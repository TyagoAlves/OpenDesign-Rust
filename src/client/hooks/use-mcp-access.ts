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
  autoStart: boolean;
  setAutoStart: (value: boolean) => void;
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
        env: { OPENDESIGN_MCP_TOKEN: token },
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
  // AC-13/MCP-03: intenção só em memória; nunca persistida.
  const [autoStart, setAutoStart] = useState(false);
  const ativoRef = useRef(false);
  const estadoAnteriorRef = useRef<McpStatusValue>("off");

  const refresh = useCallback(async () => {
    try {
      const status = await mcpStatus();
      if (!status.active) {
        ativoRef.current = false;
        if (estadoAnteriorRef.current === "connected") {
          setNotice(tr("Agente desconectado."));
        }
        estadoAnteriorRef.current = "off";
        setAutoStart(false);
        setState("off");
        return;
      }
      ativoRef.current = true;
      if (estadoAnteriorRef.current === "connected" && status.status === "waiting") {
        setNotice(tr("Agente desconectado."));
      }
      estadoAnteriorRef.current = status.status;
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
      estadoAnteriorRef.current = resultado.status;
      setState(resultado.status);
    } catch (erro) {
      estadoAnteriorRef.current = "off";
      setState(estadoDoErro(erro));
      setAutoStart(false);
      setNotice(tr("Não foi possível iniciar o serviço local."));
    }
  }, []);

  const disable = useCallback(async () => {
    const haviaToken = token !== null;
    try { await mcpStop(); } catch { /* já parado */ }
    limparCoreSafe();
    ativoRef.current = false;
    estadoAnteriorRef.current = "off";
    setState("off");
    setToken(null);
    setSessionId(null);
    setAutoStart(false);
    setNotice(haviaToken ? tr("Token revogado.") : null);
  }, [token]);

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
    autoStart,
    setAutoStart,
    enable,
    disable,
    retry,
  };
}

function limparCoreSafe(): void {
  try { limparCore(); } catch { /* módulo ainda carregando */ }
}
