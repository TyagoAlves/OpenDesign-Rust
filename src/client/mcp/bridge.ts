/**
 * Ponte Rust <-> núcleo JSON-RPC. O Rust só faz transporte/token; quem conhece
 * o catálogo, as versões e o backend localApi() é este módulo.
 *
 * HTTP: o token volta de `mcp_start` e é guardado só em memória, para redação.
 * stdio: o token fica no ambiente do processo e o Rust redige a saída; aqui o
 * núcleo roda sem secrets. Nenhum dos dois grava token em disco/log/UI.
 */
// @ts-ignore - núcleo JS compartilhado com o protótipo, sem tipos publicados
import { createCore } from "./mcp-core.mjs";
import { createTauriBackend } from "./backend-tauri";
import { pedirConfirmacao } from "./confirm";
import {
  mcpRespond,
  mcpStatus,
  mcpTakeRequest,
  type McpTransport,
} from "../lib/mcp-tauri";

let core: ReturnType<typeof createCore> | null = null;
let instalado = false;
let ocupado = false;

function montarCore(transport: McpTransport, sessionId: string, secrets: string[]): void {
  core = createCore({
    backend: createTauriBackend(pedirConfirmacao),
    sessionId,
    transport,
    secrets,
  });
}

/** Chamado pelo hook quando `mcp_start` devolve o token (somente HTTP). */
export function configurarHttp(token: string, sessionId: string): void {
  montarCore("http", sessionId, [token]);
}

/** Chamado pela ponte quando o app nasceu com --transport stdio. */
export function configurarStdio(sessionId: string): void {
  montarCore("stdio", sessionId, []);
}

export function limparCore(): void {
  core = null;
}

async function verificarStdio(): Promise<void> {
  if (core) return;
  try {
    const status = await mcpStatus();
    if (status.active && status.transport === "stdio" && status.sessionId) {
      configurarStdio(status.sessionId);
    }
  } catch {
    // browser ou app ainda iniciando: tentativa seguinte resolve.
  }
}

async function bomba(): Promise<void> {
  if (ocupado) return;
  ocupado = true;
  try {
    if (!core) await verificarStdio();
    if (!core) return;
    const pedido = await mcpTakeRequest();
    if (!pedido) return;
    let resposta: unknown;
    try {
      resposta = await core.handle(pedido.message, {
        transport: pedido.transport,
        headers: pedido.headers,
      });
    } catch (erro) {
      resposta = {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Erro interno", data: String(erro) },
      };
    }
    await mcpRespond(pedido.id, resposta);
  } catch {
    // falha de IPC não derruba a bomba; o Rust expira o pedido no timeout.
  } finally {
    ocupado = false;
  }
}

/** Instala uma vez, no App, para as tools funcionarem em qualquer rota. */
export function installMcpBridge(): void {
  if (instalado || typeof window === "undefined") return;
  const internals = (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  if (!internals) return;
  instalado = true;
  window.setInterval(() => { void bomba(); }, 75);
}
