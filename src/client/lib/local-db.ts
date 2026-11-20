/**
 * Banco local do OpenDesign (somente desktop/Tauri).
 *
 * Usa o tauri-plugin-sql registrado em src-tauri/src/lib.rs. O caminho
 * "sqlite:opendesign.db" é resolvido pelo plugin dentro do app_config_dir do
 * usuário — nada é gravado no repo e nada sai da máquina.
 *
 * Este módulo conversa direto com os comandos do plugin via
 * __TAURI_INTERNALS__.invoke, então não adiciona dependências npm (nem mexe no
 * pnpm-lock.yaml). Os nomes de comando/payload são os do plugin v2.6.0:
 *   plugin:sql|load    { db, options? }
 *   plugin:sql|select  { db, query, values }
 *   plugin:sql|execute { db, query, values }  -> [rowsAffected, lastInsertId]
 *
 * A camada replica o contrato HTTP de src/server/index.ts para designs, pages,
 * templates, brand kits, fontes e uploads. Os bytes ficam na tabela `uploads`
 * como base64 e são devolvidos como data: URLs, que o CSP do Tauri já aceita
 * em img-src/font-src (ver docs do banco local).
 */
import { collectFields, fillPages } from "../../server/fields.js";
import { SEED_TEMPLATES } from "../../server/seed-templates.js";
import type { BrandKit, CustomFont, Design, DesignWithPages, Page, Template } from "../types";

const DB_URL = "sqlite:opendesign.db";

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
type Body = Record<string, any>;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: { invoke: Invoke };
  }
}

function internal(): Invoke {
  const tauri = typeof window !== "undefined" ? window.__TAURI_INTERNALS__ : undefined;
  if (!tauri || typeof tauri.invoke !== "function") throw new Error("Tauri indisponível");
  return tauri.invoke;
}

/** True apenas dentro do webview do Tauri (dev ou build). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__?.invoke === "function";
}

/** Rotas que o banco local assume; todo o resto segue para o fetch. */
export function handles(path: string): boolean {
  return /^\/api\/(designs|pages|templates|brand-kits|fonts|uploads)(\/|$)/.test(path);
}

const UPLOADS_DDL = `CREATE TABLE IF NOT EXISTS uploads (
  key TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  family TEXT,
  name TEXT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

async function rawSelect<T>(query: string, values: unknown[] = []): Promise<T[]> {
  const result = await internal()("plugin:sql|select", { db: DB_URL, query, values });
  return (result ?? []) as T[];
}

async function rawExecute(query: string, values: unknown[] = []): Promise<number> {
  const result = await internal()("plugin:sql|execute", { db: DB_URL, query, values });
  return Array.isArray(result) ? Number(result[0]) : 0;
}

let dbReady: Promise<void> | null = null;

function getDb(): Promise<void> {
  if (!dbReady) {
    dbReady = (async () => {
      await internal()("plugin:sql|load", { db: DB_URL, options: { autoCreate: true } });
      await rawExecute(UPLOADS_DDL);
      const existing = await rawSelect<{ c: number }>("SELECT COUNT(*) as c FROM templates");
      if ((Number(existing[0]?.c) || 0) === 0) {
        for (const t of SEED_TEMPLATES) {
          await rawExecute(
            "INSERT OR IGNORE INTO templates (id, name, category, canvas_json, width, height, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [t.id, t.name, t.category, t.canvas_json, t.width, t.height, t.sort_order]
          );
        }
      }
    })().catch((e) => {
      dbReady = null;
      throw e;
    });
  }
  return dbReady;
}

async function select<T>(query: string, values: unknown[] = []): Promise<T[]> {
  await getDb();
  return rawSelect<T>(query, values);
}

async function execute(query: string, values: unknown[] = []): Promise<number> {
  await getDb();
  return rawExecute(query, values);
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// --- uploads/fontes: bytes no SQLite, data: URLs na interface ---------------
const FONT_TYPES: Record<string, { signature: number; mime: string }> = {
  ttf: { signature: 0x00010000, mime: "font/ttf" },
  otf: { signature: 0x4f54544f, mime: "font/otf" },
  woff: { signature: 0x774f4646, mime: "font/woff" },
  woff2: { signature: 0x774f4632, mime: "font/woff2" },
};

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

interface AssetRow {
  key: string;
  mime: string;
  family: string | null;
  name: string | null;
  data: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function putAsset(key: string, mime: string, bytes: Uint8Array, family: string | null = null, name: string | null = null): Promise<void> {
  await execute("INSERT OR REPLACE INTO uploads (key, mime, family, name, data) VALUES (?, ?, ?, ?, ?)", [
    key,
    mime,
    family,
    name,
    bytesToBase64(bytes),
  ]);
}

async function readAsset(key: string): Promise<AssetRow | null> {
  const rows = await select<AssetRow>("SELECT key, mime, family, name, data FROM uploads WHERE key = ?", [key]);
  return rows[0] ?? null;
}

async function listLocalFonts(): Promise<CustomFont[]> {
  const rows = await select<AssetRow>("SELECT key, mime, family, name, data FROM uploads WHERE family IS NOT NULL ORDER BY name");
  return rows
    .filter((r) => r.family && r.name)
    .map((r) => ({
      family: r.family as string,
      name: r.name as string,
      url: `data:${r.mime};base64,${r.data}`,
    }));
}

async function storeLocalFont(file: File): Promise<CustomFont> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const format = FONT_TYPES[ext];
  if (!format) throw new Error("Escolha um arquivo de fonte TTF, OTF, WOFF ou WOFF2.");
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("Fontes devem ter entre 1 byte e 10 MB.");
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 12 || new DataView(buffer).getUint32(0) !== format.signature) {
    throw new Error("Esse arquivo não é uma fonte válida do tipo selecionado.");
  }
  const family = `Custom-${newId()}`;
  const name = file.name.replace(/\.[^.]+$/, "").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 100) || "Fonte personalizada";
  const key = `font-${family}.${ext}`;
  await putAsset(key, format.mime, bytes, family, name);
  return { family, name, url: `data:${format.mime};base64,${bytesToBase64(bytes)}` };
}

async function storeLocalImage(file: File): Promise<{ url: string }> {
  const ext = file.name?.split(".").pop()?.toLowerCase() ?? "png";
  const mime = IMAGE_TYPES[ext];
  if (!mime) throw new Error("Tipo de arquivo não suportado");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await putAsset(key, mime, bytes);
  return { url: `data:${mime};base64,${bytesToBase64(bytes)}` };
}

// --- brand kits --------------------------------------------------------------
interface BrandKitRow {
  id: string;
  name: string;
  colors: string;
  heading_font: string;
  body_font: string;
  logos: string;
  created_at: string;
  updated_at: string;
}

function parseList(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function toKit(row: BrandKitRow): BrandKit {
  return { ...row, colors: parseList(row.colors), logos: parseList(row.logos) };
}

function kitValues(b: Body, fallback?: BrandKitRow): [string, string, string, string, string] {
  return [
    typeof b.name === "string" ? b.name : (fallback?.name ?? "Minha marca"),
    Array.isArray(b.colors) ? JSON.stringify(b.colors) : (fallback?.colors ?? "[]"),
    typeof b.heading_font === "string" ? b.heading_font : (fallback?.heading_font ?? "Montserrat"),
    typeof b.body_font === "string" ? b.body_font : (fallback?.body_font ?? "Inter"),
    Array.isArray(b.logos) ? JSON.stringify(b.logos) : (fallback?.logos ?? "[]"),
  ];
}

// --- despachante ------------------------------------------------------------
async function dispatch<T>(method: string, path: string, body?: unknown): Promise<T> {
  const b: Body = (body && typeof body === "object" ? body : {}) as Body;
  const parts = path.split("?")[0].split("/").filter(Boolean);
  const [resource, id] = [parts[1], parts[2]];

  if (resource === "designs") {
    if (!id && method === "GET") {
      return (await select<Design>("SELECT * FROM designs ORDER BY updated_at DESC")) as T;
    }
    if (!id && method === "POST") {
      const designId = newId();
      const canvas = typeof b.canvas_json === "string" ? b.canvas_json : "{}";
      await execute(
        "INSERT INTO designs (id, name, canvas_json, width, height) VALUES (?, ?, ?, ?, ?)",
        [designId, typeof b.name === "string" ? b.name : "Projeto sem título", canvas, Number(b.width) || 1080, Number(b.height) || 1080]
      );
      await execute(
        "INSERT INTO pages (id, design_id, title, canvas_json, sort_order) VALUES (?, ?, ?, ?, ?)",
        [newId(), designId, "Página 1", canvas, 0]
      );
      return (await select<Design>("SELECT * FROM designs WHERE id = ?", [designId]))[0] as T;
    }
    if (id && parts[3] === "fields" && method === "GET") {
      const design = (await select<{ id: string }>("SELECT id FROM designs WHERE id = ?", [id]))[0];
      if (!design) throw new Error("Não encontrado");
      const pages = await select<Page>("SELECT * FROM pages WHERE design_id = ? ORDER BY sort_order", [id]);
      return collectFields(pages) as T;
    }
    if (id && parts[3] === "fill" && method === "POST") {
      const design = (await select<Design>("SELECT * FROM designs WHERE id = ?", [id]))[0];
      if (!design) throw new Error("Não encontrado");
      const pages = await select<Page>("SELECT * FROM pages WHERE design_id = ? ORDER BY sort_order", [id]);
      const values = (b.values && typeof b.values === "object" ? b.values : {}) as Record<string, unknown>;
      const strings = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)]));
      const { pages: filledPages, filled, unmatched } = fillPages(pages, strings);
      const responsePages = filledPages.map((p) => ({
        id: p.id, title: p.title, sort_order: p.sort_order, canvas_json: p.canvas_json,
      }));
      if (!b.save) return { design, pages: responsePages, filled, unmatched } as T;
      const newDesignId = newId();
      await execute(
        "INSERT INTO designs (id, name, canvas_json, width, height) VALUES (?, ?, ?, ?, ?)",
        [newDesignId, typeof b.name === "string" ? b.name : `${design.name} (preenchido)`, filledPages[0]?.canvas_json ?? design.canvas_json, design.width, design.height]
      );
      const createdPages = filledPages.map((p) => ({ ...p, id: newId() }));
      for (const p of createdPages) {
        await execute(
          "INSERT INTO pages (id, design_id, title, canvas_json, sort_order) VALUES (?, ?, ?, ?, ?)",
          [p.id, newDesignId, p.title, p.canvas_json, p.sort_order]
        );
      }
      const created = (await select<Design>("SELECT * FROM designs WHERE id = ?", [newDesignId]))[0];
      return {
        design: created,
        pages: createdPages.map((p) => ({ id: p.id, title: p.title, sort_order: p.sort_order, canvas_json: p.canvas_json })),
        filled,
        unmatched,
      } as T;
    }
    if (id && parts[3] === "pages" && method === "POST") {
      const count = (await select<{ c: number }>("SELECT COUNT(*) as c FROM pages WHERE design_id = ?", [id]))[0];
      const title = typeof b.title === "string" ? b.title : `Página ${(Number(count?.c) || 0) + 1}`;
      let insertOrder: number;
      if (typeof b.after_sort_order === "number") {
        await execute("UPDATE pages SET sort_order = sort_order + 1 WHERE design_id = ? AND sort_order > ?", [id, b.after_sort_order]);
        insertOrder = b.after_sort_order + 1;
      } else {
        const max = (await select<{ m: number }>("SELECT COALESCE(MAX(sort_order), -1) as m FROM pages WHERE design_id = ?", [id]))[0];
        insertOrder = (typeof max?.m === "number" ? max.m : -1) + 1;
      }
      const pageId = newId();
      await execute(
        "INSERT INTO pages (id, design_id, title, canvas_json, sort_order) VALUES (?, ?, ?, ?, ?)",
        [pageId, id, title, typeof b.canvas_json === "string" ? b.canvas_json : "{}", insertOrder]
      );
      return (await select<Page>("SELECT * FROM pages WHERE id = ?", [pageId]))[0] as T;
    }
    if (id && !parts[3]) {
      if (method === "GET") {
        const row = (await select<Design>("SELECT * FROM designs WHERE id = ?", [id]))[0];
        if (!row) throw new Error("Não encontrado");
        const pages = await select<Page>("SELECT * FROM pages WHERE design_id = ? ORDER BY sort_order", [id]);
        return { ...row, pages } as DesignWithPages as T;
      }
      if (method === "PUT") {
        const existing = (await select<Design>("SELECT * FROM designs WHERE id = ?", [id]))[0];
        if (!existing) throw new Error("Não encontrado");
        await execute(
          "UPDATE designs SET name = ?, canvas_json = ?, width = ?, height = ?, thumbnail_url = ?, updated_at = datetime('now') WHERE id = ?",
          [b.name ?? existing.name, b.canvas_json ?? existing.canvas_json, b.width ?? existing.width, b.height ?? existing.height, b.thumbnail_url ?? existing.thumbnail_url, id]
        );
        return (await select<Design>("SELECT * FROM designs WHERE id = ?", [id]))[0] as T;
      }
      if (method === "DELETE") {
        await execute("DELETE FROM pages WHERE design_id = ?", [id]);
        await execute("DELETE FROM designs WHERE id = ?", [id]);
        return { ok: true } as T;
      }
    }
  }

  if (resource === "pages" && id) {
    if (parts[3] === "duplicate" && method === "POST") {
      const original = (await select<Page>("SELECT * FROM pages WHERE id = ?", [id]))[0];
      if (!original) throw new Error("Não encontrado");
      await execute("UPDATE pages SET sort_order = sort_order + 1 WHERE design_id = ? AND sort_order > ?", [original.design_id, original.sort_order]);
      const pageId = newId();
      await execute(
        "INSERT INTO pages (id, design_id, title, canvas_json, sort_order) VALUES (?, ?, ?, ?, ?)",
        [pageId, original.design_id, `${original.title} (cópia)`, original.canvas_json, original.sort_order + 1]
      );
      return (await select<Page>("SELECT * FROM pages WHERE id = ?", [pageId]))[0] as T;
    }
    if (!parts[3] && method === "PUT") {
      const existing = (await select<Page>("SELECT * FROM pages WHERE id = ?", [id]))[0];
      if (!existing) throw new Error("Não encontrado");
      await execute(
        "UPDATE pages SET title = ?, canvas_json = ? WHERE id = ?",
        [b.title ?? existing.title, b.canvas_json ?? existing.canvas_json, id]
      );
      return (await select<Page>("SELECT * FROM pages WHERE id = ?", [id]))[0] as T;
    }
    if (!parts[3] && method === "DELETE") {
      const page = (await select<Page>("SELECT * FROM pages WHERE id = ?", [id]))[0];
      if (!page) return { ok: true } as T;
      const count = (await select<{ c: number }>("SELECT COUNT(*) as c FROM pages WHERE design_id = ?", [page.design_id]))[0];
      if ((Number(count?.c) || 0) <= 1) throw new Error("Não é possível excluir a última página");
      await execute("DELETE FROM pages WHERE id = ?", [id]);
      return { ok: true } as T;
    }
  }

  if (resource === "templates") {
    if (!id && method === "GET") {
      return (await select<Template>("SELECT * FROM templates ORDER BY sort_order")) as T;
    }
    if (id && method === "GET") {
      const row = (await select<Template>("SELECT * FROM templates WHERE id = ?", [id]))[0];
      if (!row) throw new Error("Não encontrado");
      return row as T;
    }
  }

  if (resource === "brand-kits") {
    if (!id && method === "GET") {
      const rows = await select<BrandKitRow>("SELECT * FROM brand_kits ORDER BY created_at");
      return rows.map(toKit) as T;
    }
    if (!id && method === "POST") {
      const kitId = newId();
      const [name, colors, heading, body, logos] = kitValues(b);
      await execute(
        "INSERT INTO brand_kits (id, name, colors, heading_font, body_font, logos) VALUES (?, ?, ?, ?, ?, ?)",
        [kitId, name, colors, heading, body, logos]
      );
      const row = (await select<BrandKitRow>("SELECT * FROM brand_kits WHERE id = ?", [kitId]))[0];
      return toKit(row) as T;
    }
    if (id && method === "PUT") {
      const existing = (await select<BrandKitRow>("SELECT * FROM brand_kits WHERE id = ?", [id]))[0];
      if (!existing) throw new Error("Não encontrado");
      const [name, colors, heading, body, logos] = kitValues(b, existing);
      await execute(
        "UPDATE brand_kits SET name = ?, colors = ?, heading_font = ?, body_font = ?, logos = ?, updated_at = datetime('now') WHERE id = ?",
        [name, colors, heading, body, logos, id]
      );
      const row = (await select<BrandKitRow>("SELECT * FROM brand_kits WHERE id = ?", [id]))[0];
      return toKit(row) as T;
    }
    if (id && method === "DELETE") {
      await execute("DELETE FROM brand_kits WHERE id = ?", [id]);
      return { ok: true } as T;
    }
  }

  if (resource === "fonts" && !id && method === "GET") {
    return (await listLocalFonts()) as T;
  }
  if (resource === "fonts" && !id && method === "POST") {
    if (!(body instanceof File)) throw new Error("Nenhum arquivo de fonte enviado");
    return (await storeLocalFont(body)) as T;
  }
  if (resource === "uploads" && !id && method === "POST") {
    if (!(body instanceof File)) throw new Error("Nenhum arquivo enviado");
    return (await storeLocalImage(body)) as T;
  }
  if (resource === "uploads" && id && method === "GET") {
    const asset = await readAsset(decodeURIComponent(id));
    if (!asset) throw new Error("Não encontrado");
    return { url: `data:${asset.mime};base64,${asset.data}` } as T;
  }

  throw new Error(`Rota local não implementada: ${method} ${path}`);
}

export function localApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  return dispatch<T>(method, path, body);
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export function installLocalAssetFetch(): void {
  if (!isTauri() || typeof window.fetch !== "function") return;
  const marker = "__opendesignLocalFetch";
  const scope = window as unknown as Record<string, unknown>;
  if (scope[marker]) return;
  scope[marker] = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const path = raw.split("?")[0];
    if (!/^\/api\/(fonts|uploads)(\/|$)/.test(path)) return nativeFetch(input, init);

    try {
      const method = (init?.method ?? "GET").toUpperCase();
      if (path === "/api/fonts" && method === "GET") return jsonResponse(await listLocalFonts());
      if (path === "/api/fonts" && method === "POST") {
        const file = (init?.body as FormData | undefined)?.get?.("file");
        if (!(file instanceof File)) return jsonResponse({ error: "Nenhum arquivo de fonte enviado" }, 400);
        return jsonResponse(await storeLocalFont(file));
      }
      if (path === "/api/uploads" && method === "POST") {
        const file = (init?.body as FormData | undefined)?.get?.("file");
        if (!(file instanceof File)) return jsonResponse({ error: "Nenhum arquivo enviado" }, 400);
        return jsonResponse(await storeLocalImage(file));
      }
      const match = /^\/api\/uploads\/([^/]+)$/.exec(path);
      if (match && method === "GET") {
        const asset = await readAsset(decodeURIComponent(match[1]));
        if (!asset) return jsonResponse({ error: "Não encontrado" }, 404);
        return new Response(base64ToBytes(asset.data), {
          status: 200,
          headers: {
            "Content-Type": asset.mime,
            "Cache-Control": "public, max-age=31536000",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      return jsonResponse({ error: `Rota local não implementada: ${method} ${path}` }, 404);
    } catch (e) {
      return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  };
}