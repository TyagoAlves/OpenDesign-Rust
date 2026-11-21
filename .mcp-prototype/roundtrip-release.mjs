/**
 * Roundtrip de runtime do Gate 2 contra o exe de RELEASE (artifact do CI).
 *
 * Diferenças em relação ao harness de debug:
 *  - o release embute o dist (não depende do Vite em :5173);
 *  - o núcleo HTTP é configurado pela UI real (toggle do painel), não por um
 *    import `/src/...` que só existe no dev server;
 *  - o token é lido do snippet montado pela própria UI e fica só em memória.
 *
 * Uso: node .mcp-prototype/roundtrip-release.mjs <caminho-do-app.exe>
 * Nada aqui publica, commita, gera instalador ou imprime token.
 */
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const EXE = process.argv[2];
if (!EXE || !readFileSync(EXE).length) {
  console.error("Uso: node roundtrip-release.mjs <caminho-do-app.exe>");
  process.exit(2);
}
const CWD = dirname(EXE);
const CDP_HTTP = 9343;
const PORTA_MCP = 8788;
const CAMINHO = "/mcp";
const NOTE = "<token>";

let aprovados = 0;
let reprovados = 0;

function checar(nome, condicao, detalhe = "") {
  if (condicao) {
    aprovados++;
    console.log(`  OK   ${nome}${detalhe ? " — " + detalhe : ""}`);
  } else {
    reprovados++;
    console.log(`  FALHA ${nome}${detalhe ? " — " + detalhe : ""}`);
  }
}

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function matar(pid) {
  try {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    /* já morreu */
  }
}

function sanitizar(texto, token) {
  return token ? String(texto).split(token).join(NOTE) : String(texto);
}

function seg(body, token) {
  return token && String(body).includes(token) ? NOTE : String(body).length + "B";
}

function perfilWebview(nome) {
  const caminho = `C:\\Users\\tyago\\AppData\\Local\\Temp\\opencode\\gate2-release-wv2-${nome}`;
  rmSync(caminho, { recursive: true, force: true });
  return caminho;
}

function sha256(caminho) {
  return createHash("sha256").update(readFileSync(caminho)).digest("hex").toUpperCase();
}

async function esperarCdp(porta, timeoutMs = 60000) {
  const ate = Date.now() + timeoutMs;
  let ultimo = "(sem resposta)";
  while (Date.now() < ate) {
    try {
      const lista = await new Promise((res, rej) => {
        http
          .get({ host: "127.0.0.1", port: porta, path: "/json/list" }, (r) => {
            let b = "";
            r.on("data", (c) => (b += c));
            r.on("end", () => res(b));
          })
          .on("error", rej);
      });
      ultimo = lista.slice(0, 300);
      const todos = JSON.parse(lista);
      const paginas = todos.filter(
        (t) => t.type === "page" && /^https?:/.test(t.url) && !/devtools/.test(t.url),
      );
      const app = paginas.find((t) => !/splashscreen/i.test(t.url));
      if (app) {
        console.log("  CDP alvo: " + app.url);
        return app.webSocketDebuggerUrl;
      }
    } catch (e) {
      ultimo = String(e?.message ?? e);
    }
    await dormir(300);
  }
  throw new Error(`CDP ${porta} não ficou pronto — última resposta: ${ultimo}`);
}

function conectarCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let seq = 0;
    const pendentes = new Map();
    ws.onopen = () =>
      resolve({
        evaluate(expressao) {
          return new Promise((res, rej) => {
            const id = ++seq;
            pendentes.set(id, { res, rej });
            ws.send(
              JSON.stringify({
                id,
                method: "Runtime.evaluate",
                params: { expression: expressao, awaitPromise: true, returnByValue: true },
              }),
            );
          });
        },
        fechar() {
          ws.close();
        },
      });
    ws.onerror = (e) => reject(new Error("WebSocket CDP falhou: " + String(e?.message ?? e)));
    ws.onmessage = (evento) => {
      const msg = JSON.parse(evento.data);
      if (!msg.id || !pendentes.has(msg.id)) return;
      const { res, rej } = pendentes.get(msg.id);
      pendentes.delete(msg.id);
      const r = msg.result;
      if (r?.exceptionDetails || r?.result?.subtype === "error") {
        rej(new Error(String(r?.exceptionDetails?.text || "exceção no evaluate")));
      } else {
        res(r?.result?.value);
      }
    };
  });
}

function post(caminho, corpo, token, headers = {}, metodo = "POST") {
  const dados = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  const cabecalhos = {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(dados),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...headers,
  };
  return new Promise((res, rej) => {
    const req = http.request(
      { host: "127.0.0.1", port: PORTA_MCP, path: caminho, method: metodo, headers: cabecalhos },
      (r) => {
        let b = "";
        r.on("data", (c) => (b += c));
        r.on("end", () => res({ status: r.statusCode, headers: r.headers, body: b }));
      },
    );
    req.on("error", rej);
    req.write(dados);
    req.end();
  });
}

function moderno(id, method, params = {}) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params: { ...params, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } },
  };
}

function hdrs(method) {
  return { "Mcp-Method": method, "Mcp-Name": "roundtrip-release" };
}

function parse(texto) {
  return JSON.parse(texto);
}

// Avaliações SYNCRONAS + polling no Node: um awaitPromise longo dentro da
// webview é descartado quando o Tauri recarrega a página no startup.
const ESTADO = `({
  href: location.href,
  ready: document.readyState,
  tauri: !!window.__TAURI_INTERNALS__,
  invoke: typeof window.__TAURI_INTERNALS__?.invoke
})`;

async function esperarApp(cdp) {
  let ultimo = null;
  for (let i = 0; i < 250; i++) {
    try {
      const e = await cdp.evaluate(ESTADO);
      ultimo = e;
      if (e?.ready === "complete" && e?.tauri && e?.invoke === "function" && /^https?:/.test(e.href)) return e;
    } catch {
      /* contexto navegando */
    }
    await dormir(200);
  }
  throw new Error("app release não ficou pronto no CDP: " + JSON.stringify(ultimo));
}

async function iniciarHttpPelaUi(cdp) {
  // Vai para Configurações → Acesso do agente e liga o toggle.
  await cdp.evaluate(`window.location.hash = '#/settings'; true`);
  let painel = false;
  for (let i = 0; i < 200; i++) {
    painel = await cdp.evaluate(`!!document.querySelector('#agent-access-toggle')`);
    if (painel) break;
    await dormir(100);
  }
  if (!painel) throw new Error("painel de Acesso do agente não apareceu no release");
  await cdp.evaluate(`document.querySelector('#agent-access-toggle').click(); true`);

  // Lê o snippet HTTP montado pela UI. O token fica apenas em memória no Node.
  let snippet = null;
  for (let i = 0; i < 250; i++) {
    snippet = await cdp.evaluate(`(() => {
      const ligado = document.querySelector('#agent-access-toggle')?.getAttribute('aria-checked') === 'true';
      if (!ligado) return null;
      const botao = document.querySelector('[aria-controls="agent-access-http-code"]');
      if (botao && !document.querySelector('#agent-access-http-code')) botao.click();
      const el = document.querySelector('#agent-access-http-code');
      return el && el.textContent && el.textContent.includes('OPENDESIGN_MCP_TOKEN') ? el.textContent : null;
    })()`);
    if (snippet) break;
    await dormir(100);
  }
  if (!snippet) throw new Error("snippet HTTP da UI não apareceu (mcp_start falhou?)");
  const cfg = JSON.parse(snippet).mcpServers.opendesign;
  const token = String(cfg.env?.OPENDESIGN_MCP_TOKEN ?? "");
  return { token, cfg, snippet };
}

async function testeHttpRelease(sanitizar) {
  console.log("\n=== HTTP no exe de release (token pelo painel) ===");
  const env = {
    ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: perfilWebview("http"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_HTTP} --remote-allow-origins=*`,
  };
  const filho = spawn(EXE, [], { env, cwd: CWD, stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  filho.stderr.on("data", (c) => (err += c));
  try {
    const cdp = await conectarCdp(await esperarCdp(CDP_HTTP));
    await esperarApp(cdp);
    const { token, cfg, snippet } = await iniciarHttpPelaUi(cdp);
    checar("token de 64 hex gerado pela UI", /^[0-9a-f]{64}$/.test(token), seg(token, token));
    checar(
      "snippet da UI com token em env.OPENDESIGN_MCP_TOKEN",
      typeof cfg.env?.OPENDESIGN_MCP_TOKEN === "string" && /^[0-9a-f]{64}$/.test(cfg.env.OPENDESIGN_MCP_TOKEN),
      "64 hex validado",
    );
    checar("snippet da UI sem headers.Authorization", !("headers" in cfg));
    checar("snippet da UI com endpoint fixo", cfg.endpoint === "http://127.0.0.1:8788/mcp");
    cdp.fechar();

    const sem = await post(CAMINHO, moderno(1, "server/discover"), null, hdrs("server/discover"));
    checar("401 sem Bearer", sem.status === 401, `${sem.status} ${seg(sem.body, token)}`);
    const query = await post(`${CAMINHO}?token=${token}`, moderno(2, "server/discover"), token, hdrs("server/discover"));
    checar("400 com token na query", query.status === 400, `${query.status}`);
    checar("404 em caminho diverso", (await post("/mcp2", {}, token)).status === 404);
    checar("405 em GET", (await post(CAMINHO, "", token, {}, "GET")).status === 405);

    const desc = await post(CAMINHO, moderno(3, "server/discover"), token, hdrs("server/discover"));
    const dj = parse(desc.body);
    checar("server/discover moderno → 200", desc.status === 200 && dj.result?.resultType === "complete", `${desc.status}`);
    checar("cache-control: no-store", /no-store/.test(desc.headers["cache-control"] ?? ""));
    checar("sem CORS", !desc.headers["access-control-allow-origin"]);

    const notifComId = await post(CAMINHO, { jsonrpc: "2.0", id: 77, method: "notifications/initialized", params: {} }, token, hdrs("notifications/initialized"));
    checar("notificação com id → 202 (sem -32601)", notifComId.status === 202 && !notifComId.body.includes("-32601"), `${notifComId.status} ${seg(notifComId.body, token)}`);

    const initLegado = await post(CAMINHO, { jsonrpc: "2.0", id: 4, method: "initialize", params: { protocolVersion: "2025-11-25" } }, token, hdrs("initialize"));
    checar("initialize 2025-11-25 → 200", initLegado.status === 200 && parse(initLegado.body).result?.protocolVersion === "2025-11-25", `${initLegado.status}`);

    for (const versao of ["2024-11-05", "2025-03-26", "2025-06-18"]) {
      const padrao = await post(CAMINHO, {
        jsonrpc: "2.0",
        id: 100,
        method: "initialize",
        params: {
          protocolVersion: versao,
          capabilities: {},
          clientInfo: { name: "cliente-padrao", version: "1.0.0" },
        },
      }, token);
      const pj = parse(padrao.body);
      checar(`HTTP initialize ${versao} sem headers customizados`, padrao.status === 200 && pj.result?.protocolVersion === versao && !pj.error, `${padrao.status} ${pj.error?.code ?? ""}`);
      const notif = await post(CAMINHO, { jsonrpc: "2.0", method: "notifications/initialized" }, token);
      checar(`HTTP notificacao ${versao} → 202`, notif.status === 202, `${notif.status}`);
      const lista = await post(CAMINHO, { jsonrpc: "2.0", id: 101, method: "tools/list", params: {} }, token);
      const lj = parse(lista.body);
      checar(`HTTP tools/list ${versao} sem headers customizados`, lista.status === 200 && lj.result?.tools?.length === 15 && !lj.error, `${lista.status} ${lj.error?.code ?? ""}`);
    }

    const lista = await post(CAMINHO, moderno(5, "tools/list"), token, hdrs("tools/list"));
    checar("tools/list com 15 ferramentas", parse(lista.body).result?.tools?.length === 15);
    checar("tools/list sem token", !lista.body.includes(token), seg(lista.body, token));

    const status = await post(CAMINHO, moderno(6, "tools/call", { name: "catalog_status", arguments: {} }), token, hdrs("tools/call"));
    const txt = parse(status.body).result?.structuredContent ?? {};
    checar("catalog_status sem token/caminho", status.status === 200 && !status.body.includes(token) && !/C:\\|app\.exe/.test(status.body), seg(status.body, token));
    checar("catalog_status transporte http", txt.transporte === "http", String(txt.transporte));

    const invalido = await post(CAMINHO, moderno(7, "tools/call", { name: "templates_preencher", arguments: { id: "x", values: {}, save: false } }), token, hdrs("tools/call"));
    checar("save:false reprovado pelo schema", parse(invalido.body).result?.isError === true);
    const quebrado = await post(CAMINHO, "{quebrado", token, hdrs("x"));
    checar("JSON inválido → -32700", quebrado.status === 200 && parse(quebrado.body).error?.code === -32700, `${quebrado.status}`);

    // Desliga pela própria UI (mcp_stop + limparCore) e confirma que a porta fecha.
    const cdp2 = await conectarCdp(await esperarCdp(CDP_HTTP));
    await cdp2.evaluate(`(() => {
      const btn = document.querySelector('.agent-access-btn--danger');
      if (btn && !btn.disabled) btn.click();
      return true;
    })()`);
    cdp2.fechar();
    await dormir(600);
    let fechou = false;
    try {
      await post(CAMINHO, moderno(8, "server/discover"), token, hdrs("server/discover"));
    } catch {
      fechou = true;
    }
    checar("Desligar pela UI encerra o listener", fechou);
    if (!fechou) console.log("  (stderr: " + sanitizar(err.slice(0, 300), token) + ")");
  } finally {
    matar(filho.pid);
    await dormir(300);
  }
}

function linhaStdio(proc, mensagem) {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error("timeout stdio")), 25000);
    const onData = (chunk) => {
      const texto = chunk.toString();
      for (const linha of texto.split("\n")) {
        if (!linha.trim()) continue;
        clearTimeout(timer);
        proc.stdout.off("data", onData);
        res(linha);
        return;
      }
    };
    proc.stdout.on("data", onData);
    proc.stdin.write(JSON.stringify(mensagem) + "\n");
  });
}

async function portasDoPid(pid) {
  const saida = spawnSync("powershell", [
    "-NoProfile",
    "-Command",
    `Get-NetTCPConnection -OwningProcess ${pid} -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' -or $_.RemotePort -eq ${PORTA_MCP} } | Select-Object -ExpandProperty LocalPort`,
  ], { encoding: "utf8" }).stdout ?? "";
  return saida.trim();
}

async function testeStdio(sanitizar) {
  console.log("\n=== stdio no exe de release (zero TCP) ===");
  const token = randomBytes(32).toString("hex");
  const env = {
    ...process.env,
    OPENDESIGN_MCP_TOKEN: token,
    WEBVIEW2_USER_DATA_FOLDER: perfilWebview("stdio"),
  };
  const filho = spawn(EXE, ["--transport", "stdio"], {
    env,
    cwd: CWD,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdoutBruto = "";
  let err = "";
  filho.stdout.on("data", (c) => (stdoutBruto += c));
  filho.stderr.on("data", (c) => (err += c));
  try {
    await dormir(7000);
    const desc = parse(await linhaStdio(filho, moderno(1, "server/discover")));
    checar("stdio server/discover responde", desc.result?.resultType === "complete");

    for (const versao of ["2024-11-05", "2025-03-26", "2025-06-18"]) {
      const init = parse(await linhaStdio(filho, {
        jsonrpc: "2.0",
        id: 100,
        method: "initialize",
        params: { protocolVersion: versao, capabilities: {}, clientInfo: { name: "cliente-padrao", version: "1.0.0" } },
      }));
      checar(`stdio initialize ${versao} sem headers customizados`, init.result?.protocolVersion === versao && !init.error, String(init.error?.code ?? ""));
      filho.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
      const lista = parse(await linhaStdio(filho, { jsonrpc: "2.0", id: 101, method: "tools/list", params: {} }));
      checar(`stdio tools/list ${versao} sem headers customizados`, lista.result?.tools?.length === 15 && !lista.error, String(lista.error?.code ?? ""));
    }

    const lista = parse(await linhaStdio(filho, moderno(2, "tools/list")));
    checar("stdio tools/list com 15 ferramentas", lista.result?.tools?.length === 15);
    const status = parse(await linhaStdio(filho, moderno(3, "tools/call", { name: "catalog_status", arguments: {} })));
    checar("stdio catalog_status transporte stdio", status.result?.structuredContent?.transporte === "stdio", String(status.result?.structuredContent?.transporte));

    filho.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 77, method: "notifications/initialized", params: {} }) + "\n");
    const depoisNotif = parse(await linhaStdio(filho, moderno(9, "server/discover")));
    checar(
      "stdio notificação com id não gera -32601",
      depoisNotif.id === 9 && !depoisNotif.error && depoisNotif.result?.resultType === "complete",
      `id=${depoisNotif.id} erro=${depoisNotif.error?.code ?? "-"}`,
    );

    const portas = await portasDoPid(filho.pid);
    checar("nenhuma porta TCP aberta ou conexao 8788", portas === "", portas === "" ? "nenhuma" : sanitizar(portas, token));
    checar("stdout so JSON-RPC (sem banner)", stdoutBruto.trim().split("\n").every((l) => { try { JSON.parse(l); return true; } catch { return false; } }));
    checar("token ausente no stdout/stderr", !stdoutBruto.includes(token) && !err.includes(token), seg(stdoutBruto + err, token));
    checar("sem panic WebView2 no helper", !/0x800700AA|recurso solicitado|requested resource is in use/i.test(err), sanitizar(err.slice(0, 220), token));

    filho.stdin.end();
    const codigoSaida = await new Promise((res) => filho.once("exit", (code) => res(code)));
    checar("EOF encerra limpo (exit 0)", codigoSaida === 0, String(codigoSaida));
  } finally {
    if (filho.exitCode === null) matar(filho.pid);
    await dormir(200);
  }
}

async function testeStdioComGui() {
  console.log("\n=== stdio com GUI de release aberta (bug 0x800700AA) ===");
  const token = randomBytes(32).toString("hex");
  const baseEnv = { ...process.env };
  const gui = spawn(EXE, [], {
    env: baseEnv,
    cwd: CWD,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let erroGui = "";
  gui.stderr.on("data", (c) => (erroGui += c));
  const stdio = spawn(EXE, ["--transport", "stdio"], {
    env: { ...baseEnv, OPENDESIGN_MCP_TOKEN: token },
    cwd: CWD,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let saida = "";
  let erro = "";
  stdio.stdout.on("data", (c) => (saida += c));
  stdio.stderr.on("data", (c) => (erro += c));
  try {
    await dormir(9000);
    const desc = parse(await linhaStdio(stdio, moderno(1, "server/discover")));
    checar("stdio responde com GUI de release aberta", desc.result?.resultType === "complete");
    checar("helper sem panic WebView2", !/0x800700AA|recurso solicitado|requested resource is in use/i.test(erro + erroGui), sanitizar((erro + erroGui).slice(0, 220), token));
    checar("GUI permanece viva", gui.exitCode === null, String(gui.exitCode));
    checar("token ausente na saida", !saida.includes(token) && !erro.includes(token), seg(saida + erro, token));
  } finally {
    if (stdio.exitCode === null) matar(stdio.pid);
    if (gui.exitCode === null) matar(gui.pid);
    await dormir(400);
  }
}

function porta8788Ocupada() {
  const n = spawnSync("powershell", [
    "-NoProfile",
    "-Command",
    "(Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count",
  ], { encoding: "utf8" }).stdout.trim();
  return parseInt(n, 10) > 0;
}

async function main() {
  console.log("=== ROUNDTRIP GATE 2 — exe de RELEASE ===");
  console.log("EXE: " + EXE);
  console.log("SHA256: " + sha256(EXE));
  try {
    if (porta8788Ocupada()) {
      reprovados++;
      console.log("  FALHA porta 8788 ocupada — feche o processo antes de validar o HTTP");
    } else {
      await testeHttpRelease(sanitizar);
    }
    await testeStdio(sanitizar);
    await testeStdioComGui();
  } catch (erro) {
    reprovados++;
    console.log("  FALHAERRO — " + sanitizar(erro?.stack ?? String(erro), ""));
  }
  console.log(`\nRESULTADO: ${aprovados} OK / ${reprovados} FALHA`);
  process.exit(reprovados === 0 ? 0 : 1);
}

main();
