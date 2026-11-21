import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { tr } from "../i18n";
import { limparCore, configurarHttp } from "../mcp/bridge";
import {
  mcpStart,
  mcpStatus,
  mcpStop,
  type McpStatusValue,
} from "../lib/mcp-tauri";

const HTTP_ENDPOINT = "http://127.0.0.1:8788/mcp";

export interface McpAccess {
  state: McpStatusValue;
  token: string | null;
  sessionId: string | null;
  stdioCommand: string;
  stdioSnippet: string;
  httpSnippet: string;
  notice: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  retry: () => Promise<void>;
}

function snippetHttp(token: string): string {
  return JSON.stringify({
    mcpServers: {
      opendesign: {
        transport: "http",
        endpoint: HTTP_ENDPOINT,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  }, null, 2);
}

function snippetStdio(command: string, token: string): string {
  return JSON.stringify({
    mcpServers: {
      opendesign: {
        command,
        args: ["--transport", "stdio"],
        env: { OPENDESIGN_MCP_TOKEN: token },
      },
    },
  }, null, 2);
}

function estadoDoErro(erro: unknown): McpStatusValue {
  const texto = erro instanceof Error ? erro.message : String(erro);
  return texto.includes("port_in_use") ? "port-error" : "waiting";
}

export function useMcpAccess(): McpAccess {
  const [state, setState] = useState<McpStatusValue>("off");
  const [token, setToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stdioCommand, setStdioCommand] = useState("OpenDesign.exe");
  const [notice, setNotice] = useState<string | null>(null);
  const ativoRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const status = await mcpStatus();
      if (!status.active) {
        ativoRef.current = false;
        setState("off");
        return;
      }
      ativoRef.current = true;
      setState(status.status);
      if (status.sessionId) setSessionId(status.sessionId);
    } catch {
      // navegador ou app fechando
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(); }, 1000);
    void refresh();
    return () => window.clearInterval(timer);
  }, [refresh]);

  const enable = useCallback(async () => {
    setNotice(null);
    try {
      const resultado = await mcpStart("http");
      ativoRef.current = true;
      configurarHttp(resultado.token, resultado.sessionId);
      setToken(resultado.token);
      setSessionId(resultado.sessionId);
      setStdioCommand(resultado.stdioCommand || "OpenDesign.exe");
      setState(resultado.status);
    } catch (erro) {
      setState(estadoDoErro(erro));
      setNotice(tr("Não foi possível iniciar o serviço local."));
    }
  }, []);

  const disable = useCallback(async () => {
    try { await mcpStop(); } catch { /* já parado */ }
    limparCoreSafe();
    ativoRef.current = false;
    setState("off");
    setToken(null);
    setSessionId(null);
    setNotice(null);
  }, []);

  const retry = useCallback(async () => {
    await disable();
    await enable();
  }, [disable, enable]);

  const snippets = useMemo(() => ({
    stdio: token ? snippetStdio(stdioCommand, token) : "",
    http: token ? snippetHttp(token) : "",
  }), [token, stdioCommand]);

  return {
    state,
    token,
    sessionId,
    stdioCommand,
    stdioSnippet: snippets.stdio,
    httpSnippet: snippets.http,
    notice,
    enable,
    disable,
    retry,
  };
}

function limparCoreSafe(): void {
  try { limparCore(); } catch { /* módulo ainda carregando */ }
}
