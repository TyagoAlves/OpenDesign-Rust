import { tr } from "../i18n";
import { AgentAccessPanel } from "./agent-access-panel";

export function Settings() {
  return (
    <div class="h-full overflow-auto bg-[#F3F4F7]">
      <div class="max-w-4xl mx-auto px-6 py-6">
        <header class="mb-4">
          <h1 class="text-xl font-semibold text-zinc-900">{tr("Configurações")}</h1>
        </header>

        <div class="mb-4 border-b border-[#E2E5EB]">
          <nav aria-label={tr("Abas de configurações")} class="flex gap-2">
            <button
              type="button"
              role="tab"
              aria-selected="true"
              class="px-3 py-2 text-sm font-medium text-[#4f46e5] border-b-2 border-[#6366f1] bg-transparent cursor-default"
            >
              {tr("Acesso do agente")}
            </button>
          </nav>
        </div>

        <div role="tabpanel">
          <AgentAccessPanel />
        </div>
      </div>
    </div>
  );
}

export default Settings;
