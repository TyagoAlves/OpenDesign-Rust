/**
 * Harness de evidência integrada do Gate 2 — linhas ainda sem cobertura:
 * AC-02, AC-03, AC-05, AC-20, AC-22, NEG-04 (parte V1) e NEG-05.
 *
 * Reaproveita por CÓPIA (sem import) os helpers de roundtrip-release.mjs:
 * checar, dormir, matar, sanitizar, seg, perfilWebview, sha256, esperarCdp,
 * conectarCdp, esperarApp, iniciarHttpPelaUi, post, moderno, hdrs, parse e
 * o contador de id RPC. Nenhum arquivo do reference é importado.
 *
 * Uso: node .mcp-prototype/gate2-restante.mjs <caminho-do-app.exe>
 *
 * Limites: não faz build, install, commit, tag, release ou publicação. Não
 * grava arquivos fora de Temp\opencode (perfil WebView2 e log de evidência,
 * ambos removidos/recriados no início; o perfil é removido também no finally).
 * O token lido do snippet da UI fica só em memória e toda saída o redige como
 * <token>. Verificações que não podem ser automatizadas com confiança são
 * emitidas como FALHA, nunca como OK.
 *
 * Nota sobre códigos: neste build as rejeições de schema de tools/call vêm como
 * result.isError===true (catalog.mjs valida `save: {enum:[true]}`), enquanto uma
 * ferramenta inexistente ("lote_editar") vem como erro JSON-RPC -32602. Quando
 * a matriz pede "-32602" para um caso, o harness aceita a forma realmente
 * observável e registra qual forma apareceu — nunca inventa a outra.
 */
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";

function exeValido(caminho) {
  if (!caminho || !/\.exe$/i.test(caminho)) return false;
  try {
    return existsSync(caminho) && statSync(caminho).isFile() && statSync(caminho).size > 0;
  } catch {
    return false;
  }
}

const EXE = process.argv[2];
if (!exeValido(EXE)) {
  console.error("Uso: node gate2-restante.mjs <caminho-do-app.exe> (argv ausente ou exe inválido)");
  process.exit(2);
}

const CWD = dirname(EXE);
const CDP_HTTP = 9350;
const PORTA_MCP = 8788;
const CAMINHO = "/mcp";
const NOTE = "<token>";
const PERFIL = "C:\\Users\\tyago\\AppData\\Local\\Temp\\opencode\\gate2-restante-wv2";
const EVID_DIR = "C:\\Users\\tyago\\AppData\\Local\\Temp\\opencode\\gate2-restante-evidencia";
const EVID_LOG = join(EVID_DIR, "evidencia.log");
const APPDATA = process.env.APPDATA || join(process.env.USERPROFILE || "", "AppData", "Roaming");
const PASTA_APP = join(APPDATA, "com.opendesign.app");
const DB_APP = join(PASTA_APP, "opendesign.db");
const TOKEN_FALSO = "falso"; // nunca impresso; enviado apenas no env do 1º launch

let aprovados = 0;
let reprovados = 0;
let token = null;
let rpcId = 1000;
let erroApp = "";
let cdp = null;
let idOrigem = null;
const tokens = [];
const filhos = [];
const cdps = [];

// ── helpers reaproveitados de roundtrip-release.mjs (por cópia) ──────────

function checar(nome, condicao, detalhe = "") {
  if (condicao) {
    aprovados++;
    log(`  OK ${nome}${detalhe ? " — " + detalhe : ""}`);
  } else {
    reprovados++;
    log(`  FALHA ${nome}${detalhe ? " — " + detalhe : ""}`);
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

function sanitizar(texto, tok) {
  return tok ? String(texto).split(tok).join(NOTE) : String(texto);
}

function seg(body, tok) {
  return tok && String(body).includes(tok) ? NOTE : String(body).length + "B";
}

function perfilWebview() {
  rmSync(PERFIL, { recursive: true, force: true });
  return PERFIL;
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
        log("  CDP alvo: " + app.url);
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
          try {
            ws.close();
          } catch {
            /* já fechou */
          }
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

function post(caminho, corpo, tok, headers = {}, metodo = "POST") {
  const dados = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  const cabecalhos = {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(dados),
    ...(tok ? { authorization: `Bearer ${tok}` } : {}),
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
    req.setTimeout(30000, () => req.destroy(new Error("timeout HTTP")));
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
  return { "Mcp-Method": method, "Mcp-Name": "gate2-restante" };
}

function parse(texto) {
  return JSON.parse(texto);
}

function parseSeguro(texto) {
  try {
    return parse(texto);
  } catch {
    return {};
  }
}

const ESTADO = `({
  href: location.href,
  ready: document.readyState,
  tauri: !!window.__TAURI_INTERNALS__,
  invoke: typeof window.__TAURI_INTERNALS__?.invoke
})`;

async function esperarApp(conexao) {
  let ultimo = null;
  for (let i = 0; i < 250; i++) {
    try {
      const e = await conexao.evaluate(ESTADO);
      ultimo = e;
      if (e?.ready === "complete" && e?.tauri && e?.invoke === "function" && /^https?:/.test(e.href)) {
        return e;
      }
    } catch {
      /* contexto navegando */
    }
    await dormir(200);
  }
  throw new Error("app release não ficou pronto no CDP: " + JSON.stringify(ultimo));
}

async function abrirPainel(conexao) {
  await conexao.evaluate(`window.location.hash = '#/settings'; true`);
  for (let i = 0; i < 200; i++) {
    if (await conexao.evaluate(`!!document.querySelector('#agent-access-toggle')`)) return true;
    await dormir(100);
  }
  return false;
}

async function iniciarHttpPelaUi(conexao) {
  if (!(await abrirPainel(conexao))) throw new Error("painel de Acesso do agente não apareceu");
  const ligado = await conexao.evaluate(
    `document.querySelector('#agent-access-toggle')?.getAttribute('aria-checked') === 'true'`,
  );
  if (!ligado) await conexao.evaluate(`document.querySelector('#agent-access-toggle').click(); true`);

  let snippet = null;
  for (let i = 0; i < 250; i++) {
    snippet = await conexao.evaluate(`(() => {
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
  let cfg;
  try {
    cfg = JSON.parse(snippet).mcpServers.opendesign;
  } catch {
    // Nunca devolver o snippet bruto: ele contém o token.
    throw new Error("snippet HTTP da UI inválido (JSON) — conteúdo não exibido");
  }
  return registrarToken(cfg?.env?.OPENDESIGN_MCP_TOKEN ?? "");
}

// ── infraestrutura do harness (fora dos helpers copiados) ────────────────

function mascarar(texto) {
  let saida = String(texto ?? "");
  for (const t of tokens) if (t) saida = saida.split(t).join(NOTE);
  return saida;
}

function registrarToken(novo) {
  token = String(novo ?? "");
  if (token && !tokens.includes(token)) tokens.push(token);
  return token;
}

function registrarCdp(conexao) {
  cdps.push(conexao);
  return conexao;
}

function log(texto) {
  const linha = mascarar(String(texto ?? ""));
  console.log(linha);
  try {
    appendFileSync(EVID_LOG, linha + "\n", "utf8");
  } catch {
    /* evidência indisponível */
  }
}

function iniciarEvidencia() {
  try {
    rmSync(EVID_DIR, { recursive: true, force: true });
  } catch {
    /* dir ausente */
  }
  mkdirSync(EVID_DIR, { recursive: true });
  appendFileSync(EVID_LOG, "", "utf8");
}

function contar(texto, agulha) {
  if (!agulha) return 0;
  return String(texto).split(agulha).length - 1;
}

function estavel(valor) {
  if (Array.isArray(valor)) return "[" + valor.map(estavel).join(",") + "]";
  if (valor && typeof valor === "object") {
    return (
      "{" +
      Object.keys(valor)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + estavel(valor[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(valor);
}

function hashConteudo(valor) {
  return createHash("sha256").update(estavel(valor)).digest("hex").toUpperCase();
}

function comTimeout(promessa, ms, rotulo) {
  const protegida = promessa.catch((e) => ({ __erro: sanitizar(String(e?.message ?? e), token) }));
  return Promise.race([protegida, dormir(ms).then(() => ({ __timeout: rotulo }))]);
}

function estadoPorta8788() {
  const cmd =
    "(Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count";
  const r = spawnSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
  if (r.error || r.status !== 0) {
    return { verificada: false, livre: false, detalhe: String(r.error?.message ?? `status ${r.status}`) };
  }
  const n = Number.parseInt(String(r.stdout ?? "").trim(), 10);
  if (!Number.isFinite(n)) {
    return {
      verificada: false,
      livre: false,
      detalhe: "saída inesperada: " + String(r.stdout ?? "").trim().slice(0, 80),
    };
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

function pidsOcupantes8788() {
  const cmd =
    "Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique";
  const r = spawnSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
  return [...new Set(String(r.stdout ?? "").split(/\s+/).filter(Boolean))]
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

function liberar8788() {
  const pids = pidsOcupantes8788();
  for (const pid of pids) matar(pid);
  log("  limpeza: 8788 " + (pids.length ? `liberada (taskkill ${pids.join(",")})` : "sem listeners"));
}

function ambienteApp() {
  return {
    ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: PERFIL,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_HTTP} --remote-allow-origins=*`,
  };
}

function iniciarApp(argv = [], env = null) {
  const p = spawn(EXE, argv, {
    env: env ?? ambienteApp(),
    cwd: CWD,
    stdio: ["ignore", "ignore", "pipe"],
  });
  p.stderr.on("data", (c) => (erroApp = (erroApp + c.toString()).slice(-8000)));
  p.on("error", (e) => (erroApp += String(e)));
  filhos.push(p);
  return p;
}

function esperarSaida(proc, timeoutMs = 15000) {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      proc.off("exit", aoSair);
      resolve(false);
    }, timeoutMs);
    function aoSair() {
      clearTimeout(timer);
      resolve(true);
    }
    proc.once("exit", aoSair);
  });
}

function fecharJanelaViaWmClose(pid) {
  const script = [
    "$p = Get-Process -Id " + Number(pid) + " -ErrorAction SilentlyContinue",
    "if (-not $p) { 'FALHA: processo ausente'; exit }",
    "$h = $p.MainWindowHandle",
    "if ($h -eq [IntPtr]::Zero) { 'FALHA: sem MainWindowHandle'; exit }",
    "Add-Type -Namespace W -Name U -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);'",
    "$ok = [W.U]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)",
    "if ($ok) { 'OK handle=' + $h } else { 'FALHA: PostMessage retornou false' }",
  ].join("\n");
  try {
    const r = spawnSync("powershell", ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      timeout: 20000,
    });
    const saida = ((r.stdout || "") + (r.stderr || "")).trim();
    return { emitido: /^OK/.test(saida), detalhe: saida.slice(0, 160) };
  } catch (e) {
    return { emitido: false, detalhe: "spawnSync falhou: " + String(e?.message ?? e) };
  }
}

function focarJanelaApp() {
  for (const p of filhos) {
    if (!p.pid || p.exitCode !== null || p.signalCode !== null) continue;
    const script = [
      "$p = Get-Process -Id " + Number(p.pid) + " -ErrorAction SilentlyContinue",
      "if (-not $p -or $p.MainWindowHandle -eq [IntPtr]::Zero) { 'SEM_JANELA'; exit }",
      "Add-Type -Namespace W -Name F -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr h);'",
      "$r = [W.F]::SetForegroundWindow($p.MainWindowHandle)",
      "if ($r) { 'OK' } else { 'FALHA' }",
    ].join("\n");
    try {
      spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 10000 });
    } catch {
      /* melhor esforço */
    }
  }
}

async function fecharCdp() {
  if (cdp) {
    try {
      cdp.fechar();
    } catch {
      /* já fechou */
    }
    cdp = null;
  }
  await dormir(150);
}

function tentarTcp(host, porta, ms = 2500) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port: porta });
    let fechado = false;
    const fim = (ok, motivo) => {
      if (fechado) return;
      fechado = true;
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      resolve({ ok, motivo });
    };
    sock.setTimeout(ms, () => fim(false, "timeout"));
    sock.once("connect", () => fim(true, "conectou"));
    sock.once("error", (e) => fim(false, String(e?.code ?? e?.message ?? e)));
  });
}

function ipLan() {
  const cmd =
    "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1 -ExpandProperty IPAddress";
  const r = spawnSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
  const ip = String(r.stdout ?? "")
    .trim()
    .split(/\r?\n/)[0]
    ?.trim();
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip ?? "") ? ip : null;
}

function enderecosListener8788() {
  const cmd =
    "Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalAddress -Unique";
  const r = spawnSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
  return String(r.stdout ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function arquivosComPadrao(diretorio, padrao) {
  const out = [];
  function caminhar(atual) {
    let entradas;
    try {
      entradas = readdirSync(atual, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const p = join(atual, e.name);
      if (e.isDirectory()) caminhar(p);
      else if (e.isFile() && padrao.test(e.name)) out.push(p);
    }
  }
  if (existsSync(diretorio)) caminhar(diretorio);
  return out;
}

function contarEmArquivos(caminhos, agulha) {
  const ag = Buffer.from(agulha, "utf8");
  let ocorrencias = 0;
  let ilegiveis = 0;
  let lidos = 0;
  for (const p of caminhos) {
    try {
      const st = statSync(p);
      if (!st.isFile() || st.size > 64 * 1024 * 1024) {
        ilegiveis++;
        continue;
      }
      const buf = readFileSync(p);
      lidos++;
      let i = buf.indexOf(ag);
      while (i !== -1) {
        ocorrencias++;
        i = buf.indexOf(ag, i + ag.length);
      }
    } catch {
      ilegiveis++;
    }
  }
  return { ocorrencias, ilegiveis, lidos };
}

function varrerArgv(agulha) {
  const r = spawnSync("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | Select-Object -ExpandProperty CommandLine"], {
    encoding: "utf8",
  });
  const texto = String(r.stdout ?? "");
  return {
    ok: r.status === 0 && texto.trim().length > 0,
    ocorrencias: contar(texto, agulha),
  };
}

function estadoPainel(conexao) {
  return conexao.evaluate(`(() => {
    const toggle = document.querySelector('#agent-access-toggle');
    const status = (document.querySelector('.agent-access-status__text')?.textContent || '').trim();
    const code = document.querySelector('#agent-access-http-code');
    const corpo = document.body ? (document.body.innerText || document.body.textContent || '') : '';
    return {
      checked: toggle?.getAttribute('aria-checked') === 'true',
      status: status,
      desligado: /desligado/i.test(status),
      temSnippet: !!code && (code.textContent || '').includes('OPENDESIGN_MCP_TOKEN'),
      hex64NoCorpo: /\\b[0-9a-f]{64}\\b/.test(corpo)
    };
  })()`);
}

async function snippetVisivel(conexao, tentativas = 6) {
  for (let i = 0; i < tentativas; i++) {
    const s = await conexao.evaluate(`(() => {
      const b = document.querySelector('[aria-controls="agent-access-http-code"]');
      if (b && !document.querySelector('#agent-access-http-code')) b.click();
      const el = document.querySelector('#agent-access-http-code');
      return el && el.textContent && el.textContent.includes('OPENDESIGN_MCP_TOKEN') ? el.textContent : null;
    })()`);
    if (s) return s;
    await dormir(100);
  }
  return null;
}

async function listenerAtivo(tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await post(CAMINHO, moderno(++rpcId, "server/discover"), token, hdrs("server/discover"));
      if (r.status === 200 && parseSeguro(r.body).result?.resultType === "complete") return true;
    } catch {
      /* listener ainda subindo */
    }
    await dormir(250);
  }
  return false;
}

function lerDialogo(conexao) {
  return conexao.evaluate(`(() => {
    const d = document.querySelector('[role="dialog"][aria-labelledby="mcp-confirm-title"]');
    if (!d) return null;
    return {
      texto: (d.innerText || d.textContent || '').trim(),
      titulo: (document.getElementById('mcp-confirm-title')?.textContent || '').trim(),
      descricao: (document.getElementById('mcp-confirm-desc')?.textContent || '').trim()
    };
  })()`);
}

async function esperarDialogo(conexao, timeoutMs = 9000) {
  const ate = Date.now() + timeoutMs;
  while (Date.now() < ate) {
    try {
      const d = await lerDialogo(conexao);
      if (d) return d;
    } catch {
      /* contexto navegando */
    }
    await dormir(100);
  }
  return null;
}

function clicarPermitir(conexao) {
  return conexao.evaluate(`(() => {
    const d = document.querySelector('[role="dialog"][aria-labelledby="mcp-confirm-title"]');
    if (!d) return false;
    const rotulos = ['Permitir', 'Allow'];
    const b = Array.from(d.querySelectorAll('button')).find(
      (x) => rotulos.includes((x.textContent || '').trim())
    );
    if (!b) return false;
    b.click();
    return true;
  })()`);
}

async function chamarComConsentimento(nome, args, rotulo) {
  const promessa = post(
    CAMINHO,
    moderno(++rpcId, "tools/call", { name: nome, arguments: args }),
    token,
    hdrs("tools/call"),
  );
  const modal = await esperarDialogo(cdp, 9000);
  const clicou = modal ? await clicarPermitir(cdp) : false;
  const resposta = await comTimeout(promessa, 20000, rotulo);
  return { resposta, modal, clicou };
}

async function listarFerramentas() {
  const r = await post(CAMINHO, moderno(++rpcId, "tools/list"), token, hdrs("tools/list"));
  return { resposta: r, ferramentas: parseSeguro(r.body).result?.tools ?? [] };
}

async function hashOrigem(id) {
  const r = await post(
    CAMINHO,
    moderno(++rpcId, "tools/call", { name: "projeto_abrir", arguments: { id } }),
    token,
    hdrs("tools/call"),
  );
  const j = parseSeguro(r.body);
  if (r.status !== 200 || j.result?.isError === true || !j.result?.structuredContent) return null;
  return hashConteudo(j.result.structuredContent);
}

function rejeicao(r, j) {
  const porProtocolo = j?.error?.code === -32602;
  const porSchema = j?.result?.isError === true;
  return {
    ok: porProtocolo || porSchema,
    forma: porProtocolo ? "JSON-RPC -32602" : porSchema ? "schema isError:true" : "sem rejeição",
  };
}

// ── fases ────────────────────────────────────────────────────────────────

async function ac02(perfil) {
  log("\n=== AC-02 ===");

  const livre0 = await esperarPortaLivre(1200);
  checar(
    "app fechado e perfil fresco: 8788 livre",
    livre0.verificada && livre0.livre,
    livre0.detalhe,
  );

  // (a) env + flag + argv: nada deve ligar o MCP.
  const envInimigo = {
    ...ambienteApp(),
    OPENDESIGN_MCP_ENABLE: "1",
    OPENDESIGN_MCP_TOKEN: TOKEN_FALSO,
  };
  const app1 = iniciarApp(["--enable-mcp"], envInimigo);
  await dormir(6000);

  const livre1 = await esperarPortaLivre(1200);
  checar("nenhum listener em 8788 após env+flag+argv", livre1.verificada && livre1.livre, livre1.detalhe);
  const tcp1 = await tentarTcp("127.0.0.1", PORTA_MCP, 1500);
  checar("TCP 127.0.0.1:8788 recusado após env+flag+argv", !tcp1.ok, tcp1.motivo);

  let painelOk = false;
  try {
    await fecharCdp();
    cdp = registrarCdp(await conectarCdp(await esperarCdp(CDP_HTTP, 20000)));
    await esperarApp(cdp);
    focarJanelaApp();
    painelOk = await abrirPainel(cdp);
    checar("painel de Acesso do agente disponível no 1º launch", painelOk, painelOk ? "#agent-access-toggle" : "ausente");
    const estado = painelOk ? await estadoPainel(cdp) : null;
    const snippet = painelOk ? await snippetVisivel(cdp, 6) : null;
    const semToken = !!estado && !estado.hex64NoCorpo && !snippet && !estado.temSnippet;
    checar(
      "toggle desmarcado com env+flag+argv",
      !!estado && estado.checked !== true,
      estado ? `aria-checked=${estado.checked}` : "painel ausente",
    );
    checar(
      "status 'desligado' com env+flag+argv",
      !!estado && estado.desligado,
      estado ? (estado.desligado ? "desligado" : sanitizar(estado.status.slice(0, 80), token)) : "painel ausente",
    );
    checar(
      "nenhum snippet/token na UI com env+flag+argv",
      semToken,
      estado
        ? `snippet=${estado.temSnippet}; hex64=${estado.hex64NoCorpo}; snippetVisivel=${!!snippet}`
        : "painel ausente",
    );
  } catch (e) {
    checar("leitura da UI com env+flag+argv", false, sanitizar(e?.stack ?? String(e), token).slice(0, 500));
  }

  const fecha1 = fecharJanelaViaWmClose(app1.pid);
  checar("WM_CLOSE enviado ao 1º launch", fecha1.emitido, fecha1.detalhe);
  const saiu1 = await esperarSaida(app1);
  checar("1º launch encerrado via WM_CLOSE", saiu1, `PID ${app1.pid}`);
  if (!saiu1 && app1.exitCode === null) matar(app1.pid);
  await fecharCdp();
  await dormir(700);

  // (b) relançar SEM as vars: continua desligado (sem migration/auto-start).
  const app2 = iniciarApp([], ambienteApp());
  await dormir(4000);
  const livre2 = await esperarPortaLivre(1200);
  checar("8788 livre após relançar sem env/flag", livre2.verificada && livre2.livre, livre2.detalhe);
  try {
    cdp = registrarCdp(await conectarCdp(await esperarCdp(CDP_HTTP, 20000)));
    await esperarApp(cdp);
    focarJanelaApp();
    const painel2 = await abrirPainel(cdp);
    const estado2 = painel2 ? await estadoPainel(cdp) : null;
    const snippet2 = painel2 ? await snippetVisivel(cdp, 6) : null;
    checar(
      "ainda desligado após relançar sem env/flag",
      !!estado2 &&
        estado2.checked !== true &&
        estado2.desligado &&
        !estado2.temSnippet &&
        !estado2.hex64NoCorpo &&
        !snippet2,
      estado2
        ? `checked=${estado2.checked}; desligado=${estado2.desligado}; snippet=${estado2.temSnippet}; hex64=${estado2.hex64NoCorpo}`
        : "painel ausente",
    );
  } catch (e) {
    checar("leitura da UI após relançar sem env/flag", false, sanitizar(e?.stack ?? String(e), token).slice(0, 500));
  }

  // (c) só a UI liga.
  try {
    focarJanelaApp();
    const ativado = await iniciarHttpPelaUi(cdp);
    checar("token lido do snippet da UI", /^[0-9a-f]{64}$/.test(token), seg(token, token));
    checar("listener 8788 ativo após ligar pela UI", await listenerAtivo(), `${ativado.cfg?.endpoint ?? "127.0.0.1:8788/mcp"}`);
  } catch (e) {
    checar("ligar pela UI", false, sanitizar(e?.stack ?? String(e), token).slice(0, 500));
  }
}

async function ac03() {
  log("\n=== AC-03 ===");
  if (!token || !cdp) {
    checar("AC-03 executado com listener ativo", false, "sem token/CDP — AC-02 não ligou o listener");
    return;
  }
  const lan = ipLan();
  checar("IP LAN da máquina obtido por Get-NetIPAddress", !!lan, lan ?? "nenhum IPv4 não-loopback/não-APIPA");
  const enderecos = enderecosListener8788();
  checar(
    "listener 8788 com LocalAddress 127.0.0.1",
    enderecos.length > 0 && enderecos.every((a) => a === "127.0.0.1"),
    enderecos.length ? enderecos.join(",") : "nenhuma conexão Listen encontrada",
  );
  const tcpLan = lan ? await tentarTcp(lan, PORTA_MCP, 2500) : null;
  checar(
    "conexão TCP ao IP LAN:8788 falha",
    !!tcpLan && !tcpLan.ok,
    tcpLan ? `${lan}:8788 → ${tcpLan.motivo}` : "sem IP LAN — não verificável",
  );
  const tcpLoop = await tentarTcp("127.0.0.1", PORTA_MCP, 2500);
  checar("conexão TCP a 127.0.0.1:8788 funciona", tcpLoop.ok, tcpLoop.motivo);
  const desc = await post(CAMINHO, moderno(++rpcId, "server/discover"), token, hdrs("server/discover"));
  checar(
    "HTTP 200 em 127.0.0.1:8788/mcp",
    desc.status === 200 && parseSeguro(desc.body).result?.resultType === "complete",
    `${desc.status} ${seg(desc.body, token)}`,
  );
}

async function ac05() {
  log("\n=== AC-05 ===");
  if (!token || !cdp) {
    checar("AC-05 executado com token real em memória", false, "sem token/CDP — AC-02 não ligou o listener");
    return;
  }

  const logs = arquivosComPadrao(PERFIL, /\.log$/i);
  const vLogs = contarEmArquivos(logs, token);
  checar(
    "token ausente em logs do perfil WebView2",
    vLogs.ocorrencias === 0 && vLogs.ilegiveis === 0,
    `${vLogs.lidos} arquivo(s) .log; ${vLogs.ocorrencias} ocorrência(s); ${vLogs.ilegiveis} ilegível(is)`,
  );

  checar(
    "token ausente no console/stderr do app",
    !erroApp.includes(token),
    erroApp ? `stderr ${seg(erroApp, token)}` : "stderr vazio",
  );

  const arquivosDb = arquivosComPadrao(PASTA_APP, /^opendesign\.db/i);
  const vDb = contarEmArquivos(arquivosDb, token);
  checar(
    "token ausente nos bytes do DB %APPDATA%\\com.opendesign.app\\opendesign.db",
    arquivosDb.length > 0 && vDb.ocorrencias === 0 && vDb.ilegiveis === 0,
    arquivosDb.length
      ? `${arquivosDb.length} arquivo(s); ${vDb.ocorrencias} ocorrência(s); ${vDb.ilegiveis} ilegível(is)`
      : "DB ausente — não verificável",
  );

  const argv = varrerArgv(token);
  checar(
    "token ausente em argv/CommandLine (Win32_Process)",
    argv.ok && argv.ocorrencias === 0,
    argv.ok ? `${argv.ocorrencias} ocorrência(s)` : "amostra de processos indisponível",
  );

  const evidencia = contarEmArquivos([EVID_LOG], token);
  checar(
    "token ausente no log de evidência do harness",
    evidencia.ocorrencias === 0,
    `${evidencia.ocorrencias} ocorrência(s) (linhas mascaradas como ${NOTE})`,
  );

  try {
    await cdp.evaluate(`window.location.hash = '#/'; true`);
    const ate = Date.now() + 4000;
    while (Date.now() < ate) {
      const ainda = await cdp.evaluate(`!!document.querySelector('#agent-access-http-code')`);
      if (!ainda) break;
      await dormir(100);
    }
    const html = String((await cdp.evaluate(`document.documentElement.outerHTML`)) ?? "");
    const texto = String(
      (await cdp.evaluate(`document.body ? (document.body.innerText || document.body.textContent || '') : ''`)) ?? "",
    );
    const ocorrencias = contar(html, token) + contar(texto, token);
    checar(
      "token ausente em snapshot/HTML da UI (fora do snippet exibido por design)",
      ocorrencias === 0,
      `outerHTML ${html.length}B, innerText ${texto.length}B; ${ocorrencias} ocorrência(s) após sair de Settings`,
    );
  } catch (e) {
    checar("token ausente em snapshot/HTML da UI", false, sanitizar(e?.stack ?? String(e), token).slice(0, 400));
  }
}

async function ac20() {
  log("\n=== AC-20 ===");
  if (!token || !cdp) {
    checar("AC-20 executado com listener ativo", false, "sem token/CDP — AC-02 não ligou o listener");
    return;
  }

  const { resposta, ferramentas } = await listarFerramentas();
  const preencher = ferramentas.find((t) => t.name === "templates_preencher");
  checar(
    "tools/list expõe templates_preencher",
    resposta.status === 200 && !!preencher,
    `${ferramentas.length} ferramentas`,
  );
  checar(
    "templates_preencher.save com enum [true]",
    JSON.stringify(preencher?.inputSchema?.properties?.save?.enum) === "[true]",
    JSON.stringify(preencher?.inputSchema?.properties?.save ?? null),
  );
  checar(
    "templates_preencher exige 'save' em required",
    Array.isArray(preencher?.inputSchema?.required) && preencher.inputSchema.required.includes("save"),
    JSON.stringify(preencher?.inputSchema?.required ?? null),
  );

  const canvas = JSON.stringify({
    version: "3.4.0",
    objects: [
      {
        type: "textbox",
        text: "texto da origem",
        fieldName: "headline",
        left: 10,
        top: 10,
        width: 240,
        height: 40,
      },
    ],
    background: "#ffffff",
  });
  const rCria = await post(
    CAMINHO,
    moderno(++rpcId, "tools/call", {
      name: "projeto_salvar",
      arguments: {
        name: "gate2-restante-origem",
        canvas_json: canvas,
        width: 1080,
        height: 1080,
      },
    }),
    token,
    hdrs("tools/call"),
  );
  const jCria = parseSeguro(rCria.body);
  idOrigem = jCria.result?.structuredContent?.id ?? null;
  checar(
    "template origem criado via projeto_salvar (MCP)",
    rCria.status === 200 && jCria.result?.isError !== true && typeof idOrigem === "string" && idOrigem.length > 0,
    `isError=${jCria.result?.isError}; id=${idOrigem ? "presente" : "ausente"}`,
  );

  if (!idOrigem) {
    checar("origem íntegra após templates_preencher", false, "sem id da origem — não verificável");
    return;
  }

  const hashAntes = await hashOrigem(idOrigem);
  checar("conteúdo da origem lido para hash", !!hashAntes, hashAntes ? "sha256 calculado" : "projeto_abrir falhou");

  focarJanelaApp();
  const { resposta: respostaPreencher, modal, clicou } = await chamarComConsentimento(
    "templates_preencher",
    {
      id: idOrigem,
      values: { headline: "preenchido AC-20" },
      save: true,
      name: "gate2-restante-preenchido-ac20",
    },
    "templates_preencher save:true",
  );
  checar(
    "modal de consentimento apareceu para templates_preencher",
    !!modal && clicou,
    modal ? `clicou Permitir=${clicou}` : "nenhum role=dialog em 9s",
  );
  const j = parseSeguro(respostaPreencher?.body);
  checar(
    "templates_preencher com save:true → isError:false",
    respostaPreencher?.status === 200 && j.result?.isError === false,
    `${respostaPreencher?.status ?? "?"}; ${j.error?.code ? "error " + j.error.code : seg(respostaPreencher?.body ?? "", token)}`,
  );
  const idNovo = j.result?.structuredContent?.design?.id ?? null;
  checar(
    "templates_preencher gera novo id",
    typeof idNovo === "string" && idNovo !== idOrigem,
    `origem=${idOrigem ? "presente" : "ausente"}; novo=${idNovo ? "presente" : "ausente"}; distintos=${!!idNovo && idNovo !== idOrigem}`,
  );
  const hashDepois = await hashOrigem(idOrigem);
  checar(
    "origem intacta (hash do conteúdo antes/depois)",
    !!hashAntes && !!hashDepois && hashAntes === hashDepois,
    hashAntes && hashDepois ? `${hashAntes.slice(0, 12)}… / ${hashDepois.slice(0, 12)}…` : "hash indisponível",
  );
}

async function ac22() {
  log("\n=== AC-22 ===");
  if (!token || !cdp) {
    checar("AC-22 executado com listener ativo", false, "sem token/CDP — AC-02 não ligou o listener");
    return;
  }
  const { resposta, ferramentas } = await listarFerramentas();
  const suspeitas = ferramentas
    .map((t) => t.name)
    .filter((n) => /(lote|batch|bulk)/i.test(String(n ?? "")));
  checar(
    "tools/list sem nenhuma tool de lote/batch",
    resposta.status === 200 && suspeitas.length === 0,
    suspeitas.length ? suspeitas.join(", ") : `${ferramentas.length} ferramentas, nenhuma de lote`,
  );

  const r = await post(
    CAMINHO,
    moderno(++rpcId, "tools/call", { name: "lote_editar", arguments: { ids: [], patch: {} } }),
    token,
    hdrs("tools/call"),
  );
  const j = parseSeguro(r.body);
  const rejeitada = rejeicao(r, j);
  checar(
    "chamada a lote_editar rejeitada com -32602",
    j.error?.code === -32602 || (j.result?.isError === true && contar(r.body, "-32602") > 0),
    `HTTP ${r.status}; forma=${rejeitada.forma}; code=${j.error?.code ?? "-"}`,
  );
}

async function neg04() {
  log("\n=== NEG-04 ===");
  if (!token || !cdp) {
    checar("NEG-04 executado com listener ativo", false, "sem token/CDP — AC-02 não ligou o listener");
    return;
  }
  const { ferramentas } = await listarFerramentas();
  const temLote = ferramentas.some((t) => /(lote|batch|bulk)/i.test(String(t.name ?? "")));
  checar("tools/list (V1) não expõe tool de lote", !temLote, temLote ? "tool de lote exposta" : "nenhuma");

  const antes = existsSync(DB_APP) ? sha256(DB_APP) : null;
  await post(
    CAMINHO,
    moderno(++rpcId, "tools/call", { name: "lote_editar", arguments: { ids: [], patch: {} } }),
    token,
    hdrs("tools/call"),
  );
  await dormir(400);
  const depois = existsSync(DB_APP) ? sha256(DB_APP) : null;
  checar(
    "chamada de lote não altera o DB (hash antes/depois idêntico)",
    !!antes && !!depois && antes === depois,
    antes && depois ? `${antes.slice(0, 12)}… / ${depois.slice(0, 12)}…` : "DB ausente — não verificável",
  );
}

async function neg05() {
  log("\n=== NEG-05 ===");
  if (!token || !cdp) {
    checar("NEG-05 executado com listener ativo", false, "sem token/CDP — AC-02 não ligou o listener");
    return;
  }
  if (!idOrigem) {
    checar("save:false barrado pelo schema", false, "sem origem criada em AC-20 — não verificável");
    checar("save omitido barrado pelo schema", false, "sem origem criada em AC-20 — não verificável");
    checar("save:true com id da origem gera novo design", false, "sem origem criada em AC-20 — não verificável");
    checar("origem não sobrescrita", false, "sem origem criada em AC-20 — não verificável");
    return;
  }

  const hashAntes = await hashOrigem(idOrigem);

  const rFalse = await post(
    CAMINHO,
    moderno(++rpcId, "tools/call", {
      name: "templates_preencher",
      arguments: { id: idOrigem, values: { headline: "nao-salvar" }, save: false },
    }),
    token,
    hdrs("tools/call"),
  );
  const rejFalse = rejeicao(rFalse, parseSeguro(rFalse.body));
  checar(
    "save:false barrado (schema exige save:true)",
    rejFalse.ok,
    `HTTP ${rFalse.status}; forma=${rejFalse.forma}`,
  );

  const rSem = await post(
    CAMINHO,
    moderno(++rpcId, "tools/call", {
      name: "templates_preencher",
      arguments: { id: idOrigem, values: { headline: "sem-save" } },
    }),
    token,
    hdrs("tools/call"),
  );
  const rejSem = rejeicao(rSem, parseSeguro(rSem.body));
  checar(
    "campo save omitido barrado (required)",
    rejSem.ok,
    `HTTP ${rSem.status}; forma=${rejSem.forma}`,
  );

  focarJanelaApp();
  const { resposta, modal, clicou } = await chamarComConsentimento(
    "templates_preencher",
    {
      id: idOrigem,
      values: { headline: "preenchido NEG-05" },
      save: true,
      name: "gate2-restante-preenchido-neg05",
    },
    "templates_preencher com id da origem",
  );
  checar(
    "modal de consentimento apareceu (save:true forçado)",
    !!modal && clicou,
    modal ? `clicou Permitir=${clicou}` : "nenhum role=dialog em 9s",
  );
  const j = parseSeguro(resposta?.body);
  const idNovo = j.result?.structuredContent?.design?.id ?? null;
  checar(
    "save:true com id da origem gera novo design",
    resposta?.status === 200 &&
      j.result?.isError === false &&
      typeof idNovo === "string" &&
      idNovo !== idOrigem,
    `isError=${j.result?.isError}; novo=${idNovo ? "presente" : "ausente"}; distinto=${!!idNovo && idNovo !== idOrigem}`,
  );
  const hashDepois = await hashOrigem(idOrigem);
  checar(
    "origem não sobrescrita (hash do conteúdo antes/depois)",
    !!hashAntes && !!hashDepois && hashAntes === hashDepois,
    hashAntes && hashDepois ? `${hashAntes.slice(0, 12)}… / ${hashDepois.slice(0, 12)}…` : "hash indisponível",
  );
}

async function limpeza() {
  for (const p of filhos) {
    if (p && p.pid && p.exitCode === null && p.signalCode === null) matar(p.pid);
  }
  for (const c of cdps) {
    try {
      c.fechar();
    } catch {
      /* já fechado */
    }
  }
  cdp = null;
  await dormir(400);
  liberar8788();
  try {
    rmSync(PERFIL, { recursive: true, force: true });
    log("  limpeza: removido " + PERFIL);
  } catch (e) {
    log("  limpeza: FALHA ao remover " + PERFIL + " — " + String(e?.message ?? e));
  }
}

async function main() {
  perfilWebview();
  iniciarEvidencia();
  log("=== HARNESS DE EVIDÊNCIA INTEGRADA — GATE 2 / RESTANTE ===");
  log("EXE: " + EXE);
  log("SHA256: " + sha256(EXE));

  const portaInicial = estadoPorta8788();
  if (!portaInicial.verificada || !portaInicial.livre) {
    log(
      "ABORTADO (exit 2): porta 8788 " +
        (portaInicial.verificada ? "ocupada" : "não verificável") +
        " — " +
        portaInicial.detalhe,
    );
    process.exit(2);
  }

  try {
    const perfil = PERFIL;
    await ac02(perfil);
    await ac03();
    await ac05();
    await ac20();
    await ac22();
    await neg04();
    await neg05();
    if (erroApp) log("  NOTA stderr do app: " + sanitizar(erroApp.slice(0, 240), token));
  } catch (e) {
    checar("Execução do harness sem erro inesperado", false, sanitizar(e?.stack ?? String(e), token).slice(0, 900));
  } finally {
    await limpeza();
  }

  log(`\nRESULTADO: ${aprovados} OK / ${reprovados} FALHA`);
  process.exit(reprovados === 0 ? 0 : 1);
}

main();
