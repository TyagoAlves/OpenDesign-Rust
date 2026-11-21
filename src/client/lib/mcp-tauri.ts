/**
 * Wrappers tipados dos comandos MCP do Rust. Sem @tauri-apps/api: o invoke é
 * o mesmo exposto por `window.__TAURI_INTERNALS__` usado em tauri-bridge.ts.
 *
 * Nenhuma função aqui imprime token. `mcpStatus` e `mcpTakeRequest` nunca o
 * devolvem; ele só volta uma vez, em `mcpStart`, para o campo `env` do snippet.
 */

export type McpTransport = "stdio" | "http";
export type McpStatusValue = "off" | "waiting" | "connected" | "port-error";

export interface McpStartResult {
  token: string;
  sessionId: string;
  transport: McpTransport;
  stdioCommand: string;
  status: McpStatusValue;
}

export interface McpStatusResult {
  active: boolean;
  transport: McpTransport | null;
  status: McpStatusValue;
  sessionId: string | null;
  lastActivityMs: number | null;
}

export interface McpRequest {
  id: number;
  transport: McpTransport;
  headers: Record<string, string>;
  message: unknown;
}

type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: InvokeFn } }).__TAURI_INTERNALS__;
  if (!internals || typeof internals.invoke !== "function") {
    return Promise.reject(new Error("Tauri indisponível"));
  }
  return internals.invoke(command, args).then((v) => v as T);
}

export function mcpStart(transport: McpTransport): Promise<McpStartResult> {
  return invoke<McpStartResult>("mcp_start", { transport });
}

export function mcpStop(): Promise<void> {
  return invoke<void>("mcp_stop", {});
}

export function mcpStatus(): Promise<McpStatusResult> {
  return invoke<McpStatusResult>("mcp_status", {});
}

export function mcpTakeRequest(): Promise<McpRequest | null> {
  return invoke<McpRequest | null>("mcp_take_request", {});
}

export function mcpRespond(id: number, response: unknown): Promise<void> {
  return invoke<void>("mcp_respond", { id, response: JSON.stringify(response) });
}
