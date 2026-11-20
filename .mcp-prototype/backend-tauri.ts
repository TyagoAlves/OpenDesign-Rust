/**
 * ESBOÇO (Fase 2) — adaptador desktop do MCP local do OpenDesign.
 *
 * IMPORTANTE: este arquivo é somente protótipo/documentação. Ele NÃO entra no
 * build: o tsconfig inclui apenas `src`, e nada aqui é importado pelo app.
 * Serve para registrar o contrato antes de mexer no código de produção.
 *
 * Decisões registradas no plano (docs/mcp-planejamento.md):
 *   - D1: desktop SEMPRE via localApi() (SQLite local); HTTP existe só no dev.
 *   - D2: export pede confirmação POR ARQUIVO, com "lembrar nesta sessão".
 *     O "lembrar" vive apenas no Set em memória deste closure: morre com o
 *     processo e nunca é gravado em disco nem reaproveitado no launch seguinte.
 *
 * Reaproveita, sem reimplementar:
 *   - localApi() em src/client/lib/local-db.ts  -> designs, templates, brand kits
 *   - tauri-bridge.ts -> save_design, load_design, export_png, export_pdf
 *
 * Não adiciona dependências npm. Nenhuma chamada aqui grava token em log.
 */
import { localApi, isTauri as isLocalDbTauri } from "../src/client/lib/local-db.js";
import {
  isTauri as isBridgeTauri,
  parseStoredDesign,
  saveDesignNative,
  loadDesignNative,
  saveDataURLNative,
  dataURLKind,
  type DesignSnapshot,
  type StoredDesign,
} from "../src/client/lib/tauri-bridge.js";

export interface McpBackend {
  call(name: string, args: Record<string, any>): Promise<unknown>;
  kind: "tauri";
}

/** Pedido enviado à UI para consentimento (D2). */
export interface PedidoConfirmacao {
  tipo: "export_png" | "export_pdf" | "escrita";
  descricao: string;
  /** Nome do arquivo de destino; vazio quando não é export. */
  arquivo: string;
  /** Chave estável para "lembrar nesta sessão"; ausente = sempre perguntar. */
  chaveSessao?: string;
}

export type RespostaConfirmacao =
  | { aprovado: true; lembrarNestaSessao?: boolean }
  | { aprovado: false };

export type Confirmador = (pedido: PedidoConfirmacao) => Promise<RespostaConfirmacao>;

function exigirTauri(): void {
  if (!isLocalDbTauri() || !isBridgeTauri()) {
    throw new Error("Adaptador desktop indisponível fora do Tauri");
  }
}

function comId(path: string, id?: string): string {
  if (!id) return path;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error("id inválido");
  return `${path}/${encodeURIComponent(id)}`;
}

/**
 * Cria o adaptador. `confirmar` é o callback de consentimento da UI (Settings
 * → Agent access, D5): operações de escrita/export só prosseguem com OK
 * explícito. Para export, a confirmação é por arquivo (D2).
 * No protótipo ele pode ser `async () => ({ aprovado: true })` em testes.
 */
export function createTauriBackend(confirmar: Confirmador): McpBackend {
  // Memória da sessão do processo. Nunca persistida, nunca vira arquivo.
  const lembrados = new Set<string>();

  async function autorizar(pedido: PedidoConfirmacao): Promise<void> {
    if (pedido.chaveSessao && lembrados.has(pedido.chaveSessao)) return;
    const resposta = await confirmar(pedido);
    if (!resposta.aprovado) throw new Error("Operação negada pelo usuário na UI");
    if (resposta.lembrarNestaSessao && pedido.chaveSessao) {
      lembrados.add(pedido.chaveSessao);
    }
  }

  async function call(name: string, args: Record<string, any> = {}): Promise<unknown> {
    exigirTauri();

    switch (name) {
      case "projeto_listar":
        return localApi("GET", "/api/designs");
      case "projeto_abrir":
        return localApi("GET", comId("/api/designs", args.id));
      case "projeto_salvar":
        return args.id
          ? localApi("PUT", comId("/api/designs", args.id), args)
          : localApi("POST", "/api/designs", args);
      case "projeto_salvar_nativo": {
        const snap = args.snapshot as DesignSnapshot;
        if (!snap || snap.schema !== 1 || !Array.isArray(snap.pages)) {
          throw new Error("snapshot inválido: esperado DesignSnapshot com schema:1");
        }
        await autorizar({
          tipo: "escrita",
          descricao: `Salvar design nativo "${args.name}"`,
          arquivo: "",
        });
        return saveDesignNative(args.name, snap, args.id);
      }
      case "templates_listar":
        return localApi("GET", "/api/templates");
      case "templates_campos":
        return localApi("GET", comId("/api/designs", args.id) + "/fields");
      case "templates_preencher":
        // save:true cria um novo design; a origem permanece intacta.
        await autorizar({
          tipo: "escrita",
          descricao: `Preencher template "${args.id}" e salvar como novo design`,
          arquivo: "",
        });
        return localApi("POST", comId("/api/designs", args.id) + "/fill", {
          values: args.values,
          save: true,
          ...(args.name ? { name: args.name } : {}),
        });
      case "brand_kits_listar":
        return localApi("GET", "/api/brand-kits");
      case "brand_kits_criar":
        await autorizar({ tipo: "escrita", descricao: "Criar brand kit", arquivo: "" });
        return localApi("POST", "/api/brand-kits", args);
      case "brand_kits_atualizar":
        await autorizar({ tipo: "escrita", descricao: "Atualizar brand kit", arquivo: "" });
        return localApi("PUT", comId("/api/brand-kits", args.id), args);
      case "snapshot_ler": {
        if (args.origem === "nativo") {
          const stored: StoredDesign = await loadDesignNative(args.id);
          const snap = parseStoredDesign(stored);
          const limite = Math.max(0, Math.min(20000, Number(args.max_amostra ?? 2000)));
          const serial = JSON.stringify(snap);
          // offset é consumível: o chamador repete o proximo_offset devolvido.
          const offset = Number.isFinite(args.offset) ? Math.max(0, Math.floor(args.offset)) : 0;
          const fim = offset + limite;
          return {
            id: stored.id,
            name: snap.name,
            width: snap.width,
            height: snap.height,
            pages: snap.pages.length,
            origem: "nativo",
            amostra: serial.slice(offset, fim),
            total_caracteres: serial.length,
            limite,
            offset,
            proximo_offset: fim < serial.length ? fim : null,
            truncado: fim < serial.length,
          };
        }
        const design = await localApi<any>("GET", comId("/api/designs", args.id));
        const limite = Math.max(0, Math.min(20000, Number(args.max_amostra ?? 2000)));
        const canvas = typeof design?.canvas_json === "string" ? design.canvas_json : "";
        // offset é consumível: o chamador repete o proximo_offset devolvido.
        const offset = Number.isFinite(args.offset) ? Math.max(0, Math.floor(args.offset)) : 0;
        const fim = offset + limite;
        return {
          id: design?.id,
          name: design?.name,
          width: design?.width,
          height: design?.height,
          pages: Array.isArray(design?.pages) ? design.pages.length : 0,
          origem: "local",
          amostra: canvas.slice(offset, fim),
          total_caracteres: canvas.length,
          limite,
          offset,
          proximo_offset: fim < canvas.length ? fim : null,
          truncado: fim < canvas.length,
        };
      }
      case "export_salvar_png":
      case "export_salvar_pdf": {
        const kind = dataURLKind(args.data_url);
        const esperado = name === "export_salvar_png" ? "png" : "pdf";
        if (kind !== esperado) throw new Error(`data_url não é um ${esperado.toUpperCase()} válido`);
        await autorizar({
          tipo: esperado === "png" ? "export_png" : "export_pdf",
          descricao: `Salvar ${esperado.toUpperCase()} em "${args.filename}"`,
          arquivo: args.filename,
          // D2: chave por arquivo. "Lembrar nesta sessão" vale só até o processo morrer.
          chaveSessao: `export:${esperado}:${args.filename}`,
        });
        // O editor já gerou o data URL: a bridge apenas grava no disco escolhido.
        return saveDataURLNative(args.data_url, args.filename);
      }
      default:
        throw new Error(`Ferramenta desconhecida no backend Tauri: ${name}`);
    }
  }

  return { call, kind: "tauri" };
}
