/**
 * Harness de evidência integrada do Gate 2 — NEG-03 (duas vias).
 *
 * Via (b): fechar a janela nativa com WM_CLOSE (PostMessage), sem taskkill.
 * Via (c): desligar pelo botão `.agent-access-btn--danger` e religar.
 *
 * Reaproveita por CÓPIA (sem import) os helpers de roundtrip-release.mjs.
 * Não importa o arquivo de referência, não faz build/install/commit/tag/release.
 * Nada é gravado fora de Temp\opencode (o perfil WebView2 é removido no início
 * e no finally). O token lido do snippet da UI fica só em memória no Node e
 * toda saída o substitui por <token>. Verificações que não podem ser
 * automatizadas com confiança são emitidas como FALHA, nunca como OK.
 *
 * Uso: node .mcp-prototype/gate2-neg03.mjs <caminho-do-app.exe>
 */
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
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
  console.error("Uso: node gate2-neg03.mjs <caminho-do-app.exe> (argv ausente ou exe inválido)");
  process.exit(2);
}

const CWD = dirname(EXE);
const CDP_HTTP = 9348;
const PORTA_MCP = 8788;
const CAMINHO = "/mcp";
const NOTE = "<token>";
const PERFIL = "C:\\Users\\tyago\\AppData\\Local\\Temp\\opencode\\gate2-neg03-wv2";
const APPDATA = process.env.APPDATA || join(process.env.USERPROFILE || "", "AppData", "Roaming");
const PASTA_APP = join(APPDATA, "com.opendesign.app");
const DB_APP = join(PASTA_APP, "opendesign.db");

let aprovados = 0;
let reprovados = 0;
let token = null;
const tokens = [];
const apps = [];
const cdps = [];
let erroApp = "";

// ---------------------------------------------------------------- helpers ---
// (copiados de roundtrip-release.mjs / gate2-pendencias-a.mjs)

function checar(nome, condicao, detalhe = "") {
  if (condicao) {
    aprovados++;
    console.log(`  OK ${nome}${detalhe ? " — " + detalhe : ""}`);
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

function sanitizar(texto, tok) {
  return tok ? String(texto).split(tok).join(NOTE) : String(texto);
}

function seg(body, tok) {
  return tok && String(body).includes(tok) ? NOTE : String(body).length + "B";
}

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
  return { "Mcp-Method": method, "Mcp-Name": "gate2-neg03" };
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

function lerSnippet(cdp) {
  return cdp.evaluate(`(() => {
    const ligado = document.querySelector('#agent-access-toggle')?.getAttribute('aria-checked') === 'true';
    if (!ligado) return null;
    const botao = document.querySelector('[aria-controls="agent-access-http-code"]');
    if (botao && !document.querySelector('#agent-access-http-code')) botao.click();
    const el = document.querySelector('#agent-access-http-code');
    return el && el.textContent && el.textContent.includes('OPENDESIGN_MCP_TOKEN') ? el.textContent : null;
  })()`);
}

async function iniciarHttpPelaUi(cdp) {
  if (!(await abrirPainel(cdp))) throw new Error("painel de Acesso do agente não apareceu");
  const ligado = await cdp.evaluate(
    `document.querySelector('#agent-access-toggle')?.getAttribute('aria-checked') === 'true'`,
  );
  if (!ligado) await cdp.evaluate(`document.querySelector('#agent-access-toggle').click(); true`);

  let snippet = null;
  for (let i = 0; i < 250; i++) {
    snippet = await lerSnippet(cdp);
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

// ------------------------------------------------------ helpers adicionais ---

function estadoPorta8788() {
  const cmd =
    "(Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count";
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

async function esperarPortaLivre(timeoutMs = 6000) {
  const ate = Date.now() + timeoutMs;
  let ultimo = estadoPorta8788();
  while (Date.now() < ate) {
    ultimo = estadoPorta8788();
    if (ultimo.verificada && ultimo.livre) return ultimo;
    await dormir(200);
  }
  return ultimo;
}

function liberar8788() {
  const cmd =
    "Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique";
  const r = spawnSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
  for (const p of String(r.stdout ?? "").trim().split(/\s+/).filter(Boolean)) {
    const pid = Number(p);
    if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) matar(pid);
  }
}

function chamadaComToken(tok) {
  const dados = JSON.stringify(moderno(4242, "server/discover"));
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: PORTA_MCP,
        path: CAMINHO,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(dados),
          ...(tok ? { authorization: `Bearer ${tok}` } : {}),
        },
      },
      (r) => {
        let b = "";
        r.on("data", (c) => (b += c));
        r.on("end", () => resolve({ status: r.statusCode, body: b }));
      },
    );
    req.on("error", (e) => resolve({ erro: String(e?.code ?? e?.message ?? e) }));
    req.setTimeout(3000, () => req.destroy(Object.assign(new Error("tempo esgotado"), { code: "ETIMEDOUT" })));
    req.end(dados);
  });
}

function recusada(r) {
  return !!r && (r.erro === "ECONNREFUSED" || r.erro === "ECONNRESET" || r.status === 401 || r.status === 403);
}

function descreverResposta(r, tok) {
  if (!r) return "sem resposta";
  if (r.erro) return `erro ${r.erro}`;
  return `HTTP ${r.status}; corpo ${seg(r.body, tok)}`;
}

async function listenerAtivo(tok, tentativas = 20) {
  for (let i = 0; i < tentativas; i++) {
    const r = await chamadaComToken(tok);
    if (r.status === 200 && parseSeguro(r.body).result?.resultType === "complete") return true;
    await dormir(250);
  }
  return false;
}

function iniciarApp() {
  const env = {
    ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: PERFIL,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_HTTP} --remote-allow-origins=*`,
  };
  const filho = spawn(EXE, [], { env, cwd: CWD, stdio: ["ignore", "ignore", "pipe"] });
  filho.stderr.on("data", (c) => (erroApp += c));
  filho.on("error", (e) => (erroApp += String(e)));
  apps.push(filho);
  return filho;
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
  let r;
  try {
    r = spawnSync("powershell", ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      timeout: 20000,
    });
  } catch (e) {
    return { emitido: false, detalhe: "spawnSync falhou: " + String(e?.message ?? e) };
  }
  const saida = ((r.stdout || "") + (r.stderr || "")).trim();
  return { emitido: /^OK/.test(saida), detalhe: saida.slice(0, 160) };
}

function estadoPainelDesligado(cdp) {
  return cdp.evaluate(`(() => {
    const toggle = document.querySelector('#agent-access-toggle');
    const btn = document.querySelector('.agent-access-btn--danger');
    const status = (document.querySelector('.agent-access-status__text')?.textContent || '').trim();
    const code = document.querySelector('#agent-access-http-code');
    const corpo = document.body ? (document.body.innerText || document.body.textContent || '') : '';
    return {
      checked: toggle?.getAttribute('aria-checked') === 'true',
      statusDesligado: /desligado/i.test(status),
      btnDesabilitado: btn?.disabled === true,
      temSnippet: !!code,
      marcadorToken: (code?.textContent || '').includes('OPENDESIGN_MCP_TOKEN'),
      hex64NoCorpo: /\\b[0-9a-f]{64}\\b/.test(corpo)
    };
  })()`);
}

function amostraProcessos() {
  const cmd =
    "Get-CimInstance Win32_Process | ForEach-Object { " +
    "$c = ($_.CommandLine -replace '[\\r\\n,]', ' '); " +
    "$d = $_.CreationDate; " +
    "if ($d) { $d = $d.ToUniversalTime().ToString('o') } else { $d = '-' }; " +
    "\"$($_.ProcessId),$($_.ParentProcessId),$($_.Name),$d,$c\" }";
  const r = spawnSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
  if (r.error || r.status !== 0) {
    return { ok: false, linhas: [], erro: String(r.error?.message ?? `status ${r.status}`) };
  }
  const linhas = String(r.stdout ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((linha) => {
      const [pid, ppid, nome, criado, ...resto] = linha.split(",");
      return {
        pid: Number(pid),
        ppid: Number(ppid),
        nome: nome || "",
        criado: criado || "-",
        cmd: resto.join(" "),
      };
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

function ehSuspeito(p) {
  return /\bwrangler\b|\bnode(?:\.exe)?\b/i.test(`${p?.nome || ""} ${p?.cmd || ""}`);
}

function chaveProcesso(p) {
  return `${p.pid}|${p.criado}`;
}

function suspeitosVivos(suspeitos, amostra) {
  if (!amostra.ok) return suspeitos.slice();
  const chaves = new Set(amostra.linhas.map(chaveProcesso));
  return suspeitos.filter((p) => chaves.has(chaveProcesso(p)));
}

function snapshotDiretorio(diretorio) {
  const snap = {};
  for (const e of readdirSync(diretorio, { withFileTypes: true })) {
    if (e.isFile()) snap[e.name] = sha256(join(diretorio, e.name));
    else snap[e.name] = e.isDirectory() ? "<dir>" : "<outro>";
  }
  return snap;
}

function nomesNovos(antes, depois) {
  return Object.keys(depois).filter((n) => !(n in antes));
}

function snapshotAtual() {
  try {
    return existsSync(PASTA_APP) ? snapshotDiretorio(PASTA_APP) : {};
  } catch (e) {
    return { __erro: mascarar(String(e?.message ?? e)) };
  }
}

// ------------------------------------------------------------------- fases ---

async function viaJanela(snapInicial) {
  console.log("\n--- (b) fechar a janela nativa com WM_CLOSE ---");
  checar("DB em %APPDATA%\\com.opendesign.app\\opendesign.db", existsSync(DB_APP), DB_APP);
  checar(
    "snapshot de nomes+hashes do diretório do app",
    Object.keys(snapInicial).length > 0 && !("__erro" in snapInicial),
    Object.keys(snapInicial).length + " entradas" + (snapInicial.__erro ? "; " + snapInicial.__erro : ""),
  );

  const app = iniciarApp();
  const pidApp = app.pid;
  checar("PID do app registrado", Number.isInteger(pidApp) && pidApp > 0, `PID ${pidApp}`);

  const cdp = await conectarCdp(await esperarCdp(CDP_HTTP));
  cdps.push(cdp);
  await esperarApp(cdp);

  const t1 = await iniciarHttpPelaUi(cdp);
  checar("T1 lido do snippet da UI (valor mascarado)", /^[0-9a-f]{64}$/.test(t1), seg(t1, t1));
  checar("listener 8788 ativo após ligar pela UI", await listenerAtivo(t1), "127.0.0.1:8788/mcp");
  const r1 = await chamadaComToken(t1);
  checar(
    "T1 íntegro em server/discover",
    r1.status === 200 && parseSeguro(r1.body).result?.resultType === "complete",
    `${r1.status}; ${seg(r1.body, t1)}`,
  );

  const viva = amostraProcessos();
  checar("amostra de processos disponível com app vivo", viva.ok, viva.ok ? `${viva.linhas.length} processos` : viva.erro);
  const arvore = viva.ok ? descendentes(pidApp, viva.linhas) : { vista: new Set(), processos: [] };
  const suspeitosAntes = arvore.processos.filter((p) => p.pid !== pidApp && ehSuspeito(p));

  const fechamento = fecharJanelaViaWmClose(pidApp);
  checar("WM_CLOSE enviado à janela nativa", fechamento.emitido, fechamento.detalhe);
  const saiu = await esperarSaida(app);
  checar("processo do app saiu após WM_CLOSE", saiu, `PID ${pidApp}; ${saiu ? "exit observado" : "ainda vivo"}`);

  const semPanic = !/panic|fatal runtime|0x800700aa|requested resource is in use/i.test(erroApp);
  const gracioso = fechamento.emitido && saiu && semPanic;
  const motivo = !fechamento.emitido
    ? "WM_CLOSE não pôde ser enviado à janela nativa"
    : !saiu
      ? "processo do app não saiu"
      : !semPanic
        ? "stderr com marcador de panic/erro fatal"
        : "";
  if (!gracioso && app.exitCode === null && app.signalCode === null) {
    // Somente limpeza para liberar a fase seguinte. NÃO é evidência de NEG-03.
    matar(pidApp);
    await dormir(700);
  }

  const porta = await esperarPortaLivre();
  checar(
    "(b) nenhum listener em 8788",
    gracioso && porta.verificada && porta.livre,
    gracioso ? porta.detalhe : "inválido: " + motivo,
  );

  const antigo = await chamadaComToken(t1);
  checar(
    "(b) chamada com T1 recusada após fechar a janela",
    gracioso && recusada(antigo),
    gracioso ? descreverResposta(antigo, t1) : "inválido: " + motivo,
  );

  const depois = amostraProcessos();
  const sobreviventes = suspeitosVivos(suspeitosAntes, depois);
  checar(
    "(b) nenhum processo filho wrangler/node remanescente",
    gracioso && depois.ok && sobreviventes.length === 0,
    !gracioso
      ? "inválido: " + motivo
      : !depois.ok
        ? depois.erro
        : sobreviventes.length
          ? sobreviventes.map((p) => `${p.nome}:${p.pid}`).join(" | ")
          : "nenhum",
  );

  const snapDepois = snapshotAtual();
  checar(
    "(b) hash do DB idêntico ao snapshot",
    gracioso &&
      !!snapInicial["opendesign.db"] &&
      snapInicial["opendesign.db"] === snapDepois["opendesign.db"],
    gracioso ? "opendesign.db (antes/depois)" : "inválido: " + motivo,
  );
  const novos = nomesNovos(snapInicial, snapDepois);
  checar(
    "(b) nenhum arquivo novo no diretório do app",
    gracioso && novos.length === 0,
    gracioso ? (novos.length ? novos.join(" | ") : "mesmo conjunto de nomes") : "inválido: " + motivo,
  );
}

async function viaToggle(snapInicial) {
  console.log("\n--- (c) desligar pelo painel e religar ---");
  const app = iniciarApp();
  const pidApp = app.pid;
  const cdp = await conectarCdp(await esperarCdp(CDP_HTTP));
  cdps.push(cdp);
  await esperarApp(cdp);

  const painel = await abrirPainel(cdp);
  checar("painel de Acesso do agente disponível após restart", painel, painel ? "#agent-access-toggle" : "ausente");
  const inicial = painel
    ? await cdp.evaluate(`(() => ({
        checked: document.querySelector('#agent-access-toggle')?.getAttribute('aria-checked') === 'true',
        temSnippet: !!document.querySelector('#agent-access-http-code'),
        status: (document.querySelector('.agent-access-status__text')?.textContent || '').trim()
      }))()`)
    : null;
  checar(
    "restart com mesmo perfil volta ao default off",
    !!inicial && inicial.checked !== true && inicial.temSnippet !== true && /desligado/i.test(inicial.status || ""),
    inicial ? `aria-checked=${inicial.checked}; snippet=${inicial.temSnippet}; status=${/desligado/i.test(inicial.status || "") ? "desligado" : "outro"}` : "painel ausente",
  );
  const livre = await esperarPortaLivre(1500);
  checar("porta 8788 livre antes de ligar no restart", livre.verificada && livre.livre, livre.detalhe);

  const t2 = await iniciarHttpPelaUi(cdp);
  checar("T2 lido do snippet da UI (valor mascarado)", /^[0-9a-f]{64}$/.test(t2), seg(t2, t2));
  checar("listener 8788 ativo com T2", await listenerAtivo(t2), "127.0.0.1:8788/mcp");

  const amostraAntes = amostraProcessos();
  const arvoreAntes = amostraAntes.ok ? descendentes(pidApp, amostraAntes.linhas) : { vista: new Set(), processos: [] };
  const suspeitosAntes = arvoreAntes.processos.filter((p) => p.pid !== pidApp && ehSuspeito(p));

  const clicou = await cdp.evaluate(`(() => {
    const b = document.querySelector('.agent-access-btn--danger');
    if (!b || b.disabled) return false;
    b.click();
    return true;
  })()`);
  checar("botão Desligar e revogar token clicado", clicou === true, String(clicou));

  await dormir(1400);
  let estado = null;
  try {
    estado = await estadoPainelDesligado(cdp);
  } catch {
    estado = null;
  }
  checar(
    "snippet/token removido da UI após desligar",
    !!estado &&
      estado.checked !== true &&
      estado.statusDesligado === true &&
      estado.btnDesabilitado === true &&
      estado.temSnippet !== true &&
      estado.marcadorToken !== true &&
      estado.hex64NoCorpo !== true,
    estado
      ? `toggle=${estado.checked}; statusDesligado=${estado.statusDesligado}; snippet=${estado.temSnippet}; hex64=${estado.hex64NoCorpo}`
      : "CDP indisponível após o clique",
  );

  const portaDesligada = await esperarPortaLivre();
  checar("(c) listener 8788 fechado", portaDesligada.verificada && portaDesligada.livre, portaDesligada.detalhe);

  const chamadaT2 = await chamadaComToken(t2);
  checar("(c) chamada com T2 recusada", recusada(chamadaT2), descreverResposta(chamadaT2, t2));

  const amostraDepois = amostraProcessos();
  const arvoreDepois = amostraDepois.ok ? descendentes(pidApp, amostraDepois.linhas) : { vista: new Set(), processos: [] };
  const suspeitosDepois = arvoreDepois.processos.filter((p) => p.pid !== pidApp && ehSuspeito(p));
  const sobreviventes = suspeitosVivos(suspeitosAntes, amostraDepois);
  checar(
    "(c) nenhum processo filho wrangler/node novo ou sobrevivente",
    amostraDepois.ok && suspeitosDepois.length === 0 && sobreviventes.length === 0,
    !amostraDepois.ok
      ? amostraDepois.erro
      : suspeitosDepois.length || sobreviventes.length
        ? suspeitosDepois.concat(sobreviventes).map((p) => `${p.nome}:${p.pid}`).join(" | ")
        : "nenhum",
  );

  const snapDepois = snapshotAtual();
  checar(
    "(c) hash do DB idêntico ao snapshot",
    !!snapInicial["opendesign.db"] && snapInicial["opendesign.db"] === snapDepois["opendesign.db"],
    "opendesign.db (antes/depois)",
  );
  const novos = nomesNovos(snapInicial, snapDepois);
  checar("(c) nenhum arquivo novo no diretório do app", novos.length === 0, novos.length ? novos.join(" | ") : "mesmo conjunto de nomes");

  const t3 = await iniciarHttpPelaUi(cdp);
  checar("T3 lido do snippet da UI (valor mascarado)", /^[0-9a-f]{64}$/.test(t3), seg(t3, t3));
  checar("T3 diferente de T2", !!t3 && t3 !== t2, "T2=<token>; T3=<token>; distintos=" + String(t3 !== t2));
  checar("listener 8788 ativo com T3", await listenerAtivo(t3), "127.0.0.1:8788/mcp");
  const r3 = await chamadaComToken(t3);
  checar(
    "T3 íntegro em server/discover",
    r3.status === 200 && parseSeguro(r3.body).result?.resultType === "complete",
    `${r3.status}; ${seg(r3.body, t3)}`,
  );
}

function escopoNaoAutomatizado() {
  console.log("\n--- escopo não automatizado com confiança ---");
  checar(
    "(a) aba/documento do editor fechado com MCP conectado",
    false,
    "fora das duas vias pedidas: WM_CLOSE fecha a janela nativa, não um documento com undo; sem not_found/editor_closed nem hash de canvas para aferir",
  );
  checar(
    "child stdio morre ao fechar o app",
    false,
    "não automatizável aqui: o harness não inicia helper stdio (o listener sob teste é HTTP); nenhum filho stdio foi observado para provar o encerramento",
  );
}

async function limpar() {
  for (const c of cdps) {
    try {
      c.fechar();
    } catch {
      /* já fechado */
    }
  }
  for (const app of apps) {
    if (app && app.exitCode === null && app.signalCode === null) matar(app.pid);
  }
  await dormir(500);
  liberar8788();
  try {
    rmSync(PERFIL, { recursive: true, force: true });
  } catch {
    /* já removido */
  }
}

async function main() {
  console.log("=== NEG-03 ===");
  console.log("EXE: " + EXE);
  console.log("SHA256: " + sha256(EXE));

  perfilWebview();
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

  const snapInicial = snapshotAtual();
  try {
    try {
      await viaJanela(snapInicial);
    } catch (e) {
      checar("fase (b) fechar janela", false, mascarar(e?.stack ?? String(e)));
    }
    try {
      await viaToggle(snapInicial);
    } catch (e) {
      checar("fase (c) toggle", false, mascarar(e?.stack ?? String(e)));
    }
    escopoNaoAutomatizado();
    if (erroApp) console.log("  NOTA stderr do app: " + mascarar(erroApp.slice(0, 240)));
  } catch (e) {
    checar("execução do harness sem erro inesperado", false, mascarar(e?.stack ?? String(e)));
  } finally {
    await limpar();
  }

  console.log(`\nRESULTADO: ${aprovados} OK / ${reprovados} FALHA`);
  process.exit(reprovados === 0 ? 0 : 1);
}

main();
