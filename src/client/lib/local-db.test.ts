import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { installLocalAssetFetch, localApi } from "./local-db";

/**
 * Teste do adaptador SQLite sem Tauri: o invoke é mockado por um banco
 * node:sqlite em memória que aplica a mesma migration do src-tauri.
 *
 * Rodar (fora do `pnpm test` padrão, que só inclui fields/fonts):
 *   pnpm exec esbuild src/client/lib/local-db.test.ts --bundle --platform=node \
 *     --format=esm --outfile=.test-build/local-db.test.mjs && node --test .test-build/local-db.test.mjs
 */
function mockTauri() {
  const schema = readFileSync("src-tauri/migrations/0001_init.sql", "utf-8");
  const db = new DatabaseSync(":memory:");
  let loaded = false;

  Object.assign(globalThis, {
    window: {
      __TAURI_INTERNALS__: {
        invoke: async (cmd: string, args: any = {}) => {
          if (cmd === "plugin:sql|load") {
            if (!loaded) db.exec(schema);
            loaded = true;
            return args.db;
          }
          if (cmd === "plugin:sql|select") {
            return db.prepare(args.query).all(...(args.values ?? []));
          }
          if (cmd === "plugin:sql|execute") {
            const result = db.prepare(args.query).run(...(args.values ?? []));
            return [Number(result.changes), Number(result.lastInsertRowid)];
          }
          throw new Error(`Comando inesperado: ${cmd}`);
        },
      },
    },
  });
  return db;
}

const testDb = mockTauri();

test("banco local: designs, páginas, templates e brand kits persistem", async () => {
  const templates = await localApi<any[]>("GET", "/api/templates");
  assert.ok(templates.length > 0, "templates iniciais semeados");

  const design = await localApi<any>("POST", "/api/designs", {
    name: "Teste", canvas_json: "{}", width: 1080, height: 1080,
  });
  assert.equal(design.name, "Teste");

  const loaded = await localApi<any>("GET", `/api/designs/${design.id}`);
  assert.equal(loaded.pages.length, 1);
  assert.equal(loaded.pages[0].title, "Página 1");

  const page = loaded.pages[0];
  const saved = await localApi<any>("PUT", `/api/pages/${page.id}`, { canvas_json: '{"objects":[1]}' });
  assert.equal(saved.canvas_json, '{"objects":[1]}');

  const second = await localApi<any>("POST", `/api/designs/${design.id}/pages`, { title: "Page 2" });
  assert.equal(second.sort_order, 1);
  const copy = await localApi<any>("POST", `/api/pages/${second.id}/duplicate`, {});
  assert.equal(copy.title, "Page 2 (cópia)");
  assert.equal(copy.sort_order, 2);
  await localApi("DELETE", `/api/pages/${copy.id}`);
  await localApi("DELETE", `/api/pages/${second.id}`);
  await assert.rejects(localApi("DELETE", `/api/pages/${page.id}`));

  const renamed = await localApi<any>("PUT", `/api/designs/${design.id}`, { name: "Renomeado" });
  assert.equal(renamed.name, "Renomeado");
  assert.ok(Array.isArray(await localApi("GET", `/api/designs/${design.id}/fields`)));

  const kit = await localApi<any>("POST", "/api/brand-kits", {
    name: "Kit", colors: ["#ffffff"], heading_font: "Montserrat", body_font: "Inter", logos: [],
  });
  assert.deepEqual(kit.colors, ["#ffffff"]);
  const updated = await localApi<any>("PUT", `/api/brand-kits/${kit.id}`, { colors: ["#000000"] });
  assert.deepEqual(updated.colors, ["#000000"]);
  assert.equal((await localApi<any[]>("GET", "/api/brand-kits")).length, 1);
  await localApi("DELETE", `/api/brand-kits/${kit.id}`);
  assert.equal((await localApi<any[]>("GET", "/api/brand-kits")).length, 0);

  await localApi("DELETE", `/api/designs/${design.id}`);
  assert.equal((await localApi<any[]>("GET", "/api/designs")).length, 0);
  await assert.rejects(localApi("GET", `/api/designs/${design.id}`), /Não encontrado/);
});

function fontFile(name = "Minha.ttf"): File {
  const bytes = new Uint8Array(16);
  bytes.set([0, 1, 0, 0], 0);
  return new File([bytes], name, { type: "font/ttf" });
}

function uploadForm(file: File): FormData {
  const form = new FormData();
  form.append("file", file);
  return form;
}

test("banco local: fontes e uploads viram data: URLs", async () => {
  const font = await localApi<any>("POST", "/api/fonts", fontFile());
  assert.match(font.family, /^Custom-/);
  assert.equal(font.name, "Minha");
  assert.match(font.url, /^data:font\/ttf;base64,/);

  const fonts = await localApi<any[]>("GET", "/api/fonts");
  assert.equal(fonts.length, 1);
  assert.equal(fonts[0].family, font.family);
  assert.equal(fonts[0].url, font.url);

  const bytes = new Uint8Array([1, 2, 3, 4]);
  const uploaded = await localApi<any>("POST", "/api/uploads", new File([bytes], "logo.png", { type: "image/png" }));
  assert.match(uploaded.url, /^data:image\/png;base64,/);

  const rows = testDb.prepare("SELECT key FROM uploads WHERE mime = ?").all("image/png") as { key: string }[];
  assert.equal(rows.length, 1);
  const fetched = await localApi<any>("GET", `/api/uploads/${rows[0].key}`);
  assert.equal(fetched.url, uploaded.url);

  await assert.rejects(localApi("POST", "/api/fonts", new File([new Uint8Array(16)], "ruim.ttf")), /não é uma fonte válida/);
  await assert.rejects(localApi("POST", "/api/uploads", new File([bytes], "x.exe")), /Tipo de arquivo não suportado/);
  await assert.rejects(localApi("GET", "/api/uploads/inexistente.png"), /Não encontrado/);
});

test("interceptador local responde fetch direto e deixa o resto passar", async () => {
  const priorFetch = (globalThis as any).window?.fetch;
  (globalThis as any).window.fetch = async () => new Response("nativo");
  installLocalAssetFetch();

  const before = await (globalThis as any).window.fetch("/api/fonts");
  assert.equal(before.status, 200);
  const initial = (await before.json()) as unknown[];

  const posted = await (globalThis as any).window.fetch("/api/fonts", { method: "POST", body: uploadForm(fontFile()) });
  assert.equal(posted.status, 200);
  assert.equal((await (globalThis as any).window.fetch("/api/fonts").then((r: Response) => r.json())).length, initial.length + 1);

  const bytes = new Uint8Array([9, 8, 7]);
  const up = await (globalThis as any).window.fetch("/api/uploads", { method: "POST", body: uploadForm(new File([bytes], "x.png")) });
  assert.match((await up.json()).url, /^data:image\/png;base64,/);

  const key = (testDb.prepare("SELECT key FROM uploads WHERE mime = ? ORDER BY rowid DESC LIMIT 1").get("image/png") as { key: string }).key;
  const blob = await (globalThis as any).window.fetch(`/api/uploads/${key}`);
  assert.equal(blob.headers.get("content-type"), "image/png");
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);

  assert.equal(await (await (globalThis as any).window.fetch("/api/designs")).text(), "nativo");
  assert.equal((await (globalThis as any).window.fetch("/api/uploads/inexistente.png")).status, 404);

  if (priorFetch) (globalThis as any).window.fetch = priorFetch;
});