/**
 * Harness de evidência integrada do Gate 2 — pendências A.
 *
 * Cobre AC-08, AC-09, AC-13 e AC-19 contra o exe informado na argv.
 * Reaproveita (por cópia, sem import) os helpers de roundtrip-release.mjs.
 *
 * Uso: node .mcp-prototype/gate2-pendencias-a.mjs <caminho-do-app.exe>
 *
 * Limites: não faz build, install, commit, tag, release ou publicação. Não
 * grava arquivos fora de Temp\opencode (o único artefato criado é o perfil
 * WebView2, removido no início e no finally). O token MCP fica só em memória
 * e toda saída o substitui por <token>. Verificações que não podem ser
 * automatizadas com confiança são emitidas como FALHA, nunca como OK.
 */
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function exeValido(caminho) {
  if (!caminho) return false;
  try {
    return existsSync(caminho) && statSync(caminho).isFile();
  } catch {
    return false;
  }
}

const EXE = process.argv[2];
if (!exeValido(EXE)) {
  console.error("Uso: node gate2-pendencias-a.mjs <caminho-do-app.exe> (argv ausente ou arquivo inexistente)");
  process.exit(2);
}

const CWD = dirname(EXE);
const CDP_HTTP = 9346;
const PORTA_MCP = 8788;
const CAMINHO = "/mcp";
const NOTE = "<token>";
const PERFIL = "C:\\Users\\tyago\\AppData\\Local\\Temp\\opencode\\gate2-pend-a-wv2";
const RAIZ_WORKTREE = dirname(dirname(fileURLToPath(import.meta.url)));
const FONTE_BACKEND = join(RAIZ_WORKTREE, "src", "client", "mcp", "backend-tauri.ts");
const APPDATA = process.env.APPDATA || join(process.env.USERPROFILE || "", "AppData", "Roaming");
const PASTA_APP = join(APPDATA, "com.opendesign.app");
const DB_APP = join(PASTA_APP, "opendesign.db");

let aprovados = 0;
let reprovados = 0;
let token = null;
let erroApp = "";
const filhos = [];
const cdps = [];

// ---------------------------------------------------------------- helpers ---
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

function sanitizar(texto, segredo) {
  return segredo ? String(texto).split(segredo).join(NOTE) : String(texto);
}

function seg(body, segredo) {
  return segredo && String(body).includes(segredo) ? NOTE : String(body).length + "B";
}

function perfilWebview() {
  rmSync(PERFIL, { recursive: true, force: true });
  return PERFIL;
}

function sha256(caminho) {
  return createHash("sha256").update(readFileSync(caminho)).digest("hex").toUpperCase();
}

function registrar(filho) {
  filhos.push(filho);
  return filho;
}

function registrarCdp(cdp) {
  cdps.push(cdp);
  return cdp;
}

function limpar() {
  for (const filho of filhos) {
    if (filho && filho.exitCode === null && filho.signalCode === null) matar(filho.pid);
  }
  for (const cdp of cdps) {
    try {
      cdp.fechar();
    } catch {
      /* já fechado */
    }
  }
  // Nenhum outro arquivo temporário é criado por este harness.
  try {
    rmSync(PERFIL, { recursive: true, force: true });
  } catch {
    /* já removido */
  }
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

async function esperarCdpFechar(porta, timeoutMs = 10000) {
  const ate = Date.now() + timeoutMs;
  while (Date.now() < ate) {
    let aberta = false;
    await new Promise((res) => {
      const req = http.get({ host: "127.0.0.1", port: porta, path: "/json/list", timeout: 700 }, (r) => {
        aberta = true;
        r.resume();
        r.on("end", res);
        r.on("close", res);
      });
      req.on("error", () => res());
      req.on("timeout", () => {
        req.destroy();
        res();
      });
    });
    if (!aberta) return true;
    await dormir(250);
  }
  return false;
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
  throw new Error("app não ficou pronto no CDP: " + JSON.stringify(ultimo));
}

async function abrirPainel(cdp) {
  await cdp.evaluate(`window.location.hash = '#/settings'; true`);
  for (let i = 0; i < 200; i++) {
    if (await cdp.evaluate(`!!document.querySelector('#agent-access-toggle')`)) return true;
    await dormir(100);
  }
  return false;
}

async function iniciarHttpPelaUi(cdp) {
  // Configurações → Acesso do agente. Só clica se estiver desligado.
  if (!(await abrirPainel(cdp))) throw new Error("painel de Acesso do agente não apareceu");
  const ligado = await cdp.evaluate(
    `document.querySelector('#agent-access-toggle')?.getAttribute('aria-checked') === 'true'`,
  );
  if (!ligado) await cdp.evaluate(`document.querySelector('#agent-access-toggle').click(); true`);

  // O snippet é montado pela UI; o token fica apenas em memória no Node.
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
  return { token: String(cfg.env?.OPENDESIGN_MCP_TOKEN ?? ""), cfg, snippet };
}

function post(caminho, corpo, segredo, headers = {}, metodo = "POST") {
  const dados = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  const cabecalhos = {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(dados),
    ...(segredo ? { authorization: `Bearer ${segredo}` } : {}),
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
  return { "Mcp-Method": method, "Mcp-Name": "gate2-pendencias-a" };
}

function parse(texto) {
  return JSON.parse(texto);
}

// ------------------------------------------------------- helpers adicionais ---
function estadoPorta8788() {
  const cmd = "(Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count";
  const r = spawnSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
  if (r.error || r.status !== 0) {
    return { verificada: false, livre: false, detalhe: String(r.error?.message ?? `status ${r.status}`) };
  }
  const n = Number.parseInt(String(r.stdout ?? "").trim(), 10);
  if (!Number.isFinite(n)) {
    return { verificada: false, livre: false, detalhe: "saída inesperada: " + String(r.stdout ?? "").trim().slice(0, 80) };
  }
  return { verificada: true, livre: n === 0, detalhe: `${n} listener(es)` };
}

async function esperarPortaLivre(timeoutMs = 5000) {
  const ate = Date.now() + timeoutMs;
  let ultimo = estadoPorta8788();
  while (Date.now() < ate) {
    ultimo = estadoPorta8788();
    if (ultimo.verificada && ultimo.livre) return ultimo;
    await dormir(200);
  }
  return ultimo;
}

async function listenerAtivo(tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await post(CAMINHO, moderno(9999, "server/discover"), token, hdrs("server/discover"));
      if (r.status === 200 && parse(r.body).result?.resultType === "complete") return true;
    } catch {
      /* listener ainda subindo */
    }
    await dormir(250);
  }
  return false;
}

function iniciarApp(perfil) {
  const env = {
    ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: perfil,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_HTTP} --remote-allow-origins=*`,
  };
  const filho = spawn(EXE, [], { env, cwd: CWD, stdio: ["ignore", "ignore", "pipe"] });
  filho.stderr.on("data", (c) => (erroApp += c));
  filho.on("error", (e) => (erroApp += String(e)));
  return registrar(filho);
}

function amostraConexoes() {
  const cmd = `Get-NetTCPConnection -ErrorAction SilentlyContinue | ForEach-Object { "$($_.State),$($_.LocalAddress),$($_.LocalPort),$($_.RemoteAddress),$($_.RemotePort),$($_.OwningProcess)" }`;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
  if (r.error || r.status !== 0) {
    return { ok: false, linhas: [], erro: String(r.error?.message ?? `status ${r.status}`) };
  }
  const linhas = String(r.stdout ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { ok: linhas.length > 0, linhas, erro: linhas.length ? "" : "saída vazia" };
}

function amostraProcessos() {
  const cmd = `Get-CimInstance Win32_Process | ForEach-Object { $c = ($_.CommandLine -replace '[\\r\\n,]', ' '); "$($_.ProcessId),$($_.ParentProcessId),$($_.Name),$c" }`;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
  if (r.error || r.status !== 0) {
    return { ok: false, linhas: [], erro: String(r.error?.message ?? `status ${r.status}`) };
  }
  const linhas = String(r.stdout ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((linha) => {
      const [pid, ppid, nome, ...resto] = linha.split(",");
      return { pid: Number(pid), ppid: Number(ppid), nome: nome || "", cmd: resto.join(" ") };
    })
    .filter((p) => Number.isFinite(p.pid) && Number.isFinite(p.ppid));
  return { ok: linhas.length > 0, linhas, erro: linhas.length ? "" : "saída vazia" };
}

function descendentes(pid, processos) {
  const porPai = new Map();
  for (const p of processos) {
    if (!porPai.has(p.ppid)) porPai.set(p.ppid, []);
    porPai.get(p.ppid).push(p);
  }
  const vista = new Set([pid]);
  const fila = [pid];
  while (fila.length) {
    const pai = fila.shift();
    for (const f of porPai.get(pai) ?? []) {
      if (!vista.has(f.pid)) {
        vista.add(f.pid);
        fila.push(f.pid);
      }
    }
  }
  return { vista, processos: processos.filter((p) => vista.has(p.pid)) };
}

function ipLoopback(endereco) {
  const a = String(endereco ?? "").trim().toLowerCase();
  return (
    a === "::1" ||
    a === "[::1]" ||
    a === "0:0:0:0:0:0:0:1" ||
    a === "localhost" ||
    /^127\./.test(a) ||
    /^::ffff:127\./.test(a)
  );
}

function amostraNetstat() {
  const r = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", windowsHide: true });
  if (r.error || r.status !== 0) {
    return { ok: false, texto: "", erro: String(r.error?.message ?? `status ${r.status}`) };
  }
  const texto = String(r.stdout ?? "");
  return { ok: texto.trim().length > 0, texto, erro: texto.trim() ? "" : "saída vazia" };
}

function snapshotDiretorio(diretorio) {
  const snap = {};
  for (const e of readdirSync(diretorio, { withFileTypes: true })) {
    if (e.isFile()) snap[e.name] = sha256(join(diretorio, e.name));
    else if (e.isDirectory()) snap[e.name + "/"] = "<dir>";
  }
  return snap;
}

function raizesObservadas() {
  return [
    { rotulo: "%APPDATA%", dir: APPDATA },
    { rotulo: "%LOCALAPPDATA%", dir: process.env.LOCALAPPDATA },
    { rotulo: "%USERPROFILE%", dir: process.env.USERPROFILE },
    { rotulo: "dir do exe", dir: CWD },
  ].filter((r) => !!r.dir);
}

function snapshotRaizes() {
  const entradas = {};
  for (const raiz of raizesObservadas()) {
    try {
      entradas[raiz.rotulo] = readdirSync(raiz.dir).slice().sort();
    } catch {
      entradas[raiz.rotulo] = null;
    }
  }
  return entradas;
}

function novasEntradas(antes, depois) {
  const novos = [];
  for (const rotulo of Object.keys(depois)) {
    if (!depois[rotulo] || !antes[rotulo]) {
      novos.push(`${rotulo}:ilegível`);
      continue;
    }
    for (const nome of depois[rotulo]) {
      // A pasta de config do app é expectada (é aqui que o SQLite grava).
      if (rotulo === "%APPDATA%" && nome.toLowerCase() === "com.opendesign.app") continue;
      if (!antes[rotulo].includes(nome)) novos.push(`${rotulo}\\${nome}`);
    }
  }
  return novos;
}

function varrerPerfil(diretorio) {
  const padrao = /mcp_enable|auto_start/i;
  const resultado = { arquivos: 0, ilegiveis: 0, encontrados: [] };
  function caminhar(atual) {
    let entradas;
    try {
      entradas = readdirSync(atual, { withFileTypes: true });
    } catch {
      resultado.ilegiveis++;
      return;
    }
    for (const e of entradas) {
      const caminho = join(atual, e.name);
      if (e.isDirectory()) {
        caminhar(caminho);
        continue;
      }
      if (!e.isFile()) continue;
      resultado.arquivos++;
      try {
        if (statSync(caminho).size > 32 * 1024 * 1024) {
          resultado.ilegiveis++;
          continue;
        }
        const achado = readFileSync(caminho, "latin1").match(padrao);
        if (achado) resultado.encontrados.push(caminho.slice(diretorio.length + 1) + ":" + achado[0]);
      } catch {
        resultado.ilegiveis++;
      }
    }
  }
  caminhar(diretorio);
  return resultado;
}

function semComentarios(fonte) {
  // Remove comentários // e /* */ preservando strings (inclusive URLs).
  let saida = "";
  let i = 0;
  let estado = "codigo";
  while (i < fonte.length) {
    const c = fonte[i];
    const n = fonte[i + 1];
    if (estado === "codigo") {
      if (c === "/" && n === "*") {
        saida += "  ";
        estado = "bloco";
        i += 2;
        continue;
      }
      if (c === "/" && n === "/") {
        saida += "  ";
        estado = "linha";
        i += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") estado = c;
      saida += c;
      i++;
      continue;
    }
    if (estado === "linha") {
      if (c === "\n") {
        saida += "\n";
        estado = "codigo";
      } else saida += " ";
      i++;
      continue;
    }
    if (estado === "bloco") {
      if (c === "*" && n === "/") {
        saida += "  ";
        estado = "codigo";
        i += 2;
        continue;
      }
      saida += c === "\n" ? "\n" : " ";
      i++;
      continue;
    }
    if (c === "\\") {
      saida += c + (n ?? "");
      i += 2;
      continue;
    }
    if (c === estado) estado = "codigo";
    saida += c;
    i++;
  }
  return saida;
}

function extrairIdDesign(dados) {
  if (Array.isArray(dados)) {
    for (const item of dados) {
      const id = extrairIdDesign(item);
      if (id) return id;
    }
    return null;
  }
  if (dados && typeof dados === "object") {
    if (typeof dados.id === "string") return dados.id;
    for (const chave of ["designs", "itens", "resultados"]) {
      const id = extrairIdDesign(dados[chave]);
      if (id) return id;
    }
  }
  return null;
}

// ------------------------------------------------------------------- main ---
async function main() {
  console.log("=== HARNESS DE EVIDÊNCIA INTEGRADA — GATE 2 / PENDÊNCIAS A ===");
  console.log("EXE: " + EXE);
  console.log("SHA256: " + sha256(EXE));

  const perfil = perfilWebview();
  const portaInicial = estadoPorta8788();
  if (!portaInicial.verificada || !portaInicial.livre) {
    console.error(
      "ABORTADO (exit 2): porta 8788 " +
        (portaInicial.verificada ? "ocupada" : "não verificável") +
        " — " +
        portaInicial.detalhe,
    );
    process.exit(2);
  }

  try {
    // ------------------------------------------------------------- AC-08 ---
    console.log("\n=== AC-08 ===");
    const app = iniciarApp(perfil);
    let pidApp = app.pid;
    let cdp = registrarCdp(await conectarCdp(await esperarCdp(CDP_HTTP)));
    await esperarApp(cdp);

    checar("DB em %APPDATA%\\com.opendesign.app\\opendesign.db", existsSync(DB_APP), DB_APP);
    let arquivosDb = [];
    if (existsSync(PASTA_APP)) {
      arquivosDb = readdirSync(PASTA_APP).filter((n) => /\.db$/i.test(n)).sort();
    }
    checar("exatamente 1 arquivo .db na pasta do app", arquivosDb.length === 1, arquivosDb.join(", ") || "nenhum");

    const snapAntes = existsSync(PASTA_APP) ? snapshotDiretorio(PASTA_APP) : {};
    checar(
      "snapshot de nomes+hashes do diretório do app",
      Object.keys(snapAntes).length > 0,
      Object.keys(snapAntes).length + " entradas",
    );
    const raizesAntes = snapshotRaizes();

    const ativado = await iniciarHttpPelaUi(cdp);
    token = ativado.token;
    checar("token lido do snippet da UI (valor mascarado)", /^[0-9a-f]{64}$/.test(token), seg(token, token));
    checar("listener 8788 ativo após ligar pela UI", await listenerAtivo(), "127.0.0.1:8788/mcp");

    const rLista = await post(CAMINHO, moderno(1, "tools/list"), token, hdrs("tools/list"));
    const lista = parse(rLista.body);
    const ferramentas = lista.result?.tools ?? [];
    checar("tools/list (leitura) respondeu", rLista.status === 200 && ferramentas.length === 15, `${rLista.status} / ${ferramentas.length} tools`);

    const rProjetos = await post(
      CAMINHO,
      moderno(2, "tools/call", { name: "projeto_listar", arguments: {} }),
      token,
      hdrs("tools/call"),
    );
    const projetos = parse(rProjetos.body);
    checar(
      "projeto_listar (leitura) respondeu",
      rProjetos.status === 200 && !projetos.result?.isError && projetos.result?.structuredContent !== undefined,
      `${rProjetos.status} ${seg(rProjetos.body, token)}`,
    );

    const snapDepoisLeitura = existsSync(PASTA_APP) ? snapshotDiretorio(PASTA_APP) : {};
    checar(
      "hash do DB igual antes/depois SOMENTE das chamadas read-only",
      !!snapAntes["opendesign.db"] && snapAntes["opendesign.db"] === snapDepoisLeitura["opendesign.db"],
      "tools/list + projeto_listar",
    );

    const nomesSql = ferramentas
      .filter((t) => {
        const chaves = Object.keys(t.inputSchema?.properties ?? {});
        return (
          /\b(sql|sqlite|query|exec|raw)\b/i.test(t.name ?? "") ||
          chaves.some((k) => /^(sql|query|statement)$/i.test(k))
        );
      })
      .map((t) => t.name);
    checar(
      "catálogo de 15 tools sem ferramenta de SQL",
      ferramentas.length === 15 && nomesSql.length === 0,
      nomesSql.length ? nomesSql.join(", ") : "15 tools, nenhuma consulta SQL exposta",
    );

    const idOrigem = extrairIdDesign(projetos.result?.structuredContent);
    if (!idOrigem) {
      checar(
        "templates_preencher com save:true cria design novo",
        false,
        "nenhum design existente para usar como origem; não automatizável com confiança",
      );
    } else {
      const rPreencher = await post(
        CAMINHO,
        moderno(3, "tools/call", { name: "templates_preencher", arguments: { id: idOrigem, values: {}, save: true } }),
        token,
        hdrs("tools/call"),
      );
      const preenchido = parse(rPreencher.body);
      checar(
        "templates_preencher com save:true cria design novo (efeito esperado)",
        rPreencher.status === 200 && !preenchido.result?.isError && !!preenchido.result?.structuredContent?.design?.id,
        seg(rPreencher.body, token),
      );
    }

    const raizesDepois = snapshotRaizes();
    const novos = novasEntradas(raizesAntes, raizesDepois);
    checar(
      "nenhum arquivo/pasta novo fora da pasta do app (escopo: raízes observadas)",
      novos.length === 0,
      novos.length ? novos.slice(0, 6).join(" | ") : "%APPDATA%, %LOCALAPPDATA%, %USERPROFILE%, dir do exe",
    );

    // ------------------------------------------------------------- AC-09 ---
    console.log("\n=== AC-09 ===");
    const emVoo = [];
    for (let i = 0; i < 3; i++) {
      emVoo.push(
        post(
          CAMINHO,
          moderno(20 + i, "tools/call", { name: "projeto_listar", arguments: {} }),
          token,
          hdrs("tools/call"),
        ),
      );
    }
    const conexoes = amostraConexoes();
    const processos = amostraProcessos();
    await Promise.all(emVoo).catch(() => {});

    checar("amostra Get-NetTCPConnection disponível", conexoes.ok, conexoes.ok ? `${conexoes.linhas.length} linhas` : conexoes.erro);
    checar("amostra Get-CimInstance Win32_Process disponível", processos.ok, processos.ok ? `${processos.linhas.length} processos` : processos.erro);

    const arvore = descendentes(pidApp, processos.linhas);
    checar("PID do app identificado na amostra de processos", processos.ok && arvore.vista.has(pidApp), `PID ${pidApp}`);

    const naoLoopback = conexoes.linhas.filter((linha) => {
      const c = linha.split(",");
      return (
        c.length >= 6 &&
        c[0].toLowerCase() === "established" &&
        arvore.vista.has(Number(c[5])) &&
        !ipLoopback(c[3])
      );
    });
    checar(
      "nenhuma conexão established não-loopback no app e filhos",
      conexoes.ok && processos.ok && naoLoopback.length === 0,
      naoLoopback.length ? naoLoopback.slice(0, 3).join(" | ") : "apenas loopback",
    );

    const porta4747 = conexoes.linhas.filter((linha) => {
      const c = linha.split(",");
      return c.length >= 6 && (c[2] === "4747" || c[4] === "4747");
    });
    checar("nenhuma conexão/porta 4747", conexoes.ok && porta4747.length === 0, porta4747.length ? porta4747.slice(0, 3).join(" | ") : "nenhuma");

    const suspeitos = arvore.processos.filter(
      (p) => p.pid !== pidApp && /\bwrangler\b|\bnode(?:\.exe)?\b|\bd1\b|\br2\b/i.test(p.nome + " " + p.cmd),
    );
    checar(
      "nenhum processo filho wrangler/node/D1/R2",
      processos.ok && suspeitos.length === 0,
      suspeitos.length ? suspeitos.slice(0, 3).map((p) => `${p.nome}:${p.cmd}`.slice(0, 120)).join(" | ") : "nenhum",
    );

    const bytesExe = readFileSync(EXE, "latin1").toLowerCase();
    checar("exe sem ':4747'", !bytesExe.includes(":4747"));
    checar("exe sem 'wrangler'", !bytesExe.includes("wrangler"));
    checar(
      "cobertura completa de egresso (firewall/proxy/UDP/DNS)",
      false,
      "não automatizável com confiança: o harness não instala firewall/proxy nem captura UDP/DNS; cobertura limitada a TCP, processos e strings do exe",
    );

    // ------------------------------------------------------------- AC-13 ---
    console.log("\n=== AC-13 ===");
    checar("listener ativo antes do restart", await listenerAtivo(), "confirmação prévia ao matar o app");
    cdp.fechar();
    matar(pidApp);
    await dormir(1200);
    const fechouCdp = await esperarCdpFechar(CDP_HTTP);
    checar("CDP 9346 encerrou ao matar o app", fechouCdp, fechouCdp ? "porta fechada" : "porta ainda responde");
    const livreAposMorte = await esperarPortaLivre();
    checar("porta 8788 fechou ao matar o app", livreAposMorte.verificada && livreAposMorte.livre, livreAposMorte.detalhe);

    // Relança com o MESMO perfil WebView2.
    const religado = iniciarApp(perfil);
    pidApp = religado.pid;
    cdp = registrarCdp(await conectarCdp(await esperarCdp(CDP_HTTP)));
    await esperarApp(cdp);
    const painel = await abrirPainel(cdp);
    checar("painel de Acesso do agente disponível após restart", painel, painel ? "#agent-access-toggle" : "ausente");

    const estadoToggle = painel
      ? await cdp.evaluate(`document.querySelector('#agent-access-toggle')?.getAttribute('aria-checked') ?? null`)
      : null;
    checar(
      "toggle #agent-access-toggle NÃO está aria-checked=true após restart",
      painel && estadoToggle !== "true",
      `aria-checked=${estadoToggle}`,
    );
    const autoStart = painel
      ? await cdp.evaluate(`(() => {
          const cb = document.querySelector('.agent-access-check input[type=checkbox]');
          return cb ? { checked: cb.checked, disabled: cb.disabled } : null;
        })()`)
      : null;
    checar(
      "checkbox de auto-start desmarcado e desabilitado após restart",
      !!autoStart && autoStart.checked === false && autoStart.disabled === true,
      JSON.stringify(autoStart),
    );

    const livreAposRestart = await esperarPortaLivre(1500);
    checar("porta 8788 livre após restart", livreAposRestart.verificada && livreAposRestart.livre, livreAposRestart.detalhe);

    const varredura = varrerPerfil(perfil);
    checar(
      "perfil WebView2 sem 'mcp_enable'/'auto_start' persistidos",
      varredura.encontrados.length === 0 && varredura.ilegiveis === 0,
      `${varredura.arquivos} arquivos, ${varredura.ilegiveis} ilegíveis` +
        (varredura.encontrados.length ? `, achados: ${varredura.encontrados.slice(0, 3).join(" | ")}` : ""),
    );

    // ------------------------------------------------------------- AC-19 ---
    console.log("\n=== AC-19 ===");
    const religadoUi = await iniciarHttpPelaUi(cdp);
    token = religadoUi.token;
    checar("MCP religado pela UI para amostragem AC-19", /^[0-9a-f]{64}$/.test(token), seg(token, token));

    const amostras = [];
    for (let rodada = 0; rodada < 2; rodada++) {
      const chamadas = [
        post(CAMINHO, moderno(30 + rodada, "tools/list"), token, hdrs("tools/list")),
        post(
          CAMINHO,
          moderno(40 + rodada, "tools/call", { name: "projeto_listar", arguments: {} }),
          token,
          hdrs("tools/call"),
        ),
      ];
      amostras.push(amostraNetstat());
      await Promise.all(chamadas).catch(() => {});
    }
    checar(
      "netstat disponível durante chamada MCP em voo",
      amostras.every((a) => a.ok),
      amostras.map((a) => a.erro || "amostra obtida").join(" | "),
    );
    const com8787 = amostras.filter((a) => /:8787\b/.test(a.texto));
    checar(
      "nenhuma conexão :8787 durante chamada MCP em voo",
      amostras.every((a) => a.ok) && com8787.length === 0,
      com8787.length ? "conexão :8787 observada" : "2 amostras; janelas de curtíssima duração podem escapar",
    );

    let fonteBackend = null;
    try {
      fonteBackend = readFileSync(FONTE_BACKEND, "utf8");
    } catch (e) {
      fonteBackend = null;
    }
    checar("backend-tauri.ts legível no worktree", fonteBackend !== null, FONTE_BACKEND);
    if (fonteBackend !== null) {
      const codigo = semComentarios(fonteBackend);
      checar("backend desktop canônico usa localApi()", codigo.includes("localApi"), "localApi(");
      checar("backend desktop sem chamada fetch(", !/\bfetch\s*\(/.test(codigo));
      checar("backend desktop sem literal 8787 fora de comentários", !/8787/.test(codigo));
    }
  } catch (erro) {
    checar("execução do harness sem erro inesperado", false, sanitizar(erro?.stack ?? String(erro), token || ""));
    if (erroApp) console.log("  (stderr do app: " + sanitizar(erroApp.slice(0, 240), token || "") + ")");
  } finally {
    limpar();
  }

  console.log(`\nRESULTADO: ${aprovados} OK / ${reprovados} FALHA`);
  process.exit(reprovados === 0 ? 0 : 1);
}

main();
