# Banco local (desktop/Tauri) — OpenDesign

Estado: **implementado, sem commit/publicação**. Escopo: designs, páginas, templates, brand kits, fontes e uploads salvos **somente na máquina do usuário**.

## Como funciona

- `tauri-plugin-sql` (v2.6.0, feature `sqlite`) registrado em `src-tauri/src/lib.rs`.
- O caminho `sqlite:opendesign.db` é resolvido pelo plugin dentro do **`app_config_dir`** do app (pasta de configuração do usuário), nunca dentro do repo. Nenhum dado sai da máquina.
- `src-tauri/migrations/0001_init.sql` contém o schema leve (4 tabelas: `designs`, `pages`, `templates`, `brand_kits`), aplicado automaticamente na primeira carga do banco. A tabela `uploads` é criada pelo adaptador com `CREATE TABLE IF NOT EXISTS` na abertura: a migration v1 já foi aplicada em instalações existentes e não deve ser reescrita (o `lib.rs` a registra com `include_str!`), e não editamos o Rust.
- `src-tauri/capabilities/default.json` liberou `sql:allow-load`, `sql:allow-select`, `sql:allow-execute` (sem `sql:allow-close`).
- `src/client/lib/local-db.ts` fala direto com os comandos do plugin via `__TAURI_INTERNALS__.invoke` — **nenhuma dependência npm nova** — `package.json`/`pnpm-lock.yaml` não foram alterados por esta entrega (estão modificados por outros agentes, sem conflito).
- `src/client/api.ts` despacha para o banco local quando `window.__TAURI_INTERNALS__` existe (Tauri dev ou build). No navegador (`vite` + `wrangler dev`), tudo continua igual, usando o D1 local.

## Cobertura

Atendido pelo banco local: `GET/POST /api/designs`, `GET/PUT/DELETE /api/designs/:id`, `GET /api/designs/:id/fields`, `POST /api/designs/:id/fill`, `POST /api/designs/:id/pages`, `POST /api/pages/:id/duplicate`, `PUT/DELETE /api/pages/:id`, `GET /api/templates`, `GET /api/templates/:id`, `GET/POST /api/brand-kits`, `PUT/DELETE /api/brand-kits/:id`, `GET/POST /api/fonts`, `POST /api/uploads`, `GET /api/uploads/:filename`.

Nesta entrega, fontes e imagens são gravadas como base64 na tabela `uploads` e devolvidas como `data:` URLs. `installLocalAssetFetch()` (instalado por `api.ts`) intercepta os `fetch()` diretos de fonts/uploads — `fonts.ts`, `kit-transfer.ts`, `brand-kit-panel.tsx` e `left-sidebar.tsx` — sem exigir mudança nesses componentes. A validação de assinatura TTF/OTF/WOFF/WOFF2 e o limite de 10 MB espelham `src/server/uploads.ts`.

CSP atual (`src-tauri/tauri.conf.json`): `img-src 'self' data: blob:` e `font-src 'self' data:` (verificado em disco; permite data: para imagens e fontes) — **mantida sem alteração nesta entrega**. A migração para FS + `asset://` ficou para a **próxima entrega** por decisão do Tyago. Quando ocorrer, o plano registrado é: acrescentar `tauri-plugin-fs` (Rust) e as permissões `fs:allow-mkdir`, `fs:allow-write-file` e `fs:allow-read-file` na capability, além de `assetProtocol` com scope restrito à pasta de assets; ajustar `img-src`/`font-src` com `asset:` e `http://asset.localhost`. Nada disso é aplicado agora — o adaptador SQLite + DataURL segue como fonte única e o `.exe` não muda nesta entrega.

Os templates iniciais são semeados na primeira abertura a partir do mesmo `src/server/seed-templates.ts` usado pelo servidor (guarda feita por `COUNT(*)`, igual ao `ensureSeeded()` do server).

## Validação feita (2026-11-20)

- `pnpm run build` (Vite): **OK** (bundles relativos, sem URL do wrangler no `dist`).
- `pnpm exec tsc --noEmit`: sem erros novos — restam 5 erros **preexistentes** (`canvas-area.tsx:179`, `D1Database`/`R2Bucket` em `src/server/`).
- `node:sqlite` com a migration real: **SQL válido** (.insert/select/update/delete/cascade OK).
- Teste ponta a ponta do adaptador com `invoke` mockado (`src/client/lib/local-db.test.ts`): **3/3 OK** (CRUD de design/página/kit, seed de templates, proteção da última página, fonts/uploads como data: URLs e interceptador de fetch).
- `pnpm test`: **14/14 OK** (fonts, fields etc.).
- `cargo check --offline` (2026-11-20, terminal novo): `& "C:\Users\tyago\.cargo\bin\cargo.exe" check --offline --manifest-path "src-tauri/Cargo.toml"` → **exit 0**, `Finished dev profile ... in ~23s`, **13 warnings** de código/itens não usados em `src-tauri/src/commands.rs` (comandos de design fora do `invoke_handler`, fonte única = SQLite). Eu não instalei nada.
- Re-teste do `dist/` isolado pelo Heitor (AG-02): **OK** — servidor estático puro na porta 4399, HTML/JS/CSS/favicons com HTTP 200, bundle contém `__opendesignLocalFetch` e `api.ts` chama `installLocalAssetFetch()`. Todas as 10 rotas `/api` são atendidas localmente, incluindo `GET/POST /api/fonts` e `POST/GET /api/uploads`. O 404 anterior em `/__clawnify/presence.js` era artefato do harness de isolamento; no browser real com `__TAURI_INTERNALS__` há 0 requests (guarda em `app.tsx:38`, AppNav suprimido em `:72`).

## Fora de escopo / decisões para a equipe

- **Degradação conhecida:** logos/fontes salvos antes desta mudança com a URL legada `/api/uploads/...` não são carregados no desktop (o `<img>`/`FontFace` não passa pelo `fetch` interceptado). O fluxo atual já grava `data:` URLs; kits antigos podem ser reexportados/reimportados para migrar. Não há crash: `inlineAsset()` devolve `null` e `loadCustomFont` é filtrado por `Promise.allSettled`.
- `/__clawnify/presence.js` **não é pendência**: `reportLocation()` é guardado por `if (!isTauri())` em `app.tsx:38` e o AppNav/cartão Clawnify é suprimido no Tauri em `app.tsx:72`. O 404 reportado antes vinha do harness de isolamento, não de um request real.
- Exportações PNG/PDF já têm ponte nativa em `src/client/lib/tauri-bridge.ts` (`saveDataURLNative`), usada por `lib/export.ts`.
- **Sobreposição decidida:** `src/client/lib/tauri-bridge.ts` (arquivo da Renata) ainda expõe `save_design`/`load_design`/`list_designs`/`delete_design` como referência, e os 4 comandos Rust do AG-07 seguem em `commands.rs`. Por decisão do Tyago, **nenhum é registrado no `invoke_handler` nem chamado pela UI** (`lib.rs:87-91` só com `app_ready`, `export_png`, `export_pdf`). Fonte única = SQLite; sem segundo storage.
- Existem dois `isTauri()` (aqui e em `tauri-bridge.ts`); são idênticos e não conflitam, mas vale consolidar numa revisão.
- Implementei a opção 1 recomendada por Heitor em `TAURI-READINESS.md` (adaptador em `api.ts`), com SQLite em vez de IndexedDB para atender ao pedido do Tyago.
- Não há sincronização com a nuvem — é local-first por decisão. Backup é responsabilidade do usuário (copiar o `opendesign.db` do `app_config_dir`).
- **Contrato frágil registrado (sem correção nesta entrega):** `api.ts:12-15` JSON-stringifica qualquer `body` sem detectar `FormData`/`File`, e `local-db.ts` espera `File` nu enquanto o interceptador espera `FormData` com campo `file`. Hoje a UI usa `fetch()` direto em `fonts.ts:87`, então não quebra; mas não dá para passar `FormData` por `api()` no desktop.
- **Notas técnicas para a próxima entrega (FS + `asset://`, NÃO aplicadas agora):** `plugin:fs|mkdir` exige `{ path, options: { recursive: true } }`; `plugin:fs|write_file` lê `path`/`options` dos headers e os bytes do body — chamar `invoke(cmd, bytes, { headers: { path: encodeURIComponent(filePath), options: "{}" } })`, passando `Uint8Array` (não `Array.from`); `plugin:fs|read_file` usa `{ path, options: {} }`; preferir `__TAURI_INTERNALS__.convertFileSrc(filePath, "asset")` a sniffar `navigator.userAgent`. Requer ainda `assetProtocol` com scope e `http://asset.localhost` em `img-src`/`font-src`, com parecer do Emanuel e OK do Tyago. O código FS anterior foi revertido — não há `plugin:fs|*` em `local-db.ts` nesta entrega.

## Como validar

1. `pnpm run build` (Vite) — OK.
2. Teste do adaptador:
   `pnpm exec esbuild src/client/lib/local-db.test.ts --bundle --platform=node --format=esm --outfile=.test-build/local-db.test.mjs && node --test .test-build/local-db.test.mjs`
3. `cargo check`: `& "C:\Users\tyago\.cargo\bin\cargo.exe" check --offline --manifest-path "C:\Users\tyago\Projeto\bloaudhab\OpenDesign\src-tauri\Cargo.toml"` (execute no diretório do repo; **não** a partir da raiz de `OpenDesign/`). Depois `pnpm exec tauri dev` — criar um design, recarregar e conferir que persistiu. O banco aparece em `%APPDATA%\com.opendesign.app\` (ou equivalente). **Nota:** o smoke test do `tauri dev` ainda está por fazer nesta entrega; apenas o `cargo check` e o `dist/` isolado foram validados.
4. No navegador, `pnpm run dev` continua usando o D1 local em `.wrangler/`.

## Arquivos alterados

- `src-tauri/Cargo.toml` — + `tauri-plugin-sql`
- `src-tauri/src/lib.rs` — registro do plugin + migration
- `src-tauri/capabilities/default.json` — permissões SQL
- `src-tauri/migrations/0001_init.sql` — **novo** (inalterado na entrega de uploads)
- `src/client/lib/local-db.ts` — **novo** (+ fonts/uploads e interceptador de fetch)
- `src/client/lib/local-db.test.ts` — **novo** (+ testes de fonts/uploads)
- `src/client/api.ts` — despacho local + instalação do interceptador
- `docs/banco-local.md` — **novo** (este arquivo)