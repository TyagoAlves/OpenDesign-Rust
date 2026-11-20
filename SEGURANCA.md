# Segurança — OpenDesign desktop (Tauri 2)

> **Autor:** Emanuel (AG-05) · **Data:** 2026-11-20 · **Estado:** parecer final; CSP de release aprovada pelo Tyago e aplicada; `npm run build` executado; smoke test `tauri dev` concluído pelo Luan sem bloqueios de CSP (binário de release/CSP final ainda pendente); sem commit/push/publish
> **Escopo autorizado (Tyago):** escrita somente dentro de `C:\Users\tyago\Projeto\bloaudhab\OpenDesign\`; arquivos de segurança: `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json` e este documento. `src-tauri/src/lib.rs` **não** foi editado (é área do Luan).
> **Coordenação (atualizada por determinação do Tyago):** canais autorizados = bridge (`POST http://localhost:4747/api/messages`) para a **Renata**, líder do projeto, e este canal do Tyago; decisões finais somente com o Tyago. `OpenDesign/SEGURANCA.md` é o parecer formal. **Nenhum** arquivo fora de `OpenDesign/` foi escrito — em especial `docs/coordenacao.md` da LIMPABYTE, projeto separado em `E:\Nova pasta\AGENCIA_DARK_4_0\...`.

## 1. CSP final (aprovada pelo Tyago, aplicada)

Arquivo canônico: `src-tauri/tauri.conf.json` → `app.security`. O `tauri.conf.json` da raiz é scaffold antigo e foi ignorado.

**Produção (`app.security.csp`) — aprovada pelo Tyago, com `font-src` acrescentado depois por decisão dele:**
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ipc: ipc.localhost
```
**Desenvolvimento (`app.security.devCsp`) — HMR do Vite:**
```
default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ipc: ipc.localhost http://localhost:* ws://localhost:*
```

| Diretiva | Justificativa (decisão do Tyago) |
|---|---|
| `script-src 'self'` | O Tauri 2 injeta automaticamente hashes/nonces para scripts locais no build, então não precisa de `unsafe-inline`/`unsafe-eval` e não quebra o `__TAURI_INTERNALS__` usado por `local-db.ts`/`tauri-bridge.ts`. Evidência: bundle novo (`index-BbaaXGLk.js`) com **0** `eval(`, **0** `new Function(`; `dist/index.html` sem `<script>` inline; `public/splashscreen.html` só tem `<style>` inline, nenhum `<script>` inline. |
| `style-src 'self' 'unsafe-inline'` | Fabric.js/Preact injetam estilos em runtime e o `splashscreen.html` usa `<style>` inline. É a única folga mantida; estilo não executa código. |
| `img-src 'self' data: blob:` | `data:`/`blob:` usados por `canvas.toDataURL()` e `URL.createObjectURL()` (export e miniaturas). |
| `font-src 'self' data:` | Acrescentada por decisão do Tyago (dúvida 2/4 da Daniela): fontes customizadas e uploads entram na mesma frente, gravados como **DataURL no SQLite**. O `FontFace` com data URL exige `font-src 'self' data:`; sem isso a fonte é bloqueada. Neste estado não há `@tauri-apps/plugin-fs` (npm), `asset://`, nova dependência nem nova permissão. |
| `connect-src 'self' ipc: ipc.localhost` | Declarado explicitamente conforme exigiu o Tyago: no Windows o `invoke()` passa por `ipc.localhost`. Sem isso, `plugin:sql|*` e `plugin:dialog|save` falhariam silenciosamente. `http://localhost:*` e `ws://localhost:*` ficaram **somente no `devCsp`**, por causa do HMR do Vite. **Ponto em acompanhamento (Luan, 2026-11-20):** a documentação oficial do Tauri 2 exemplifica `connect-src ipc: http://ipc.localhost`, mas o Luan verificou no código do Tauri 2.12.7 que o token `ipc.localhost` é um *host-source* sem scheme e, com o documento servido em `http`, casa com `http://ipc.localhost` no Windows; no Linux/macOS o token `ipc:` cobre `ipc://localhost`. Além disso, se o fetch do IPC falhar, o `scripts/ipc-protocol.js` avisa no console `IPC custom protocol failed, Tauri will now use the postMessage interface instead` e refaz o `invoke()` por `window.ipc.postMessage`, que não depende de `connect-src`. Portanto a string aprovada pode funcionar com apenas esse warning. O Douglas foi avisado para procurar exatamente esse aviso, não só falha de `invoke`. Manter a redação aprovada; qualquer correção vai para o **Tyago neste canal**. Coordenação técnica: Renata e responsáveis. |
| `devCsp` com `unsafe-inline`/`unsafe-eval` | Restrito ao desenvolvimento; necessário para o HMR. Não vai para o binário de release. |

`dangerousDisableAssetCspModification` **não** foi ativado (permanece `false`, o padrão): o Tauri continua injetando automaticamente os nonces/hashes e os esquemas que ele precisa.

**Validação do build (`npm run build`, executado em 2026-11-20 após a mudança e re-executado após a tradução):** exit 0, 6342 módulos transformados; `dist/index.html` (`lang="pt-BR"`) com assets **relativos** (`./assets/...`) e sem `<script>` inline; varredura dos `.js` finais: `0` `eval(`, `0` `new Function(`, `0` `sk-`/`AKIA`/`ghp_`/`api_key`. Único aviso: chunk `index-Bwi-_kH8.js` com 612,60 kB (>500 kB) — aviso de tamanho, não de segurança. Testes: `npm test` (14/14) e `local-db.test.ts` isolado (3/3), ambos OK.

## 2. Permissões mínimas (`src-tauri/capabilities/default.json`)

| Permissão | Uso real | Decisão |
|---|---|---|
| `core:default` | eventos/janelas básicos (inclui `app_ready` e o listener do splash) | mantida |
| `dialog:allow-save` | `plugin:dialog\|save` chamado em `src/client/lib/tauri-bridge.ts` (diálogo nativo “Salvar como”) | mantida (autorizada pelo Tyago) |
| `sql:allow-load` | `plugin:sql\|load` em `local-db.ts` (abre/cria o DB) | mantida |
| `sql:allow-select` | `plugin:sql\|select` (leitura de designs/páginas) | mantida |
| `sql:allow-execute` | `plugin:sql\|execute` (escrita/atualização) | mantida |
| `sql:allow-close` | **nenhum** uso no frontend (grep só encontra `load`/`select`/`execute`) | **removida** por menor privilégio |
| `fs:*`, `shell:*`, `http:*`, `process:*`, `window:allow-*` extras | não usados | **ausentes** — correto |

A capability vale para `main` e `splashscreen`; a splash não chama SQL/dialog. **Recomendação futura:** separar em duas capabilities (`core:default` para ambas; `sql`+`dialog` só para `main`), mas isso mexe no desenho do Luan — não aplicado sem OK.

## 3. Dados do usuário (save local)

- Decisão do Tyago (dúvida 2/4): **opção (a)** — persistência local, sem backend e sem sidecar. **Rejeitadas:** (b) sidecar Hono com `connect-src 127.0.0.1:<porta>` e (c) desktop somente-leitura. O desktop cria e salva designs normalmente.
- Caminho autorizado e já implementado (nenhuma dependência nova adicionada por mim):
  - `src/client/lib/local-db.ts` (Daniela): adaptador SQLite via `tauri-plugin-sql`, com `__TAURI_INTERNALS__.invoke` direto.
  - `src/client/api.ts`: se `isTauri()`, desvia `/api/designs`, `/api/pages`, `/api/templates` e `/api/brand-kits` para `localApi()` **antes** do `fetch`. As assinaturas de `api(method, path, body)` não mudaram; `use-designs.ts` e os demais hooks seguem iguais.
  - `Cargo.toml`: `tauri-plugin-sql = 2.6.0` com feature `sqlite` já presente. **`@tauri-apps/plugin-fs` (pacote npm) não foi adicionado.** Um repasse posterior anuncia a entrada de `tauri-plugin-fs` (Rust) e `asset://` como "decisão 4"; isso contradiz a confirmação direta do Tyago neste canal (DataURL/SQLite) e **não foi aplicado** aqui sem confirmação dele neste canal. Não registro "sem plugin-fs" como estado final irreversível — registro apenas o estado atual do código e da capability.
  - `src-tauri/src/lib.rs` (área do Luan, não editada por mim): plugin SQL já registrado com `migrations/0001_init.sql`, integrado a `app_ready`, `export_png` e `export_pdf`. Os 4 comandos de design em JSON (`save_design`/`load_design`/`list_designs`/`delete_design`) ficam **fora do caminho ativo**, para não criar um 2º storage.
  - `capabilities/default.json`: `sql:allow-load/select/execute` presentes; `dialog:allow-save` já está na capability (autorizada pelo Tyago); `sql:allow-close` removida por não uso.
- Banco: `sqlite:opendesign.db`, gravado no **appDataDir** (`app_config_dir` do Tauri; no Windows, `%APPDATA%\com.opendesign.app\`), **fora do repositório**. Migration: `src-tauri/migrations/0001_init.sql`.
- `tauri.conf.json` não contém `externalBin`/sidecar (verificado) e não deve conter — nenhum backend externo é iniciado. Nenhum dado de design sai da máquina pelo caminho ativo.
- **Dev desktop sem backend (decisão do Tyago):** `beforeDevCommand` passou de `npm run dev` para `npm run dev:desktop` — Vite puro, sem wrangler/Hono. Tyago fechou a dúvida com "foco no menos pesado": **mantém-se** `npm run dev:desktop` (script `vite`, já testado pelo Heitor); **não** trocar para `pnpm exec vite`. `devUrl` (`http://localhost:5173`) permanece inalterado; `beforeBuildCommand` está `pnpm build` (decisão repassada por Rafael/Tyago, já aplicada no canônico `src-tauri/tauri.conf.json`). O script `dev:desktop` em `package.json` é do Heitor, não meu. Isso mantém o `devCsp` coerente: o localhost liberado no dev é só o do Vite/HMR.
- **Build do executável (autorização do Tyago, execução do Rafael):** autorizado `tauri build` sem installer (`bundle.active = false`); quem roda e copia o artefato para `OpenDesign/Release` é o Rafael, para não competir com o build dele. Eu **não** rodei build de exe nesta rodada. Continua proibido gerar release/tag/publish sem novo OK explícito.
- **Config duplicada removida da raiz (decisão do Tyago, repasse Rafael):** o antigo `OpenDesign/tauri.conf.json` não existe mais na raiz; foi **movido, não apagado**, para `docs/tauri.conf.raiz-legado.json.bak`. O único arquivo canônico é `src-tauri/tauri.conf.json`.
- **Fontes/uploads (decisão do Tyago, dúvida 2/4 da Daniela — ciclo fechado pelo Rafael e reconfirmado pelo Tyago em 2026-11-20):** entram na **mesma frente local**, gravados em **base64 no SQLite** e devolvidos como **data: URLs**. Um repasse posterior atribuiu ao Tyago uma decisão de `Tauri FS + asset://` com `fs:allow-read`/`fs:allow-write`/`fs:scope` e `app.security.assetProtocol`; **não foi aplicado** porque contradiz a decisão direta dele neste canal. Tyago confirmou aqui, de forma explícita, que prevalece DataURL/SQLite ("Manter DataURL") — nenhuma permissão `fs:*` e nenhum `assetProtocol` foram adicionados. Se existir uma decisão nova posterior, ela precisa ser confirmada pelo próprio Tyago neste canal antes de qualquer alteração de capability ou `assetProtocol`. O adaptador único em `src/client/api.ts` + `src/client/lib/local-db.ts` (SQLite via `tauri-plugin-sql`) agora cobre também `GET/POST /api/fonts` e `POST/GET /api/uploads` no desktop — sem frente paralela, sem `@tauri-apps/plugin-fs` (npm), sem `asset://`, sem nova dependência e sem nova permissão **no estado atual**. A CSP de `src-tauri/tauri.conf.json` já aceita `data:` (`font-src 'self' data:` e `img-src 'self' data: blob:`). Minha alteração foi somente a CSP; a implementação é da Daniela.
- **Lacunas ainda em tratamento por outros:** `/__clawnify/presence.js` é root-relative e precisa de tratativa; o Heitor vai re-testar o `dist/` isolado com o código atual. Não alterei nenhuma rota `fetch`.
- `.gitignore` cobre `data.db*` do modo dev; o DB do desktop nem entra no repo por estar no appDataDir.

## 4. Segredos no binário

- Varredura nos fontes (fora `node_modules/`, `dist/`, `.git/`, `.wrangler/`, `target/`): **0** chaves privadas, tokens AWS/GitHub/Slack/OpenAI ou `api_key`.
- Bundle final `dist/assets/index-*.js`: **0** ocorrências de `sk-`, `AKIA`, `ghp_`, `api[_-]?key`.
- `.env` não existe; `.env.example` diz “No API keys required for basic usage”; `wrangler.toml` usa `database_id = "local"` e bucket local — sem credenciais Cloudflare.
- Regra para o time: **nunca colocar segredo em `VITE_*`** — o Vite embute essas variáveis no JS e, portanto, no binário. Segredos de build/CI ficam em GitHub Secrets; `.env` local permanece ignorado.
- `tauri_plugin_log` só é registrado sob `cfg!(debug_assertions)` — nada de log de conteúdo de design em release.

## 5. Validação

- [x] CSP aprovada aplicada em `src-tauri/tauri.conf.json` (`csp` + `devCsp`), JSON revalidado.
- [x] `npm run build` executado após a mudança: `dist/index.html` sem `<script>` inline e com assets relativos; bundle sem `eval(`/`new Function(`/segredos (detalhes em §1).
- [x] `cargo check --offline` em `src-tauri/` executado a pedido do Luan com `C:\Users\tyago\.cargo\bin\cargo.exe`: exit 0, apenas 13 warnings de código não usado em `commands.rs` (os 4 comandos de design fora do caminho ativo). O `gen/schemas/capabilities.json` foi regenerado e agora traz `core:default`, `dialog:allow-save` e `sql:allow-execute/load/select` — sem `sql:allow-close`.
- [x] **Fechamento repassado pelo Rafael e reVALIDADO pelo Luan:** o bloqueio anterior de `cargo check` era de configuração/toolchain no ambiente dele; nada foi instalado. O Luan rodou `cargo check --offline` com **exit 0** depois da correção do config e do `tauri dev` completo, sem alterar dependências.
- [x] **Smoke test `tauri dev` concluído pelo Luan (2026-11-20):** 432 crates compilados, `Finished dev in 2m 41s`, `Running target\debug\app.exe`. Log capturado: **0** `blocked by Content Security Policy`, **0** `Not allowed`, **0** `permission`. Os `ECONNREFUSED` em `/api/*` são do proxy do Vite para o wrangler na 8787, **não** são CSP. CSP ativa com `font-src 'self' data:` — compatível com as fontes locais da Daniela. A primeira tentativa havia falhado antes de compilar com `No package info in the config file` por causa do config duplicado na raiz; bloqueio de config, já resolvido (só restam `src-tauri/tauri.conf.json` e `docs/tauri.conf.raiz-legado.json.bak`). Ainda depende de ação de UI o clique efetivo no diálogo “Salvar como”, e o item `ipc: ipc.localhost` vs `ipc: http://ipc.localhost` segue em observação — não foi bloqueado neste dev, mas o Douglas deve confirmar no Windows.
- [ ] **CSP de produção só é exercitada no binário de `tauri build`, não no dev:** gerar o binário sem instalador (`bundle.active = false`) e conferir o HTML/CSP final com os hashes/nonces injetados pelo Tauri; repetir salvar/carregar/excluir/exportar PNG/PDF no binário. Validar também se `invoke()` chega ao Rust com `connect-src 'self' ipc: ipc.localhost` e, sobretudo, se aparece o aviso `IPC custom protocol failed... postMessage interface instead` no console do Windows — nesse caso o invoke pode funcionar via `postMessage`, mas o ponto vai ao Tyago para decisão sobre trocar para `ipc: http://ipc.localhost`. Se `asset://` entrar em alguma versão futura, validar no build se `asset:` precisa constar explicitamente em `img-src`/`font-src` — hoje a CSP só tem `'self' data: blob:` e `font-src 'self' data:`; não acrescentar nada às cegas.
- [ ] Confirmar que `opendesign.db` aparece no appDataDir (`app_config_dir`) e **não** dentro de `OpenDesign/`.
- [ ] Confirmar que nenhum segredo aparece em strings do binário final.
- [ ] Re-testar o `dist/` isolado (Heitor), inclusive o carregamento de `/__clawnify/presence.js`, root-relative.
- [ ] **Não criar release nem tag** sem OK explícito do Tyago.

## 6. Fora do escopo / não feito

- **Estado atual da CSP: aprovada explicitamente pelo Tyago e aplicada** em `src-tauri/tauri.conf.json` (`csp` + `devCsp`, ver §1). Não há proposta pendente, não há “aguardando Tyago” e não há reversão ativa. Houve uma reversão temporária enquanto a decisão aguardava, já superada; qualquer mensagem antiga nesse sentido é rascunho superado (confirmações na bridge: entrega das 6 decisões pelo Rafael e confirmação de aplicação pelo Heitor às 18:04). Release/tag seguem bloqueados até OK explícito.
- **Nenhum instalador nesta fase** (decisão do Tyago nas dúvidas 4/8 e 7/8 do Douglas): `bundle.active = false` no canônico `src-tauri/tauri.conf.json`, para o smoke test local do `.exe` cru. **Não alterar** esse valor. MSI/NSIS serão gerados somente no CI, por um `--config` de override que a Manuela vai criar no workflow. O bloco `targets: "all"` foi preservado. `targets: "none"` **não** é valor válido no schema do Tauri 2; a forma correta é `active: false` (ou `--no-bundle` na CLI).
- Não adicionei `@tauri-apps/plugin-fs` (npm), novos comandos Rust de design, sidecar/`externalBin` nem qualquer dependência. A eventual entrada de `tauri-plugin-fs` (Rust)/`asset://`, anunciada em repasse, segue dependendo de confirmação direta do Tyago neste canal; não alterei `Cargo.toml`, capability nem `assetProtocol`.
- Não escrevi `docs/coordenacao.md` da LIMPABYTE nem qualquer outro arquivo fora de `OpenDesign/` (Dúvida 3/4 confirmada: reporte só pela bridge).
- Não editei `src-tauri/src/lib.rs` (área do Luan), `Cargo.toml`, `wrangler.toml`, `package.json`, o config raiz nem qualquer arquivo fora de `OpenDesign/`. Na **fase de segurança** não toquei em `src/client/`; na **tarefa de tradução do Kanban** editei somente textos visíveis em `src/client/`, `src/server/`, `README.md`, `agent.md` e `manifest.json`, todos dentro de `OpenDesign/`.
- Não rodei `npm install`, `tauri dev` nem `tauri build`; executei apenas o `npm run build` do frontend (autorizado pelo Tyago), `npm test`, o teste isolado de `local-db`, o `cargo check --offline` (pedido pelo Luan) e a inspeção dos artefatos gerados. O fechamento repassado pelo Rafael corrobora `build` OK, 14/14 + 3/3 testes e `tsc` sem erros novos; o `cargo check` foi revalidado com exit 0 pelo Luan depois da correção do config. O smoke real no binário de release fica com o Douglas; o `tauri dev` dele já compilou, rodou o `app.exe` e não mostrou violações de CSP.
- Não houve commit, push, publish ou criação de conta.
- `target/`: recomendação **já executada pelo Luan** em `OpenDesign/.gitignore`, confirmada com `git check-ignore -v` (o `src-tauri/.gitignore` só cobria `src-tauri/target/`; o workspace Cargo gera `OpenDesign/target/`).
