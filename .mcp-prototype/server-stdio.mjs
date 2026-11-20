#!/usr/bin/env node
/**
 * Transporte stdio do protótipo MCP local do OpenDesign.
 *
 * Uso (somente com opt-in explícito por launch):
 *   OPENDESIGN_MCP_ENABLE=1 node .mcp-prototype/server-stdio.mjs
 *
 * Segurança:
 *   - desligado por padrão: sem OPENDESIGN_MCP_ENABLE=1 o processo encerra;
 *   - stdout contém SOMENTE JSON-RPC (uma mensagem por linha) — nada de logs;
 *   - diagnostics vão para stderr e nunca incluem token;
 *   - nenhum token é necessário no stdio (o limite de confiança é o processo
 *     pai, a aplicação desktop); o token por sessão é exigido no HTTP.
 *
 * Este arquivo é protótipo isolado: não altera package.json, CI nem o app.
 */
import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { createCore } from "./mcp-core.mjs";
import { createDevHttpBackend } from "./backend-dev-http.mjs";

function configurar() {
  if (process.env.OPENDESIGN_MCP_ENABLE !== "1") {
    process.stderr.write(
      "MCP desligado. Defina OPENDESIGN_MCP_ENABLE=1 para ativar neste launch.\n",
    );
    process.exit(2);
  }
  const baseUrl = process.env.OPENDESIGN_MCP_BASE_URL || "http://127.0.0.1:8787";
  return { baseUrl, sessionId: `sess-${randomUUID().slice(0, 8)}` };
}

function main() {
  const { baseUrl, sessionId } = configurar();
  const backend = createDevHttpBackend({ baseUrl });
  const core = createCore({ backend, sessionId, transport: "stdio", secrets: [] });

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on("line", async (linha) => {
    if (!linha.trim()) return;
    let msg;
    try {
      msg = JSON.parse(linha);
    } catch {
      const resposta = { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } };
      process.stdout.write(JSON.stringify(resposta) + "\n");
      return;
    }
    try {
      const resposta = await core.handle(msg, { transport: "stdio" });
      if (resposta !== null) process.stdout.write(JSON.stringify(resposta) + "\n");
    } catch (e) {
      const resposta = {
        jsonrpc: "2.0",
        id: msg?.id ?? null,
        error: { code: -32603, message: "Internal error" },
      };
      process.stdout.write(JSON.stringify(resposta) + "\n");
      process.stderr.write(`Falha interna no núcleo MCP: ${e instanceof Error ? e.name : "erro"}\n`);
    }
  });

  rl.on("close", () => process.exit(0));
}

main();
