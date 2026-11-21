import { ArrowLeft } from "lucide-preact";
import { tr } from "../i18n";
import { isTauri } from "../lib/tauri";
import { AgentAccessPanel } from "./agent-access-panel";

interface SettingsProps {
  navigate?: (to: string) => void;
}

export function Settings({ navigate }: SettingsProps) {
  const showBack = isTauri() || !!navigate;

  return (
    <div class="h-full overflow-auto bg-[#F3F4F7]">
      <div class="max-w-4xl mx-auto px-6 py-6">
        <header class="mb-4 flex items-center gap-3">
          {showBack && (
            <button
              type="button"
              class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 bg-white text-zinc-700 cursor-pointer hover:bg-zinc-50 transition-colors"
              onClick={() => (navigate ? navigate("/") : (window.location.hash = "#/"))}
              aria-label={tr("Voltar")}
            >
              <ArrowLeft size={14} />
              {tr("Voltar")}
            </button>
          )}
          <h1 class="text-xl font-semibold text-zinc-900 m-0">{tr("Configurações")}</h1>
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
