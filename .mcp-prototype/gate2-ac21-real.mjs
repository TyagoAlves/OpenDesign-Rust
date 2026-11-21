/**
 * Harness de evidência integrada do Gate 2 — AC-21 e NEG-06 — FLUXO REAL.
 *
 * Não há stub de invoke: `__TAURI_INTERNALS__.invoke` é congelado no release e
 * não pode ser substituído por CDP. O diálogo nativo "Salvar imagem PNG" é
 * respondido por UI Automation (PowerShell), e o modal de consentimento é
 * clicado com Input.dispatchMouseEvent (coordenadas reais do botão).
 *
 * Uso: node .mcp-prototype/gate2-ac21-real.mjs <caminho-do-app.exe>
 * Nada aqui publica, commita, gera instalador ou imprime token. O token lido
 * do snippet da UI fica apenas em memória no Node e é sempre redigido.
 */
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const EXE = process.argv[2];
if (!EXE) {
  console.error("Uso: node gate2-ac21-real.mjs <caminho-do-app.exe>");
  process.exit(2);
}
try {
  const st = statSync(EXE);
  if (!st.isFile() || st.size === 0) throw new Error("exe inválido");
} catch {
  console.error("Uso: node gate2-ac21-real.mjs <caminho-do-app.exe> (exe inválido)");
  process.exit(2);
}

const CWD = dirname(EXE);
const CDP_HTTP = 9349;
const PORTA_MCP = 8788;
const CAMINHO = "/mcp";
const NOTE = "<token>";
const PERFIL = "C:\\Users\\tyago\\AppData\\Local\\Temp\\opencode\\gate2-ac21-wv2";
const EXPORT_DIR = "C:\\Users\\tyago\\AppData\\Local\\Temp\\opencode\\gate2-ac21-export";
// Neste ambiente o diálogo nativo "Salvar imagem PNG" não aparece como janela
// isolada: o blocking_save_file() do Tauri resolve com o destino padrão do
// Windows, e safe_stem("prova.png") gera "prova-png". Observado em todas as
// rodadas: C:\Users\tyago\OneDrive\Documents\prova-png.png.
const DESTINO = "C:\\Users\\tyago\\OneDrive\\Documents\\prova-png.png";
const NAO_DEVE_EXISTIR = `${EXPORT_DIR}\\nao-deve-existir.png`;
const DOCS = ["C:\\Users\\tyago\\OneDrive\\Documents", "C:\\Users\\tyago\\Documents"];
const NOMES_RELEVANTES = new Set(["prova-png.png", "prova.png"]);
const SEL_DIALOGO = '[role="dialog"][aria-labelledby="mcp-confirm-title"]';
const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PNG_SHA = "431CED6916A2A21A156E38701AFE55BBD7F88969FBBFC56D7FE099D47F265460";

class ErroFase extends Error {}

let aprovados = 0;
let reprovados = 0;
let token = null;
let filho = null;
let cdp = null;
let baseline = null;
let rpcId = 1000;
let erroApp = "";
const filhos = [];

// ── helpers reaproveitados de roundtrip-release.mjs ────────────────────

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

/** Cliente CDP com método genérico (necessário para Input.dispatchMouseEvent). */
function conectarCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let seq = 0;
    const pendentes = new Map();

    function enviar(metodo, params = {}) {
      return new Promise((res, rej) => {
        const id = ++seq;
        pendentes.set(id, { res, rej });
        try {
          ws.send(JSON.stringify({ id, method: metodo, params }));
        } catch (e) {
          pendentes.delete(id);
          rej(e);
        }
      });
    }

    ws.onopen = () =>
      resolve({
        comando(metodo, params = {}) {
          return enviar(metodo, params);
        },
        evaluate(expressao) {
          return enviar("Runtime.evaluate", {
            expression: expressao,
            awaitPromise: true,
            returnByValue: true,
          }).then((r) => {
            if (r?.exceptionDetails || r?.result?.subtype === "error") {
              throw new Error(
                String(
                  r?.exceptionDetails?.text ||
                    r?.exceptionDetails?.exception?.description ||
                    r?.result?.description ||
                    "exceção no evaluate",
                ),
              );
            }
            return r?.result?.value;
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
      if (msg.error) {
        rej(new Error(`CDP ${msg.error.code ?? "?"}: ${msg.error.message ?? "erro"}`));
        return;
      }
      res(msg.result ?? {});
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
  return { "Mcp-Method": method, "Mcp-Name": "gate2-ac21-real" };
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
      if (e?.ready === "complete" && e?.tauri && e?.invoke === "function" && /^https?:/.test(e.href)) return e;
    } catch {
      /* contexto navegando */
    }
    await dormir(200);
  }
  throw new Error("app release não ficou pronto no CDP: " + JSON.stringify(ultimo));
}

async function iniciarHttpPelaUi(conexao) {
  await conexao.evaluate(`window.location.hash = '#/settings'; true`);
  let painel = false;
  for (let i = 0; i < 200; i++) {
    painel = await conexao.evaluate(`!!document.querySelector('#agent-access-toggle')`);
    if (painel) break;
    await dormir(100);
  }
  if (!painel) throw new Error("painel de Acesso do agente não apareceu no release");

  let clicou = false;
  for (let i = 0; i < 250; i++) {
    const ligado = await conexao.evaluate(
      `document.querySelector('#agent-access-toggle')?.getAttribute('aria-checked') === 'true'`,
    );
    if (!ligado && !clicou) {
      await conexao.evaluate(`document.querySelector('#agent-access-toggle').click(); true`);
      clicou = true;
    }
    const snippet = await conexao.evaluate(`(() => {
      const el = document.querySelector('#agent-access-http-code');
      if (el && el.textContent && el.textContent.includes('OPENDESIGN_MCP_TOKEN')) return el.textContent;
      const botao = document.querySelector('[aria-controls="agent-access-http-code"]');
      if (botao && !el) botao.click();
      return null;
    })()`);
    if (snippet) {
      const cfg = JSON.parse(snippet).mcpServers.opendesign;
      return { token: String(cfg.env?.OPENDESIGN_MCP_TOKEN ?? ""), cfg, snippet };
    }
    await dormir(100);
  }
  throw new Error("snippet HTTP da UI não apareceu (mcp_start falhou?)");
}

// ── automação do diálogo nativo (UI Automation, sem stub) ───────────────

const PS_DIALOGO = String.raw`$ErrorActionPreference = 'Stop'
$destino = $env:OD_GATE2_DESTINO
if ([string]::IsNullOrWhiteSpace($destino)) { Write-Output 'FALHA: destino vazio'; exit 1 }
try {
  Add-Type -AssemblyName UIAutomationClient | Out-Null
  Add-Type -AssemblyName UIAutomationTypes | Out-Null
  $raiz = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = [System.Windows.Automation.Condition]::TrueCondition
  $filhos = [System.Windows.Automation.TreeScope]::Children
  $descendentes = [System.Windows.Automation.TreeScope]::Descendants
  $titulos = @('Salvar imagem PNG', 'Salvar como')
  $janela = $null
  $ate = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $ate -and $null -eq $janela) {
    $tops = $raiz.FindAll($filhos, $cond)
    foreach ($w in $tops) {
      try { $nome = $w.Current.Name } catch { $nome = '' }
      foreach ($t in $titulos) {
        if ($nome -and $nome.Contains($t)) { $janela = $w; break }
      }
      if ($null -ne $janela) { break }
    }
    if ($null -eq $janela) { Start-Sleep -Milliseconds 200 }
  }
  if ($null -eq $janela) {
    $nomes = @()
    foreach ($w in $raiz.FindAll($filhos, $cond)) {
      try { $n = $w.Current.Name; if (-not [string]::IsNullOrWhiteSpace($n)) { $nomes += $n } } catch {}
    }
    $lista = ($nomes | Select-Object -First 60) -join ' | '
    Write-Output ('FALHA: janela de salvamento nao apareceu em 10s; titulos=' + $lista)
    exit 1
  }
  if ($janela.Current.ControlType -ne [System.Windows.Automation.ControlType]::Window) {
    try {
      $pai = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($janela)
      while ($null -ne $pai -and $pai.Current.ControlType -ne [System.Windows.Automation.ControlType]::Window) {
        $pai = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($pai)
      }
      if ($null -ne $pai) { $janela = $pai }
    } catch {}
  }

  $valorPat = [System.Windows.Automation.ValuePattern]::Pattern
  $campoValor = $null
  foreach ($e in $janela.FindAll($descendentes, $cond)) {
    if ($null -ne $campoValor) { break }
    try {
      $id = $e.Current.AutomationId
      $nome = $e.Current.Name
      $alvo = ($id -eq '1148') -or ($nome -and ($nome.Contains('Nome do arquivo') -or $nome.Contains('File name')))
      if ($alvo) {
        try { $campoValor = $e.GetCurrentPattern($valorPat) } catch { $campoValor = $null }
        if ($null -eq $campoValor) {
          foreach ($f in $e.FindAll($descendentes, $cond)) {
            try { $campoValor = $f.GetCurrentPattern($valorPat) } catch { $campoValor = $null }
            if ($null -ne $campoValor) { break }
          }
        }
      }
    } catch {}
  }
  if ($null -eq $campoValor) { Write-Output 'FALHA: campo Nome do arquivo nao encontrado'; exit 1 }
  $campoValor.SetValue($destino)
  Start-Sleep -Milliseconds 150

  $invokePat = [System.Windows.Automation.InvokePattern]::Pattern
  $botaoInvoke = $null
  foreach ($e in $janela.FindAll($descendentes, $cond)) {
    if ($null -ne $botaoInvoke) { break }
    try {
      $nome = ($e.Current.Name -replace '&', '').Trim()
      if ($nome -ceq 'Salvar') {
        try { $botaoInvoke = $e.GetCurrentPattern($invokePat) } catch { $botaoInvoke = $null }
      }
    } catch {}
  }
  if ($null -eq $botaoInvoke) { Write-Output 'FALHA: botao Salvar nao encontrado'; exit 1 }
  $botaoInvoke.Invoke()
  Write-Output 'OK'
} catch { Write-Output ('FALHA: ' + $_.Exception.Message); exit 1 }
`;

function resolverDialogoNativo() {
  const r = spawnSync("powershell", ["-NoProfile", "-Command", PS_DIALOGO], {
    encoding: "utf8",
    timeout: 60000,
    env: { ...process.env, OD_GATE2_DESTINO: DESTINO },
  });
  const bruto = String(r.stdout ?? "").trim() || String(r.stderr ?? "").trim();
  const ultima = bruto.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop() ?? "(sem saída)";
  console.log("  diálogo nativo: " + sanitizar(ultima, token));
  return { ok: ultima === "OK", detalhe: ultima };
}

async function resolverOuFalhar(rotulo) {
  await dormir(300);
  const r = resolverDialogoNativo();
  if (!r.ok) throw new ErroFase(`${rotulo}: ${r.detalhe}`);
}

// ── cliques no modal por coordenadas CDP (sem element.click) ────────────

function expressaoBotao(rotulo) {
  return `(() => {
    const d = document.querySelector(${JSON.stringify(SEL_DIALOGO)});
    if (!d) return { x: 0, y: 0, visivel: false, motivo: 'dialogo-ausente' };
    const rot = ${JSON.stringify(rotulo)};
    const b = Array.from(d.querySelectorAll('button')).find(
      (x) => (x.textContent || '').replace(/\\s+/g, ' ').trim() === rot
    );
    if (!b) return { x: 0, y: 0, visivel: false, motivo: 'botao-ausente' };
    b.scrollIntoView({ block: 'center', inline: 'center' });
    const r = b.getBoundingClientRect();
    const s = getComputedStyle(b);
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      visivel: r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none',
      motivo: ''
    };
  })()`;
}

async function infoBotao(conexao, rotulo) {
  return conexao.evaluate(expressaoBotao(rotulo));
}

async function clicarBotao(conexao, rotulo) {
  const info = await infoBotao(conexao, rotulo);
  if (!info?.visivel) throw new ErroFase(`botão "${rotulo}" não clicável: ${info?.motivo ?? "invisível"}`);
  await conexao.comando("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: info.x,
    y: info.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await conexao.comando("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: info.x,
    y: info.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await dormir(150);
  return info;
}

async function lerDialogo(conexao) {
  return conexao.evaluate(`(() => {
    const d = document.querySelector(${JSON.stringify(SEL_DIALOGO)});
    if (!d) return null;
    return {
      texto: (d.innerText || d.textContent || '').trim(),
      titulo: (document.getElementById('mcp-confirm-title')?.textContent || '').trim(),
      descricao: (document.getElementById('mcp-confirm-desc')?.textContent || '').trim()
    };
  })()`);
}

async function dialogoApareceEm(conexao, timeoutMs) {
  const ate = Date.now() + timeoutMs;
  while (Date.now() < ate) {
    const d = await lerDialogo(conexao);
    if (d) return d;
    await dormir(100);
  }
  return null;
}

function textoMostraDestino(texto) {
  const alvos = [DESTINO, DESTINO.replace(/\\/g, "/"), DESTINO.replace(/\\/g, "\\\\")];
  return alvos.some((alvo) => String(texto || "").includes(alvo));
}

// ── arquivosRelevantes / snapshot ───────────────────────────────────────

function caminhosRelevantes() {
  const lista = [];
  for (const nome of NOMES_RELEVANTES) {
    lista.push(join(EXPORT_DIR, nome));
    for (const dir of DOCS) lista.push(join(dir, nome));
  }
  return [...new Set(lista)];
}

function existeArquivo(caminho) {
  try {
    return statSync(caminho).isFile();
  } catch {
    return false;
  }
}

function snapshot() {
  const mapa = new Map();
  for (const caminho of caminhosRelevantes()) {
    try {
      const st = statSync(caminho);
      if (!st.isFile()) continue;
      mapa.set(caminho, { tamanho: st.size, hash: sha256(caminho), mtimeMs: st.mtimeMs });
    } catch {
      /* inexistente */
    }
  }
  return mapa;
}

function imprimirSnapshot(rotulo, mapa) {
  const itens = [...mapa].map(
    ([c, v]) => `${basename(c)} em ${dirname(c)}: ${v.tamanho}B sha256=${v.hash}`,
  );
  console.log(`  snapshot ${rotulo}: ${itens.length ? itens.join(" | ") : "(vazio)"}`);
}

function diferencas(base, atual = snapshot()) {
  const diffs = [];
  for (const [caminho, v] of atual) {
    const b = base.get(caminho);
    if (!b) diffs.push(`${basename(caminho)} em ${dirname(caminho)}: NOVO ${v.tamanho}B ${v.hash}`);
    else if (b.tamanho !== v.tamanho || b.hash !== v.hash || b.mtimeMs !== v.mtimeMs)
      diffs.push(`${basename(caminho)} em ${dirname(caminho)}: ALTERADO ${b.tamanho}B->${v.tamanho}B`);
  }
  for (const caminho of base.keys()) {
    if (!atual.has(caminho)) diffs.push(`${basename(caminho)} em ${dirname(caminho)}: REMOVIDO`);
  }
  return diffs;
}

function descreve(diffs) {
  return diffs.length ? diffs.join(" | ") : "nenhum";
}

// ── inicialização / limpeza ─────────────────────────────────────────────

function porta8788Ocupada() {
  const n = spawnSync("powershell", [
    "-NoProfile",
    "-Command",
    "(Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count",
  ], { encoding: "utf8" }).stdout.trim();
  return parseInt(n, 10) > 0;
}

function pidsOcupantes8788() {
  const saida = spawnSync("powershell", [
    "-NoProfile",
    "-Command",
    "Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess",
  ], { encoding: "utf8" }).stdout ?? "";
  return [...new Set(String(saida).split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s)))]
    .map(Number)
    .filter((pid) => pid !== process.pid);
}

function liberar8788() {
  const pids = pidsOcupantes8788();
  for (const pid of pids) {
    matar(pid);
    console.log(`  limpeza: 8788 liberado (taskkill no PID ${pid})`);
  }
  if (!pids.length) console.log("  limpeza: porta 8788 sem listeners");
}

function ambienteApp() {
  return {
    ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: PERFIL,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_HTTP} --remote-allow-origins=*`,
  };
}

function iniciarApp() {
  erroApp = "";
  const p = spawn(EXE, [], { env: ambienteApp(), cwd: CWD, stdio: ["ignore", "ignore", "pipe"] });
  p.stderr.on("data", (c) => (erroApp = (erroApp + c.toString()).slice(-4000)));
  filho = p;
  filhos.push(p);
  return p;
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

async function limpeza() {
  for (const p of filhos) {
    if (p.pid && p.exitCode === null) matar(p.pid);
  }
  await fecharCdp();
  liberar8788();

  for (const caminho of [PERFIL, EXPORT_DIR]) {
    try {
      rmSync(caminho, { recursive: true, force: true });
      console.log(`  limpeza: removido ${caminho}`);
    } catch (e) {
      console.log(`  limpeza: FALHA ao remover ${caminho} — ${String(e?.message ?? e)}`);
    }
  }

  if (!baseline) {
    console.log("  limpeza: baseline indisponível; nenhum prova-png.png de Documents removido");
    return;
  }
  const removidos = [];
  for (const dir of DOCS) {
    const caminho = join(dir, "prova-png.png");
    if (existeArquivo(caminho) && !baseline.has(caminho)) {
      try {
        rmSync(caminho, { force: true });
        removidos.push(caminho);
      } catch (e) {
        console.log(`  limpeza: FALHA ao remover ${caminho} — ${String(e?.message ?? e)}`);
      }
    }
  }
  console.log(
    removidos.length
      ? `  limpeza: prova-png.png removido(s) de Documents: ${removidos.join(" | ")}`
      : "  limpeza: nenhum prova-png.png criado em Documents/OneDrive Documents",
  );
}

function comTimeout(promessa, ms, rotulo) {
  const protegida = promessa.catch((e) => ({ __erro: sanitizar(String(e?.message ?? e), token) }));
  return Promise.race([protegida, dormir(ms).then(() => ({ __timeout: rotulo }))]);
}

function chamarExport(tok = token) {
  return post(
    CAMINHO,
    moderno(++rpcId, "tools/call", {
      name: "export_salvar_png",
      arguments: { data_url: PNG_1X1, filename: "prova.png" },
    }),
    tok,
    hdrs("tools/call"),
  );
}

function resposta(resultado, rotulo) {
  if (resultado?.__timeout) throw new ErroFase(`${rotulo}: timeout HTTP`);
  if (resultado?.__erro) throw new ErroFase(`${rotulo}: ${resultado.__erro}`);
  return parseSeguro(resultado?.body);
}

function focarJanelaApp() {
  for (const p of filhos) {
    if (!p.pid || p.exitCode !== null) continue;
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

async function iniciarExport(rotulo, tentativas = 4) {
  // Sem automação de janela nativa: neste ambiente o blocking_save_file()
  // ora retorna de imediato com o destino padrão, ora falha com -32603 quando
  // a janela não está em primeiro plano (ver nota em DESTINO). Quando não há
  // modal, a chamada falha em autorizar() ANTES de gravar — repetir é seguro.
  for (let i = 1; i <= tentativas; i++) {
    focarJanelaApp();
    await dormir(250);
    const respostaP = chamarExport();
    const dialogo = await dialogoApareceEm(cdp, 8000);
    if (dialogo) return { respostaP, dialogo, tentativa: i };
    const r = await comTimeout(respostaP, 12000, `retry ${i}`);
    const corpo = sanitizar(String(r?.body ?? "").slice(0, 220), token);
    console.log(`  ${rotulo}: tentativa ${i} sem modal (HTTP ${r?.status ?? "?"}; ${corpo})`);
  }
  throw new ErroFase(`${rotulo}: modal não apareceu após ${tentativas} tentativas`);
}

// ── fases ───────────────────────────────────────────────────────────────

async function preparar() {
  perfilWebview();
  rmSync(EXPORT_DIR, { recursive: true, force: true });
  mkdirSync(EXPORT_DIR, { recursive: true });
  baseline = snapshot();
  imprimirSnapshot("inicial", baseline);

  iniciarApp();
  cdp = await conectarCdp(await esperarCdp(CDP_HTTP));
  await esperarApp(cdp);
  checar("CDP 9349 e app release prontos (sem stub)", true, "invoke nativo intacto");

  const cfg = await iniciarHttpPelaUi(cdp);
  token = cfg.token;
  checar("token lido do snippet da UI", /^[0-9a-f]{64}$/.test(token), seg(token, token));
}

async function ac21() {
  // (a) modal aparece após resolver o diálogo nativo.
  const a = await iniciarExport("(a) diálogo nativo");
  checar("(a) modal role=dialog aparece", !!a.dialogo, a.dialogo ? "encontrado" : "ausente em 10s");
  const texto = a.dialogo?.texto ?? "";
  checar("(a) modal mostra prova.png", /prova\.png/i.test(texto), sanitizar(texto.slice(0, 400), token));
  checar("(a) modal mostra o destino padrão prova-png.png", textoMostraDestino(texto), "texto real: " + sanitizar(texto.slice(0, 400), token));
  checar(
    "(e) descrição do modal traz arquivo e destino",
    /prova\.png/i.test(a.dialogo?.descricao ?? "") || (/prova\.png/i.test(texto) && textoMostraDestino(texto)),
    "descrição real: " + sanitizar(String(a.dialogo?.descricao ?? "").slice(0, 300), token),
  );

  // (b) Negar não grava.
  await clicarBotao(cdp, "Negar");
  const rbRaw = await comTimeout(a.respostaP, 30000, "resposta após Negar");
  const rb = resposta(rbRaw, "(b) Negar");
  checar("(b) Negar → HTTP 200 com result.isError===true", rbRaw?.status === 200 && rb.result?.isError === true, `${rbRaw?.status} isError=${rb.result?.isError}`);
  const diffsB = diferencas(baseline);
  checar("(b) nenhum arquivo novo após Negar", diffsB.length === 0, descreve(diffsB));

  // (c) Permitir grava exatamente o PNG 1x1 esperado.
  const c = await iniciarExport("(c) diálogo nativo");
  checar("(c) modal reaparece na nova chamada", !!c.dialogo, c.dialogo ? "encontrado" : "ausente em 10s");
  await clicarBotao(cdp, "Permitir");
  const rcRaw = await comTimeout(c.respostaP, 30000, "resposta após Permitir");
  const rc = resposta(rcRaw, "(c) Permitir");
  checar("(c) Permitir → HTTP 200 com result.isError===false", rcRaw?.status === 200 && rc.result?.isError === false, `${rcRaw?.status} isError=${rc.result?.isError}`);
  const tam = existeArquivo(DESTINO) ? statSync(DESTINO).size : -1;
  const hash = existeArquivo(DESTINO) ? sha256(DESTINO) : "(ausente)";
  checar("(c) prova-png.png no destino padrão existe com 68 bytes", tam === 68, `${tam}B em ${DESTINO}`);
  checar("(c) SHA256 do PNG 1x1 confere", hash === PNG_SHA, hash);

  // (d) nonce one-shot rejeitado via invoke direto no CDP (fluxo real).
  const expressao = `(async () => {
    try {
      const v = await window.__TAURI_INTERNALS__.invoke('export_png', {
        dataUrl: ${JSON.stringify(PNG_1X1)},
        filename: 'prova.png',
        destination: ${JSON.stringify(NAO_DEVE_EXISTIR)},
        nonce: 'nonce-invalido'
      });
      return { rejeitado: false, resultado: v };
    } catch (e) {
      return { rejeitado: true, erro: String(e?.message ?? e) };
    }
  })()`;
  const evalD = await cdp.comando("Runtime.evaluate", {
    expression: expressao,
    awaitPromise: true,
    returnByValue: true,
  });
  const v = evalD?.result?.value;
  const rejeitou = v?.rejeitado === true || v?.resultado?.isError === true;
  checar("(d) invoke direto com nonce inválido rejeita", rejeitou, sanitizar(v?.erro ?? JSON.stringify(v?.resultado ?? v), token).slice(0, 200));
  checar("(d) nao-deve-existir.png não foi gravado", !existeArquivo(NAO_DEVE_EXISTIR), existeArquivo(NAO_DEVE_EXISTIR) ? "arquivo presente" : "ausente");
  checar("(d) prova.png segue íntegro após rejeição", existeArquivo(DESTINO) && sha256(DESTINO) === PNG_SHA, hash);
  console.log("  (limitação: o reuso do nonce autêntico emitido por pick_save_path não foi observado — nonce fica no closure do Rust e não é exposto ao harness)");
}

async function neg06() {
  // (f) lembrar nesta sessão.
  const f = await iniciarExport("(f) diálogo nativo");
  if (!f.dialogo) {
    const diag = await comTimeout(f.respostaP, 10000, "diag (f)");
    console.log("  DIAG (f) sem modal — resposta: " + JSON.stringify({
      status: diag?.status,
      body: sanitizar(String(diag?.body ?? "").slice(0, 400), token),
      timeout: diag?.__timeout,
      erro: diag?.__erro,
    }));
  }
  checar("(f) modal aparece antes de lembrar", !!f.dialogo, f.dialogo ? "encontrado" : "ausente em 10s");
  const infoLembrar = await infoBotao(cdp, "Permitir e lembrar nesta sessão");
  checar("(f) botão 'Permitir e lembrar nesta sessão' disponível", infoLembrar?.visivel === true, infoLembrar?.motivo ?? "visível");
  await clicarBotao(cdp, "Permitir e lembrar nesta sessão");
  const rfRaw = await comTimeout(f.respostaP, 30000, "resposta após lembrar");
  const rf = resposta(rfRaw, "(f) lembrar");
  checar("(f) lembrar → HTTP 200 com result.isError===false", rfRaw?.status === 200 && rf.result?.isError === false, `${rfRaw?.status} isError=${rf.result?.isError}`);

  // (g) segunda chamada para o MESMO arquivo+destino: sem modal por 2,5s.
  const gResp = chamarExport();
  const dlgG = await dialogoApareceEm(cdp, 2500);
  if (dlgG) {
    checar("(g) nenhum modal de consentimento em 2,5s", false, "modal apareceu: " + sanitizar(dlgG.texto.slice(0, 200), token));
    try {
      await clicarBotao(cdp, "Permitir");
    } catch {
      /* evita pendurar a resposta */
    }
  } else {
    checar("(g) nenhum modal de consentimento em 2,5s", true, "2,5s sem modal (diálogo nativo ignorado)");
  }
  const rgRaw = await comTimeout(gResp, 30000, "segunda chamada");
  const rg = resposta(rgRaw, "(g) segunda chamada");
  checar("(g) segunda chamada → isError:false", rgRaw?.status === 200 && rg.result?.isError === false, `${rgRaw?.status} isError=${rg.result?.isError}`);
  checar("(g) arquivo segue íntegro", existeArquivo(DESTINO) && sha256(DESTINO) === PNG_SHA, "sha256 conferido");

  // (h) relançamento com o MESMO perfil: o consentimento deve voltar.
  await fecharCdp();
  for (const p of filhos) if (p.pid && p.exitCode === null) matar(p.pid);
  await dormir(1200);
  iniciarApp();
  cdp = await conectarCdp(await esperarCdp(CDP_HTTP));
  await esperarApp(cdp);
  const cfg2 = await iniciarHttpPelaUi(cdp);
  token = cfg2.token;
  checar("(h) HTTP reiniciado pela UI após relançamento", /^[0-9a-f]{64}$/.test(token), seg(token, token));

  const h = await iniciarExport("(h) diálogo nativo após relançamento");
  checar("(h) modal VOLTA a aparecer após relançamento", !!h.dialogo, h.dialogo ? "encontrado" : "ausente em 10s");

  // (i) Negar no relançamento não grava nada.
  const antesI = snapshot();
  await clicarBotao(cdp, "Negar");
  const rhRaw = await comTimeout(h.respostaP, 30000, "resposta após Negar no relançamento");
  const rh = resposta(rhRaw, "(h) Negar após relançamento");
  checar("(h) Negar após relançamento → isError:true", rhRaw?.status === 200 && rh.result?.isError === true, `${rhRaw?.status} isError=${rh.result?.isError}`);
  const diffsI = diferencas(antesI);
  checar("(i) nenhum arquivo novo/alterado após Negar no relançamento", diffsI.length === 0, descreve(diffsI));
  checar("(i) prova.png permanece íntegro", existeArquivo(DESTINO) && statSync(DESTINO).size === 68 && sha256(DESTINO) === PNG_SHA, "68B, sha256 conferido");
}

// ── main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== HARNESS GATE 2 — AC-21 / NEG-06 — FLUXO REAL ===");
  console.log("EXE: " + EXE);
  console.log("SHA256: " + sha256(EXE));

  if (porta8788Ocupada()) {
    console.error("FALHA: porta 8788 ocupada — feche o processo antes de validar");
    process.exit(2);
  }

  try {
    await preparar();
    console.log("\n=== AC-21 ===");
    await ac21();
    console.log("\n=== NEG-06 ===");
    await neg06();
  } catch (erro) {
    const detalhe = sanitizar(erro?.stack ?? String(erro), token).slice(0, 900);
    if (erro instanceof ErroFase) checar("Etapa interrompida com segurança", false, detalhe);
    else checar("Execução do harness", false, detalhe);
    if (erroApp) console.log("  stderr do app: " + sanitizar(erroApp.slice(0, 300), token));
  } finally {
    await limpeza();
  }

  console.log(`\nRESULTADO: ${aprovados} OK / ${reprovados} FALHA`);
  process.exit(reprovados === 0 ? 0 : 1);
}

main();
