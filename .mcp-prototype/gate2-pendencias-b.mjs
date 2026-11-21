/**
 * Harness de evidência integrada do Gate 2 — NEG-02, AC-21 e NEG-06.
 *
 * Uso: node .mcp-prototype/gate2-pendencias-b.mjs <caminho-do-app.exe>
 *
 * Nada aqui publica, commita, gera instalador ou imprime token. O token lido
 * do snippet da UI fica apenas em memória no Node e é sempre redigido como
 * <token> em qualquer detalhe de asserção.
 */
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const EXE = process.argv[2];
if (!EXE) {
  console.error("Uso: node gate2-pendencias-b.mjs <caminho-do-app.exe>");
  process.exit(2);
}
try {
  if (!readFileSync(EXE).length) throw new Error("executável vazio");
} catch {
  console.error("Uso: node gate2-pendencias-b.mjs <caminho-do-app.exe> (exe inválido)");
  process.exit(2);
}

const CWD = dirname(EXE);
const CDP_HTTP = 9347;
const PORTA_MCP = 8788;
const CAMINHO = "/mcp";
const NOTE = "<token>";
const PERFIL = "C:\\Users\\tyago\\AppData\\Local\\Temp\\opencode\\gate2-pend-b-wv2";
const EXPORT_DIR = "C:\\Users\\tyago\\AppData\\Local\\Temp\\opencode\\gate2-pend-b-export";
const DESTINO = `${EXPORT_DIR}\\prova.png`;
const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

let aprovados = 0;
let reprovados = 0;
let token = null;
let filho = null;
let cdp = null;
let ocupante = null;
let stubOk = false;
let conexoesOcupante = 0;
let rpcId = 1000;

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
  return { "Mcp-Method": method, "Mcp-Name": "gate2-pendencias-b" };
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
      if (
        e?.ready === "complete" &&
        e?.tauri &&
        e?.invoke === "function" &&
        /^https?:/.test(e.href)
      ) {
        return e;
      }
    } catch {
      /* contexto navegando */
    }
    await dormir(200);
  }
  throw new Error("app não ficou pronto no CDP: " + JSON.stringify(ultimo));
}

function lerSnippet(conexao) {
  return conexao.evaluate(`(() => {
    const botao = document.querySelector('[aria-controls="agent-access-http-code"]');
    if (botao && !document.querySelector('#agent-access-http-code')) botao.click();
    const el = document.querySelector('#agent-access-http-code');
    return el && el.textContent && el.textContent.includes('OPENDESIGN_MCP_TOKEN') ? el.textContent : null;
  })()`);
}

async function iniciarHttpPelaUi(conexao) {
  await conexao.evaluate(`window.location.hash = '#/settings'; true`);
  let painel = false;
  for (let i = 0; i < 200; i++) {
    painel = await conexao.evaluate(`!!document.querySelector('#agent-access-toggle')`);
    if (painel) break;
    await dormir(100);
  }
  if (!painel) throw new Error("painel de Acesso do agente não apareceu");
  await conexao.evaluate(`document.querySelector('#agent-access-toggle').click(); true`);

  let snippet = null;
  for (let i = 0; i < 250; i++) {
    snippet = await lerSnippet(conexao);
    if (snippet) break;
    await dormir(100);
  }
  if (!snippet) throw new Error("snippet HTTP da UI não apareceu (mcp_start falhou?)");
  const cfg = JSON.parse(snippet).mcpServers.opendesign;
  return String(cfg.env?.OPENDESIGN_MCP_TOKEN ?? "");
}

// ── helpers específicos deste harness ──────────────────────────────────

function envApp() {
  return {
    ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: PERFIL,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_HTTP} --remote-allow-origins=*`,
  };
}

function portaOcupada(porta) {
  const n = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `(Get-NetTCPConnection -LocalPort ${porta} -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count`,
    ],
    { encoding: "utf8" },
  ).stdout.trim();
  return parseInt(n, 10) > 0;
}

function portasDoApp(pid) {
  const script = `
$ids = New-Object 'System.Collections.Generic.List[int]'
$fila = New-Object 'System.Collections.Generic.Queue[int]'
$fila.Enqueue(${pid})
while ($fila.Count -gt 0) {
  $p = $fila.Dequeue()
  if ($ids -contains $p) { continue }
  $ids.Add($p)
  Get-CimInstance Win32_Process -Filter "ParentProcessId=$p" -ErrorAction SilentlyContinue | ForEach-Object { $fila.Enqueue([int]$_.ProcessId) }
}
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $ids -contains [int]$_.OwningProcess -and [int]$_.LocalPort -ne ${CDP_HTTP} } |
  Select-Object -ExpandProperty LocalPort -Unique
`;
  return (spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }).stdout ?? "").trim();
}

function matarPorta8788() {
  const saida = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -LocalPort ${PORTA_MCP} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`,
    ],
    { encoding: "utf8" },
  ).stdout.trim();
  for (const p of saida.split(/\s+/).filter(Boolean)) {
    const pid = Number(p);
    if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) matar(pid);
  }
}

function abrirOcupante() {
  return new Promise((resolve, reject) => {
    const sockets = new Set();
    const servidor = net.createServer((socket) => {
      conexoesOcupante++;
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => {});
      socket.end("HTTP/1.1 409 Conflict\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    });
    servidor.once("error", reject);
    servidor.listen(PORTA_MCP, "127.0.0.1", () => resolve({ servidor, sockets }));
  });
}

function fecharOcupante(occ) {
  return new Promise((res) => {
    if (!occ) return res();
    try {
      for (const s of occ.sockets) s.destroy();
      occ.servidor.close(() => res());
    } catch {
      res();
    }
  });
}

function reqOcupante() {
  return new Promise((res, rej) => {
    const req = http.request(
      { host: "127.0.0.1", port: PORTA_MCP, path: CAMINHO, method: "POST", headers: { "content-length": 0 } },
      (r) => {
        let b = "";
        r.on("data", (c) => (b += c));
        r.on("end", () => res({ status: r.statusCode, body: b }));
      },
    );
    req.on("error", rej);
    req.end();
  });
}

async function esperarPortaLivre(timeoutMs = 10000) {
  const ate = Date.now() + timeoutMs;
  while (Date.now() < ate) {
    try {
      const r = await reqOcupante();
      if (r.status === 409) {
        await dormir(150);
        continue;
      }
      return false;
    } catch {
      return true;
    }
  }
  return false;
}

async function esperarCdpIndisponivel(porta, timeoutMs = 20000) {
  const ate = Date.now() + timeoutMs;
  while (Date.now() < ate) {
    try {
      await new Promise((res, rej) => {
        const req = http.get({ host: "127.0.0.1", port, path: "/json/list" }, (r) => {
          r.resume();
          r.on("end", res);
        });
        req.on("error", rej);
        req.on("timeout", () => req.destroy(new Error("timeout")));
      });
    } catch {
      return true;
    }
    await dormir(250);
  }
  return false;
}

async function navegarSettings(conexao) {
  await conexao.evaluate(`window.location.hash = '#/settings'; true`);
  for (let i = 0; i < 200; i++) {
    if (await conexao.evaluate(`!!document.querySelector('#agent-access-toggle')`)) return true;
    await dormir(100);
  }
  return false;
}

function instalarObservadorPortaErro(conexao) {
  return conexao.evaluate(`(() => {
    window.__gate2PortErrorVisto = false;
    window.__gate2TokenVisto = false;
    const capturar = () => {
      const txt = document.body ? (document.body.innerText || document.body.textContent || '') : '';
      if (txt.includes('Porta 8788 em uso')) window.__gate2PortErrorVisto = true;
      const el = document.querySelector('#agent-access-http-code');
      if (el && el.textContent && el.textContent.includes('OPENDESIGN_MCP_TOKEN')) window.__gate2TokenVisto = true;
    };
    capturar();
    if (window.__gate2ObsPorta) window.__gate2ObsPorta.disconnect();
    window.__gate2ObsPorta = new MutationObserver(capturar);
    window.__gate2ObsPorta.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    return true;
  })()`);
}

function estadoPainel(conexao) {
  return conexao.evaluate(`(() => ({
    checked: document.querySelector('#agent-access-toggle')?.getAttribute('aria-checked') === 'true',
    status: (document.querySelector('.agent-access-status__text')?.textContent || '').trim(),
    alerta: (document.querySelector('.agent-access__error')?.textContent || '').trim(),
    temSnippet: !!(document.querySelector('#agent-access-http-code')?.textContent || '').includes('OPENDESIGN_MCP_TOKEN')
  }))()`);
}

function clicarToggle(conexao) {
  return conexao.evaluate(`(() => {
    const b = document.querySelector('#agent-access-toggle');
    if (!b) return false;
    b.click();
    return true;
  })()`);
}

function stubExpression() {
  return `(() => {
    const I = window.__TAURI_INTERNALS__;
    if (!I || typeof I.invoke !== 'function') {
      return { ok: false, reason: '__TAURI_INTERNALS__.invoke ausente' };
    }
    if (window.__gate2StubAtivo) {
      const ativo = window.__TAURI_INTERNALS__.invoke === window.__gate2StubFn;
      return { ok: ativo, substituido: ativo, calls: (window.__gate2Calls || []).length };
    }
    const original = I.invoke.bind(I);
    const stub = async function (cmd, args) {
      const a = args || {};
      window.__gate2Calls.push({ cmd: cmd, tipo: 'invoke', seq: ++window.__gate2Seq });
      if (cmd === 'pick_save_path') {
        const nonce = 'stub-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
        window.__gate2Calls.push({
          cmd: cmd, tipo: 'pick_save_path', filename: a.filename || null,
          nonceEmitido: nonce, destinoEmitido: window.__gate2Destino,
          seq: ++window.__gate2Seq
        });
        return { path: window.__gate2Destino, nonce: nonce };
      }
      if (cmd === 'export_png' || cmd === 'export_pdf' || cmd === 'save_data_url_native') {
        window.__gate2Calls.push({
          cmd: cmd, tipo: 'save', filename: a.filename || null,
          nonceRecebido: a.nonce || null, destinoRecebido: a.destination || null,
          seq: ++window.__gate2Seq
        });
        return { path: window.__gate2Destino, bytes: 70 };
      }
      return original(cmd, args);
    };
    window.__gate2Calls = [];
    window.__gate2Seq = 0;
    window.__gate2InvokeReal = original;
    window.__gate2Destino = ${JSON.stringify(DESTINO)};
    window.__gate2StubFn = stub;
    let substituido = false;
    let metodo = 'nenhum';
    try {
      I.invoke = stub;
      substituido = (I.invoke === stub);
      if (substituido) metodo = 'atribuicao';
    } catch (e) {}
    if (!substituido) {
      try {
        Object.defineProperty(I, 'invoke', { value: stub, configurable: true, writable: true });
        substituido = (I.invoke === stub);
        if (substituido) metodo = 'defineProperty';
      } catch (e) {}
    }
    if (!substituido) {
      try {
        const proxy = new Proxy(I, {
          get: function (t, p, r) { return p === 'invoke' ? stub : Reflect.get(t, p, r); }
        });
        Object.defineProperty(window, '__TAURI_INTERNALS__', {
          value: proxy, configurable: true, writable: true
        });
        substituido = (window.__TAURI_INTERNALS__.invoke === stub);
        if (substituido) metodo = 'proxy';
      } catch (e) {}
    }
    window.__gate2StubAtivo = true;
    return {
      ok: substituido,
      substituido: substituido,
      metodo: metodo,
      calls: window.__gate2Calls.length
    };
  })()`;
}

async function instalarStub() {
  if (!cdp) return { ok: false, reason: "CDP indisponível" };
  try {
    const r = await cdp.evaluate(stubExpression());
    stubOk = !!(r && r.ok && r.substituido !== false);
    return r && typeof r === "object" ? r : { ok: false, reason: "sem resposta do evaluate" };
  } catch (e) {
    stubOk = false;
    return { ok: false, reason: String(e?.message ?? e) };
  }
}

function chamarExport(filename, tok = token) {
  return post(
    CAMINHO,
    moderno(++rpcId, "tools/call", {
      name: "export_salvar_png",
      arguments: { data_url: PNG_1X1, filename },
    }),
    tok,
    hdrs("tools/call"),
  );
}

function comTimeout(promessa, ms, rotulo) {
  const protegida = promessa.catch((e) => ({ __erro: String(e?.message ?? e) }));
  return Promise.race([
    protegida,
    dormir(ms).then(() => ({ __timeout: rotulo })),
  ]);
}

async function marcoChamadas() {
  const bruto = await cdp.evaluate(`(window.__gate2Seq || 0)`);
  return Number(bruto || 0);
}

function desde(chamadas, marco) {
  return chamadas.filter((c) => Number(c?.seq || 0) > marco);
}

function textoMostraDestino(texto) {
  const alvos = [DESTINO, DESTINO.replace(/\\/g, "/"), DESTINO.replace(/\\/g, "\\\\")];
  return alvos.some((alvo) => String(texto || "").includes(alvo));
}

async function lerChamadas() {
  const bruto = await cdp.evaluate(`JSON.stringify(window.__gate2Calls || [])`);
  try {
    return JSON.parse(bruto || "[]");
  } catch {
    return [];
  }
}

function esperarDialogo(conexao, timeoutMs = 10000) {
  return (async () => {
    const ate = Date.now() + timeoutMs;
    while (Date.now() < ate) {
      const d = await conexao.evaluate(`(() => {
        const d = document.querySelector('[role="dialog"][aria-labelledby="mcp-confirm-title"]');
        return d ? {
          texto: (d.innerText || d.textContent || '').trim(),
          titulo: (document.getElementById('mcp-confirm-title')?.textContent || '').trim()
        } : null;
      })()`);
      if (d) return d;
      await dormir(100);
    }
    return null;
  })();
}

function clicarBotaoDialogo(conexao, rotulo, marcar = false) {
  return conexao.evaluate(`(() => {
    const d = document.querySelector('[role="dialog"][aria-labelledby="mcp-confirm-title"]');
    if (!d) return { ok: false, reason: 'dialogo-ausente' };
    const b = Array.from(d.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === ${JSON.stringify(rotulo)});
    if (!b) return { ok: false, reason: 'botao-ausente' };
    if (${marcar ? "true" : "false"}) window.__gate2Calls.push({
      cmd: '__confirmar', rotulo: ${JSON.stringify(rotulo)},
      seq: ++(window.__gate2Seq || 0)
    });
    b.click();
    return { ok: true };
  })()`);
}

async function exportarSemDialogo(conexao, promessa, janelaMs = 2500) {
  let apareceu = false;
  const ate = Date.now() + janelaMs;
  while (Date.now() < ate) {
    const visivel = await conexao.evaluate(
      `!!document.querySelector('[role="dialog"][aria-labelledby="mcp-confirm-title"]')`,
    );
    if (visivel) {
      apareceu = true;
      break;
    }
    await dormir(100);
  }
  if (apareceu) await clicarBotaoDialogo(conexao, "Negar");
  const resposta = await comTimeout(promessa, 15000, "export sem diálogo");
  return { apareceu, resposta };
}

async function reiniciarApp() {
  if (cdp) {
    try {
      cdp.fechar();
    } catch {
      /* já fechado */
    }
    cdp = null;
  }
  if (filho && filho.exitCode === null) matar(filho.pid);
  await dormir(700);
  await esperarCdpIndisponivel(CDP_HTTP);
  filho = spawn(EXE, [], { env: envApp(), cwd: CWD, stdio: ["ignore", "ignore", "pipe"] });
  filho.stderr.on("data", () => {});
  cdp = await conectarCdp(await esperarCdp(CDP_HTTP));
  await esperarApp(cdp);
  if (!(await navegarSettings(cdp))) {
    throw new Error("painel de Acesso do agente não reapareceu após relançamento");
  }
  token = await iniciarHttpPelaUi(cdp);
}

// ── fases ──────────────────────────────────────────────────────────────

async function faseNeg02() {
  console.log("\n=== NEG-02 ===");
  checar("porta 8788 livre no início", !portaOcupada(PORTA_MCP), "nenhum listener em 127.0.0.1:8788");
  checar("CDP 9347 livre no início", !portaOcupada(CDP_HTTP), "nenhum listener em 127.0.0.1:9347");

  ocupante = await abrirOcupante();
  filho = spawn(EXE, [], { env: envApp(), cwd: CWD, stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  filho.stderr.on("data", (c) => (err += c));

  cdp = await conectarCdp(await esperarCdp(CDP_HTTP));
  await esperarApp(cdp);
  if (!(await navegarSettings(cdp))) throw new Error("painel de Acesso do agente não apareceu");
  await instalarObservadorPortaErro(cdp);
  await clicarToggle(cdp);
  await dormir(1800);

  const latch = await cdp.evaluate(`({ erro: window.__gate2PortErrorVisto === true, token: window.__gate2TokenVisto === true })`);
  const painel = await estadoPainel(cdp);
  const texto = `${painel.status} ${painel.alerta}`;
  checar(
    "UI mostra 'Porta 8788 em uso'",
    !!(latch?.erro || texto.includes("Porta 8788 em uso")),
    sanitizar(texto.slice(0, 180), token) || "nenhum texto de erro capturado",
  );

  const portasApp = portasDoApp(filho.pid)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  checar(
    "nenhum listener MCP alternativo no processo do app",
    portasApp.length === 0,
    portasApp.length ? "portas: " + portasApp.join(",") : "nenhuma (exceto CDP 9347)",
  );

  const ocupado = await reqOcupante();
  checar(
    "8788 permanece com o socket ocupante",
    ocupado.status === 409 && conexoesOcupante > 0,
    `HTTP ${ocupado.status}; conexões no ocupante=${conexoesOcupante}`,
  );
  checar(
    "nenhum token/snippet exposto na UI enquanto 8788 está ocupada",
    !latch?.token && !painel.temSnippet,
    "snippet HTTP ausente; nenhum OPENDESIGN_MCP_TOKEN observado",
  );

  await fecharOcupante(ocupante);
  ocupante = null;
  const livre = await esperarPortaLivre();
  checar("porta 8788 liberada para o app", livre, livre ? "listener de teste encerrado" : "porta ainda ocupada");

  token = await iniciarHttpPelaUi(cdp);
  const desc = await post(CAMINHO, moderno(++rpcId, "server/discover"), token, hdrs("server/discover"));
  const dj = parseSeguro(desc.body);
  checar(
    "listener MCP sobe em 127.0.0.1:8788 após liberar",
    desc.status === 200 && dj.result?.resultType === "complete" && dj.result?.serverInfo,
    `HTTP ${desc.status}; resultType=${dj.result?.resultType ?? "-"}`,
  );
  checar("token novo íntegro vindo da UI", /^[0-9a-f]{64}$/.test(token), seg(token, token));

  // Rotação real: desliga e liga de novo pela UI para produzir um token antigo.
  await cdp.evaluate(`(() => {
    const b = document.querySelector('.agent-access-btn--danger');
    if (b && !b.disabled) b.click();
    return true;
  })()`);
  await dormir(800);
  const tokenAntigo = token;
  token = await iniciarHttpPelaUi(cdp);
  const velho = await post(CAMINHO, moderno(++rpcId, "server/discover"), tokenAntigo, hdrs("server/discover"));
  checar(
    "token antigo recusado com 401",
    velho.status === 401,
    `${velho.status}; corpo ${seg(velho.body, tokenAntigo)}`,
  );

  console.log(
    "  NOTA Observado: mensagem de porta em uso sem snippet/token, 8788 preso ao ocupante, nenhuma porta TCP alternativa do app (exceto CDP); após liberar, listener e token novos; token anterior revogado.",
  );
  console.log(
    "  NOTA Não observado: nenhum token chegou a ser exposto enquanto a porta estava ocupada (mcp_start falha antes de devolver o snippet).",
  );
  if (err && err.length) console.log("  NOTA stderr: " + sanitizar(err.slice(0, 200), token));
}

async function faseAc21() {
  console.log("\n=== AC-21 ===");
  if (!token || !cdp) {
    checar("interceptação de invoke disponível", false, "sem token/CDP — AC-21 não executado");
    for (const nome of [
      "(a) diálogo de confirmação aparece e mostra arquivo/destino",
      "(b) Negar → isError:true e nenhum save registrado",
      "(c) save depois da confirmação e com nonce do ticket",
      "(d) nonce one-shot recusado na 2ª chamada",
    ]) {
      checar(nome, false, "sem token/CDP — sem cobertura");
    }
    return;
  }

  const inst = await instalarStub();
  const diag = await cdp.evaluate(`(() => ({
    ativo: window.__gate2StubAtivo === true,
    funcao: String(window.__TAURI_INTERNALS__?.invoke || '').slice(0, 160),
    chamadas: (window.__gate2Calls || []).map(function (c) { return c.cmd; })
  }))()`);
  console.log("  NOTA Diagnóstico pós-instalação: " + JSON.stringify(diag));
  checar(
    "interceptação de invoke disponível (pick_save_path/export_png stubados)",
    inst.ok,
    inst.ok
      ? `__TAURI_INTERNALS__.invoke substituído (${inst.metodo || "verificado"})`
      : String(inst.reason ?? JSON.stringify(inst)),
  );
  if (!inst.ok) {
    for (const nome of [
      "(a) diálogo de confirmação aparece e mostra arquivo/destino",
      "(b) Negar → isError:true e nenhum save registrado",
      "(c) save depois da confirmação e com nonce do ticket",
      "(d) nonce one-shot recusado na 2ª chamada",
    ]) {
      checar(nome, false, "stub de invoke indisponível — sem cobertura confiável");
    }
    return;
  }

  try {
    const marco1 = await marcoChamadas();
    const p1 = chamarExport("prova.png");
    const d1 = await esperarDialogo(cdp, 10000);
    checar(
      "(a) diálogo role=dialog aparece",
      !!d1,
      d1 ? `aria-labelledby=mcp-confirm-title; título="${d1.titulo}"` : "nenhum diálogo em 10s",
    );
    if (d1) {
      checar(
        "(a) diálogo mostra arquivo e destino",
        d1.texto.includes("prova.png") && textoMostraDestino(d1.texto),
        `arquivo=prova.png; destinoEsperado=<temp>/prova.png; texto=${JSON.stringify(d1.texto)}`,
      );
    } else {
      checar("(a) diálogo mostra arquivo e destino", false, "sem diálogo — sem cobertura");
    }

    await clicarBotaoDialogo(cdp, "Negar");
    const r1 = await comTimeout(p1, 15000, "export com Negar");
    const cham1 = await lerChamadas();
    console.log("  NOTA Comandos observados no stub: " + JSON.stringify(cham1.map((c) => c.cmd)));
    const novas1 = desde(cham1, marco1);
    const pick1 = novas1.find((c) => c.cmd === "pick_save_path");
    checar(
      "pick_save_path interceptado pelo stub",
      !!pick1,
      pick1 ? "ticket {path, nonce} devolvido sem diálogo nativo real" : "nenhuma chamada registrada",
    );
    const j1 = parseSeguro(r1?.body);
    checar(
      "(b) Negar → isError:true",
      !!r1 && !r1.__timeout && !r1.__erro && r1.status === 200 && j1.result?.isError === true,
      r1?.__timeout || r1?.__erro ? String(r1.__timeout || r1.__erro) : `HTTP ${r1?.status}; isError=${j1.result?.isError}`,
    );
    const saves1 = novas1.filter((c) => c.tipo === "save");
    checar(
      "(b) nenhum save_data_url_native registrado após Negar",
      saves1.length === 0,
      `${saves1.length} chamada(s) de save registrada(s)`,
    );

    await dormir(250);
    const marco2 = await marcoChamadas();
    const p2 = chamarExport("prova.png");
    const d2 = await esperarDialogo(cdp, 10000);
    checar("(c) diálogo reaparece para nova exportação", !!d2, d2 ? "segundo pedido de consentimento" : "nenhum diálogo em 10s");
    await clicarBotaoDialogo(cdp, "Permitir", true);
    const r2 = await comTimeout(p2, 15000, "export com Permitir");
    const cham2 = await lerChamadas();
    const novas2 = desde(cham2, marco2);
    const idxConf = novas2.findIndex((c) => c.cmd === "__confirmar");
    const idxSave = novas2.findIndex((c) => c.tipo === "save");
    checar(
      "(c) save chamado depois da confirmação",
      idxConf >= 0 && idxSave > idxConf,
      `confirmação@${idxConf}; save@${idxSave}`,
    );
    const pick2 = novas2.find((c) => c.cmd === "pick_save_path");
    const save2 = novas2[idxSave];
    checar(
      "(c) save chamado com nonce do ticket e destino",
      !!pick2 && !!save2 && save2.nonceRecebido === pick2.nonceEmitido && save2.destinoRecebido === DESTINO,
      pick2 && save2 ? "nonce=<nonce>; destino confere" : "registros insuficientes",
    );
    const j2 = parseSeguro(r2?.body);
    checar(
      "(c) Permitir → isError:false",
      !!r2 && !r2.__timeout && !r2.__erro && r2.status === 200 && j2.result?.isError === false,
      r2?.__timeout || r2?.__erro ? String(r2.__timeout || r2.__erro) : `HTTP ${r2?.status}; isError=${j2.result?.isError}`,
    );

    checar(
      "(d) nonce one-shot recusado na 2ª chamada",
      false,
      "NÃO OBSERVÁVEL: o one-shot é imposto no Rust (ExportTokens::consume) e o nonce só é emitido pelo pick_save_path real. Com pick_save_path stubado não há nonce emitido pelo Rust; o export_png real rejeitaria qualquer nonce fabricado, e não há automação do diálogo nativo para obtê-lo. Registrar sucesso aqui seria inventar evidência.",
    );

    console.log(
      "  NOTA Observado: fluxo pick_save_path (stub) → diálogo role=dialog → confirmação → chamada de save registrada com o nonce do ticket; Negar não chamou save.",
    );
    console.log(
      "  NOTA Não observado: emissão/consumo real do nonce no Rust e gravação de arquivo (save_data_url_native foi stubado, sem fs::write).",
    );
  } catch (e) {
    checar("fase AC-21", false, sanitizar(e?.stack ?? String(e), token));
  }
}

async function faseNeg06() {
  console.log("\n=== NEG-06 ===");
  if (!token || !cdp || !stubOk) {
    checar("(e) 'lembrar' suprime diálogo na segunda exportação", false, "sem token/stub — NEG-06 não executado");
    checar("(f) diálogo reaparece após relançar com o mesmo perfil", false, "sem token/stub — NEG-06 não executado");
    return;
  }

  try {
    const p1 = chamarExport("prova.png");
    const d1 = await esperarDialogo(cdp, 10000);
    checar("(e) diálogo aparece antes de 'lembrar'", !!d1, d1 ? "role=dialog presente" : "nenhum diálogo em 10s");
    if (!d1) {
      await comTimeout(p1, 15000, "export sem diálogo (lembrar)");
    } else {
      checar(
        "(e) opção 'Permitir e lembrar nesta sessão' disponível",
        d1.texto.includes("Permitir e lembrar nesta sessão"),
        "botão procurado por texto exato",
      );
      await clicarBotaoDialogo(cdp, "Permitir e lembrar nesta sessão");
      const r1 = await comTimeout(p1, 15000, "export com lembrar");
      const j1 = parseSeguro(r1?.body);
      checar(
        "(e) exportação com 'lembrar' concluída",
        !!r1 && !r1.__timeout && !r1.__erro && r1.status === 200 && j1.result?.isError === false,
        r1?.__timeout || r1?.__erro ? String(r1.__timeout || r1.__erro) : `HTTP ${r1?.status}; isError=${j1.result?.isError}`,
      );
    }

    await dormir(250);
    const savesAntes = (await lerChamadas()).filter((c) => c.tipo === "save").length;
    const p2 = chamarExport("prova.png");
    const sem = await exportarSemDialogo(cdp, p2, 2500);
    checar(
      "(e) segunda exportação para mesmo arquivo+destino NÃO abre diálogo",
      !sem.apareceu,
      sem.apareceu ? "role=dialog apareceu apesar do 'lembrar'" : "nenhum role=dialog em 2,5s",
    );
    const savesDepois = (await lerChamadas()).filter((c) => c.tipo === "save").length;
    checar(
      "(e) save registrado na exportação sem diálogo",
      savesDepois > savesAntes,
      `saves: ${savesAntes} → ${savesDepois}`,
    );

    await reiniciarApp();
    const inst2 = await instalarStub();
    checar(
      "(f) stub reinstalado após relançamento com mesmo perfil",
      inst2.ok,
      inst2.ok ? "novo invoke interceptado" : String(inst2.reason),
    );
    if (!inst2.ok) {
      checar("(f) diálogo reaparece após relançar com o mesmo perfil", false, "stub não reinstalado — sem cobertura");
    } else {
      const p3 = chamarExport("prova.png");
      const d3 = await esperarDialogo(cdp, 10000);
      checar(
        "(f) diálogo reaparece após relançar com o mesmo perfil",
        !!d3,
        d3 ? "role=dialog presente no novo processo" : "nenhum diálogo em 10s",
      );
      if (d3) {
        checar(
          "(f) diálogo mostra o mesmo arquivo e destino",
          d3.texto.includes("prova.png") && textoMostraDestino(d3.texto),
          `arquivo=prova.png; destinoEsperado=<temp>/prova.png; texto=${JSON.stringify(d3.texto)}`,
        );
        await clicarBotaoDialogo(cdp, "Negar");
      } else {
        checar("(f) diálogo mostra o mesmo arquivo e destino", false, "sem diálogo — sem cobertura");
      }
      await comTimeout(p3, 15000, "export pós-relançamento");
    }

    console.log(
      "  NOTA Observado: 'lembrar nesta sessão' suprimiu o diálogo de confirmação na sessão; após matar/relançar o app com o mesmo perfil WebView2 o diálogo voltou a aparecer.",
    );
    console.log(
      "  NOTA Não observado: gravação real do PNG (save stubado) e eventual preferência persistida em disco — o código mantém o 'lembrar' apenas em Set em memória.",
    );
  } catch (e) {
    checar("fase NEG-06", false, sanitizar(e?.stack ?? String(e), token));
  }
}

async function limpeza() {
  if (ocupante) {
    await fecharOcupante(ocupante);
    ocupante = null;
  }
  if (cdp) {
    try {
      cdp.fechar();
    } catch {
      /* já fechado */
    }
    cdp = null;
  }
  if (filho && filho.exitCode === null) matar(filho.pid);
  await dormir(500);
  matarPorta8788();
  try {
    rmSync(EXPORT_DIR, { recursive: true, force: true });
  } catch {
    /* já removido */
  }
  try {
    rmSync(PERFIL, { recursive: true, force: true });
  } catch {
    /* já removido */
  }
}

async function main() {
  console.log("=== HARNESS GATE 2 — NEG-02 / AC-21 / NEG-06 ===");
  console.log("EXE: " + EXE);
  console.log("SHA256: " + sha256(EXE));
  try {
    perfilWebview();
    mkdirSync(EXPORT_DIR, { recursive: true });
    try {
      await faseNeg02();
    } catch (e) {
      checar("fase NEG-02", false, sanitizar(e?.stack ?? String(e), token));
    }
    try {
      await faseAc21();
    } catch (e) {
      checar("fase AC-21", false, sanitizar(e?.stack ?? String(e), token));
    }
    try {
      await faseNeg06();
    } catch (e) {
      checar("fase NEG-06", false, sanitizar(e?.stack ?? String(e), token));
    }
  } catch (e) {
    checar("configuração inicial", false, sanitizar(e?.stack ?? String(e), token));
  } finally {
    await limpeza();
  }
  console.log(`\nRESULTADO: ${aprovados} OK / ${reprovados} FALHA`);
  process.exit(reprovados === 0 ? 0 : 1);
}

main();
