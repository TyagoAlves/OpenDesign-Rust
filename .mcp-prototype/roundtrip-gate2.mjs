/**
 * Roundtrip de runtime do Gate 2 contra o exe Tauri de debug.
 *
 * - HTTP: inicia o serviço chamando `mcp_start` dentro da webview via CDP
 *   (o token nunca é impresso), testa 401/400/404/405, initialize,
 *   server/discover, tools/list (15), catalog_status e redação, e 202.
 * - stdio: inicia uma 2ª instância com `--transport stdio` + token no env,
 *   troca JSON-RPC por stdin/stdout, confere stdout limpo e ZERO portas TCP.
 *
 * Uso: node .mcp-prototype/roundtrip-gate2.mjs
 * Nada aqui publica, commita ou gera instalador.
 */
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";

function perfilWebview(nome) {
  const caminho = `C:\\Users\\tyago\\AppData\\Local\\Temp\\opencode\\gate2-wv2-${nome}`;
  rmSync(caminho, { recursive: true, force: true });
  return caminho;
}

const EXE = "C:\\Users\\tyago\\Projeto\\bloaudhab\\OpenDesign\\target\\debug\\app.exe";
const CWD = "C:\\Users\\tyago\\Projeto\\bloaudhab\\OpenDesign\\src-tauri";
const CDP_HTTP = 9333;
const CDP_STDIO = 9334;
const PORTA_MCP = 8788;
const CAMINHO = "/mcp";

let aprovados = 0;
let reprovados = 0;
const NOTE = "<token>";

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

async function esperarCdp(porta, timeoutMs = 45000) {
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
      if (paginas.length) {
        console.log("  CDP alvos: " + todos.map((t) => `${t.type}:${t.url}`).join(" | "));
        // O Tauri abre um splash; a ponte IPC só existe na página real do app.
        const app = paginas.find((t) => !/splashscreen/i.test(t.url));
        if (app) {
          console.log("  CDP alvo escolhido: " + app.url + " → " + app.webSocketDebuggerUrl);
          return app.webSocketDebuggerUrl;
        }
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
    ws.onopen = () => resolve({
      evaluate(expressao) {
        return new Promise((res, rej) => {
          const id = ++seq;
          pendentes.set(id, { res, rej });
          ws.send(JSON.stringify({
            id,
            method: "Runtime.evaluate",
            params: { expression: expressao, awaitPromise: true, returnByValue: true },
          }));
        });
      },
      fechar() { ws.close(); },
    });
    ws.onerror = (e) => reject(new Error("WebSocket CDP falhou: " + String(e?.message ?? e)));
    ws.onmessage = (evento) => {
      const msg = JSON.parse(evento.data);
      if (!msg.id || !pendentes.has(msg.id)) return;
      const { res, rej } = pendentes.get(msg.id);
      pendentes.delete(msg.id);
      const r = msg.result;
      if (r?.exceptionDetails || r?.result?.subtype === "error") {
        rej(new Error(r?.exceptionDetails?.text || "exceção no evaluate"));
      } else {
        res(r?.result?.value);
      }
    };
  });
}

function post(pathname, corpo, token, headers = {}, metodo = "POST") {
  const dados = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  const cabecalhos = {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(dados),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...headers,
  };
  return new Promise((res, rej) => {
    const req = http.request(
      { host: "127.0.0.1", port: PORTA_MCP, path: pathname, method: metodo, headers: cabecalhos },
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
  return { "Mcp-Method": method, "Mcp-Name": "roundtrip-gate2" };
}
function parse(texto) {
  return JSON.parse(texto);
}
function seg(body, token) {
  return token && body.includes(token) ? NOTE : body.length + "B";
}

async function testeHttp(sanitizar) {
  console.log("\n=== HTTP (exe Tauri + CDP) ===");
  const env = {
    ...process.env,
    // WebView2 exige user-data-folder exclusivo quando remote debugging está ligado.
    WEBVIEW2_USER_DATA_FOLDER: perfilWebview("http"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_HTTP} --remote-allow-origins=*`,
  };
  const filho = spawn(EXE, [], { env, cwd: "C:\\Users\\tyago\\Projeto\\bloaudhab\\OpenDesign\\src-tauri", stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  filho.stderr.on("data", (c) => (err += c));
  try {
    const cdp = await conectarCdp(await esperarCdp(CDP_HTTP));
    // O target pode navegar de about:blank para a app logo após o /json/list;
    // um evaluate nessa janela volta undefined. Aquecemos e repetimos.
    const pronto = `(async () => {
      for (let i = 0; i < 150; i++) {
        const ok = /^https?:\\/\\//.test(location.href) && document.readyState === 'complete' && window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function';
        if (ok) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    })()`;
    let iniciado;
    for (let tentativa = 0; tentativa < 8; tentativa++) {
      await cdp.evaluate(pronto);
      iniciado = await cdp.evaluate(`window.__TAURI_INTERNALS__.invoke('mcp_start', { transport: 'http' })`);
      if (iniciado) break;
      await dormir(500);
    }
    console.log("  mcp_start: " + JSON.stringify({ erro: iniciado?.erro, chaves: iniciado ? Object.keys(iniciado) : null }));
    const token = iniciado?.token;
    // O hook configura o núcleo no enable() da UI; aqui chamamos mcp_start
    // direto, então ligamos a mesma ponte com o token devolvido (não impresso).
    await cdp.evaluate(`(async () => {
      const mod = await import('/src/client/mcp/bridge.ts');
      mod.configurarHttp(${JSON.stringify(token)}, ${JSON.stringify(iniciado?.sessionId)});
      return true;
    })()`);
    checar("mcp_start devolveu token/sessão/transporte", !!token && !!iniciado.sessionId && iniciado.transport === "http", seg(String(iniciado?.sessionId ?? ""), token));
    checar("stdioCommand sem token", !!iniciado?.stdioCommand && !String(iniciado.stdioCommand).includes(token));
    cdp.fechar();

    const sem = await post(CAMINHO, moderno(1, "server/discover"), null, hdrs("server/discover"));
    checar("401 sem Bearer", sem.status === 401, `${sem.status} ${seg(sem.body, token)}`);

    const query = await post(`${CAMINHO}?token=${token}`, moderno(2, "server/discover"), token, hdrs("server/discover"));
    checar("400 com token na query", query.status === 400, `${query.status}`);

    const errado = await post("/mcp2", {}, token);
    checar("404 em caminho diverso", errado.status === 404, `${errado.status}`);
    const get = await post(CAMINHO, "", token, {}, "GET");
    checar("405 em GET", get.status === 405, `${get.status}`);

    const desc = await post(CAMINHO, moderno(3, "server/discover"), token, hdrs("server/discover"));
    const dj = parse(desc.body);
    checar("server/discover moderno → 200", desc.status === 200 && dj.result?.resultType === "complete", `${desc.status}`);
    checar("cache-control: no-store", /no-store/.test(desc.headers["cache-control"] ?? ""));
    checar("sem CORS", !desc.headers["access-control-allow-origin"]);

    const init = await post(CAMINHO, { jsonrpc: "2.0", id: 4, method: "initialize", params: { protocolVersion: "2025-11-25" } }, token, hdrs("initialize"));
    const ij = parse(init.body);
    checar("initialize legado → 200", init.status === 200 && ij.result?.protocolVersion === "2025-11-25", `${init.status}`);

    // Clientes MCP padrão (Antigravity/Claude/Cursor): Initialize com as versões
    // publicadas e SEM os headers customizados Mcp-Method/Mcp-Name.
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
      checar(
        `initialize ${versao} sem headers customizados`,
        padrao.status === 200 && pj.result?.protocolVersion === versao && !pj.error,
        `${padrao.status} ${pj.error?.code ?? ""}`,
      );
      const notifPadrao = await post(CAMINHO, { jsonrpc: "2.0", method: "notifications/initialized" }, token);
      checar(`notifications/initialized ${versao} → 202`, notifPadrao.status === 202, `${notifPadrao.status}`);
      const listaPadrao = await post(CAMINHO, { jsonrpc: "2.0", id: 101, method: "tools/list", params: {} }, token);
      const lpj = parse(listaPadrao.body);
      checar(
        `tools/list ${versao} sem headers customizados`,
        listaPadrao.status === 200 && lpj.result?.tools?.length === 15 && !lpj.error,
        `${listaPadrao.status} ${lpj.error?.code ?? ""}`,
      );
    }

    const lista = await post(CAMINHO, moderno(5, "tools/list"), token, hdrs("tools/list"));
    const lj = parse(lista.body);
    checar("tools/list com 15 ferramentas", lj.result?.tools?.length === 15, String(lj.result?.tools?.length));
    checar("tools/list sem token", !lista.body.includes(token), seg(lista.body, token));

    const status = await post(CAMINHO, moderno(6, "tools/call", { name: "catalog_status", arguments: {} }), token, hdrs("tools/call"));
    const sj = parse(status.body);
    const txt = sj.result?.structuredContent ?? {};
    checar("catalog_status sem token/caminho", status.status === 200 && !status.body.includes(token) && !/C:\\|app\.exe/.test(status.body), seg(status.body, token));
    checar("catalog_status transporte http", txt.transporte === "http", String(txt.transporte));
    checar("catalog_status id_sessao", txt.id_sessao === iniciado.sessionId, String(txt.id_sessao === iniciado.sessionId));

    const invalido = await post(CAMINHO, moderno(7, "tools/call", { name: "templates_preencher", arguments: { id: "x", values: {}, save: false } }), token, hdrs("tools/call"));
    const ivj = parse(invalido.body);
    checar("save:false reprovado pelo schema", ivj.result?.isError === true, `${ivj.result?.isError}`);

    const notif = await post(CAMINHO, { jsonrpc: "2.0", method: "notifications/initialized" }, token, hdrs("notifications/initialized"));
    checar("notificação → 202", notif.status === 202, `${notif.status}`);
    const notifComId = await post(CAMINHO, { jsonrpc: "2.0", id: 77, method: "notifications/initialized", params: {} }, token, hdrs("notifications/initialized"));
    checar("notificação com id → 202 (sem -32601)", notifComId.status === 202 && !notifComId.body.includes("-32601"), `${notifComId.status} ${seg(notifComId.body, token)}`);

    const parseErr = await post(CAMINHO, "{quebrado", token, hdrs("x"));
    checar("JSON inválido → -32700", parseErr.status === 200 && parse(parseErr.body).error?.code === -32700, `${parseErr.status}`);

    const cdp2 = await conectarCdp(await esperarCdp(CDP_HTTP));
    await cdp2.evaluate(`window.__TAURI_INTERNALS__.invoke('mcp_stop', {})`);
    cdp2.fechar();
    await dormir(400);
    let fechou = false;
    try { await post(CAMINHO, moderno(8, "server/discover"), token, hdrs("server/discover")); } catch { fechou = true; }
    checar("mcp_stop encerra o listener", fechou);
    if (!fechou) console.log("  (stderr: " + sanitizar(err.slice(0, 300), token) + ")");
  } catch (erro) {
    console.log("  (stderr do exe: " + sanitizar(err.slice(0, 600), "") + ")");
    throw erro;
  } finally {
    matar(filho.pid);
    await dormir(300);
  }
}

function linhaStdio(proc, mensagem) {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error("timeout stdio")), 20000);
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
    "-NoProfile", "-Command",
    `Get-NetTCPConnection -OwningProcess ${pid} -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' -or $_.RemotePort -eq ${PORTA_MCP} } | Select-Object -ExpandProperty LocalPort`,
  ], { encoding: "utf8" }).stdout ?? "";
  return saida.trim();
}

async function testeStdio(sanitizar) {
  console.log("\n=== stdio in-process (zero TCP) ===");
  const token = randomBytes(32).toString("hex");
  const env = {
    ...process.env,
    OPENDESIGN_MCP_TOKEN: token,
    WEBVIEW2_USER_DATA_FOLDER: perfilWebview("stdio"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_STDIO} --remote-allow-origins=*`,
  };
  const filho = spawn(EXE, ["--transport", "stdio"], { env, cwd: "C:\\Users\\tyago\\Projeto\\bloaudhab\\OpenDesign\\src-tauri", stdio: ["pipe", "pipe", "pipe"] });
  let stdoutBruto = "";
  let err = "";
  filho.stdout.on("data", (c) => (stdoutBruto += c));
  filho.stderr.on("data", (c) => (err += c));
  try {
    await dormir(6000); // webview oculta carrega e instala a ponte
    const desc = parse(await linhaStdio(filho, moderno(1, "server/discover")));
    checar("stdio server/discover responde", desc.result?.resultType === "complete", "");

    const lista = parse(await linhaStdio(filho, moderno(2, "tools/list")));
    checar("stdio tools/list com 15 ferramentas", lista.result?.tools?.length === 15, String(lista.result?.tools?.length));

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
    checar("nenhuma porta TCP aberta ou conexão 8788", portas === "", portas === "" ? "nenhuma" : sanitizar(portas, token));
    checar("stdout só JSON-RPC (sem banner)", stdoutBruto.trim().split("\n").every((l) => { try { JSON.parse(l); return true; } catch { return false; } }), "");
    checar("token ausente no stdout/stderr", !stdoutBruto.includes(token) && !err.includes(token), seg(stdoutBruto + err, token));

    filho.stdin.end();
    const codigoSaida = await new Promise((res) => filho.once("exit", (code) => res(code)));
    checar("EOF encerra limpo (exit 0)", codigoSaida === 0, String(codigoSaida));
  } finally {
    if (filho.exitCode === null) matar(filho.pid);
    await dormir(200);
  }
}

async function testeNucleoPadrao() {
  console.log("\n=== núcleo JS: clientes MCP padrão ===");
  const { createCore } = await import("../src/client/mcp/mcp-core.mjs");
  const core = createCore({
    backend: { call: async () => ({ ok: true }) },
    transport: "http",
    sessionId: "teste-padrao",
  });
  for (const versao of ["2024-11-05", "2025-03-26", "2025-06-18"]) {
    const init = await core.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: versao, capabilities: {}, clientInfo: { name: "padrao", version: "1" } },
    }, { transport: "http", headers: { "content-type": "application/json" } });
    checar(
      `núcleo initialize ${versao} sem headers customizados`,
      init.result?.protocolVersion === versao && !init.error,
      String(init.error?.code ?? ""),
    );
    const lista = await core.handle(
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      { transport: "http", headers: { "content-type": "application/json", "mcp-protocol-version": versao } },
    );
    checar(
      `núcleo tools/list ${versao} sem headers customizados`,
      lista.result?.tools?.length === 15 && !lista.error,
      String(lista.error?.code ?? ""),
    );
  }
  const desconhecida = await core.handle(
    { jsonrpc: "2.0", id: 3, method: "initialize", params: { protocolVersion: "1999-01-01" } },
    { transport: "http", headers: {} },
  );
  checar("versão desconhecida ainda é rejeitada", desconhecida.error?.code === -32022, String(desconhecida.error?.code));

  const initModerno = await core.handle(moderno(4, "initialize"), {
    transport: "http",
    headers: {},
  });
  checar(
    "núcleo initialize moderno → -32601",
    initModerno.error?.code === -32601 && !initModerno.result,
    String(initModerno.error?.code ?? ""),
  );

  const notifComId = await core.handle(
    { jsonrpc: "2.0", id: 77, method: "notifications/initialized", params: {} },
    { transport: "http", headers: {} },
  );
  checar("notificação com id aceita silenciosamente", notifComId === null, JSON.stringify(notifComId));
  const notifSemId = await core.handle(
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { transport: "http", headers: {} },
  );
  checar("notificação sem id aceita silenciosamente", notifSemId === null, JSON.stringify(notifSemId));
}

function testeSnippetHttp() {
  console.log("\n=== snippet HTTP (token só no env) ===");
  const base = "C:/Users/tyago/Projeto/bloaudhab/OpenDesign/src/client/";
  try {
    const hook = readFileSync(base + "hooks/use-mcp-access.ts", "utf8");
    const painel = readFileSync(base + "components/agent-access-panel.tsx", "utf8");
    checar(
      "snippet HTTP usa env.OPENDESIGN_MCP_TOKEN",
      /endpoint: HTTP_ENDPOINT,\s*\n\s*env: \{ OPENDESIGN_MCP_TOKEN: token \}/.test(hook) &&
        !/Authorization/.test(hook),
    );
    checar(
      "preview HTTP usa env.OPENDESIGN_MCP_TOKEN",
      /endpoint: "http:\/\/127\.0\.0\.1:8788\/mcp",\s*\n\s*env: \{ OPENDESIGN_MCP_TOKEN: PLACEHOLDER \}/.test(painel) &&
        !/Authorization/.test(painel),
    );
  } catch (erro) {
    checar("snippet HTTP (leitura dos fontes)", false, String(erro?.message ?? erro));
  }
}

async function testeStdioComGui() {
  console.log("\n=== stdio com GUI aberta (sem colisão WebView2) ===");
  const token = randomBytes(32).toString("hex");
  const baseEnv = { ...process.env };
  // Reaproveita a GUI já aberta pelo usuário quando existe — é exatamente o
  // cenário relatado. Se não houver, sobe uma GUI de teste.
  const lista = spawnSync("powershell", [
    "-NoProfile", "-Command",
    "Get-CimInstance Win32_Process -Filter \"Name = 'app.exe'\" | Where-Object { $_.CommandLine -notmatch '--transport' } | Select-Object -ExpandProperty ProcessId",
  ], { encoding: "utf8" }).stdout.trim();
  const pidGuiExistente = lista.split(/\s+/).find(Boolean) ?? null;
  let gui = null;
  let erroGui = "";
  if (pidGuiExistente) {
    console.log("  GUI existente reaproveitada: PID " + pidGuiExistente);
  } else {
    gui = spawn(EXE, [], { env: baseEnv, cwd: CWD, stdio: ["ignore", "ignore", "pipe"] });
    gui.stderr.on("data", (c) => (erroGui += c));
  }
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
    await dormir(8000); // GUI e helper estabilizam
    const desc = parse(await linhaStdio(stdio, moderno(1, "server/discover")));
    checar("stdio responde com GUI aberta", desc.result?.resultType === "complete", "");
    checar(
      "helper stdio sem panic WebView2",
      !/0x800700AA|recurso solicitado|requested resource is in use/i.test(erro + erroGui),
      sanitizar((erro + erroGui).slice(0, 220), token),
    );
    const guiViva = pidGuiExistente
      ? !!spawnSync("powershell", ["-NoProfile", "-Command", `Get-Process -Id ${pidGuiExistente} -ErrorAction SilentlyContinue`], { encoding: "utf8" }).stdout.trim()
      : gui.exitCode === null;
    checar("GUI permanece viva", guiViva, pidGuiExistente ?? String(gui.exitCode));
    checar("token ausente na saída do helper", !saida.includes(token) && !erro.includes(token), seg(saida + erro, token));
  } finally {
    if (stdio.exitCode === null) matar(stdio.pid);
    if (gui && gui.exitCode === null) matar(gui.pid);
    await dormir(400);
  }
}

function sanitizar(texto, token) {
  return token ? String(texto).split(token).join(NOTE) : String(texto);
}

function porta8788Ocupada() {
  const n = spawnSync("powershell", [
    "-NoProfile", "-Command",
    "(Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count",
  ], { encoding: "utf8" }).stdout.trim();
  return parseInt(n, 10) > 0;
}

async function main() {
  console.log("=== ROUNDTRIP GATE 2 — exe Tauri debug ===");
  try {
    testeSnippetHttp();
    await testeNucleoPadrao();
    if (porta8788Ocupada()) {
      console.log("\n  (HTTP completo PULADO: porta 8788 em uso por outro processo)");
    } else {
      await testeHttp(sanitizar);
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
