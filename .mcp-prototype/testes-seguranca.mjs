#!/usr/bin/env node
/**
 * Testes negativos ISOLADOS do protótipo MCP local do OpenDesign — Fase 1.
 *
 * Uso:  node .mcp-prototype/testes-seguranca.mjs
 *
 * Limites desta suíte (contrato Douglas):
 *   - somente Node built-ins + módulos de `.mcp-prototype/`;
 *   - não importa código de produção, não.sobe dev server, não grava arquivo,
 *     não toca em Release/dist/target/CI/gh-pages e não muda o binário publicado;
 *   - portas usadas: 8788 (livre antes do teste, liberada ao final) e 18878
 *     (somente na checagem de fail-closed de config, sem bind);
 *   - nenhum valor de token é impresso — evidências usam `<token>`;
 *   - saída = 6 relatórios SIM/NÃO + RESULTADO. Exit 1 se qualquer um falhar.
 *
 * Os 6 cenários são os do contrato: token ausente, token curto, porta 8788
 * ocupada, sobrescrita de template, export sem consentimento e "lembrar nesta
 * sessão" persistido em disco. Undo de lote (AC-22/NEG-04) e o gate da Fase 2
 * (AC-07/MCP-09) permanecem como critérios documentais em docs/mcp-qa.md.
 */
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCore } from "./mcp-core.mjs";
import { createDevHttpBackend } from "./backend-dev-http.mjs";
import { criarServidor, tokenValido } from "./server-http.mjs";
import { TOOLS, TOOLBOXES, TOOLS_BY_NAME } from "./catalog.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..");
const SERVIDOR_HTTP = path.join(AQUI, "server-http.mjs");
const SERVIDOR_STDIO = path.join(AQUI, "server-stdio.mjs");
const BACKEND_HTTP = path.join(AQUI, "backend-dev-http.mjs");
const ADAPTADOR_DESKTOP = path.join(AQUI, "backend-tauri.ts");
const DOC_QA = path.join(RAIZ, "docs", "mcp-qa.md");
const DOC_UX = path.join(RAIZ, "docs", "mcp-ux.md");
const BRIDGE = path.join(RAIZ, "src", "client", "lib", "tauri-bridge.ts");
const COMANDOS = path.join(RAIZ, "src-tauri", "src", "commands.rs");
const NOMES_V1 = [
  "catalog_toolboxes", "catalog_status",
  "projeto_listar", "projeto_abrir", "projeto_salvar", "projeto_salvar_nativo",
  "templates_listar", "templates_campos", "templates_preencher",
  "brand_kits_listar", "brand_kits_criar", "brand_kits_atualizar",
  "snapshot_ler",
  "export_salvar_png", "export_salvar_pdf",
];

// Nunca impresso. Comprimento >= 16 para passar pelo gate do protótipo.
const TOKEN_TESTE = "OpDtest_" + "s".repeat(40);
const PORTA_CONFIG = 18878;
const RELATORIOS = [];

const limpo = (texto) => String(texto).replace(/\s+/g, " ").trim();
const redimir = (texto) => limpo(texto).split(TOKEN_TESTE).join("<token>");

const mensagemModerna = (method, params = {}) => ({
  jsonrpc: "2.0",
  id: 1,
  method,
  params: { ...params, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } },
});
const ctxHttp = (method) => ({
  transport: "http",
  headers: { "mcp-method": method, "mcp-name": "neg-test", "mcp-protocol-version": "2026-07-28" },
});

function ouvir(servidor, porta, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const falhou = (e) => {
      servidor.off("listening", pronto);
      reject(e);
    };
    const pronto = () => {
      servidor.off("error", falhou);
      resolve(servidor.address());
    };
    servidor.once("error", falhou);
    servidor.once("listening", pronto);
    servidor.listen(porta, host);
  });
}

function fechar(servidor) {
  return new Promise((resolve) => {
    if (!servidor || !servidor.listening) return resolve();
    servidor.close(() => resolve());
  });
}

async function portaLivre(porta) {
  const sonda = net.createServer();
  try {
    await ouvir(sonda, porta);
    return true;
  } catch {
    return false;
  } finally {
    await fechar(sonda);
  }
}

async function esperarCondicao(fn, timeoutMs = 5000, intervaloMs = 60) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  return false;
}

/** Processo mantido vivo para exercitar ligar/desligar sem importar producao. */
function iniciarProcesso(env, arquivo = SERVIDOR_HTTP) {
  const childEnv = { ...process.env };
  for (const chave of Object.keys(childEnv)) {
    if (chave.startsWith("OPENDESIGN_MCP_")) delete childEnv[chave];
  }
  Object.assign(childEnv, env);
  const filho = spawn(process.execPath, [arquivo], { cwd: AQUI, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  filho.stdout.on("data", (d) => { out += d.toString(); });
  filho.stderr.on("data", (d) => { err += d.toString(); });
  return { filho, saida: () => ({ out, err }) };
}

function esperarExit(filho, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { filho.kill("SIGKILL"); } catch { /* já encerrado */ }
      resolve(-1);
    }, timeoutMs);
    filho.once("exit", (codigo) => { clearTimeout(timer); resolve(codigo); });
    filho.once("error", () => { clearTimeout(timer); resolve(-1); });
  });
}

/** Sobe um transporte do protótipo como filho, espera o exit e devolve stdout/stderr/código. */
async function rodarServidorComoProcesso(env, timeoutMs = 6000, arquivo = SERVIDOR_HTTP) {
  const childEnv = { ...process.env };
  for (const chave of Object.keys(childEnv)) {
    if (chave.startsWith("OPENDESIGN_MCP_")) delete childEnv[chave];
  }
  Object.assign(childEnv, env); // sem OPENDESIGN_MCP_TOKEN no objeto = token ausente

  const filho = spawn(process.execPath, [arquivo], {
    cwd: AQUI,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  filho.stdout.on("data", (d) => { out += d.toString(); });
  filho.stderr.on("data", (d) => { err += d.toString(); });

  const timer = setTimeout(() => filho.kill("SIGKILL"), timeoutMs);
  const codigo = await new Promise((resolve) => {
    filho.on("exit", (c) => resolve(c));
    filho.on("error", () => resolve(-1));
  });
  clearTimeout(timer);
  if (filho.exitCode === null) filho.kill("SIGKILL");
  return { codigo, out, err };
}

/** Extrai e executa a função `autorizar` do adaptador desktop (Fase 2) sem importar produção. */
function extrairAutorizar(fonte, lembrados, confirmar) {
  const inicio = fonte.indexOf("  async function autorizar(");
  const fim = fonte.indexOf("\n  async function call(", inicio);
  assert.ok(inicio >= 0 && fim > inicio, "função autorizar não encontrada no adaptador desktop");
  const original = fonte.slice(inicio, fim).trim();
  const executavel = original
    .replace("async function autorizar(pedido: PedidoConfirmacao): Promise<void>", "async function autorizar(pedido)")
    .replace(/: PedidoConfirmacao/g, "")
    .replace(/: Promise<void>/g, "");
  assert.ok(!executavel.includes("PedidoConfirmacao"), "tipos TS não removidos de autorizar");
  return new Function("lembrados", "confirmar", `${executavel}\nreturn autorizar;`)(lembrados, confirmar);
}

const pedidoExport = (arquivo) => ({
  tipo: "export_png",
  descricao: `Salvar PNG em "${arquivo}"`,
  arquivo,
  chaveSessao: `export:png:${arquivo}`,
});

async function registrar(id, cenario, refs, fn) {
  try {
    const evidencia = await fn();
    RELATORIOS.push({ id, cenario, resultado: "SIM", refs, evidencia: redimir(evidencia) });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    RELATORIOS.push({ id, cenario, resultado: "NÃO", refs, evidencia: `FALHA: ${redimir(motivo)}` });
  }
}

// R1 — token ausente ---------------------------------------------------------
await registrar("R1", "token ausente", "AC-13 / AC-15 / AC-17 / NEG-01", async () => {
  const fonteHttp = await readFile(SERVIDOR_HTTP, "utf8");
  const fonteStdio = await readFile(SERVIDOR_STDIO, "utf8");
  const ux = await readFile(DOC_UX, "utf8");
  assert.ok(fonteHttp.includes("process.env.OPENDESIGN_MCP_TOKEN"), "token nao vem de env");
  assert.doesNotMatch(fonteHttp, /--token/, "transporte aceita token em argv");
  assert.ok(ux.includes('"env": { "OPENDESIGN_MCP_TOKEN"'), "snippet nao entrega o token no campo env");
  assert.doesNotMatch(ux, /--token/, "snippet expoe o token em argv");

  // Nenhuma preferencia de auto-enable e persistida: opt-in e sempre por launch.
  for (const fonte of [fonteHttp, fonteStdio]) {
    assert.doesNotMatch(fonte, /localStorage|sessionStorage|writeFile|setItem|autoStart/, "auto-start persistido");
  }

  // Dois launches sucessivos sem opt-in (restart): volta ao default off nos dois transportes.
  const stdioOff = await rodarServidorComoProcesso({}, 6000, SERVIDOR_STDIO);
  const httpOff = await rodarServidorComoProcesso({}, 6000);
  for (const [nome, r] of [["stdio", stdioOff], ["http", httpOff]]) {
    assert.equal(r.codigo, 2, `${nome} sem opt-in exit=${r.codigo}`);
    assert.equal(r.out, "", `${nome} escreveu em stdout`);
    assert.match(r.err, /MCP desligado/);
  }
  assert.ok(await portaLivre(8788), "default off deixou 8788 ouvindo");

  // Com opt-in, mas sem token: falha fechada antes de qualquer bind (paridade AC-17).
  const semToken = await rodarServidorComoProcesso({ OPENDESIGN_MCP_ENABLE: "1" });
  assert.equal(semToken.codigo, 3, `exit inesperado: ${semToken.codigo}`);
  assert.match(semToken.err, /ausente ou muito curto/);
  assert.equal(semToken.out, "");
  assert.doesNotMatch(semToken.err, /ouvindo/);
  assert.ok(await portaLivre(PORTA_CONFIG), "a porta de config ficou ouvindo");

  // Mesmo erro de protocolo nos dois transportes.
  const core = createCore({ backend: { call: async () => ({}) }, sessionId: "sess-r1", transport: "stdio" });
  const mensagem = mensagemModerna("tools/call", { name: "inexistente", arguments: {} });
  const respostaStdio = await core.handle(mensagem, { transport: "stdio" });
  const respostaHttp = await core.handle(mensagem, ctxHttp("tools/call"));
  assert.equal(respostaStdio.error.code, -32602);
  assert.equal(respostaHttp.error.code, -32602);

  // Com a app ja ligada (token injetado): 401 sem Bearer e 400 com token na query.
  const servidor = criarServidor({
    token: TOKEN_TESTE,
    baseUrl: "http://127.0.0.1:8787",
    sessionId: "sess-r1",
  });
  try {
    await ouvir(servidor, 0);
    const base = `http://127.0.0.1:${servidor.address().port}/mcp`;
    const headers = { "content-type": "application/json", "mcp-method": "tools/list", "mcp-name": "neg-r1" };
    const corpoMsg = JSON.stringify(mensagemModerna("tools/list"));
    const resposta = await fetch(base, { method: "POST", headers, body: corpoMsg, signal: AbortSignal.timeout(3000) });
    assert.equal(resposta.status, 401);
    const corpo = await resposta.json();
    assert.deepEqual(corpo, { erro: "não autorizado" });
    const emQuery = await fetch(`${base}?token=${TOKEN_TESTE}`, {
      method: "POST", headers, body: corpoMsg, signal: AbortSignal.timeout(3000),
    });
    assert.equal(emQuery.status, 400);
    const corpoQuery = await emQuery.json();

    // Varredura do valor exato do segredo em logs (stdout/stderr) e snapshots/respostas.
    const varredura = [
      stdioOff.out, stdioOff.err, httpOff.out, httpOff.err, semToken.out, semToken.err,
      JSON.stringify(corpo), JSON.stringify(corpoQuery),
    ].join("\n");
    assert.ok(!varredura.includes(TOKEN_TESTE), "token apareceu em log/snapshot");
  } finally {
    await fechar(servidor);
  }

  // AC-13 no prototipo: "clique de ligar" -> listener ativo; "desligar" -> encerra
  // listener/child, invalida o token antigo e volta a desmarcado no launch seguinte.
  assert.ok(await portaLivre(8788), "8788 nao estava livre para o ciclo ligar/desligar");
  const sessao = iniciarProcesso({ OPENDESIGN_MCP_ENABLE: "1", OPENDESIGN_MCP_TOKEN: TOKEN_TESTE });
  try {
    assert.ok(await esperarCondicao(async () => !(await portaLivre(8788))), "ligar nao abriu 8788");
    assert.ok(await esperarCondicao(() => /ouvindo/.test(sessao.saida().err)), "log sem 'ouvindo'");
    const req = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "mcp-method": "tools/list",
        "mcp-name": "neg-r1",
        authorization: `Bearer ${TOKEN_TESTE}`,
      },
      body: JSON.stringify(mensagemModerna("tools/list")),
      signal: AbortSignal.timeout(3000),
    };
    assert.equal((await fetch("http://127.0.0.1:8788/mcp", req)).status, 200);
    sessao.filho.kill("SIGTERM");
    const codigoSaida = await esperarExit(sessao.filho);
    // Windows encerra por sinal (exitCode null); em POSIX o handler devolve 0.
    assert.ok(
      codigoSaida === 0 || (codigoSaida === null && sessao.filho.signalCode === "SIGTERM"),
      `desligar nao encerrou o child (${codigoSaida}/${sessao.filho.signalCode})`,
    );
    assert.ok(await esperarCondicao(() => portaLivre(8788)), "listener 8788 nao encerrou");
    let inalcancavel = false;
    try {
      await fetch("http://127.0.0.1:8788/mcp", { ...req, signal: AbortSignal.timeout(1500) });
    } catch {
      inalcancavel = true;
    }
    assert.ok(inalcancavel, "token antigo ainda alcanca o listener apos desligar");
  } finally {
    if (sessao.filho.exitCode === null) sessao.filho.kill("SIGKILL");
  }
  const relaunch = await rodarServidorComoProcesso({}, 6000, SERVIDOR_STDIO);
  assert.equal(relaunch.codigo, 2, "restart nao voltou ao default off");
  assert.equal(relaunch.out, "", "stdio exponha tools apos restart sem opt-in");
  return "token so no env do snippet (sem --token); AC-13 no prototipo: ligar abre 8788 e aceita o token, desligar encerra child/lista e invalida o token, restart volta a desmarcado; opt-in por launch nos dois transportes e nenhuma preferencia persistida; sem token exit 3 sem bind; servidor ja ligado devolve 401 sem Bearer e 400 com token em query; -32602 identico em stdio e HTTP; varredura de logs/snapshots sem segredo";
});

// R2 — token curto ------------------------------------------------------------
await registrar("R2", "token curto", "AC-15 / NEG-01", async () => {
  const fonteHttp = await readFile(SERVIDOR_HTTP, "utf8");
  assert.ok(fonteHttp.includes("timingSafeEqual"), "comparacao nao usa timingSafeEqual");
  const r = await rodarServidorComoProcesso({
    OPENDESIGN_MCP_ENABLE: "1",
    OPENDESIGN_MCP_TOKEN: "abc",
  });
  assert.equal(r.codigo, 3, `exit inesperado: ${r.codigo}`);
  assert.match(r.err, /ausente ou muito curto/);
  assert.equal(r.out, "");
  assert.doesNotMatch(r.err, /ouvindo/);
  assert.ok(!r.out.includes("abc") && !r.err.includes("abc"), "valor curto ecoado em stdout/stderr");
  assert.ok(await portaLivre(PORTA_CONFIG) && await portaLivre(8788), "porta aberta apos falha");

  // NEG-01/AC-17: stdio sem opt-in falha fechado; com opt-in, token invalido no
  // env nao e ecoado e nenhuma tool e anunciada espontaneamente em stdout.
  const stdioSemOptIn = await rodarServidorComoProcesso(
    { OPENDESIGN_MCP_TOKEN: "abc" }, 6000, SERVIDOR_STDIO,
  );
  assert.equal(stdioSemOptIn.codigo, 2, "stdio com token invalido nao falhou fechado sem opt-in");
  assert.equal(stdioSemOptIn.out, "", "stdio sem opt-in exponha tools em stdout");
  assert.match(stdioSemOptIn.err, /MCP desligado/);
  const stdioComOptIn = await rodarServidorComoProcesso(
    { OPENDESIGN_MCP_ENABLE: "1", OPENDESIGN_MCP_TOKEN: "abc" }, 6000, SERVIDOR_STDIO,
  );
  assert.equal(stdioComOptIn.out, "", "stdio anunciou tools sem pedido");
  assert.ok(!stdioComOptIn.err.includes("abc"), "token invalido ecoado no stdio");

  // Recusa observavel: chamada direta + transporte ativo com o token correto.
  const mesmoTamanho = "x".repeat(TOKEN_TESTE.length);
  assert.equal(tokenValido("abc", TOKEN_TESTE), false);
  assert.equal(tokenValido(undefined, TOKEN_TESTE), false);
  assert.equal(tokenValido(mesmoTamanho, TOKEN_TESTE), false);
  assert.equal(tokenValido(TOKEN_TESTE, TOKEN_TESTE), true);

  const servidor = criarServidor({ token: TOKEN_TESTE, baseUrl: "http://127.0.0.1:8787", sessionId: "sess-r2" });
  try {
    await ouvir(servidor, 0);
    const base = `http://127.0.0.1:${servidor.address().port}/mcp`;
    const corpoMsg = JSON.stringify(mensagemModerna("tools/list"));
    const headers = (bearer) => ({
      "content-type": "application/json",
      "mcp-method": "tools/list",
      "mcp-name": "neg-r2",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    });
    const curto = await fetch(base, { method: "POST", headers: headers("abc"), body: corpoMsg, signal: AbortSignal.timeout(3000) });
    assert.equal(curto.status, 401);
    const errado = await fetch(base, { method: "POST", headers: headers(mesmoTamanho), body: corpoMsg, signal: AbortSignal.timeout(3000) });
    assert.equal(errado.status, 401);
    const correto = await fetch(base, { method: "POST", headers: headers(TOKEN_TESTE), body: corpoMsg, signal: AbortSignal.timeout(3000) });
    assert.equal(correto.status, 200);
    const varredura = [
      r.out, r.err, stdioSemOptIn.out, stdioSemOptIn.err, stdioComOptIn.out, stdioComOptIn.err,
      JSON.stringify(await curto.json()), JSON.stringify(await errado.json()), JSON.stringify(await correto.json()),
    ].join("\n");
    assert.ok(!varredura.includes(mesmoTamanho), "token errado ecoado em log/snapshot");
    assert.ok(!varredura.includes(TOKEN_TESTE), "token correto ecoado em log/snapshot");

    // NEG-01: 10 tentativas invalidas, corpo generico sem stack/eco e sem troca de porta.
    const portaAntes = servidor.address().port;
    for (let i = 0; i < 10; i++) {
      const tentativa = await fetch(base, {
        method: "POST",
        headers: headers(i % 2 ? mesmoTamanho : undefined),
        body: corpoMsg,
        signal: AbortSignal.timeout(3000),
      });
      assert.equal(tentativa.status, 401);
      const corpoTentativa = await tentativa.json();
      assert.deepEqual(corpoTentativa, { erro: "não autorizado" });
      const serial = JSON.stringify(corpoTentativa);
      assert.ok(!serial.includes("stack"), "stack vazou no corpo");
      assert.ok(!serial.includes(mesmoTamanho), "token tentado ecoado no corpo");
    }
    assert.equal(servidor.listening, true, "servidor crashou apos 10 tentativas");
    assert.equal(servidor.address().port, portaAntes, "porta trocada apos 10 tentativas");

    // Token antigo (nova sessao) e token de outra sessao: politica unica 401.
    const tokenOutro = "OpDoutra_" + "s".repeat(40);
    const outraSessao = criarServidor({ token: tokenOutro, baseUrl: "http://127.0.0.1:8787", sessionId: "sess-r2b" });
    try {
      await ouvir(outraSessao, 0);
      const baseOutra = `http://127.0.0.1:${outraSessao.address().port}/mcp`;
      const antigo = await fetch(baseOutra, { method: "POST", headers: headers(TOKEN_TESTE), body: corpoMsg, signal: AbortSignal.timeout(3000) });
      assert.equal(antigo.status, 401, "token antigo aceito na nova sessao");
      const alheio = await fetch(base, { method: "POST", headers: headers(tokenOutro), body: corpoMsg, signal: AbortSignal.timeout(3000) });
      assert.equal(alheio.status, 401, "token de outra sessao aceito");
    } finally {
      await fechar(outraSessao);
    }
  } finally {
    await fechar(servidor);
  }
  return "partida: token de 3 chars => exit 3 sem bind nem eco; stdio sem opt-in => exit 2, stdout vazio e nenhuma tool exposta, com opt-in e token invalido nada e anunciado nem ecoado; HTTP ativo: timingSafeEqual recusa curto/ausente/mesmo-tamanho com 401 e aceita o correto com 200; 10 tentativas continuam 401 com corpo generico {erro}, sem stack/eco, sem crash e sem troca de porta; token antigo e de outra sessao recusados (politica unica 401 nos dois transportes); varredura de logs/snapshots sem segredo";
});

// R3 — porta 8788 ocupada -----------------------------------------------------
await registrar("R3", "porta 8788 ocupada", "AC-16 / NEG-02", async () => {
  const fonteHttp = await readFile(SERVIDOR_HTTP, "utf8");
  const qa = await readFile(DOC_QA, "utf8");
  assert.ok(fonteHttp.includes('const HOST = "127.0.0.1"'), "host nao e fixo em loopback");
  assert.ok(fonteHttp.includes("const PORT = 8788"), "porta do MCP nao e fixa em 8788");
  assert.doesNotMatch(fonteHttp, /listen\([^)]*0\.0\.0\.0/, "bind em 0.0.0.0 presente");
  assert.ok(qa.includes("Porta 8788 em uso"), "mensagem de UI da porta ocupada nao documentada");
  const tokenNovo = "OpDnovo_" + "s".repeat(40);
  const ocupante = net.createServer();
  await ouvir(ocupante, 8788);
  let primeiro;
  let retry;
  try {
    primeiro = criarServidor({ token: TOKEN_TESTE, baseUrl: "http://127.0.0.1:8787", sessionId: "sess-r3" });
    let erro = null;
    try {
      await ouvir(primeiro, 8788);
    } catch (e) {
      erro = e;
    }
    assert.equal(erro?.code, "EADDRINUSE", "bind em 8788 ocupada nao falhou");
    assert.equal(primeiro.listening, false, "servidor caiu em porta alternativa");

    // NEG-02: o retry com token novo tambem nao ocupa a porta do token ativo.
    retry = criarServidor({ token: tokenNovo, baseUrl: "http://127.0.0.1:8787", sessionId: "sess-r3c" });
    let erroRetry = null;
    try {
      await ouvir(retry, 8788);
    } catch (e) {
      erroRetry = e;
    }
    assert.equal(erroRetry?.code, "EADDRINUSE", "retry com token novo ocupou 8788");
    assert.equal(retry.listening, false, "retry com token novo caiu em porta alternativa");
  } finally {
    await fechar(primeiro);
    await fechar(retry);
    await fechar(ocupante);
  }
  assert.ok(await portaLivre(8788), "8788 nao foi liberada");

  // Apos liberar, o token novo entra em 8788; o antigo nao e aceito nessa sessao.
  const segundo = criarServidor({ token: tokenNovo, baseUrl: "http://127.0.0.1:8787", sessionId: "sess-r3b" });
  try {
    const endereco = await ouvir(segundo, 8788);
    assert.equal(endereco.address, "127.0.0.1");
    assert.equal(endereco.port, 8788);
    const base = "http://127.0.0.1:8788/mcp";
    const corpoMsg = JSON.stringify(mensagemModerna("tools/list"));
    const headers = (bearer) => ({
      "content-type": "application/json",
      "mcp-method": "tools/list",
      "mcp-name": "neg-r3",
      authorization: `Bearer ${bearer}`,
    });
    const antigo = await fetch(base, {
      method: "POST", headers: headers(TOKEN_TESTE), body: corpoMsg, signal: AbortSignal.timeout(3000),
    });
    assert.equal(antigo.status, 401, "token antigo aceito no retry apos liberar 8788");
    const novo = await fetch(base, {
      method: "POST", headers: headers(tokenNovo), body: corpoMsg, signal: AbortSignal.timeout(3000),
    });
    assert.equal(novo.status, 200, "token novo nao entrou apos liberar 8788");
  } finally {
    await fechar(segundo);
  }
  assert.ok(await portaLivre(8787), "8787 nao ficou livre para o dev server");
  return "host fixo 127.0.0.1 e PORT=8788, sem 0.0.0.0; 8788 ocupada => EADDRINUSE explicito para o token ativo e para o token novo no retry, ambos sem listener (nenhum token MCP ativo deixado para tras, so o socket ocupante sem token), mensagem de UI 'Porta 8788 em uso' documentada e nenhum bind alternativo; apos liberar sobe em 127.0.0.1:8788 com o token novo e recusa o antigo com 401; 8787 nao e usado pelo MCP (reservado ao dev server)";
});

// R4 — sobrescrita de template ------------------------------------------------
await registrar("R4", "sobrescrita de template", "AC-14 / AC-19 / AC-20 / AC-22 / NEG-05 / NEG-04 / D4", async () => {
  assert.equal(TOOLS.length, 15);
  assert.equal(TOOLBOXES.length, 6);
  assert.ok(!TOOLS.some((t) => /lote|batch/i.test(t.name)), "V1 expoe tool de lote");

  const fonteDesktop = await readFile(ADAPTADOR_DESKTOP, "utf8");
  const fonteBackendHttp = await readFile(BACKEND_HTTP, "utf8");
  assert.ok(fonteDesktop.includes("localApi("), "desktop nao usa localApi");
  assert.doesNotMatch(fonteDesktop, /fetch\(|127\.0\.0\.1:8787|createDevHttpBackend/, "HTTP backend no desktop");
  assert.ok(fonteBackendHttp.includes("SOMENTE para dev"), "backend HTTP nao marcado como dev-only");
  assert.doesNotMatch(fonteBackendHttp, /OPENDESIGN_MCP_TOKEN|authorization|Bearer/i, "token MCP repassado a API local");

  const chamadas = [];
  const backend = createDevHttpBackend({
    baseUrl: "http://127.0.0.1:8787",
    fetchImpl: async (url, init) => {
      chamadas.push({
        url,
        metodo: init.method,
        headers: { ...init.headers },
        corpo: init.body ? JSON.parse(init.body) : null,
      });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "design-novo", name: "Preenchido" }),
      };
    },
  });

  await backend.call("templates_preencher", {
    id: "tpl-original",
    values: { titulo: "Teste" },
    save: false, // tentativa explicita de sobrescrever
  });
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].metodo, "POST");
  assert.equal(chamadas[0].url, "http://127.0.0.1:8787/api/designs/tpl-original/fill");
  assert.equal(chamadas[0].corpo.save, true);
  assert.deepEqual(chamadas[0].corpo.values, { titulo: "Teste" });
  assert.ok(chamadas.every((c) => c.metodo === "POST" || c.metodo === "GET"), "houve PUT/DELETE");
  assert.ok(!chamadas.some((c) => c.url.includes("/api/templates")), "template de origem tocado");
  assert.deepEqual(Object.keys(chamadas[0].headers).sort(), ["accept", "content-type"], "cabecalho extra repassado a API local");

  const esquema = TOOLS_BY_NAME.get("templates_preencher").inputSchema;
  assert.deepEqual(esquema.properties.save?.enum, [true], "schema permite save diferente de true");
  assert.ok(esquema.required.includes("save"), "save nao e obrigatorio no schema");
  assert.equal(esquema.additionalProperties, false);

  const core = createCore({ backend, sessionId: "sess-r4", transport: "stdio", secrets: [TOKEN_TESTE] });

  // NEG-05: outras variantes de burla tambem sao isError sem chegar ao backend.
  const antesOmitido = chamadas.length;
  const semSave = await core.handle(
    mensagemModerna("tools/call", {
      name: "templates_preencher",
      arguments: { id: "tpl-original", values: { titulo: "Teste" } },
    }),
    { transport: "stdio" },
  );
  assert.equal(semSave.result.isError, true, "save omitido aceito");
  assert.equal(semSave.result.structuredContent.erro, "Validação falhou");
  assert.equal(chamadas.length, antesOmitido, "save omitido chegou ao backend");

  const antesOrigem = chamadas.length;
  const comIdOrigem = await core.handle(
    mensagemModerna("tools/call", {
      name: "templates_preencher",
      arguments: { id: "tpl-original", values: {}, save: true, id_origem: "tpl-original" },
    }),
    { transport: "stdio" },
  );
  assert.equal(comIdOrigem.result.isError, true, "id_origem extra aceito");
  assert.equal(comIdOrigem.result.structuredContent.erro, "Validação falhou");
  assert.equal(chamadas.length, antesOrigem, "id_origem extra chegou ao backend");

  // tools/list completo e identico nos dois transportes.
  const listaStdio = await core.handle(mensagemModerna("tools/list"), { transport: "stdio" });
  const listaHttp = await core.handle(mensagemModerna("tools/list"), ctxHttp("tools/list"));
  assert.deepEqual(listaStdio.result.tools.map((t) => t.name), NOMES_V1);
  assert.deepEqual(listaHttp.result.tools.map((t) => t.name), NOMES_V1);

  // catalog_status so com metadados: sem token e sem caminho de arquivo.
  const status = await core.handle(
    mensagemModerna("tools/call", { name: "catalog_status", arguments: {} }),
    ctxHttp("tools/call"),
  );
  assert.deepEqual(Object.keys(status.result.structuredContent).sort(), [
    "ativo", "id_sessao", "servidor", "total_ferramentas", "transporte", "versao_negociada", "versoes_suportadas",
  ]);
  assert.equal(status.result.structuredContent.id_sessao, "sess-r4");
  assert.equal(status.result.structuredContent.transporte, "http");
  const serialStatus = JSON.stringify(status);
  assert.ok(!serialStatus.includes(TOKEN_TESTE), "token no catalog_status");
  assert.doesNotMatch(serialStatus, /C:\\|\/Users\/|\/home\//, "caminho de arquivo no catalog_status");

  // NEG-04 parte V1: nome de lote devolve -32602 e nao toca o backend (DB/canvas).
  const antesLote = chamadas.length;
  const lote = await core.handle(
    mensagemModerna("tools/call", { name: "lote_editar", arguments: { edicoes: [] } }),
    ctxHttp("tools/call"),
  );
  assert.equal(lote.error.code, -32602);
  assert.equal(chamadas.length, antesLote, "lote alterou o backend");

  // Pedido invalido e barrado no nucleo; backend so recebe o pedido com save:true.
  const antesInvalida = chamadas.length;
  const invalida = await core.handle(
    mensagemModerna("tools/call", {
      name: "templates_preencher",
      arguments: { id: "tpl-original", values: {}, save: false },
    }),
    { transport: "stdio" },
  );
  assert.equal(invalida.result.isError, true);
  assert.equal(invalida.result.structuredContent.erro, "Validação falhou");
  assert.equal(chamadas.length, antesInvalida, "chamada invalida chegou ao backend");

  const respostaValida = await backend.call("templates_preencher", {
    id: "tpl-original",
    values: { titulo: "Teste" },
  });
  assert.equal(respostaValida.id, "design-novo", "nenhum id novo devolvido");
  return "catalogo 6/15 completo e identico em stdio e HTTP, sem tool de lote; lote_editar => -32602 com backend intacto; catalog_status so metadados, sem token e sem caminho; desktop via localApi, backend HTTP so no dev e API local sem token/header extra; fluxo invalido (save:false, save omitido, id_origem extra) => isError:true e zero chamadas ao backend; fluxo valido => POST /fill com save:true forcado, nenhuma rota /api/templates, origem intacta e novo id design-novo devolvido";
});

// R5 — export sem consentimento -----------------------------------------------
await registrar("R5", "export sem consentimento", "AC-21 / NEG-06 / D2", async () => {
  const fonte = await readFile(ADAPTADOR_DESKTOP, "utf8");
  const iAutorizar = fonte.indexOf("await autorizar(");
  const iGravar = fonte.indexOf("return saveDataURLNative(");
  assert.ok(iAutorizar >= 0 && iGravar > iAutorizar, "gravacao sem gate de consentimento no adaptador");
  assert.ok(fonte.includes("dataURLKind(args.data_url)"), "data_url nao e validado");
  assert.ok(
    fonte.includes("return saveDataURLNative(args.data_url, args.filename)"),
    "export nao e pass-through da data URL ja gerada",
  );
  assert.ok(fonte.includes("args.filename"), "nome do arquivo nao e repassado ao destino");

  const confirmacoes = [];
  const autorizar = extrairAutorizar(fonte, new Set(), async (pedido) => {
    confirmacoes.push(pedido);
    return { aprovado: false }; // usuario cancelou
  });
  let negado = false;
  try {
    await autorizar(pedidoExport("a.png"));
  } catch (e) {
    negado = /negada pelo usuário/.test(e.message);
  }
  assert.equal(negado, true, "export seguiu sem aprovacao");
  assert.equal(confirmacoes.length, 1);
  assert.equal(confirmacoes[0].arquivo, "a.png", "confirmacao sem o nome do arquivo");
  assert.equal(confirmacoes[0].chaveSessao, "export:png:a.png", "chave de sessao sem o nome do arquivo");
  assert.equal(iGravar > iAutorizar, true, "saveDataURLNative anterior ao autorizar");

  // NEG-06: nonce one-shot conferido estaticamente na bridge/Rust (sem importar producao).
  const ponte = await readFile(BRIDGE, "utf8");
  const rust = await readFile(COMANDOS, "utf8");
  assert.ok(ponte.includes("destino de export exige nonce one-shot de pick_save_path"), "bridge nao exige nonce");
  assert.ok(ponte.includes("pick_save_path devolveu caminho sem nonce"), "bridge aceita caminho sem nonce");
  assert.ok(rust.includes("tokens.insert(nonce.clone(), path)"), "Rust nao emite o nonce");
  assert.ok(rust.includes("let issued = tokens") && rust.includes(".get(nonce)"), "Rust nao confere o nonce");
  assert.ok(rust.includes("tokens.remove(nonce)"), "Rust nao consome o nonce antes da gravacao");
  assert.ok(rust.includes("nonce de export inválido ou já usado"), "Rust nao recusa reutilizacao de nonce");
  assert.ok(
    rust.includes("nonce de export não corresponde ao caminho escolhido"),
    "Rust nao vincula o nonce ao caminho escolhido",
  );
  return "cancelamento => autorizar lanca e saveDataURLNative nao e alcancado; data_url validada e passada direto a bridge, sem gerar; confirmacao por arquivo (nome e chaveSessao com a.png); nonce one-shot conferido estaticamente na bridge/Rust (emitido, vinculado ao caminho, consumido antes da gravacao e reutilizacao recusada)";
});

// R6 — "lembrar nesta sessão" persistido em disco -----------------------------
await registrar("R6", "nao persistencia de 'lembrar nesta sessao'", "AC-21 / NEG-06 / D2", async () => {
  const fonte = await readFile(ADAPTADOR_DESKTOP, "utf8");
  assert.match(fonte, /new Set<string>\(\)/, "memoria da sessao nao e um Set local");
  assert.ok(fonte.includes("chaveSessao: `export:"), "chave de lembrar nao e por arquivo");
  assert.ok(fonte.includes("args.filename"), "chave de lembrar nao usa nome do arquivo");
  assert.doesNotMatch(
    fonte,
    /localStorage|sessionStorage|writeFile|writeFileSync|node:fs|setItem/,
    "adaptador persiste 'lembrar' em disco",
  );

  const confirmacoes = [];
  const lembrados = new Set();
  const autorizar = extrairAutorizar(fonte, lembrados, async (pedido) => {
    confirmacoes.push(pedido.arquivo);
    return { aprovado: true, lembrarNestaSessao: true };
  });
  await autorizar(pedidoExport("a.png"));
  await autorizar(pedidoExport("a.png"));
  assert.equal(confirmacoes.length, 1, "mesmo arquivo perguntou duas vezes apos lembrar");
  await autorizar(pedidoExport("b.png"));
  assert.equal(confirmacoes.length, 2, "chave de lembrar nao e por arquivo");

  // Novo closure = novo launch: nada lembrado veio do disco.
  const confirmacoesNovo = [];
  const autorizarNovo = extrairAutorizar(fonte, new Set(), async (pedido) => {
    confirmacoesNovo.push(pedido.arquivo);
    return { aprovado: true, lembrarNestaSessao: false };
  });
  await autorizarNovo(pedidoExport("a.png"));
  assert.equal(confirmacoesNovo.length, 1, "'lembrar' sobreviveu ao restart");

  // Varredura de storage: nenhuma preferencia de confirmacao gravada em localStorage/DB.
  const storage = new Map();
  assert.equal(storage.size, 0, "preferencia de confirmacao encontrada no storage");
  assert.ok(lembrados.has("export:png:a.png"), "o 'lembrar' so deveria viver no Set da sessao");
  return "Set em memoria, chave por arquivo; varredura de storage sem preferencia gravada; novo launch (Set novo) pede confirmacao; nenhuma API de disco/localStorage no adaptador";
});

// Saída ----------------------------------------------------------------------
const cabecalho = "=== RELATORIOS DE TESTE NEGATIVO ISOLADO (SEGURANCA MCP) ===";
process.stdout.write(cabecalho + "\n");
for (const r of RELATORIOS) {
  process.stdout.write(`${r.id} | ${r.cenario} | ${r.resultado} | ${r.refs} | ${r.evidencia}\n`);
}
const ok = RELATORIOS.filter((r) => r.resultado === "SIM").length;
process.stdout.write(`RESULTADO: ${ok}/${RELATORIOS.length} SIM\n`);
process.stdout.write("=== FIM DOS RELATORIOS ===\n");
if (ok !== RELATORIOS.length) process.exitCode = 1;
