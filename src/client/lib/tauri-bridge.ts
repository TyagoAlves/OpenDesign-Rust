/**
 * Bridge Rust <-> frontend do OpenDesign desktop.
 *
 * Não usamos `@tauri-apps/api` de propósito: o pacote ainda não está nas
 * dependências (a Renata está cuidando do packaging). O Tauri 2 expõe o invoke
 * em `window.__TAURI_INTERNALS__`, que é exatamente o que o pacote oficial
 * chama por baixo. Se o pacote entrar depois, troque `invoke()` aqui — o resto
 * do app não muda.
 *
 * Em browser (vite + wrangler) `isTauri()` é false e nenhuma chamada é feita:
 * o fluxo HTTP atual continua intacto.
 */

type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: { invoke: InvokeFn };
  }
}

/** Metadados de um design salvo localmente. */
export interface DesignFileInfo {
  id: string;
  name: string;
  /** Caminho absoluto; apenas para exibição/diagnóstico, nunca reenviado. */
  path: string;
  modifiedAt: number;
}

/** Envelope lido de `<app data dir>/designs/<id>.json`. */
export interface StoredDesign {
  version: number;
  id: string;
  name: string;
  /** JSON do snapshot, mantido como string para não impor schema no Rust. */
  document: string;
}

export interface ExportResult {
  path: string;
  bytes: number;
}

/** Formato do snapshot que o frontend deve mandar em `saveDesignNative`. */
export interface DesignSnapshot {
  schema: 1;
  name: string;
  width: number;
  height: number;
  pages: Array<{ id: string; title?: string; canvasJson: string }>;
}

export function parseStoredDesign(stored: StoredDesign): DesignSnapshot {
  const parsed = JSON.parse(stored.document) as DesignSnapshot;
  if (!parsed || parsed.schema !== 1 || !Array.isArray(parsed.pages)) {
    throw new Error("Snapshot local incompatível (schema diferente de 1)");
  }
  return parsed;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__?.invoke === "function";
}

async function invoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const internals = typeof window === "undefined" ? undefined : window.__TAURI_INTERNALS__;
  if (!internals) {
    throw new Error(`Tauri indisponível: não é possível chamar '${command}' no browser`);
  }
  return (await internals.invoke(command, args)) as T;
}

// ── designs ───────────────────────────────────────────────────────────

export function saveDesignNative(
  name: string,
  snapshot: DesignSnapshot,
  id?: string,
): Promise<DesignFileInfo> {
  const args: Record<string, unknown> = {
    name,
    document: JSON.stringify(snapshot),
  };
  if (id) args.id = id;
  return invoke<DesignFileInfo>("save_design", args);
}

export function loadDesignNative(id: string): Promise<StoredDesign> {
  return invoke<StoredDesign>("load_design", { id });
}

export function listDesignsNative(): Promise<DesignFileInfo[]> {
  return invoke<DesignFileInfo[]>("list_designs", {});
}

export function deleteDesignNative(id: string): Promise<void> {
  return invoke<void>("delete_design", { id });
}

// ── exports ───────────────────────────────────────────────────────────

const PNG_DATA_URL = /^data:image\/png;base64,/i;
const PDF_DATA_URL = /^data:application\/(?:pdf|octet-stream);base64,/i;

export type ExportKind = "png" | "pdf";

/** Formato de um data URL de export, ou `null` se não for PNG/PDF. */
export function dataURLKind(dataURL: string): ExportKind | null {
  if (PNG_DATA_URL.test(dataURL)) return "png";
  if (PDF_DATA_URL.test(dataURL)) return "pdf";
  return null;
}

/**
 * Resultado do diálogo nativo "Salvar como".
 * `path: null` significa que o usuário cancelou; `ok: false` significa que o
 * comando não está disponível ou quebrou o contrato one-shot. `nonce` é um
 * token por operação devolvido junto com o destino e deve voltar ao comando de
 * export exatamente uma vez. Nunca há destino utilizável sem nonce.
 */
export type SavePathResult =
  | { ok: true; path: string | null; nonce?: string }
  | { ok: false; reason: string };

interface SavePathTicket {
  path?: string | null;
  nonce?: string | null;
}

/**
 * Abre o diálogo nativo no Rust via `pick_save_path`, que devolve `{ path,
 * nonce }`. O nonce é one-shot: cada export precisa do seu. Falha fechado se
 * vier caminho sem nonce — nesse caso o chamador usa o fallback em app data dir.
 * Não existe mais o caminho legado `plugin:dialog|save`: ele devolve só o
 * caminho, sem nonce, e o Rust rejeita qualquer `destination` desacompanhado.
 */
export async function pickSavePath(filename: string, kind: ExportKind): Promise<SavePathResult> {
  if (!isTauri()) return { ok: false, reason: "não está no Tauri" };

  try {
    const result = await invoke<SavePathTicket | null>("pick_save_path", { filename, kind });
    const path = result && typeof result === "object" && typeof result.path === "string"
      ? result.path
      : null;
    if (!path) return { ok: true, path: null }; // usuário cancelou

    const nonce = result && typeof result.nonce === "string" && result.nonce
      ? result.nonce
      : null;
    if (!nonce) return { ok: false, reason: "pick_save_path devolveu caminho sem nonce" };
    return { ok: true, path, nonce };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Salva um data URL via Rust. Com `destination`, o `nonce` é obrigatório e é
 * consumido uma única vez no Rust antes do `fs::write`; sem destino, mantém o
 * fallback em `<app data dir>/exports/`. Nenhum caminho é aceito sem nonce.
 * Retorna `null` no browser (o chamador faz o download normal).
 */
export async function saveDataURLNative(
  dataURL: string,
  filename: string,
  destination?: string,
  nonce?: string,
): Promise<ExportResult | null> {
  if (!isTauri()) return null;
  const kind = dataURLKind(dataURL);
  if (!kind) throw new Error("Export nativo aceita só data URLs PNG ou PDF em base64");
  const args: Record<string, unknown> = { dataUrl: dataURL, filename };
  if (destination) {
    if (!nonce) throw new Error("destino de export exige nonce one-shot de pick_save_path");
    args.destination = destination;
    args.nonce = nonce;
  }
  return invoke<ExportResult>(kind === "png" ? "export_png" : "export_pdf", args);
}
