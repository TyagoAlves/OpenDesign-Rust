import { useMemo, useState } from "preact/hooks";
import { tr } from "../i18n";
import { useMcpAccess } from "../hooks/use-mcp-access";
import type { McpStatusValue } from "../lib/mcp-tauri";

type PreviewMode = "off" | "waiting" | "connected" | "stdio" | "http" | "port-error";

interface Props {
  /** Força um estado/visão específica para verificação visual (6 imagens). */
  preview?: PreviewMode;
}

const PLACEHOLDER = "<token-gerado-localmente>";

function previewSnippets() {
  const stdio = {
    mcpServers: {
      opendesign: {
        command: "<comando-do-opendesign>",
        args: ["--transport", "stdio"],
        env: { OPENDESIGN_MCP_TOKEN: PLACEHOLDER },
      },
    },
  };
  const http = {
    mcpServers: {
      opendesign: {
        transport: "http",
        endpoint: "http://127.0.0.1:8788/mcp",
        headers: { Authorization: `Bearer ${PLACEHOLDER}` },
      },
    },
  };
  return {
    stdio: JSON.stringify(stdio, null, 2),
    http: JSON.stringify(http, null, 2),
  };
}

function StatusIcon({ state }: { state: McpStatusValue }) {
  const color = state === "connected" ? "#16a34a" : state === "waiting" ? "#d97706" : state === "port-error" ? "#dc2626" : "#71717a";
  const label =
    state === "connected" ? tr('Conectado') : state === "waiting" ? tr('Aguardando') : state === "port-error" ? tr('Porta 8788 em uso') : tr('Desligado');
  return (
    <svg
      class="agent-access-status__icon"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="7" cy="7" r="5" fill={color} />
      {state === "port-error" && (
        <path d="M4.5 4.5 L9.5 9.5 M9.5 4.5 L4.5 9.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" />
      )}
      {state === "waiting" && <circle cx="7" cy="7" r="2" fill="#fff" />}
      {state === "connected" && <path d="M4.2 7.2 L6.1 9 L9.8 5.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />}
      <title>{label}</title>
    </svg>
  );
}

function SnippetBlock({
  id,
  label,
  code,
  show,
  onToggle,
  onCopy,
  endpoint,
}: {
  id: string;
  label: string;
  code: string;
  show: boolean;
  onToggle: () => void;
  onCopy: () => void;
  endpoint?: string;
}) {
  const codeId = `${id}-code`;
  return (
    <div class="agent-access-snippet">
      <div class="agent-access-snippet__head">
        <span class="agent-access-snippet__label">{label}</span>
        <div class="agent-access__token-actions">
          <button type="button" class="agent-access-btn agent-access-btn--ghost" onClick={onCopy}>{tr('Copiar {0}', [label])}</button>
          <button type="button" class="agent-access-btn agent-access-btn--ghost" onClick={onToggle} aria-expanded={show} aria-controls={codeId}>
            {show ? tr('Ocultar snippet') : tr('Mostrar snippet')}
          </button>
        </div>
      </div>
      {endpoint && <p class="agent-access-muted">{tr('Endpoint HTTP:')} <code>{endpoint}</code>{tr(', fixo. O token')} <strong>{tr('não')}</strong> {tr('aparece em URL, query ou argumentos; no HTTP ele vai no header')} <code>Authorization: Bearer</code>{tr('.')}</p>}
      {show && (
        <pre id={codeId} class="agent-access-code"><code>{code}</code></pre>
      )}
    </div>
  );
}

export function AgentAccessPanel({ preview }: Props) {
  const access = useMcpAccess();
  const [showStdio, setShowStdio] = useState(false);
  const [showHttp, setShowHttp] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const forced: McpStatusValue | null =
    preview === "port-error" ? "port-error" :
    preview === "connected" ? "connected" :
    preview === "waiting" || preview === "stdio" || preview === "http" ? "waiting" :
    preview === "off" ? "off" : null;

  const state: McpStatusValue = forced ?? access.state;
  const isOn = state === "waiting" || state === "connected";
  const snippetsEnabled = isOn;
  const showStdioBlock = preview === "stdio" ? true : showStdio;
  const showHttpBlock = preview === "http" ? true : showHttp;

  const previews = useMemo(previewSnippets, []);
  const isPreview = !!forced && !!preview;
  const stdioCode = isPreview ? previews.stdio : access.stdioSnippet;
  const httpCode = isPreview ? previews.http : access.httpSnippet;

  const statusText =
    state === "off" ? tr('Desligado') :
    state === "waiting" ? tr('Serviço local ativo - aguardando agente') :
    state === "connected" ? tr('Agente conectado') :
    tr('Porta 8788 em uso');

  const notice = copyNotice ?? access.notice;

  function handleToggle(next: boolean) {
    if (preview) return;
    if (next) void access.enable();
    else void access.disable();
  }

  async function handleCopy(which: "stdio" | "http") {
    const text = which === "stdio" ? stdioCode : httpCode;
    if (!text) {
      setCopyNotice(tr('Ligue o acesso para gerar o snippet.'));
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopyNotice(tr('Snippet copiado. Cole na configuração do seu agente.'));
      } else {
        throw new Error("no clipboard");
      }
    } catch {
      setCopyNotice(tr('Não foi possível copiar. Selecione o texto abaixo e copie manualmente.'));
      if (which === "stdio") setShowStdio(true);
      else setShowHttp(true);
    }
  }

  return (
    <section class="agent-access" aria-labelledby="agent-access-title">
      <header class="agent-access__header">
        <p class="agent-access__path">{tr('Configurações → Acesso do agente')}</p>
        <h2 id="agent-access-title">{tr('Acesso do agente (MCP)')}</h2>
        <p class="agent-access__intro">{tr('Conexão local para um agente de IA no seu computador. Fica desligada sempre que o OpenDesign abre. Na V1 há duas formas de conexão: stdio e HTTP.')}</p>
      </header>

      <div class="agent-access__card">
        <div class="agent-access__row agent-access__row--toggle">
          <div class="agent-access__row-text">
            <label id="agent-access-toggle-label" class="agent-access__label" for="agent-access-toggle"><strong>{tr('Permitir acesso do agente')}</strong></label>
            <p class="agent-access__hint">{tr('Desligado ao abrir o app. Você precisa ligar de novo a cada uso.')}</p>
          </div>
          <button
            id="agent-access-toggle"
            type="button"
            role="switch"
            aria-labelledby="agent-access-toggle-label"
            aria-checked={isOn}
            class={`agent-access-switch ${isOn ? "is-on" : ""}`}
            onClick={() => handleToggle(!isOn)}
            disabled={!!preview}
          >
            <span class="agent-access-switch__thumb" aria-hidden="true" />
          </button>
        </div>

        <div class="agent-access__warning" role="note">
          <p><strong>{tr('Controle local.')}</strong> {tr('Sem conta, sem nuvem, sem acesso remoto. O token é como senha: não compartilhe. No stdio ele aparece no campo')} <code>env</code>{tr('; no HTTP, no header')} <code>Authorization</code>{tr(' dos snippets.')}</p>
        </div>

        <div
          class={`agent-access-status agent-access-status--${state}`}
          role="status"
          aria-live="polite"
          aria-label={tr('Status: {0}', [statusText])}
        >
          <StatusIcon state={state} />
          <span class="agent-access-status__text">{statusText}</span>
        </div>

        {state === "port-error" && (
          <div class="agent-access__error" role="alert">
            <p><strong>{tr('Porta 8788 em uso.')}</strong> {tr('Feche o processo que usa a porta e tente novamente. O OpenDesign não troca de porta.')}</p>
            <button type="button" class="agent-access-btn" onClick={() => void access.retry()} disabled={!!preview}>{tr('Tentar novamente')}</button>
          </div>
        )}

        <div class="agent-access__transport">
          <p class="agent-access__hint"><strong>{tr('Transportes (V1):')}</strong> {tr('stdio e HTTP. stdio não abre porta; HTTP escuta em')} <code>127.0.0.1:8788/mcp</code>.</p>
        </div>

        {snippetsEnabled && (
          <div class="agent-access__snippets">
            <SnippetBlock
              id="agent-access-stdio"
              label={tr('stdio')}
              code={stdioCode}
              show={showStdioBlock}
              onToggle={() => !preview && setShowStdio((v) => !v)}
              onCopy={() => handleCopy("stdio")}
            />
            <SnippetBlock
              id="agent-access-http"
              label={tr('HTTP')}
              code={httpCode}
              show={showHttpBlock}
              endpoint="http://127.0.0.1:8788/mcp"
              onToggle={() => !preview && setShowHttp((v) => !v)}
              onCopy={() => handleCopy("http")}
            />

            <div class="agent-access__token-row">
              <div>
                <p class="agent-access__label"><strong>{tr('Token')}</strong></p>
                <p class="agent-access__hint">{tr('stdio: campo')} <code>env</code>{tr('; HTTP: header')} <code>Authorization: Bearer</code>{tr(' - nunca em comando, endereço ou log.')}</p>
              </div>
            </div>
            {notice && <p class="agent-access__notice" role="status">{notice}</p>}
          </div>
        )}

        <div class="agent-access__actions">
          <button type="button" class="agent-access-btn agent-access-btn--danger" onClick={() => void access.disable()} disabled={state === "off" || !!preview}>
            {tr('Desligar e revogar token')}
          </button>
        </div>
      </div>
    </section>
  );
}

export default AgentAccessPanel;
