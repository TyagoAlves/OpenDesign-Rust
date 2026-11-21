import { tr } from "../i18n";
import { responderConfirmacao, usePedidoConfirmacao } from "../mcp/confirm";

/** Modal global de consentimento (D2). Renderizado uma vez pelo App. */
export function McpConfirmDialog() {
  const pedido = usePedidoConfirmacao();
  if (!pedido) return null;

  const negar = () => responderConfirmacao({ aprovado: false });

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={negar}>
      <div
        class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-confirm-title"
        aria-describedby="mcp-confirm-desc"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="mcp-confirm-title" class="m-0 mb-2 text-base font-semibold text-zinc-900">
          {tr("Permitir ação do agente?")}
        </h2>
        <p id="mcp-confirm-desc" class="mb-1 text-sm text-zinc-700">{pedido.descricao}</p>
        {pedido.arquivo && (
          <p class="mb-1 text-xs text-zinc-500">{tr("Arquivo: {0}", [pedido.arquivo])}</p>
        )}
        {pedido.destino && (
          <p class="mb-4 text-xs text-zinc-500">{tr("Destino: {0}", [pedido.destino])}</p>
        )}
        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" class="agent-access-btn agent-access-btn--danger" onClick={negar}>
            {tr("Negar")}
          </button>
          <button type="button" class="agent-access-btn" onClick={() => responderConfirmacao({ aprovado: true })}>
            {tr("Permitir")}
          </button>
          {pedido.chaveSessao && (
            <button
              type="button"
              class="agent-access-btn agent-access-btn--ghost"
              onClick={() => responderConfirmacao({ aprovado: true, lembrarNestaSessao: true })}
            >
              {tr("Permitir e lembrar nesta sessão")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default McpConfirmDialog;
