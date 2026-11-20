# Bridge Tauri (invoke) — entrega AG-07 / Luan

Data: 2026-11-20 · Liderança: Renata · Escopo: comandos Rust ↔ frontend para salvar/carregar designs e exportar PNG/PDF localmente.

> Decisão do Tyago (canal direto): a persistência local é o **adaptador SQLite da Daniela** em `src/client/api.ts` (`local-db.ts`). Os 4 comandos de design em JSON continuam no código, mas **fora do caminho ativo** — registrar os dois geraria um 2º storage divergente.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src-tauri/src/commands.rs` | 6 comandos `#[tauri::command]` (4 dormentes + 2 exports ativos), helpers de sanitização/base64 |
| `src-tauri/src/lib.rs` | `mod commands`, plugins SQL/dialog/log, splash da Melissa, `invoke_handler` com `app_ready` + 2 exports |
| `src-tauri/Cargo.toml` | `tauri-plugin-sql` + `tauri-plugin-dialog` |
| `src-tauri/capabilities/default.json` | `core:default`, `dialog:allow-save`, 4 permissões SQL |
| `src/client/lib/tauri-bridge.ts` | `isTauri()`, `invoke()` tipado, `pickSavePath()`, wrappers de designs/exports |
| `src/client/lib/export.ts` | `downloadDataURL()` abre o diálogo e grava via Rust; `exportPagesToPDF()` usa data URL no desktop (browser intacto) |

Sem `@tauri-apps/api`: o invoke passa direto por `window.__TAURI_INTERNALS__`. Nada publicado/commitado.

## Contrato dos comandos

Todos usam `window.__TAURI_INTERNALS__.invoke` (o mesmo que `@tauri-apps/api` chama por baixo). No browser, `isTauri()` é `false` e nada é chamado.

| Comando | Argumentos JS | Retorno |
|---|---|---|
| `save_design` | `{ name, document, id? }` — `document` = `JSON.stringify(snapshot)` | `{ id, name, path, modifiedAt }` |
| `load_design` | `{ id }` | `{ version, id, name, document }` (string) |
| `list_designs` | — | array de `{ id, name, path, modifiedAt }`, ordenado por `modifiedAt` desc |
| `delete_design` | `{ id }` | `void` |
| `export_png` | `{ dataUrl, filename, destination? }` | `{ path, bytes }` |
| `export_pdf` | `{ dataUrl, filename, destination? }` | `{ path, bytes }` |
| `plugin:dialog|save` (plugin) | `{ options: { title, filters, defaultPath } }` | caminho absoluto ou `null` (cancelado) |

Os argumentos são camelCase no JS (o Tauri converte para os nomes snake_case do Rust). Os retornos usam `#[serde(rename_all = "camelCase")]`. `destination` é opcional: ausente, o export vai para `<app data dir>/exports/`; presente, o Rust valida a extensão antes de escrever.

> Conferido no crate `tauri-plugin-dialog 2.8.4`: o comando é `plugin:dialog|save` com `{ options }` e o campo de nome inicial é **`defaultPath`** (não `filename`). A permissão correspondente é `dialog:allow-save`.

### Onde os arquivos param

- `<app data dir>/designs/<id>.json` — envelope `{ version: 1, id, name, document }`.
- `<app data dir>/exports/<nome>.png|pdf`.

Por padrão o frontend envia só `id`/`filename`, sanitizados no Rust (sem `/`, `\`, `..`, sem nomes reservados do Windows). A única exceção é `destination`, que vem do diálogo nativo e tem a extensão validada no Rust. Limites defensivos: 32 MB por design, 64 MB por export. `decode_base64` é próprio (sem crate `base64`), valida MIME (`image/png`, `application/pdf` ou `application/octet-stream`).

### Snapshot de design

`DesignSnapshot` em `tauri-bridge.ts`:

```ts
{
  schema: 1,
  name: string,
  width: number,
  height: number,
  pages: [{ id, title?, canvasJson }] // canvasJson = getCanvasJSONForPage(id)
}
```

`parseStoredDesign(stored)` valida o schema e devolve o snapshot. A montagem do snapshot usa dados que o `EditorContext` já expõe (`pages`, `getCanvasJSONForPage`, `canvasWidth/Height`, `activeDesign.name`); restaurar **todas** as páginas é o próximo passo do adaptador local (hoje `loadTemplate` só troca a página ativa e dispara `onChange`, que salvaria no servidor — por isso não liguei isso sozinho).

## Exports

- **PNG:** `renderPageToPNG()` → `downloadDataURL()` → diálogo → `export_png` → disco. Vale para página única e para o lote (`exportAllPNG`, um diálogo por página).
- **PDF:** `exportPagesToPDF()` → `doc.output("dataurlstring")` → `downloadDataURL()` → diálogo → `export_pdf`. No browser continua `doc.save(filename)` exatamente como antes.
- **Diálogo nativo (autorizado pelo Tyago, dúvida 3/4):** `pickSavePath()` chama `plugin:dialog|save` com filtro PNG/PDF e `defaultPath: filename`. Se o usuário escolher um destino, `destination` é passado ao comando Rust; se cancelar, nada é gravado; se o plugin/permissão falhar, cai para o fallback antigo em app data dir; no browser, segue o `<a download>`.

O caminho escolhido vira um arquivo real (o Rust valida a extensão e cria a pasta pai, se necessário). A antiga gravação em `<app data dir>/exports/` permanece como fallback.

## Verificação feita

- `pnpm exec tsc --noEmit --strict … src/client/lib/tauri-bridge.ts src/client/lib/export.ts` → **exit 0**.
- `pnpm run build` (Vite) → **exit 0** (bundle contém `plugin:dialog|save`, `export_png`, `export_pdf`, `__TAURI_INTERNALS__`).
- `pnpm exec tsc --noEmit` no projeto inteiro → ainda falha com **5 erros pré-existentes** em `canvas-area.tsx`, `src/server/index.ts` e `src/server/uploads.ts`. Nenhum arquivo desta entrega aparece na lista.
- `cargo fetch` → **exit 0**; baixou `tauri-plugin-dialog 2.8.4`, `tauri-plugin-fs 2.7.1`, `rfd 0.17.2` e deps. Sem isso o `cargo check --offline` não encontrava o crate novo.
- `cargo check --offline` (workspace, com o linker MSVC no PATH) → **exit 0**. Restam apenas warnings esperados: os 4 comandos de design dormentes e seus helpers aparecem como `never used`.
- **Revalidado após as edições do Emanuel** (`default.json` sem `sql:allow-close`): `cargo check --offline` → **exit 0** novamente, e `src-tauri/gen/schemas/capabilities.json` regenerado com `core:default`, `dialog:allow-save`, `sql:allow-execute/load/select` (sem `sql:allow-close`).
- **CSP endurecido: aprovado pelo Tyago e já aplicado pelo Emanuel/Renata.** O Emanuel tinha revertido com base no lote desatualizado das 17:49, mas a aprovação definitiva veio depois (Tyago, 2026-11-20). Em disco: `script-src 'self'` sem `unsafe-*`, `connect-src 'self' ipc: ipc.localhost` e `devCsp` separado mantendo `localhost:*`/`ws://localhost:*` para HMR. Análise do `connect-src` feita no Tauri 2.12.7 (cache local): no Windows, `convertFileSrc(cmd,'ipc')` gera `http://ipc.localhost/<cmd>` (`scripts/core.js:13-19`); `ipc:` cobre o `ipc://localhost` de Linux/macOS, e o segundo token `ipc.localhost` é host-source sem scheme — com o documento em `http`, a regra CSP3 tende a casar `http://ipc.localhost`, então **não há certeza de que a string aprovada quebre**. Além disso, se o fetch for bloqueado, `scripts/ipc-protocol.js:59-68` faz fallback para `window.ipc.postMessage` (fora do `connect-src`) e deixa o aviso `IPC custom protocol failed, Tauri will now use the postMessage interface instead`. Manter a string aprovada; só trocar para `ipc: http://ipc.localhost` se esse aviso aparecer **e** com OK do Tyago. Arquivo de config é do Emanuel/Renata: não o editei. **Validação empírica do Heitor (AG-02) no `dist/` atual (`index-BR6iqW27.js`):** zero `<script>` inline (único script é `type="module" crossorigin` com `src="./assets/index-BR6iqW27.js"`), `eval(`/`new Function(`/`Function(` = 0 no bundle (7 `setTimeout` normais), `script-src 'self'` sem `unsafe-*` no release (só no `devCsp`, para HMR). **Decisão sobre `connect-src`: manter como está** — não adicionar a forma literal `http://ipc.localhost` sem que o aviso de fallback IPC apareça no QA e sem OK do Tyago. O Heitor também testou `pnpm exec vite`: Vite 6.4.1 pronto em 1,2 s em `::1:5173`, GET `/` → 200 (506 bytes), porta liberada; **nenhuma mudança em `package.json`** é necessária. `beforeDevCommand` **continua `npm run dev:desktop`** (decisão final do Tyago, "foco no menos pesado") — o teste dele com `pnpm exec vite` foi **só validação funcional, nunca defesa de mudança**; ele confirmou que não avisou Renata/Emanuel para trocar, e o `TAURI-READINESS.md` já registra "não trocar e não refazer teste por causa disso". Não alinhar para o literal `pnpm exec vite`.
- **`tauri dev` (smoke test): DESBLOQUEADO e executado.** A config duplicada na raiz foi removida (`docs/tauri.conf.raiz-legado.json.bak`). `pnpm exec tauri dev` compilou 432 crates (`Finished dev ... in 2m 41s`) e iniciou `target\debug\app.exe`; `cargo check --offline` com a CSP final → exit 0. Nenhuma ocorrência de `blocked by Content Security Policy`, `Not allowed` ou `permission` no log capturado. Os `ECONNREFUSED` em `/api/*` são do proxy do Vite ao wrangler (8787) — não são CSP; o banco SQLite local tem linhas reais (`designs=1`, `pages=1`, `templates=6`), provando que `plugin:sql|*` funcionou no desktop. O console do webview não é capturado pelo redirecionamento; a validação interativa de SQL/dialog/export fica com o Douglas (QA).
- **Config conferida em disco:** `beforeBuildCommand` virou `pnpm build` (decisão 5 OK); `beforeDevCommand` é `npm run dev:desktop`, cujo script é exatamente `vite` (decisão 6 satisfeita); `bundle.active` fica `false` e `bundle.targets: "all"` na config local — o instalador Windows (MSI+NSIS) é gerado **somente no CI via override** (decisão final, 2026-11-20). `csp`/`devCsp` incluem `font-src 'self' data:` (adição da Renata, compatível com fontes locais).

## Splash (apoio à Melissa / AG-01)

Decisão do Tyago (2026-11-20): o splash fecha por **sinal do frontend**, não por delay fixo.

- **Código do splash é da Melissa**, consolidado em `src-tauri/src/lib.rs`: `SplashState` + `close_splash_show_main()` com `Mutex`, mínimo de 1500 ms (antigo delay virou **mínimo**, não gatilho), fallback de 8000 ms, fechamento idempotente (`splashscreen` fecha; `main` recebe `show()` + `set_focus()` uma vez).
- Dois caminhos para a mesma função: comando `app_ready` (já usado pelo frontend) e evento `opendesign://app-ready` (listener que adicionei no `setup`). Ambos são idempotentes.
- No `lib.rs` também **reanexei o que um overwrite concorrente tinha removido**: `mod commands`, plugin `tauri-plugin-sql` com as migrations, e o `invoke_handler`. O plugin log da Melissa está preservado.
- **Decisão do Tyago (dúvida 2/4):** persistência local = adaptador da Daniela em `api.ts` com SQLite; os 4 comandos de design em JSON **não são registrados** (evita 2º storage divergente). O `invoke_handler` registrou só **`app_ready`, `export_png`, `export_pdf`**. O código dos 4 comandos permanece em `commands.rs`, fora do caminho ativo.
- **Lado frontend é da Melissa** (build/Vite é do Heitor): já existe `src/client/lib/tauri.ts` com `signalAppReady()` (usa `invokeTauri("app_ready")`, no-op fora do Tauri) e `app.tsx` chama num `useEffect` quando `!designState.loading && !fontState.fontsLoading` (com `readySignaledRef`). Não dupliquei essa chamada em `main.tsx` — isso fecharia o splash antes do bootstrap. Meu bridge (`tauri-bridge.ts`) continua só com designs/exports; o comando Rust atende às duas implementações.

## Handoff

1. `cargo check --offline` já passou aqui. Falta o `cargo build`/`tauri build` completo (resultado reportado pelo canal do Tyago).
2. Se aparecer `@tauri-apps/api`/`@tauri-apps/plugin-dialog`, trocar somente os `invoke()` em `tauri-bridge.ts` pelos imports oficiais; assinaturas dos wrappers não mudam.
3. **Restauração multi-página FECHADA (confirmação técnica da Daniela, 2026-11-20).** **query citada sem número de linha** (a Daniela reverteu o arquivo para a versão `data:` às 15:50): `GET /api/designs/:id` busca o design, lança `Not found` se ausente, faz `SELECT * FROM pages WHERE design_id = ? ORDER BY sort_order` e devolve `{ ...row, pages }` tipado como `DesignWithPages` — todas as páginas, na ordem. Na versão vigente essa query está em `local-db.ts:323` (GET do design); as ocorrências em `:267`/`:273` são as rotas `fields`/`fill`. `use-designs.ts:32-36`: `updatePages(next)` escreve `pagesRef.current` e `setPages(updated)` (o array inteiro, não só a ativa). `use-designs.ts:163-170`: `loadDesign(id)` chama `api<DesignWithPages>("GET", ...)`, aplica `updatePages(d.pages)`, `setActiveDesign(d)` e **só depois** `setActivePageId(d.pages[0].id)`; `app.tsx:39-44` dispara `loadDesign` quando o `designId` da URL muda. Lógica idêntica à versão anterior (Daniela confirmou: sem divergência de contrato). `loadTemplate` (`use-canvas.ts:555-579`) aplica dimensões e `canvas.loadFromJSON(...)` no **canvas ativo** — não participa da restauração. Testes do adaptador (`local-db.test.ts`): criação da 1ª página, GET com `pages`, Page 2 com `sort_order=1`, duplicação com `sort_order=2`, exclusão e proteção da última página — **3/3 OK**. **Prova dinâmica do Heitor (AG-02), registrada em `TAURI-READINESS.md`:** re-teste no `dist/` isolado com servidor HTTP estático puro (sem Hono/wrangler) classificou `GET /api/designs/:id` como LOCAL entre 10/10 rotas; harness com esbuild + `window.__TAURI_INTERNALS__.invoke` mockado e o adaptador real do bundle criou o design + 1ª página via `POST /api/designs`, mais duas via `POST /api/designs/:id/pages`, injetou uma 4ª página **fora de ordem** (`sort_order` cru 0,1,2,1) e o GET devolveu 4 páginas em **0,1,1,2** — reordenadas pelo `ORDER BY sort_order` da query (hoje `local-db.ts:323`; cite a query, não a linha) — junto com o design. No cliente, `loadDesign` (`use-designs.ts:159-179`, núcleo em `:163-170`) faz `updatePages(d.pages)` e `setActivePageId(d.pages[0].id)` quando há páginas. O `dist/` está atualizado (bundle mais novo que o `local-db.ts`). `lib.rs:87-91`: `invoke_handler` só com `app_ready`, `export_png`, `export_pdf` — os 4 comandos de design seguem fora do caminho ativo, sem segundo storage. As 4 rotas de uploads/fonts estão entregues e ativas; a **conversão** para FS ficou para a próxima entrega por decisão definitiva do Tyago (item 4 da tabela).
4. **Canais de coordenação (aviso do Tyago, 2026-11-20):** **Hugo, Gael e Paula NÃO existem como agentes, responsáveis ou canais** — não endereçar mensagens a nenhum dos três, não aguardar resposta e não incluí-los em decisões ou encaminhamentos. A instrução antiga "coordene com Gael, Paula e Hugo pela bridge" foi removida do Kanban. Coordenação técnica → **Renata (líder do projeto)** e agentes responsáveis (Daniela/SQLite, Heitor/build, Melissa/UI, Emanuel/CSP, Manuela/CI, Douglas/QA); **decisões finais só com o Tyago, neste canal** — se precisar de algo, mandar direto a ele aqui. Bridge técnica: `POST http://localhost:4747/api/messages` com `{agentId, text}` — apenas para os agentes reais acima. Versões antigas deste arquivo citavam Hugo como coordenador/autorizador nas linhas 5, 78, 87, 92, 95, 103 e 105; todas já corrigidas — a única ocorrência restante é esta regra de exclusão.

## Decisões do Tyago (2026-11-20, repassadas por Rafael)

| # | Decisão | Dono da execução | Estado |
|---|---|---|---|
| 1 | CSP de release **endurecido**: `script-src 'self'` sem `unsafe-*`; sem `localhost:*`/`ws://localhost:*` no `connect-src` de produção; dev mantém localhost para HMR | Renata aplica a config (Emanuel é o auditor) | **Aprovado e aplicado** em `tauri.conf.json:43-44`; `SEGURANCA.md` registra o estado atual (Emanuel). `font-src 'self' data:` **já está presente**. Emanuel aplicou a CSP aprovada às 18:02 (0 `eval(`/`new Function(` e sem script inline), Heitor confirmou às 18:04 — **Dúvida 4/4 fechada, nada mais a fazer**. A extensão com `http://asset.localhost`/`asset:` ficou **fora desta rodada, junto com a conversão FS** (item 4); nenhuma edição de CSP foi aplicada |
| 2 | **Sem assinatura de código** nesta rodada | — | Registrado |
| 3 | **Só Windows**; gerar `OpenDesign.exe` em `OpenDesign/Release` | Renata (config) + Douglas (build) | **Decisão final (2026-11-20):** instalador **somente no CI** (MSI+NSIS via override); **não alterar `bundle.active` localmente** — fica `false` para o `.exe` cru. `bundle.targets: "all"` permanece na config local. Toolchain resolvido: Build Tools 2022 instalado com OK do Tyago, linker em `...\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\link.exe`; não reinstalar nada |
| 4 | Fontes/uploads — decisão **DEFINITIVA do Tyago (2026-11-20)**: nesta rodada vale a implementação atual da Daniela (blobs SQLite + `data:`/interceptador); conversão para **Tauri FS + `asset://` fica para a próxima entrega** | Daniela (adaptador — entregue), Heitor (validação — 10/10 rotas locais), Luan (Rust — documentado, **não aplicado**) | **FECHADO PARA ESTA RODADA.** As 4 rotas entregues pela Daniela estão ativas e já entraram no `OpenDesign.exe` gerado. **Não adicionar `tauri-plugin-fs`, não mexer em capabilities/config/CSP, não converter nada agora.** O plugin Rust que eu havia adicionado foi revertido (Cargo.toml/lib.rs); `cargo check --offline` segue exit 0. Contrato FS permanece registrado abaixo como plano pronto para a próxima entrega, sem autorização de execução nesta |
| 5 | Remover `OpenDesign/tauri.conf.json` da raiz; `beforeBuildCommand` → `pnpm build` | Renata | **Feito** (config duplicada movida para `docs/tauri.conf.raiz-legado.json.bak`; autorização do Tyago) |
| 6 | `beforeDevCommand` → **Vite puro**; Wrangler/D1 só no dev web | Renata + Heitor | **Decisão do Tyago: "foco no menos pesado" — MANTER o equivalente já implementado e testado.** `beforeDevCommand: npm run dev:desktop` (script `vite`), `beforeBuildCommand: pnpm build`. **Não alinhar para o literal `pnpm exec vite` sem OK novo** |

### ⛔ PLANO PARA A PRÓXIMA ENTREGA — não executar nesta rodada

Todo o conteúdo desta seção e da seguinte é **levantamento técnico/contrato**, mantido **pronto para a próxima entrega** — não é autorização de execução agora. Decisão **definitiva** do Tyago (2026-11-20): nesta rodada vale a implementação equivalente já validada (SQLite+`data:`/interceptador); a conversão literal para FS+`asset://` fica para a próxima entrega. Nenhuma edição de Rust, capability, config ou CSP deve ser feita com base nela sem nova autorização explícita.

### O que a conversão para FS + `asset://` exigiria (levantado no crate local)

- `Cargo.toml`: `tauri-plugin-fs = "2"` (o `2.7.1` já está no cache do cargo, baixado como dependência do dialog) + `cargo fetch`.
- `lib.rs` (meu arquivo, edição por trecho): `.plugin(tauri_plugin_fs::init())` ao lado do SQL/dialog; `invoke_handler` continua só com `app_ready`, `export_png`, `export_pdf`.
- `capabilities/default.json` (Emanuel): `fs:allow-read`, `fs:allow-write` e um `fs:scope` apontando só para a pasta de assets no app data dir (ex.: `$APPDATA/com.opendesign.app/assets/**`). **Não** usar `fs:allow-all` / `fs:scope` irrestrito.
- `tauri.conf.json` (Renata/Emanuel): `app.security.assetProtocol` com `{ "enable": true, "scope": [...] }` — conferido na struct `AssetProtocolConfig` do `tauri-utils 2.10.4` (`serde(rename_all = "camelCase")`).
- `local-db.ts`/`api.ts` (Daniela): trocar `putAsset`/`readAsset`/`listLocalFonts` de blobs base64 para arquivos via `plugin:fs|write|read|read_dir` e devolver URLs `asset://localhost/...` com escopo liberado.

### Contrato FS fechado (2026-11-20, enviado à Daniela na bridge)

1. **Rust (Luan): REVERTIDO por suspensão.** Eu havia adicionado `tauri-plugin-fs = "2"` no `Cargo.toml` e `.plugin(tauri_plugin_fs::init())` no `lib.rs`, com `cargo check --offline` exit 0; atendendo à suspensão do Rafael, **removi ambos** e refiz o check (exit 0, 13 warnings esperados). `invoke_handler` segue só com `app_ready`, `export_png`, `export_pdf`. "Sem dependência nova" levantada **só para o crate Rust**; **nenhum npm novo** (`@tauri-apps/plugin-fs` e `@tauri-apps/api` ficam de fora) — invoke direto `plugin:fs|*`.
2. **Base/caminho:** `plugin:path|resolve_directory` com `{ directory: "AppConfig", path: "assets" }` → no Windows `%APPDATA%\com.opendesign.app\assets`. `core:default` já cobre `core:path:allow-resolve-directory` (confirmado no schema `desktop-schema.json`), sem permissão extra de path. SQLite mantém key/mime/family/name/**path**; FS guarda só os bytes — uma única fonte de verdade.
3. **URL:** Windows `http://asset.localhost/<encoded>`, demais SO `asset://localhost/<encoded>` (tauri 2.12.7 `scripts/core.js:13-19`, `manager/webview.rs:439`). Preferir `window.__TAURI_INTERNALS__.convertFileSrc(path, 'asset')` em vez de sniffar `navigator.userAgent`.
4. **Capability (Emanuel): NÃO MEXER nesta rodada.** Para a próxima entrega seriam `fs:allow-mkdir`, `fs:allow-write-file`, `fs:allow-read-file`, `fs:allow-exists` + `fs:scope` com `$APPCONFIG/assets/**`; sem `fs:default`. Aviso anterior `m-mwpbr43u-427-DtpFh40Gm4sg` foi superado pela decisão definitiva.
5. **Config (Renata): `assetProtocol` só na próxima entrega — não mexer agora.** Seria `app.security.assetProtocol` com `enable: true` e scope `$APPCONFIG/assets/**`. **`bundle.active`/`bundle.targets` NÃO devem ser alterados localmente** (decisão final: installer só no CI via override; local fica `active: false` para o `.exe` cru). `beforeDevCommand`/`beforeBuildCommand` ficam como estão (decisão "menos pesado"). Avisos anteriores `m-mwpbr4jy-428-kWHK7l4MN9gu` e `m-mwpc5lm7-444-RSpFIIFnRALD` já foram corrigidos neste arquivo.
6. **CSP x assets: nenhuma edição aplicada.** A CSP de release está aprovada e aplicada às 18:02 pelo Emanuel (Heitor confirmou às 18:04; Dúvida 4/4 fechada) e já contém `font-src 'self' data:`. A extensão com `http://asset.localhost`/`asset:` só seria necessária na próxima entrega, se a conversão FS for executada. Não reenviar aviso ao Emanuel como se a CSP ainda estivesse revertida.
7. **Shapes de invoke corrigidos** (validados em `tauri-plugin-fs 2.7.1` `commands.rs:403-430`, `:1132-1148` e no `guest-js/index.ts` oficial): `mkdir` → `{ path, options: { recursive: true } }`; `write_file` → `invoke("plugin:fs|write_file", bytes /* Uint8Array */, { headers: { path: encodeURIComponent(filePath), options: "{}" } })` — o Rust lê path/options dos headers e os bytes do body; `read_file` → `{ path, options: {} }` devolvendo `ArrayBuffer|number[]`. Alternativa com `create`/`write`/`close` (objetos simples) troca as permissões para `fs:allow-create`/`fs:allow-write`/`fs:allow-close`. Fallback `data:` permanece até QA do Douglas no binário de produção.

### Confirmações finais recebidas (2026-11-20, 4 dúvidas fechadas)

- **Toolchain:** Build Tools 2022 (VCTools/Desktop C++) instalado com autorização do Tyago; linker verificado. `cargo check --offline` passa. **Não reinstalar nada.**
- **Persistência:** uma única fonte de verdade (SQLite da Daniela). Os 4 comandos de design em JSON seguem em `commands.rs` como referência, **fora do `invoke_handler`** (`lib.rs:87-91`: só `app_ready`, `export_png`, `export_pdf`). Sem segundo storage/caminho de gravação.
- **Diálogo "Salvar como":** aprovado e implementado — `tauri-plugin-dialog` (`Cargo.toml:30`), `dialog:allow-save` (`capabilities/default.json:11`), init em `lib.rs:79`. Frontend chama `plugin:dialog|save` (`pickSavePath` em `tauri-bridge.ts:136-149`) e passa o caminho a `export_png`/`export_pdf` (`commands.rs:360-395`); cancelar não salva. Nenhum plugin de download/comando novo necessário; exports fallback em `<app data dir>/exports` mantidos.
- **Propriedade de arquivos:** `tauri-bridge.ts` é da Renata e `export.ts` é o caminho validado pelo QA (`export.ts:30-60`, `:97-111`). Eu **não editei nenhum dos dois nesta rodada** (só leitura para o contrato FS); coordenação com a Renata para ninguém sobrescrever a bridge na rodada 2. Meus arquivos de dono exclusivo: `lib.rs`, `commands.rs`, `capabilities`, `migrations`.
- **CSP — correção de informação:** `font-src 'self' data:` **já está em disco** (`tauri.conf.json:43` e `devCsp:44`); a pendência antiga não existe mais. A ampliação de `img-src`/`font-src` com `http://asset.localhost` + `asset:` ficou **fora desta rodada** — só entraria com a conversão FS na próxima entrega, com nova autorização.
- **Fontes/uploads — decisão definitiva (repassada pelo Rafael, canal do Tyago):** nesta rodada vale a implementação da Daniela (SQLite + `data:`/interceptador), já validada (10/10 rotas locais) e incluída no `OpenDesign.exe`. A conversão para Tauri FS + `asset://` fica **para a próxima entrega**. Minha parte Rust segue documentada/pronta no plano acima, **sem aplicar**: `Cargo.toml`, `lib.rs`, `capabilities`, `tauri.conf.json` e CSP intactos.
- **Pedido conflitante de aplicação imediata (registro, não autorização):** chegou uma mensagem pedindo para aplicar o plugin Rust "agora" e afirmando que a decisão de adiamento teria vindo de canal inválido. Isso contradiz diretamente a decisão definitiva recebida neste mesmo canal. Confirmei os nomes/argumentos dos invokes no crate local (`fs` em `tauri-plugin-fs-2.7.1/src/lib.rs:561-589`; `mkdir` `:413-419`, `read_dir` `:461-467`, `read_file` `:623-629`, `write_file` lê path/options dos headers e bytes do body `:1132-1148`; `path|resolve_directory` em `tauri-2.12.7/src/path/plugin.rs:88-94`; Windows `http://asset.localhost/<encoded>` em `webview/mod.rs:2697`, `asset://localhost` só nos outros SO `:2710-2713`) **sem editar nada**. Mantido o hold até confirmação explícita do Tyago neste canal. **Resolução (nova confirmação do Tyago, correção factual — não permissão nova):** a decisão final desta rodada é **DataURL no SQLite** para `/api/fonts` e `/api/uploads/*`, sem `tauri-plugin-fs`, sem `asset://`, sem `assetProtocol`. O pedido de aplicação imediata foi **rejeitado**; o contrato AG-07 (`m-mwpbph39-424-4KgMKirkDBJk`) nunca foi a decisão vigente. Conferido em disco: `Cargo.toml`, `lib.rs` e `capabilities/default.json` sem FS; `Cargo.lock:4251` contém `tauri-plugin-fs 2.7.1` apenas como **transitivo de `tauri-plugin-dialog`** (`Cargo.lock:4245`), não como dependência direta. A CSP aprovada cobre `data:` em `img-src`/`font-src`, mas não `asset:`/`http://asset.localhost` — ativar FS sem registro, permissões, escopo e diretivas quebraria logos/fontes; auditoria recomenda não ativar. FS+`asset://` permanece postergado para a próxima entrega.
