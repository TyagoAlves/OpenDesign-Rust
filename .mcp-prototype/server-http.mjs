#!/usr/bin/env node
/**
 * Transporte Streamable HTTP (protótipo) do MCP local do OpenDesign.
 *
 * Uso (somente com opt-in explícito por launch e token obrigatório):
 *   OPENDESIGN_MCP_ENABLE=1 OPENDESIGN_MCP_TOKEN=<gerado pela app> \
 *     node .mcp-prototype/server-http.mjs
 *
 * Regras de segurança implementadas:
 *   - bind exclusivo em 127.0.0.1 (nunca 0.0.0.0);
 *   - desligado por padrão (OPENDESIGN_MCP_ENABLE=1);
 *   - falha fechada: sem OPENDESIGN_MCP_TOKEN o servidor NÃO sobe;
 *   - Bearer comparado com timingSafeEqual (compra de tempo mitigada);
 *   - token nunca impresso em stdout/stderr, nunca aceito na URL/query;
 *   - headers MCP opcionais (Mcp-Method, Mcp-Name); validados no núcleo se presentes;
 *   - sem CORS, sem GET de stream (removido em 2026-07-28), Cache-Control no-store;
 *   - limite de body para não aceitar canvas arbitrariamente grande.
 *
 * O token deve ser rotacionado a cada launch pela aplicação (Settings → Agent
 * access). Este protótipo apenas o recebe por env; não persiste nem o gera.
 */
import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createCore } from "./mcp-core.mjs";
import { createDevHttpBackend } from "./backend-dev-http.mjs";

const HOST = "127.0.0.1";
const PORT = 8788; // AC-16: fixa; porta ocupada é erro, nunca fallback
const MAX_BODY = 40 * 1024 * 1024; // canvas_json pode chegar a ~40 MB
const CAMINHO = "/mcp";

function configurar() {
  if (process.env.OPENDESIGN_MCP_ENABLE !== "1") {
    process.stderr.write("MCP desligado. Defina OPENDESIGN_MCP_ENABLE=1 para ativar neste launch.\n");
    process.exit(2);
  }
  const token = process.env.OPENDESIGN_MCP_TOKEN;
  if (!token || token.length < 16) {
    process.stderr.write("MCP bloqueado: OPENDESIGN_MCP_TOKEN ausente ou muito curto.\n");
    process.exit(3);
  }
  if (process.env.OPENDESIGN_MCP_PORT) {
    process.stderr.write("MCP bloqueado: a porta é fixa 8788; OPENDESIGN_MCP_PORT não é aceita.\n");
    process.exit(4);
  }
  return {
    token,
    baseUrl: process.env.OPENDESIGN_MCP_BASE_URL || "http://127.0.0.1:8787",
    sessionId: `sess-${randomUUID().slice(0, 8)}`,
  };
}

/** Comparação em tempo constante; tamanhos diferentes também falham rápido. */
export function tokenValido(fornecido, esperado) {
  if (typeof fornecido !== "string" || !esperado) return false;
  const a = Buffer.from(fornecido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function json(res, status, corpo) {
  const payload = JSON.stringify(corpo);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(payload);
}

async function lerBody(req) {
  let tamanho = 0;
  const pedacos = [];
  for await (const pedaco of req) {
    tamanho += pedaco.length;
    if (tamanho > MAX_BODY) {
      const erro = new Error("body too large");
      erro.status = 413;
      throw erro;
    }
    pedacos.push(pedaco);
  }
  return Buffer.concat(pedacos).toString("utf8");
}

export function criarServidor({ token, baseUrl, sessionId }) {
  const backend = createDevHttpBackend({ baseUrl });
  const core = createCore({ backend, sessionId, transport: "http", secrets: [token] });

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

    if (url.pathname !== CAMINHO) {
      json(res, 404, { erro: "não encontrado" });
      return;
    }
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      json(res, 405, { erro: "use POST" });
      return;
    }
    // Nunca aceitar token em query/fragmento de URL.
    if (url.search || url.hash || "token" in Object.fromEntries(url.searchParams)) {
      json(res, 400, { erro: "token na URL não é aceito" });
      return;
    }

    const auth = req.headers.authorization ?? "";
    const match = /^Bearer (.+)$/.exec(auth);
    if (!tokenValido(match?.[1], token)) {
      json(res, 401, { erro: "não autorizado" });
      return;
    }

    let corpo;
    try {
      corpo = await lerBody(req);
    } catch (e) {
      json(res, e?.status === 413 ? 413 : 400, { erro: "body inválido" });
      return;
    }

    let msg;
    try {
      msg = JSON.parse(corpo);
    } catch {
      json(res, 200, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }

    try {
      const resposta = await core.handle(msg, { transport: "http", headers: req.headers });
      if (resposta === null) {
        res.writeHead(202);
        res.end();
        return;
      }
      json(res, 200, resposta);
    } catch {
      json(res, 200, {
        jsonrpc: "2.0",
        id: msg?.id ?? null,
        error: { code: -32603, message: "Internal error" },
      });
    }
  });
}

function main() {
  const cfg = configurar();
  const server = criarServidor(cfg);
  server.on("error", (erro) => {
    if (erro?.code === "EADDRINUSE") {
      process.stderr.write(`MCP bloqueado: ${HOST}:${PORT} ocupada. Sem fallback.\n`);
      process.exit(5);
    }
    process.stderr.write(`MCP falhou ao abrir ${HOST}:${PORT}: ${erro?.code ?? "erro"}\n`);
    process.exit(6);
  });
  server.listen(PORT, HOST, () => {
    // Log sem token e sem segredos: apenas metadados de escopo local.
    process.stderr.write(`MCP local ouvindo em http://${HOST}:${PORT}${CAMINHO}\n`);
  });
  for (const sinal of ["SIGINT", "SIGTERM"]) {
    process.on(sinal, () => server.close(() => process.exit(0)));
  }
}

const executadoDireto = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (executadoDireto) main();
