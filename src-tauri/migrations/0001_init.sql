-- OpenDesign — schema local (SQLite), aplicado pelo tauri-plugin-sql.
--
-- Este arquivo é DDL puro e roda UMA vez, na primeira carga de
-- "sqlite:opendesign.db". O banco fica no diretório de configuração do app
-- (app_config_dir), dentro da máquina do usuário — nunca no repo do projeto.
-- Espelha o schema.sql do D1, sem seeds: os templates iniciais são inseridos
-- pelo adaptador do cliente, de SEED_TEMPLATES (mesma fonte do servidor).

CREATE TABLE IF NOT EXISTS designs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled Design',
  canvas_json TEXT NOT NULL DEFAULT '{}',
  width INTEGER NOT NULL DEFAULT 1080,
  height INTEGER NOT NULL DEFAULT 1080,
  thumbnail_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  design_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Page 1',
  canvas_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pages_design ON pages(design_id, sort_order);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  canvas_json TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  thumbnail_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category, sort_order);

CREATE TABLE IF NOT EXISTS brand_kits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'My Brand',
  -- Arrays JSON ficam como TEXT: o kit exportado/importado é o mesmo blob.
  colors TEXT NOT NULL DEFAULT '[]',
  heading_font TEXT NOT NULL DEFAULT 'Montserrat',
  body_font TEXT NOT NULL DEFAULT 'Inter',
  logos TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
