---
id: QA-GOLIVE-OPENDESIGN-DESKTOP
data: 2026-11-20
responsavel: AG-09 (Revisora de Go-Live) — apoio ao time da Renata
status: REPROVADO — GO-LIVE DO APP DESKTOP NÃO APROVADO (rodada 1)
projeto: OpenDesign (Tauri 2 + Preact + Fabric.js)
---

# OpenDesign Desktop — Checklist de Go-Live (AG-09) — Rodada 1

> Pedido registrado na bridge (reenviado; vale a versão corrigida): empacotar o
> OpenDesign como app desktop via Tauri e fazer QA final antes do Tyago liberar. Escopo estrito:
> **somente `C:\Users\tyago\Projeto\bloaudhab\OpenDesign\`**. Nada publicado, nada
> commitado, nenhuma conta criada. Não escrevi no `docs/coordenacao.md` do LIMPABYTE
> justamente porque ele fica fora da pasta autorizada — a resposta vai pela bridge.

## Coordenação — AVISO DO TYAGO (2026-11-20) — regra definitiva

- **HUGO, GAEL e PAULA NÃO existem** como agentes, responsáveis ou canais de
  coordenação. **Não endereçar mensagens a nenhum dos três, não aguardar
  resposta e não incluí-los em decisões ou encaminhamentos.** A instrução antiga
  "coordene com Gael, Paula e Hugo pela bridge do escritório" foi **removida do
  Kanban** e não vale mais.
- **Coordenação técnica: Renata (líder do projeto) e este canal do Tyago.**
  **Decisões finais somente com o Tyago.**
- Regras inalteradas: **nada fora de `OpenDesign/`**, **zero
  commit/push/publish/tag/release sem OK explícito do Tyago**.
- Efeito neste documento: todas as atribuições antigas a "Hugo" (inclusive
  respostas às dúvidas 1/8–8/8 e o alerta do lote antigo) são **registro
  histórico sem autoridade de decisão**. O que vale é o que foi **conferido em
  disco** e as **decisões do Tyago**. Nenhuma mensagem nova será enviada a esses
  nomes. A contradição de canal que eu vinha registrando está, assim, **fechada**.

## Veredito

**GO-LIVE NÃO APROVADO.** O frontend compila, mas o app desktop como está **não
abre com dados e não cria design**: todo o estado vem de `/api/...` (Hono/Workers +
D1/R2), que não é empacotado no Tauri. Somam-se a isso (a) um `tauri.conf.json`
duplicado na raiz que faz `tauri build` falhar com `No package info in the config
file`, e (b) ausência do linker MSVC (`link.exe`), sem o qual nenhum binário
Windows é gerado. Mac não é verificável nesta máquina Windows.

## O que eu executei

| # | Verificação | Resultado | Evidência |
|---|---|---|---|
| 1 | Pasta e estrutura Tauri existem | **PASS** | `OpenDesign/src-tauri/` com `Cargo.toml`, `build.rs`, `main.rs`, `lib.rs`, `capabilities/default.json`, `icons/` (ico/icns/png), `tauri.conf.json`. `@tauri-apps/cli` 2.12.6 em `devDependencies` e instalado. |
| 2 | `npm run build` (frontend) | **PASS** | Vite 6.4.1: 6337 módulos, `✓ built in 13.50s`. `dist/index.html` com `./assets/index-BKUPdBQB.js` (591,10 kB) + `./assets/index-Jgtuai0F.css` (35,26 kB). Único aviso: chunk > 500 kB (não bloqueia). **Eu rebuildei** — os hashes acima são os atuais (o build anterior das 14:13 tinha `index-CGsfi5vL.js`/`index-CJd7XLs_.css`). |
| 3 | Toolchain Rust | **PASS (parcial)** | rustc/cargo 1.100.0 em `%USERPROFILE%\.cargo\bin` (não estão no PATH global); `Cargo.toml` pede `rust-version = 1.90` → compatível. WebView2 157.0.4341.60 instalada. |
| 4 | Dependências de sistema para build Windows | **FALHA** | `tauri info`: `✘ Couldn't detect any Visual Studio or VS Build Tools instance with MSVC and SDK components.` WiX (`candle`) e NSIS (`makensis`) ausentes. `tauri build` (de `src-tauri/`): `error: linker 'link.exe' not found` → `failed to build app`. |
| 5 | `tauri build` a partir da raiz `OpenDesign/` | **FALHA** | `Error No package info in the config file`. Causa: existiam dois configs (o da raiz é scaffold legado, com `$schema: "../node_modules/..."`, e não encontra o `Cargo.toml`). Rodando de `src-tauri/` o erro muda para o `link.exe` (item 4). *Situação da rodada 1 — resolvida; ver devolução 3/8 abaixo.* |
| 6 | Instalador Win/Mac gerado | **FALHA** | Nenhum `.exe`, `.msi`, `.app` ou `.dmg` gerado (build morreu no linker). `bundle.targets = "all"` também pede targets de macOS — impossível de validar numa máquina Windows, e sem assinatura/notarização. |
| 7 | Abrir o app e usar a interface | **FALHA (funcional)** | Não há binário para abrir. Mesmo que houvesse, o frontend depende de API ausente (item 8). Não consegui exercitar "abrir". |
| 8 | Criar design / salvar / listar designs | **FALHA (bloqueio de arquitetura)** | `src/client/hooks/use-designs.ts`: `GET /api/designs`, `POST /api/designs`, `PUT /api/designs/:id`, `PUT /api/pages/:id`, etc. — todos via `api()` → `fetch(path)` em `src/client/api.ts`. O backend é `src/server/index.ts` (Hono + D1/R2, roda no `wrangler dev --port 8787` e é proxyado por Vite **somente no dev** via `vite.config.ts`). **Nada disso entra no `frontendDist`.** `createDesign()` engole o erro (`console.error`) e retorna `undefined` — a falha é silenciosa para o usuário. Mesmo `fonts.ts`, `brand-kit-panel.tsx`, `left-sidebar.tsx` e `kit-transfer.tsx` chamam `/api/fonts`, `/api/uploads`, `/api/brand-kits`. |
| 9 | Exportar PNG/PDF | **NÃO EXERCITÁVEL** (código client-side OK) | `src/client/lib/export.ts`: `renderPageToPNG` (Fabric `toDataURL`), `downloadDataURL` (via `<a download>`), `buildCarouselPDF`/`exportPagesToPDF` (jsPDF importado sob demanda). Não depende da API — **mas** sem design carregado (item 8) não há canvas para exportar. Ainda não sei se `<a download>` funciona no WebView Tauri sem permissão de download; precisa de teste manual pós-correção. |
| 10 | Persistência local offline | **FALHA** | Só `localStorage["opendesign:auto-save"]` (preferência), nenhum dado de design em disco. Sem backend, fechar e reabrir perde tudo. |
| 11 | Config de segurança / permissões | **ATENÇÃO** | `capabilities/default.json` = `core:default` (bom: menor privilégio). **Divergência do briefing:** o pedido citava `api-all` no `Cargo.toml`, mas o arquivo real tem `tauri = { version = "2.12.7" }` sem features — não vou adicionar `api-all`; manter `core:default`. CSP atual: `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, `connect-src 'self' http://localhost:* ws://localhost:*` — permissiva demais para produção desktop e, de todo modo, **não resolve** o item 8 (o `/api` não existe no protocolo do app). `@tauri-apps/api` JS não instalado. **Correção (conferida em disco):** a afirmação "nenhum `__TAURI__` no código" estava **errada** — existem **12 referências a `window.__TAURI_INTERNALS__`** (`tauri.ts` 2, `tauri-bridge.ts` 5, `local-db.ts` 4, `local-db.test.ts` 1). É esse mecanismo interno que o adaptador usa para os invokes e que `connect-src ipc:` libera. CSP descrita nesta linha é a **antiga (rodada 1)**; a vigente está em `src-tauri/tauri.conf.json:43` e no header runtime (seção da rodada 2). |
| 12 | Identidade/ícones | **PASS** | `src-tauri/icons/` tem `icon.ico`, `icon.icns`, `icon.png`, 32/128/@2x e os ícones quadrados do Windows; `bundle.icon` aponta para arquivos existentes **relativos a `src-tauri/`**. |
| 13 | Repositório limpo | **PASS** | `git status --short -- OpenDesign` → `?? OpenDesign/` (pasta ainda untracked no repo `bloaudhab`). Nada comitado. Nenhum arquivo fora de `OpenDesign/` foi criado/editado por mim. |

## Decisão (Go / No-Go)

| Condição | Estado |
|---|---|
| Binário Windows gerado e instalável | ❌ (linker/WiX/NSIS ausentes) |
| App abre e carrega dados | ❌ (sem backend) |
| Criar design funciona | ❌ (`POST /api/designs` não existe no desktop) |
| Exportar PNG/PDF funciona de ponta a ponta | ❌ (não exercitável sem design; download em WebView não testado) |
| Instalador Mac verificado | ❌ (máquina Windows; sem assinatura/notarização) |
| Build frontend verde | ✅ |
| Estrutura/ícones/Tauri CLI presentes | ✅ |
| **OK do Tyago** | ❌ (não pedi, não dei por ele) |

## Devolução por responsável

- **Arquitetura de persistência (decisão do Tyago, já aplicada):** opção (a)
  aprovada — `api.ts` desvia para `localApi()` quando `isTauri()`;
  `local-db.ts` (Daniela) usa `sqlite:opendesign.db` no `app_config_dir` via
  `tauri-plugin-sql`. **Não** é `@tauri-apps/plugin-fs` (dependência não
  autorizada) e a opção (b), backend remoto, está **rejeitada** — sem URL
  base/conta e sem `connect-src` para host externo. (Registro histórico: minha
  recomendação inicial na dúvida 2/8 citava `plugin-fs`; corrigida aqui.)
- **Config duplicada — RESOLVIDA (dúvida 3/8, autorização executada):** o scaffold
  legado `OpenDesign/tauri.conf.json` foi movido para
  `OpenDesign/docs/tauri.conf.raiz-legado.json.bak` (preservado, não apagado).
  Canônico: **`OpenDesign/src-tauri/tauri.conf.json`**. Todo comando Tauri —
  `tauri build`, `tauri dev`, `cargo check` — deve ser executado dentro de
  `OpenDesign/src-tauri/`. Conferido em disco: raiz sem o arquivo e `.bak`
  presente. Os dois arquivos **não eram idênticos**: o da raiz apontava
  `bundle.icon` para `src-tauri/icons/...`, o canônico para `icons/...`. Não
  toquei em `src-tauri/tauri.conf.json` (domínio do Emanuel).
  **Reconferido em disco agora (apos repasse antigo à Renata dizendo que a raiz
  ainda tinha o arquivo e que a mudança era minha):** `OpenDesign/tauri.conf.json`
  está **AUSENTE**; `docs/tauri.conf.raiz-legado.json.bak` existe (1.514 bytes,
  14:24:03, SHA-256 `19701F7F…0BB98`); canônico em `src-tauri/tauri.conf.json`
  (1.693 bytes, 15:16:06, SHA-256 `3434C5E8…5EDFF2`). **Não há nada para mover**
  — a afirmação repassada à Renata está desatualizada e deve ser corrigida.
- **Tyago:** instalar **Visual Studio Build Tools 2022 com "Desktop development
  with C++"** (MSVC + Windows SDK) na máquina de build; instalar WiX/NSIS se o
  target for `all`, ou restringir `bundle.targets` ao que realmente será entregue.
  Sem isso não há `.exe`/`.msi`.
- **Quem for cuidar de Mac:** validar em macOS real (não dá daqui), com
  signing/notarização se houver distribuição.
- **AG-09 (eu):** rodada 2 assim que houver binário + adapter local: instalar no
  Windows, abrir/splash, criar design, editar, salvar, carregar, excluir,
  fechar/reabrir (persistência), exportar PNG e PDF, checar permissões e o
  `<a download>` no WebView.
- **Checagem de CSP (aviso de mudança 2026-11-20):** conferir no console por
  `Refused to ...` e qualquer violação de CSP, com foco em produção sem
  `unsafe-inline`/`unsafe-eval` em `script-src` e sem `localhost:*` no
  `connect-src` (com `ipc: ipc.localhost` explícito); HMR restrito ao `devCsp`.
  Conferência em disco já confirmou essa configuração aplicada em
  `src-tauri/tauri.conf.json`. **Qualquer bloqueio → avisar antes de falar em
  release**; nada de publicar/commitar/tagar até OK explícito do Tyago.
- **Falha de persistência deve aparecer na UI (item pedido, 2026-11-20):** na
  rodada 2, forçar falha de gravação e confirmar que o erro chega ao usuário,
  não só ao console do WebView. Em disco `use-designs.ts:32-39` já tem
  `reportFailure()` com `console.error` + `setError`, e `createDesign` (`:129-141`)
  chama esse caminho — verificar se o estado de erro é realmente renderizado.
- **Pendências do lote antigo já fechadas (confirmado em disco):** `/api/fonts`
  e `/api/uploads/*` cobertos por `local-db.ts` (tabela `uploads`, DDL em `:56`,
  `installLocalAssetFetch()` em `api.ts:5`); único 404 residual é
  `/__clawnify/presence.js` (feature do Clawnify, inofensiva no desktop); script
  `dev:desktop: vite` existe no `package.json`. Não reabrir esses itens.

## Decisões do Tyago (repassadas 2026-11-20) — aplicação no QA

- **6/8 CSP:** encerrada como decisão; meu papel é **validar**, não editar
  (`tauri.conf.json` é do Emanuel). Validação prévia feita agora: **0** ocorrências
  de `eval(` / `new Function(` nos `.js` de `dist/assets` e **nenhum** `<script>`
  inline em `dist/index.html` (só o `<script type="module" crossorigin>` externo).
  Config em disco já endurecida: `script-src 'self'`, `connect-src 'self' ipc:
  ipc.localhost`, sem `unsafe-*`/`localhost:*`; HMR restrito ao `devCsp`.
- **4/8 e 7/8 — artifact desta fase:** **`.exe` cru, sem instalador** (nenhum MSI,
  NSIS, WiX, `.app`, `.dmg`, assinatura ou notarização). Formato de entrega será
  decidido depois, só com OK explícito do Tyago. Correção técnica registrada:
  **`"targets": "none"` é inválido no schema Tauri 2**; a forma correta é
  `"bundle": { "active": false }` (ou `tauri build --no-bundle`). Corrigi meu
  registro anterior que marcava `targets: "all"` como divergência — o controle
  efetivo é `active: false`, já aplicado pelo Emanuel. WiX/NSIS não precisam ser
  instalados agora. Build roda dentro de `OpenDesign/src-tauri/`; saída prevista
  em `OpenDesign\Release` (pasta existe). Toolchain confirmado: `link.exe` MSVC
  14.44, Windows SDK 10.0.26100.0, `cargo check --offline` exit 0. Se `tauri info`
  ainda acusar MSVC ausente, é PATH de terminal antigo — reabrir ou usar caminho
  completo. Não instalei nada adicional.
- **fonts/uploads:** as 4 rotas entram no escopo da rodada 2. Implementação
  encontrada em disco é **SQLite** (`local-db.ts`: tabela `uploads` +
  `installLocalAssetFetch()`), **não** "Tauri FS + asset://" como diz o repasse;
  `@tauri-apps/plugin-fs` não está autorizado como dependência nova. Pedir
  confirmação da Renata/Daniela sobre a descrição — funcionalmente as rotas estão
  cobertas e serão testadas.
- **6ª decisão (`beforeDevCommand`):** o literal pedido é `pnpm exec vite`; em
  disco está `npm run dev:desktop` (cujo script é `vite`). Equivalente em
  comportamento (Vite puro, sem Wrangler), mas não literal — alinhar com
  Renata/Emanuel antes da rodada 2.
- **5/8 permissões — confirmado, sem `api-all`:** manter `core:default`, por
  **princípio do menor privilégio** e porque **`api-all` é conceito do Tauri 1**
  (feature do `Cargo.toml`); no **Tauri 2** as permissões são declaradas nas
  *capabilities*, e o Tyago não autorizou nada amplo. Estado conferido em disco:
  `Cargo.toml` = `tauri 2.12.7` sem features + `tauri-plugin-log`,
  `tauri-plugin-sql` (sqlite) e `tauri-plugin-dialog`;
  `capabilities/default.json` = `core:default` + `dialog:allow-save` (aprovada)
  + `sql:allow-execute`/`allow-load`/`allow-select`. É o estritamente necessário
  para gravar localmente, abrir "Salvar como" e escrever exports. **Se o QA
  identificar permissão faltante**, pedir o comando/plugin exato pela bridge —
  nunca substituir por `api-all`, `core:*` ou qualquer permissão curinga.
- **Validação do build/CSP (Emanuel AG-05, 2026-11-20):** CSP final aplicada;
  `npm run build` exit 0 (6342 módulos), `dist/index.html` sem `<script>` inline e
  com assets relativos; varredura 0 `eval(`, 0 `new Function(`, 0
  `sk-/AKIA/ghp_/api_key`; único aviso é chunk grande (não segurança);
  `public/splashscreen.html` só tem `<style>` inline. **Contingência de smoke
  test:** `ipc: ipc.localhost` foi aplicado literalmente como aprovado, mas a
  documentação do Tauri 2 costuma mostrar `http://ipc.localhost`. Se o console
  acusar bloqueio de `connect-src` no Windows, a correção é trocar para
  `ipc: http://ipc.localhost` — o Emanuel aplica; **eu não edito a config**.
- **Artifact atual pode estar desatualizado:** `OpenDesign\Release\OpenDesign.exe`
  existe (13.977.600 bytes, SHA-256 `209094AC…`), mas com timestamp **15:16**,
  anterior ao `dist/index.html` (**15:20**). Gerar binário novo antes do smoke
  test para não validar bytes velhos.
- **Divergência de hash do build (registrada 2026-11-20):** o Emanuel relatou
  `npm run build` exit 0 com chunk `index-BbaaXGLk.js` (606,68 kB), mas conferência
  em disco agora mostra **somente** `index-Bwi-_kH8.js` (612.603 bytes, 15:20:40)
  em `dist/assets`, e nenhum `index-BbaaXGLk.js` em todo o projeto. Não dá para
  afirmar qual é a origem (build reverterdo, diretório diferente ou snapshot
  antigo no repasse). Resolução: **não validar nenhum dos dois** — gerar build
  novo a partir do código atual dentro de `OpenDesign/src-tauri/` e validar os
  bytes frescos. `dist/` é artefato de build (domínio do Heitor); regenerei via
  `pnpm build` como etapa de QA, sem editar fonte de ninguém.
- Não editei `tauri.conf.json`, `Cargo.toml` nem qualquer arquivo de outro dono.
  Zero commit/push/tag/release/publicação.

## Notas honestas

- Rodei `npm run build` e `tauri build` localmente; ambos geraram/alteraram apenas
  arquivos dentro de `OpenDesign/` (`dist/`, `src-tauri/target/`, ambos gitignored).
- **Não** rodei `npm install`, `tauri init`, `npm audit fix`, `tauri dev` com servidor,
  nem qualquer comando de publicação/assinatura.
- **Não** toquei o repositório Habblaud fora da subpasta `OpenDesign/`, não commitei
  e não criei contas externas.
- Esta é a rodada 1 do app desktop; a reprovação do LimpaByte (rodada 3) continua
  separada e não foi alterada por aqui.

## Atualização de escopo (registro histórico, 2026-11-20)

- A redação da chamada foi corrigida: onde dizia "nada em `bloaudhab`", o
  correto é **"nada FORA da pasta `C:\Users\tyago\Projeto\bloaudhab\OpenDesign\`"**.
  A pasta `OpenDesign/` está **liberada para leitura e escrita**; todo o restante
  de `bloaudhab` continua proibido. A Camila apontou a contradição.
- Isso **confirma** a interpretação que já estava sendo usada nesta rodada: só
  escrevi `OpenDesign/docs/qa-golive-desktop.md` e rebuildei `dist/` e
  `src-tauri/target/` dentro da pasta. Nenhuma alteração de procedimento.
- Dúvida 1/8 (escopo) marcada como **RESPONDIDA**; confirmação enviada pela bridge
  (HTTP 201, mensagem `m-mwp9adiu-71-pWzJbmiLQsQJ`). As dúvidas 2 a 8 foram
  fechadas por **conferência em disco e decisões do Tyago**, não por atribuição a
  canal inexistente (ver AVISO no topo). Go-live segue NÃO APROVADO.

## Atualização de estado (cartão "Rafael / 39 mensagens", registro histórico, 2026-11-20)

Leitura somente da bridge/fila (`hugo-queue-live.json`, 58 mensagens) — nenhum
despacho em massa feito por mim. Verificado:

- **Alerta crítico:** `C:\Users\tyago\AppData\Local\Temp\opencode\send-bridge-replies.cjs`
  (lote das 17:49) está **desatualizado** e já causou dano: o Emanuel reaplicou a
  CSP endurecida e a reverteu por causa dele (seq 5843), o Luan flagrou o dano
  (seq 5939), e só às 18:02 a CSP aprovada foi reaplicada (seq 5920). O script
  também afirma coisas hoje falsas ("ninguém instalou Build Tools", "diálogo
  Salvar como aguarda OK"); **acertou**, porém, ao dizer que Gael/Paula/Hugo não
  existem — agora confirmado pelo AVISO do Tyago. **Não rodar.** Registro
  histórico: aviso enviado na bridge antes desse AVISO (HTTP 201, mensagem
  `m-mwpaubnc-329-h84hDn9gGkMS`); **não reenviar**.
- **Minhas 8 dúvidas (AG-09): todas respondidas** — 2/8 adaptador local + SQLite;
  3/8 `tauri.conf.json` da raiz movido para `docs/`; 4/8 Build Tools instalado e
  Tyago decidiu `bundle.active=false` / sem instaladores nesta fase (seq 6062);
  5/8 `core:default`; 6/8 CSP aprovada e aplicada (seq 5920); 7/8 sem Mac nesta
  fase; 8/8 export via Rust + diálogo "Salvar como" aprovado e implementado.
- **Mudanças de estado que afetam a rodada 2:** adapter local em `api.ts` +
  `local-db.ts` (SQLite) já ligado; `dev:desktop: vite` em `package.json`;
  `beforeDevCommand="npm run dev:desktop"`; `cargo check --offline` passou
  (exit 0, 13 warnings); CSP de release fechada; instalação de Build Tools
  concluída. Ainda sem binário de installer (decisão do Tyago). `fonts/uploads`
  entra nesta rodada por decisão do Tyago (seq 5809) — pendente de implementação.
- Não dupliquei despacho aos agentes (Rafael/Renato já cobriram) e não
  assumi decisões de terceiros. **Veredito inalterado: GO-LIVE NÃO APROVADO**
  até a rodada 2 com binário + persistência validada. Nada commitado/publicado.

### Reenvio do lote antigo (texto idêntico, 2026-11-20)

- Recebi novamente o consolidado 2/8–8/8 do `send-bridge-replies.cjs` ("3/8
  depende de decisão formal", "4/8 aguarda autorização", "6/8 decisão pendente",
  "7/8 aguardando decisão", "8/8 diálogo depende de OK"). Conferência em disco
  agora: **3/8** `tauri.conf.json` da raiz removido e `docs/tauri.conf.raiz-legado.json.bak`
  presente; **4/8** Build Tools instalado, `bundle.active=false` (sem instaladores
  nesta fase); **6/8** CSP aprovada e aplicada (`script-src 'self'`, `connect-src
  'self' ipc: ipc.localhost`); **7/8** sem targets Mac/assinatura nesta fase;
  **8/8** `tauri-plugin-dialog` + `dialog:allow-save` presentes; além disso
  `beforeBuildCommand = pnpm build`. Itens **2/8** (adaptador local + SQLite) e
  **5/8** (`core:default`, sem `api-all`) seguem válidos. Nada foi alterado em
  resposta a esse reenvio.

- **Terceira reentrega (Rafael, mesmo lote, assinatura diferente):** manteve 6/8
  como "aguardando OK do Tyago" e 7/8 como "decisão pendente". **Incorreto e
  perigoso** — a CSP já está aprovada e aplicada, e `bundle.active=false` já
  resolveu instaladores/targets nesta fase. Reverificado em disco nesta rodada:
  `link.exe` MSVC 14.44 existe, `csp` produção sem `unsafe-*`/`localhost:*`,
  `devCsp` com HMR, `tauri-plugin-dialog = "2"` presente, raiz do
  `tauri.conf.json` removida. **Tratar 6/8 e 7/8 como pendentes faria o Emanuel
  reverter a CSP de novo.** Nenhuma ação tomada a partir dessa mensagem.

## Rodada 2 — smoke test no binário fresco (2026-11-20, AG-09)

### Build e artefato

- Build executado **dentro de `OpenDesign/src-tauri/`** com ambiente explícito
  (`vcvars64.bat` + `C:\Users\tyago\.cargo\bin` no PATH, porque o terminal comum
  não vê o `cargo`): `node .../@tauri-apps/cli/tauri.js build --no-bundle`.
  **EXIT 0**, 6342 módulos no frontend, `Finished release profile in 3m 28s`.
  13 warnings de `dead_code`/`unused_imports` em `commands.rs` — coerentes com a
  decisão de manter os comandos JSON do Luan **fora do caminho ativo**.
- Binário: `OpenDesign\target\release\app.exe` → copiado para
  **`OpenDesign\Release\OpenDesign-FRESH-20261120-1533.exe`**
  (13.979.136 bytes, 15:33:53, SHA-256
  `7F47B6D4FDAB2478EFF5EA35971A8A1AD74143CB5562A4C815DD02B42D63F7E1`).
- **`OpenDesign\Release\OpenDesign.exe` estava VELHO** (13.977.600 bytes,
  15:16:28, SHA-256 `209094AC…`) e travado pelo PID 20200 (outro agente). Não
  matei o processo de terceiros; cópia de segurança do antigo:
  `OpenDesign.exe.stale-20261120-1516.bak`. O processo foi fechado por outro
  agente e **o binário fresco foi promovido ao caminho canônico**:
  `Release\OpenDesign.exe` = 13.979.136 bytes, 15:33:53, SHA-256
  `7F47B6D4FDAB2478EFF5EA35971A8A1AD74143CB5562A4C815DD02B42D63F7E1`
  (idêntico ao `OpenDesign-FRESH-20261120-1533.exe`). **Bloqueio resolvido.**
- **Não reprodutível:** apareceram **5 hashes** de frontend em ~20 min —
  `index-Bwi-_kH8.js` (disco 15:20), `index-BbaaXGLk.js` (relatado pelo Emanuel),
  `index-BHWflTva.js` (meu `pnpm build`), `index-BR6iqW27.js` (disco 15:32:42) e
  `index-DbD7ieMa.js` (**realmente carregado pelo exe embutido**).
  `local-db.ts` foi modificado às 15:31:56, logo antes do dist das 15:32:42:
  há edição concorrente ativa. O exe embute um frontend diferente do `dist/`
  atual — **sem code freeze não há artefato rastreável**.

### CSP e segurança — PASSOU (Validação real, não só estática)

- Header HTTP real em `http://tauri.localhost/`:
  `script-src 'self' 'sha256-DM3G/…' 'sha256-SXUeg…' 'sha256-UX9r…';
  font-src 'self' data:; default-src 'self'; img-src 'self' data: blob:;
  connect-src 'self' ipc: ipc.localhost; style-src 'self' 'unsafe-inline'`.
  Sem `unsafe-inline`/`unsafe-eval` em `script-src`, sem `localhost:*` em
  `connect-src` — exatamente a decisão do Tyago. **`font-src 'self' data:` está
  presente** tanto em `tauri.conf.json:43` quanto nesse header capturado em
  runtime: a "lacuna" alegada no reenvio da dúvida 4/8 está **fechada** (não é
  preciso mudar a CSP). Falta apenas o teste funcional abaixo.
  **Reconferência final (repasse ao Tyago dizendo que `csp`/`devCsp` ainda não
  tinham o `font-src`):** falso. `src-tauri/tauri.conf.json` íntegro desde
  15:16:06, SHA-256 `3434C5E8EC2E95581E9C48FCFFCB50EDB6C6746FB7950755EDFF2`;
  `font-src 'self' data:` aparece em **`:43` (csp) e `:44` (devCsp)**. **Não
  reaplicar**: editar a config agora mudaria o hash e exigiria novo rebuild,
  atrapalhando o code freeze. O teste de fonte customizada segue **não iniciado**
  — mas pelo bloqueio real (code freeze/rebuild + divergência fonts/uploads), não
  por falta de `font-src`.
- Teste válido: `<script>` inline injetado via **DOM** foi **bloqueado** (flag
  ficou `0` + `Log.entryAdded` de segurança). O teste via `eval()` no CDP foi
  descartado porque o protocolo bypassa CSP.
- **`ipc: ipc.localhost` funciona no Windows**: `invoke('app_ready')` retornou
  `ok: true`, zero `Refused to ...` em toda a sessão. **Não é necessária** a
  contingência `http://ipc.localhost` do Emanuel.
- Zero erros/violações de console em todo o smoke funcional. **Não apareceu** o
  aviso `IPC custom protocol failed... postMessage interface instead` citado em
  `SEGURANCA.md:80`.
- Itens do parecer do Emanuel já **atendidos pela rodada 2** (registrado aqui
  para não reabrir; não editei `SEGURANCA.md`, que é dele):
  - `SEGURANCA.md:80` (`- [ ]`): "CSP de produção só é exercitada no binário de
    `tauri build`" — feito: binário sem instalador, header com hashes injetados,
    salvar/carregar/excluir/exportar repetidos no `.exe`, `invoke()` chegou ao Rust.
  - `SEGURANCA.md:79`: observação `ipc: ipc.localhost` vs `http://ipc.localhost`
    — **fechada**: funciona no Windows, sem bloqueio de `connect-src`.
  - Limitação já conhecida e mantida: clique efetivo no diálogo nativo "Salvar
    como" não foi exercitado (modal); export testado via invoke com `destination`.

### Funcional — PASSOU no binário fresco

Executado via CDP do WebView2 (porta isolada + user-data-dir separado):

| Cenário | Resultado |
|---|---|
| Abrir app / splash → janela principal | OK — UI renderizou |
| Criar projeto ("Novo projeto") | **0 → 1**, navegou para `/design/<id>` |
| Persistir após recarregar | **OK** — "Projeto sem título" continuou na lista |
| Carregar projeto | OK — último design reaberto, lista do SQLite populada |
| Excluir projeto | **1 → 0** |
| Exportar PNG via `export_png` | **OK** — 70 bytes gravados em disco |
| Exportar PDF via `export_pdf` | **OK** — 218 bytes gravados em disco |
| Erro de persistência na UI | **Não validável no artefato atual**: tentei forçar falha via CDP (patch de `invoke` antes/depois do load, `APPDATA` isolado, DB corrompido) e o banner não apareceu. Causa raiz provada em disco: o exe embute `index-DbD7ieMa.js`, que **não contém** `[use-designs]` / `Não foi possível criar` / `Fechar aviso` / `bg-red-600`; o `dist/` vigente (`index-BHWflTva.js`) contém as quatro. O fix do Heitor é posterior ao exe — nenhum patch de runtime faria o banner aparecer. Revalidar só após rebuild com code freeze. |
| Diálogo nativo "Salvar como" | **Não exercitado** (abriria diálogo modal); export testado via invoke direto com `destination` |
| Fonte customizada salva como DataURL recarregar depois | **Não executado** — item do checklist para a rodada 3. A CSP já permite (`font-src 'self' data:`), então é teste de round-trip da Daniela, não de CSP |

Efeito colateral do smoke: um design de teste "Untitled Design" foi excluído e
um "Projeto sem título" foi criado no `app_config_dir` compartilhado. São dados
de teste, não produção.

### Auditoria do fluxo de exportação (dúvida 8/8, conferida em disco)

- Caminho normal no desktop confirmado: `isTauri()` → `pickSavePath()`
  (`plugin:dialog|save`) → `saveDataURLNative()` → `export_png`/`export_pdf` →
  Rust `fs::write`. Evidências: `lib.rs:87-91`, `Cargo.toml:30`,
  `capabilities/default.json:11`, `commands.rs:21,300-305` (teto de 64 MB),
  `export.ts:30-59` e `export.ts:104-110` (`jsPDF.save()` evitado no desktop;
  PDF de carrossel = **um** arquivo/**um** diálogo). **Não precisa** de plugin
  de download nem de novo invoke.
- `<a download>`/`link.click()` é apenas fallback: browser/dev (`isTauri()`
  falso), data URL fora do regex aceito, ou falha do diálogo **e** do invoke.
  Com diálogo aceito e gravação falhando, `export.ts:40-44` só emite
  `console.error` e retorna — **sem aviso na UI**; cancelar (`:36`) retorna
  silenciosamente.
- **Achado registrado (não exercitado no smoke):** `use-canvas.ts:508-520` —
  `exportAllPNG` dispara **um diálogo nativo por página**, escalonado em
  `i * 250 ms`, **sem aguardar o anterior**. No desktop isso pode sobrepor
  diálogos; uma falha/cancelamento individual só é logada e a página some sem
  aviso. **Decisão (Tyago, resposta à dúvida 3): a Renata decide** entre gravar
  num diretório único ou documentar como limitação conhecida; o desfecho dela é
  suficiente e **não volta ao Tyago**. Douglas apenas registra o desfecho e
  exercita o cenário no smoke. Não alterei código (arquivo é de outro agente).
  - **Cenário incluído no smoke:** com um design de 2+ páginas, acionar
    "Exportar todas as páginas em PNG"; contar diálogos e arquivos gerados,
    cancelar uma página e verificar se as demais gravam e se há aviso na UI;
    registrar se o comportamento bate com a decisão da Renata.
- `ipc: ipc.localhost` **(fechado):** no smoke do binário real, `invoke()` chegou
  ao Rust e **não** apareceu o aviso `IPC custom protocol failed... postMessage
  interface instead`. Não trocar a CSP; `docs/tauri-bridge-ag07.md:77` só autoriza
  `ipc: http://ipc.localhost` se o aviso aparecer **e** com OK do Tyago.

### Bloqueios para go-live

1. **Fontes/uploads não implementados como decidido.** `local-db.ts` (15:31)
   chama `plugin:fs|mkdir` → **`Command plugin:fs|mkdir not allowed by ACL`** e
   `plugin:path|resolve_directory` → **`invalid args directory: invalid type:
   string "AppConfig", expected u16`**. `Cargo.toml` não registra
   `tauri-plugin-fs`/`tauri-plugin-path`; `capabilities/default.json` não tem
   `fs:*`/`path:*`. Existe fallback explícito para tabela `uploads` + data URLs
   ("enquanto plugin FS/capability/config não estiverem disponíveis"). Ou seja,
   a decisão do Tyago ("Tauri FS + asset://") **está degradada**, embora as 4
   rotas funcionem via fallback. Precisa de: plugin registrado + capability
   **exata** (nunca curinga) + argumento correto, ou decisão explícita do Tyago
   aceitando o fallback. Donos: Daniela (código) / Luan (Cargo/capabilities).
   **Atenção:** há decisão do Tyago em sentido contrário registrada em
   `docs/tauri-ci.md:32` — ver a seção "Contradição a resolver" abaixo antes de
   tratar este item como bloqueante.
2. **Artefato não rastreável** (5 hashes, exe ≠ dist) — exige code freeze e um
   único rebuild final.
3. ~~`Release\OpenDesign.exe` velho e travado~~ — **RESOLVIDO**: binário fresco
   promovido ao caminho canônico (hash `7F47B6D4…`). Revalidar se outro agente
   voltar a sobrescrever o arquivo antes da entrega.
4. `beforeDevCommand` permanece `npm run dev:desktop` (equivale a `pnpm exec
   vite`, mas não é o literal pedido) — alinhar com Renata/Emanuel.
5. Falha de persistência forçada e diálogo "Salvar como" ficam para a rodada 3
   após o freeze.

### Veredito da rodada 2

**GO-LIVE NÃO APROVADO.** O app passou no smoke técnico (CSP, IPC, CRUD,
exports, console limpo), mas os itens 1–3 acima são bloqueantes e o código ainda
está mudando. Nenhuma Tag/release/publicação/commit/push foi feito. Aguardando
correção dos bloqueios + **OK explícito do Tyago**.

## Release: rascunho por tag, publicação manual (decisão do Tyago, 2026-11-20)

- **Gatilho:** `push` em tag `v*` cria **release RASCUNHO**
  (`releaseDraft: true`); `workflow_dispatch` é **dry-run, sem release**.
- **Publicação é MANUAL e só depois de (1) meu QA final e (2) OK explícito do
  Tyago.** Este é o ponto a reforçar: **rascunho ≠ autorização de publicação**.
- Conferido em disco em `OpenDesign/.github/workflows/tauri.yml`: gatilho em
  `:24-31` (`tags: 'v*'` + `workflow_dispatch`), `tagName`/`releaseName` vazios
  no disparo manual (`:140-144`), `releaseDraft: true` em `:146`,
  `prerelease: false` em `:147`. O arquivo está em **rascunho no caminho final,
  NÃO commitado/pushado/tagueado/publicado** (`:5-7`). Detalhes em
  `OpenDesign/docs/tauri-ci.md:26-28`.
- **Regra operacional do QA (AG-09):** não criar/pushar tag `v*`, não criar
  release, não publicar, não transformar rascunho em publicado e não gerar
  instaladores de release sem **autorização explícita e nova do Tyago**. O
  `releaseDraft: true` reduz o risco de publicação acidental, **mas não substitui
  o OK**: a sequência continua `QA final → OK do Tyago → Publish manual`.
- O artefato local desta fase continua sendo o `.exe` cru em
  `OpenDesign\Release\OpenDesign.exe`; MSI/NSIS só no CI, via override
  `src-tauri/ci-build.json`, sem mexer no `bundle.active:false` canônico.
- **Escopo de plataforma (repassado como decisão do Tyago, conferido em disco):**
  `tauri.yml:42-43` tem **um único job `windows` em `windows-latest`**; não há
  `macos-*`/`linux` na matrix. Não vou tentar validar `.app`/`.dmg` nem aguardá-los
  — Mac/Linux estão **fora do escopo desta rodada**. Sem conta Apple, assinatura
  ou notarização.
- **O "problema real" alegado no repasse (bundle.active:false impediria MSI/NSIS
  no CI) NÃO existe na versão atual do workflow:** `tauri.yml:87-125` **gera em
  tempo de execução** `src-tauri/ci-build.json` a partir do config canônico, com
  `active: true` e `targets: ['msi','nsis']` (`:110-121`), e o build usa **um
  único** `--config src-tauri/ci-build.json` (`:153`). O arquivo está **ausente
  em disco local porque é criado no runner**, não por falha. Também **não existe
  `ci-signing.json`**: o `certificateThumbprint`, quando há secrets, entra no
  **mesmo** JSON de override (`:115-120`), conforme `docs/tauri-ci.md:70`. Não
  há o que corrigir/reenviar à Manuela por esse motivo; a alegação é de lote
  antigo. Nenhum MSI/NSIS foi gerado, baixado ou assinado por mim.

### Rodada 3 — alegado "build novo" é replay do build STALE (15:16)

Repasse recebido dizendo que houve `pnpm exec tauri build` novo, com
`Release\OpenDesign.exe` = 13,33 MB, SHA-256 `209094AC…8BDB2`. **Conferido em
disco (15:55): o hash alegado pertence ao backup antigo, não ao artefato atual.**

| Arquivo | Bytes | Mtime | SHA-256 | Frontend embutido |
|---|---|---|---|---|
| `Release\OpenDesign.exe` (artefato de registro) | 13.979.136 | 15:33:53 | `7F47B6D4…F7E1` | `index-DbD7ieMa.js` |
| `target\release\app.exe` (fonte) | 13.979.136 | 15:33:53 | `7F47B6D4…F7E1` | `index-DbD7ieMa.js` |
| `Release\OpenDesign.exe.stale-20261120-1516.bak` | 13.977.600 | 15:16:28 | **`209094AC…8BDB2`** | `index-BQaKmokg.js` |

- O log `opendesign-build-release.log` (última linha: `Finished release profile
  in 6m 32s`, `Built application at: ...\target\release\app.exe`) corresponde ao
  build **das 15:16**, que deu origem ao `.stale-...bak`. O build fresco das
  15:33 é o que está em `Release/` e **já passou no smoke da rodada 2**.
- **Não promovi nem vou promover o `.bak` stale sobre o exe atual**: isso
  rebaixaria o artefato. Nenhum exe novo foi gerado por mim nesta rodada.
- **Não iniciei smoke test sobre o hash alegado**: ele é o artefato antigo, já
  superado. Repetir o smoke no artefato atual também não resolve o bloqueio —
  ele já foi feito na rodada 2 e o código continuou mudando depois.
- Code freeze segue **quebrado**: `dist/` foi regerado às **15:52:07** com
  `index-BHWflTva.js`, enquanto o exe de registro embute `index-DbD7ieMa.js`.
  Só faz sentido um novo smoke **após** um rebuild único feito a partir de
  código congelado, com novo timestamp + SHA-256 e o hash do `dist/` anexado.

### Contradição a resolver antes do QA final (fonts/uploads)

- O repasse anterior (Rafael) dizia "Tyago decidiu **Tauri FS + asset://** para
  fonts/uploads". Porém `OpenDesign/docs/tauri-ci.md:32` registra a **decisão
  #7 do Tyago** como: **"Manter blobs SQLite em base64 + `data:` URLs; não
  converter para Tauri FS + `asset://`"** — exatamente o fallback que o
  `local-db.ts` já executa.
- Se a decisão vigente for a do `docs/tauri-ci.md`, os erros de
  `plugin:fs|mkdir` (ACL) e `plugin:path|resolve_directory` (arg `u16`) são
  **esperados e inofensivos**, e o item 1 dos bloqueios acima deve ser
  reclassificado de "bloqueante" para "comportamento correto". Se a decisão
  vigente for a do repasse, é bloqueante de verdade.
- **Não vou escolher entre as duas:** preciso de confirmação explícita **pelo
  canal do Tyago**, com Renata na coordenação técnica (Manuela/Daniela/Luan como
  técnicos, sem poder de decisão final). Até lá, o item segue marcado como
  **divergência de decisão**, e o veredito permanece **NÃO APROVADO**.
- **Permissões — NADA a adicionar nem a remover (reconferido com Emanuel,
  2026-11-20):** `capabilities/default.json` (intacto desde 14:53:55) tem exatamente
  `core:default`, `dialog:allow-save`, `sql:allow-execute`, `sql:allow-load`,
  `sql:allow-select`; `sql:allow-close` já fora. Uso real confirmado:
  `plugin:sql|select/execute/load` em `local-db.ts:66/71/80` e
  `plugin:dialog|save` em `tauri-bridge.ts:144`. **Não estou pedindo `fs:*` nem
  `path:*`**: se a decisão vigente for a do `docs/tauri-ci.md:32` (SQLite + data
  URL), os invoke `plugin:fs|*`/`plugin:path|*` em `local-db.ts` são caminho
  morto/divergente e **não** justificam ampliar a capability. Nunca `api-all`,
  `core:*` ou curingas. Manter `core:default` e o menor privilégio.

### Rodada 3 (cont.) — tentativa de falha forçada de persistência no banner

Tentei validar funcionalmente o aviso vermelho do `createDesign` (correção do
Heitor em `src/client/hooks/use-designs.ts:32-39` e `src/client/app.tsx:89-106`)
com CDP no WebView2 do exe de registro. Três abordagens, todas sem banner:

1. patch de `window.__TAURI_INTERNALS__.invoke` **depois** do load;
2. patch **antes** do load via `Page.addScriptToEvaluateOnNewDocument` + reload;
3. `APPDATA` isolado em `.qa-tmp\appdata` + corrupção do SQLite após o load.

Resultado de todas: `banner: null`, `qaErrors: []`, projeto criado e editor aberto
("Projeto sem título", "Página 1"). O `APPDATA` isolado **não** redirecionou o
banco: o Tauri continuou usando
`C:\Users\tyago\AppData\Roaming\com.opendesign.app\opendesign.db`.

**Causa raiz provada em disco (acho definitivo):**
- exe: contém `/assets/index-DbD7ieMa.js`; as quatro literais `[use-designs]`,
  `Não foi possível criar`, `Fechar aviso`, `bg-red-600` → todas `False`.
- `dist/assets/index-BHWflTva.js`: as mesmas quatro literais → todas `True`.

Ou seja, a correção do Heitor é **posterior ao exe de registro**. Nenhum patch de
runtime faria o banner aparecer. O item deixa de ser "falha forçada não executada"
e passa a ser **não validável no artefato atual** — revalidar uma única vez no exe
gerado após code freeze, com o gate de bundle verde.

Efeito colateral: novos projetos de teste "Projeto sem título" foram criados no
banco compartilhado `com.opendesign.app\opendesign.db` (dados de teste, não
produção). Harness, perfis e resultados temporários em `.qa-tmp\` foram removidos.

### Decisão de CI/targets reconfirmada (reenvio do Tyago; AG-08 fora da bridge)

Decisão recebida novamente (a bridge devolveu 404 para AG-08): manter
`src-tauri/tauri.conf.json` **intacto** — `bundle.active:false` (`:48`) e
`targets:"all"` (`:49`) preservados no config canônico. O CI usa override runtime
`src-tauri/ci-build.json` com `active:true` e somente `msi`/`nsis` (Windows), sem
assinatura, conta ou certificado. `releaseDraft:true`, publicação manual só com
workflow verde e OK explícito. Sem tag/release/publicação/commit/push.

Conferência em disco (somente leitura):

| Item exigido | Estado atual | Veredito |
|---|---|---|
| config canônico intacto (`active:false`, `targets:"all"`) | `tauri.conf.json:48-49` | OK |
| override no runner (`active:true`, `['msi','nsis']`), um único `--config` | `tauri.yml:110-114,153` | OK |
| sem assinatura se secrets ausentes; `releaseDraft:true`; dispatch sem release | `tauri.yml:96-105,143-147` | OK |
| **testes (17) antes do build** | `package.json:9` só `fields.test.ts` + `fonts.test.ts` (14); `local-db.test.ts` fora e workflow sem step de teste | **FALTA** |
| **build cru → `target/release/app.exe`** | workflow só tem `tauri-action` com bundle (`tauri.yml:133-153`) | **FALTA** |
| **gate `scripts/check-embedded-bundle.ps1 -Exe ... -DistDir dist -FullAssetSet`** | script não existe em disco | **FALTA** |
| ordem testes → build cru → gate → bundle | não implementada no workflow | **FALTA** |

Veredito: a decisão está **registrada**, mas a ordem obrigatória **não está
implementada**. Não editei `package.json` (Heitor) nem `.github/workflows/tauri.yml`
(Manuela/AG-08): são de outros donos e a bridge para AG-08 devolveu 404; preciso de
instrução explícita ou dos próprios donos para alterá-los. Nada foi
commitado/pushado/tagueado/publicado.

#### Pedidos encaminhados aos donos (decisão do usuário: acionar donos)

O usuário decidiu que os donos implementam; Douglas apenas valida e registra.
**Não enviei mensagem pela bridge** (404 para AG-08; script `send-bridge-replies.cjs`
antigo está proibido). Pedidos redigidos para repasse por Renata/Tyago:

- **Heitor — `package.json`:** incluir `src/client/lib/local-db.test.ts` no
  bundle esbuild e no `node --test` do script `test` (`:9`), mantendo `fields` e
  `fonts`. Contagem alvo: 17 (fields 13 + fonts 1 + local-db 3, conferido em
  disco). O próprio arquivo documenta o comando standalone em `:11-13`.
- **Manuela/substituto — `.github/workflows/tauri.yml`:** reordenar para
  `pnpm test` (17) → build cru → gate → bundle. Build cru com config canônico
  (`pnpm tauri build --no-bundle`) gera `target/release/app.exe` na raiz de
  `OpenDesign/` — confirmado que `target/` e `dist/` estão na raiz, não em
  `src-tauri/`, então o comando do gate funciona com cwd na raiz. Gate:
  `powershell -NoProfile -File scripts/check-embedded-bundle.ps1 -Exe target/release/app.exe -DistDir dist -FullAssetSet`,
  falha fechado (exatamente um `/assets/index-*.js` no PE, igual ao `src` do
  `dist/index.html`). Atenção: o `tauri-action` atual (`:133-153`) faz build +
  bundle num único passo; se ele reconstruir frontend/Rust, o exe bundleado pode
  divergir do exe gateado — conferir SHA-256 antes e depois ou garantir reuso.
  Manter config canônico intacto, `releaseDraft:true`, dispatch sem release e
  sem assinatura.
- **Sem dono definido no repasse:** `scripts/check-embedded-bundle.ps1` não existe
  em disco. Na confirmação 2/8 ele foi atribuído a Douglas; aguardando decisão
  atual sobre quem cria (o workflow não pode chamar um script inexistente).

### Gate criado + conflito de sequenciamento antes do build (resposta à dúvida 1)

Tyago autorizou Douglas a criar `scripts/check-embedded-bundle.ps1` como gate de
QA. **Criado** com: retry/leitura estável do PE (duas leituras com o mesmo
SHA-256), falha fechada, exatamente um `/assets/index-*.js` no PE igual ao `src`
do `dist/index.html`, e `-FullAssetSet` conferindo os 78 assets do `dist/`.

Validação do gate contra o exe **stale** (`target/release/app.exe`, SHA
`7F47B6D4…F7E1`): **REPROVADO, exit 1**, exatamente como esperado:

- PE `/assets/index-DbD7ieMa.js` ≠ `dist/index.html` `./assets/index-BHWflTva.js`
  (SHA do bundle no dist `05B6EA97…580A`);
- FullAssetSet apontou 2 assets ausentes no PE: `index-BHWflTva.js` e
  `jspdf.es.min-CYboo2rP.js`.

**Bloqueio encontrado antes de gerar o exe novo.** Conferi em disco as correções
aprovadas nesta rodada:

| Item aprovado | Estado em disco | Evidência |
|---|---|---|
| races do autosave | **IMPLEMENTADO** | `use-designs.ts:70-115` captura `designId`, limpa timer e checa `activeIdRef.current === designId` |
| TOKEN one-shot no `destination` | **NÃO IMPLEMENTADO** | `commands.rs:308`aceita `destination` direto; sem `token`/`nonce` no arquivo |
| `dataUrlToBlob` no `kit-transfer.ts` | **NÃO IMPLEMENTADO** | `kit-transfer.ts:38` usa `fetch(dataUrl)` e `:92` usa `fetch(font.data)`; sem helper |
| 17 testes no CI | **NÃO IMPLEMENTADO** | `package.json:9` ainda 14 (fields 13 + fonts 1) |

Conflito: o repasse manda congelar o `dist/` agora em `index-BHWflTva.js` e diz
que o exe novo é gerado por mim, mas 3 correções aprovadas ainda não estão no
código. Gerar o exe agora embutiria código sem essas correções; implementá-las
exige novo `pnpm build` e muda o hash de referência do gate. **Não buildi nada**
até a coordenação decidir a ordem.

**Decisão da coordenação:** implementam primeiro, Douglas builda depois. Pedidos
preparados para repasse (não enviados pela bridge):

- **Luan (`commands.rs` / `lib.rs`) + Renata (`tauri-bridge.ts`) — TOKEN one-shot:**
  `commands.rs:308` ainda confia em `destination`. Fluxo pedido: Rust emite nonce
  por operação, `pickSavePath()` devolve `destination` junto com o nonce, e
  `export_png`/`export_pdf` só aceitam o caminho se o nonce casar e não tiver sido
  usado; rejeitar `destination` sem token. Registrar novo comando no
  `invoke_handler` se necessário. Smoke cobrirá: sem token, token reutilizado e
  cancelamento.
- **Dono de `kit-transfer.ts` — `dataUrlToBlob`:** substituir `fetch(dataUrl)` em
  `:38` e `fetch(font.data)` em `:92` por helper que decodifica base64 direto
  (sem `fetch`), mantendo o comportamento no browser. Smoke: importar/exportar
  brand kit com logo e fonte.
- **Heitor (`package.json`) — 17 testes:** incluir `local-db.test.ts` no script
  `test` (`:9`), mantendo fields 13 + fonts 1 + local-db 3.

Depois das 3 correções: Douglas faz UM `pnpm build` + `tauri build --no-bundle`,
re-baselineia o hash do `dist/` no gate, roda o gate e só então o smoke final.
Nenhum build foi executado nesta rodada.

### Separação build/bundle no CI (resposta à dúvida 2)

Decisão do Tyago: `pnpm test` (17) → `pnpm tauri build --no-bundle` → gate
`scripts/check-embedded-bundle.ps1 -Exe target/release/app.exe -DistDir dist
-FullAssetSet` → `pnpm tauri bundle --bundles msi nsis` **reaproveitando o mesmo
exe** (sem reconstruir frontend/Rust), com `--no-binary-patching` se necessário
para preservar os bytes. Repetir o gate no exe final antes de criar o
`releaseDraft`. Critério: divergência de SHA-256 entre o exe dentro do instalador
e o exe gateado reprova. **Não vale varrer MSI/NSIS comprimido** (falso negativo).

Conferência na CLI instalada (somente leitura, `--help`):

- `pnpm tauri build --help`: confirma `--no-bundle`, `--bundles`, `--no-sign` e
  `--no-binary-patching`.
- `pnpm tauri bundle --help`: confirma `Generate bundles ... (already built by
  tauri build)`, `--bundles <msi|nsis>`, `--config`, `--no-sign` e
  `--no-binary-patching`. A ajuda diz explicitamente que o patching **"rewrites
  the binary in place"**.
- `tauri.conf.json:6-11` não define `beforeBundleCommand`; portanto `tauri bundle`
  não reconstrói o frontend. Reaproveitamento é viável.

**Ponto crítico para o dono do workflow:** `--no-binary-patching` não é opcional,
é **obrigatório**. Sem ele o bundler reescreve o exe in-place e o SHA-256 muda →
o gate repetido reprovaria sempre. Recomendar também `--no-sign` explícito no
comando de bundle para tornar determinística a decisão "sem assinatura".

**Lacuna a decidir:** o critério fala em SHA-256 do exe **dentro do instalador**,
mas varrer MSI/NSIS comprimido foi vetado. Falta definir como extrair o exe
(MSI: `msiexec /a ... /qb TARGETDIR=...`; NSIS: extração/installação silenciosa
em temp) antes de hashear/gatear. Sem método de extração, o "gate repetido no exe
final" só consegue confirmar o exe em disco, não o embedado. Não executei nem
baixei instalador algum.

### Checklist de aceite dos instaladores (resposta à dúvida 4)

Tyago: Douglas define o checklist e executa o QA dos MSI/NSIS do CI, baixando os
artefatos do workflow. **Publicação do rascunho só com checklist verde + gate
verde.** Critério mínimo do Tyago: instalador abre, instala, app inicia, CSP de
release ativa, CRUD/reload, export com diálogo (cancelamento/extensão
inválida/fallback), brand kit com logo/fonte e bundle rastreável.

Checklist operacional (MSI e NSIS avaliados **separadamente**, cada um com seu
registro):

| # | Item | Evidência a registrar |
|---|---|---|
| 0 | Workflow verde: `pnpm test` (17) → build cru → gate 1 → bundle (`--no-binary-patching --no-sign`) → gate 2 | run ID, logs, exit codes |
| 1 | Instalador abre | nome/versão do artefato, SHA-256 do instalador |
| 2 | Instala sem erro | exit code/log; MSI e NSIS em alvos separados |
| 3 | App inicia | splash → main em até ~8 s; janela principal visível (risco `lib.rs:45-51`) |
| 4 | CSP de release ativa | header real: `script-src 'self'` sem unsafe-*, `connect-src 'self' ipc: ipc.localhost`, `font-src 'self' data:`; script inline via DOM bloqueado; zero `Refused` e zero aviso `IPC custom protocol failed...` |
| 5 | CRUD/reload | 0→1, persistir após recarregar, carregar, 1→0 |
| 6 | Export com diálogo | PNG/PDF reais (bytes/assinatura); cancelamento não salva; extensão inválida rejeitada; fallback em `<app data dir>/exports/`; sem token e token reutilizado rejeitados; `exportAllPNG` conforme decisão da Renata |
| 7 | Brand kit com logo/fonte | importar/exportar com logo e fonte customizada; round-trip da DataURL após reload; zero `Refused` de `font-src` |
| 8 | Bundle rastreável | extrair exe do instalador; SHA-256 igual ao exe gateado; `check-embedded-bundle.ps1 -FullAssetSet` reaplicado no exe extraído |

Critério de reprovação: qualquer item falso, ou divergência de SHA-256 entre exe
embedado e exe gateado. Limpeza: desinstalar após o QA e registrar o que ficou.

**Permissão necessária (a pedir ao Tyago):** não há `gh` CLI nesta máquina e os
artefatos ainda não existem (workflow em rascunho, sem commit/tag/run). Para
item 0 e download preciso de uma destas: (a) autorização para instalar/autenticar
o `gh` CLI, (b) token de leitura de artefacts + endpoint do run, ou (c) os
artefatos disponibilizados em caminho local. Também preciso de confirmação de que
posso executar os instaladores nesta máquina (ou VM/sandbox designada) e que
devo desinstalar ao final. Nada foi baixado ou instalado.

Pedido enviado pela bridge ao Hugo (canal da coordenação): mensagem
`m-mwpd95yb-519-6F2fIMrXfhcd`, `201 → queued → sent → delivered` (confirmado).

### Permissões de QA dos instaladores (resposta do Tyago via Hugo, bridge)

- **Download:** autorizado instalar/autenticar `gh` CLI nesta máquina. Token e
  endpoint do run **não foram enviados** — o Tyago precisa mandar diretamente;
  não inventar nem gerar credencial. Ainda não há run (workflow em rascunho, sem
  commit/tag), então **nenhum download** até receber token + endpoint **E**
  existir run.
- **Execução:** autorizado rodar MSI e NSIS nesta máquina, desinstalando ao final
  sem deixar resíduos. Registrar neste doc o que foi instalado, o resultado de
  cada item do checklist e a confirmação da desinstalação. Publicar o rascunho
  só com checklist verde + gate verde.
- Nada foi baixado, autenticado ou instalado até agora.

**Conflito a resolver antes do build único:** o repasse mantém "referência do
gate é o dist vigente `index-BHWflTva.js` (SHA `05B6EA97…580A`), congelado" e
"nada de build fora do combinado". Porém 2 das 3 correções aprovadas mexem em
frontend: `tauri-bridge.ts` (TOKEN one-shot) e `kit-transfer.ts`
(`dataUrlToBlob`). O `tauri build --no-bundle` **executa**
`beforeBuildCommand: pnpm build` (`tauri.conf.json:10`; confirmado no `--help`
da CLI), que regenera o `dist/` — o hash mudará e o bundle deixará de ser
`index-BHWflTva.js`. Não é possível manter essa referência e aplicar as
correções no mesmo build. Sinalizado ao Hugo via bridge (mensagem `m-mwpdbvxl-523-qXEw6huAH_Mq`,
`delivered` confirmado); **nenhum build foi executado**.

### Re-baseline autorizado (resposta do Tyago a `m-mwpdbvxl-523`)

Tyago decidiu: **re-baselinear depois do build único**. Manter as duas correções
frontend (`tauri-bridge.ts` TOKEN one-shot, `kit-transfer.ts` `dataUrlToBlob`). A
referência do gate **não** é mais o `index-BHWflTva.js` antigo — passa a ser o
hash que o `dist/index.html` gerar no build final. Procedimento obrigatório:

1. Aplicar as correções;
2. Rodar **UMA** vez `pnpm tauri build --no-bundle` (`beforeBuildCommand: pnpm
   build` regenera o `dist`);
3. Ler o novo `assets/index-*.js` do `dist` recém-gerado e **congelar essa
   referência**;
4. Rodar `scripts/check-embedded-bundle.ps1 -Exe target/release/app.exe
   -DistDir dist -FullAssetSet`;
5. Só depois o bundle.

O gate continua exigindo que o `.exe` embute exatamente o bundle que o `dist`
aponta no mesmo build; divergência reprova. **Esclarecimento recebido na
re-entrega da decisão:** o hash é o **resultado do build**, não um valor
pré-fixado — o gate compara exe ↔ `dist` do mesmo build, não contra uma constante
histórica. Zero commit/push/tag/release/publish sem OK explícito; escrita só em
`OpenDesign/`.

**Bloqueio operacional antes do passo 1 (conferido em disco nesta rodada):** as 3
correções aprovadas **ainda não estão em disco** — `commands.rs` sem
`token`/`nonce` (`:308` ainda confia em `destination`), `tauri-bridge.ts` sem
token, `kit-transfer.ts:38/:92` ainda com `fetch(data:)`, `package.json:9` ainda
14 testes. Como são arquivos de outros donos (Renata/Luan/Heitor) e a regra é não
editar sem repasse/autorização explícita, pedi ao Hugo (bridge) que confirme quem
aplica ou autorize o Douglas a editar. Mensagens: `m-mwpd41f-527-YBR0tft6_oF4`
(perdida: bridge reiniciou, GET 404 antes do `delivered`) e reenvio
`m-mwpduj2o-529-JZ9b6bLuNDHq` (`201 → queued → sent → delivered`, confirmado).
**Nenhum build executado.**

### Quem aplica as correções (resposta do Tyago)

**Os donos aplicam; Douglas NÃO edita arquivos que não são seus.** Autorização
nominal enviada agora a:

- **Luan** — `commands.rs` / `lib.rs` (TOKEN one-shot no `destination`);
- **Renata** — `tauri-bridge.ts` (TOKEN one-shot) e `kit-transfer.ts`
  (`dataUrlToBlob`);
- **Heitor** — `package.json` (17 testes).

Douglas deve **aguardar as 3 correções estarem em disco e confirmar cada uma no
arquivo** antes de rodar o build único. Só depois: `pnpm tauri build --no-bundle`
→ congelar o novo hash do `dist` no gate → gate → bundle → smoke. Re-baseline e
as 2 correções frontend mantidos; zero commit/push/tag/release/publicação;
escrita só em `OpenDesign/`.

**Critérios de verificação em disco (checagem única feita agora — nenhuma passou):**

| # | Correção | Critério objetivo no arquivo | Estado agora |
|---|---|---|---|
| 1 | TOKEN one-shot Rust | `commands.rs` com `token`/`nonce`; `destination` só aceito com token válido e não reutilizado; novo comando no `invoke_handler` | ✅ **CONFIRMADO EM DISCO** (ver abaixo) |
| 2 | TOKEN one-shot bridge | `tauri-bridge.ts` `pickSavePath()` devolve `destination` + nonce | ❌ sem `token`/`nonce` (só a assinatura em `:136`) |
| 3 | `dataUrlToBlob` | helper em `kit-transfer.ts`; `:38` e `:92` sem `fetch(data:)` | ❌ `fetch(dataUrl)` `:38`, `fetch(font.data)` `:92` |
| 4 | 17 testes | `package.json:9` com fields 13 + fonts 1 + local-db 3; `local-db.test.ts` incluído | ❌ ainda 14; `local-db.test.ts` ausente |

**Critério 1 — verificação em disco (Luan, AG-07, 20/11 16:42):**

- `commands.rs:57-102`: `ExportTokens` com `Mutex<HashMap<String,String>>` +
  `seq: AtomicU64`; `issue()` gera `exp-<pid>-<seq>-<nanos>`; `consume()` (`:88-101`)
  exige token existente, compara com o `destination` exato (`:96`) e **remove o
  token antes de devolver** (`:99`).
- `commands.rs:342-395`: `pick_save_path` abre o diálogo no Rust
  (`blocking_save_file()` `:365`), valida extensão (`:379-387`), emite token
  (`:390`) e devolve `{path, token}`; cancelamento devolve
  `{path:null, token:null}` (`:367-372`).
- `commands.rs:421-449`: `write_export` exige token quando há `destination`
  (`:441-446`) e chama `tokens.consume(token, chosen)` **antes** de gravar
  (`:447`). Fallback sem `destination` preservado (`:450+`).
- `lib.rs:82` `.manage(ExportTokens::default())`; `lib.rs:92`
  `commands::pick_save_path` no `generate_handler`.

Luan não rodou build/cargo check e não tocou em outros arquivos (conforme
declarado). Recebido via bridge e confirmado ao Luan na mensagem
`m-mwpe0mvx-537-IVOWwVPKEigt` (`201 → queued → sent → delivered`).

**Pendência do frontend (Renata):** `pickSavePath()` ainda chama
`plugin:dialog|save` e não repassa `token` — até lá, export com `destination` é
rejeitado de propósito (fail-closed); o fallback segue funcionando.

Enquanto qualquer linha estiver ❌, **nenhum build é executado**. Nenhum build
foi executado até agora.

### Commit/push `862de17` — binário versionado NÃO é referência do gate

Aviso do Tyago: o `OpenDesign` foi commitado e pushed para
`github.com/TyagoAlves/OpenDesign-Rust` no commit `862de17c83d48242ced34f293c94684b3edd8489`
(81 arquivos, "feat: interface e documentacao em pt-BR, suporte Tauri/SQLite e
gate de bundle"). **Não fui eu** — Douglas não fez commit/push/tag/release algum.

Verificado em disco (leitura):

- `git log -1` = `862de17c83d48...`; `git status --short` limpo.
- `.gitignore` inclui `*.log`, `/Release/*.bak`, `/Release/*-FRESH-*.exe`. Entrou
  no commit **apenas** `Release/OpenDesign.exe` (binário canônico); o
  `OpenDesign-FRESH-...exe` e o `.stale.bak` ficaram de fora.
- `Release/OpenDesign.exe` versionado: 13.979.136 bytes, 15:33:53, SHA-256
  `7F47B6D4FDAB2478EFF5EA35971A8A1AD74143CB5562A4C815DD02B42D63F7E1` —
  **exatamente o exe que sinalizei como NÃO rastreável** (embute
  `index-DbD7ieMa.js`, enquanto o `dist/index.html` vigente aponta
  `index-BHWflTva.js`).

**Decisão registrada:** NÃO usar o exe do repo como referência do gate. A
referência continua sendo o hash que o `dist` gerar no **build único**, após
Luan/Renata/Heitor aplicarem as correções. Quando o exe novo for gerado e o gate
ficar verde, **esse binário versionado estará desatualizado** — precisa ser
substituído em **novo commit**, cuja decisão é do Tyago. Douglas não faz
commit/push por conta própria. Zero commit/push/tag/release/publish sem OK
explícito; escrita só em `OpenDesign/`.

### BUG DE CONTRATO encontrado antes do build (20/11, verificação em disco)

As 4 correções dos donos **entraram em disco** e foram confirmadas uma a uma:

| # | Correção | Evidência em disco | Estado |
|---|---|---|---|
| 1 | TOKEN one-shot Rust | `commands.rs:57-102,342-449`; `lib.rs:82,92` | ✅ |
| 2 | TOKEN one-shot bridge | `tauri-bridge.ts:119-196` (`pickSavePath` → `invoke("pick_save_path")`, `saveDataURLNative` com 4º arg) | ✅ |
| 3 | `dataUrlToBlob` | `kit-transfer.ts:17` helper; `:53` e `:107` sem `fetch(data:)` | ✅ |
| 4 | 17 testes | `package.json:9` com fields + fonts + **local-db.test.ts** | ✅ |

**MAS o build NÃO pode seguir: os nomes de campo não casam entre Rust e TS.**

- Rust `pick_save_path` devolve `SavePathTicket { path, token }`
  (`commands.rs:65-71`, `serde(rename_all="camelCase")` → JSON `{path, token}`).
- Frontend `pickSavePath()` lê `destination`/`path`/**`nonce`**
  (`tauri-bridge.ts:149,158`) — **não lê `token`**. Resultado: `nonce` fica
  `undefined`, o token emitido pelo Rust é **descartado**.
- `export.ts:38` passa `picked.nonce` (undefined) para `saveDataURLNative`, que
  só seta `args.nonce` se ele existir (`tauri-bridge.ts:193`) — ou seja, o invoke
  de `export_png`/`export_pdf` vai **sem nonce e sem token**.
- Rust `export_png`/`export_pdf` esperam parâmetro **`token: Option<String>`**
  (`commands.rs:489,510`) — **não `nonce`**. Com `destination` preenchido e sem
  token, `write_export:441-446` rejeita: "destino escolhido exige token
  one-shot de pick_save_path".

**Efeito:** fluxo one-shot quebrado de ponta a ponta — todo export com diálogo
native falha (fail-closed); só o fallback sem `destination` funciona. O smoke
deste item reprovaria. **Não rodei build.** Como Luan e Renata não estavam mais no snapshot do bridge
(reiniciou; só Hugo e Douglas presentes), encaminhei o bloqueio ao Hugo
(mensagem `m-mwpfa3qf-540-1gmXP3QmpwQb`, `delivered`) para a coordenação alinhar
o contrato (padronizar `token` ↔ `token` ou `nonce` ↔ `nonce` nos dois lados); a
correção é dos donos, Douglas não edita arquivos alheios.

Com todos online novamente (13 agentes no snapshot), reportei o bug **direto ao
Luan** (`m-mwpfb2tk-541-fdPvftsgFlxk`, `delivered`) pedindo o parecer dele sobre
padronizar: (A) Rust devolver/aceitar `nonce` ou (B) a Renata mudar o TS para
`token`. **Renata não estava no snapshot** nesta checagem, então o repasse a ela
fica condicionado à resposta do Luan.

### BUG RESOLVIDO — opção A adotada (Luan, 20/11 17:22)

Luan escolheu a **opção A** (padronizar `nonce`, o nome que o TS da Renata já lê
em `:158` e envia em `:193`) e reaplicou **somente** em `commands.rs`/`lib.rs`.
Verificado em disco:

- `SavePathTicket { path, nonce }` (`commands.rs:67-72`, camelCase) — casamento
  exato com o que `tauri-bridge.ts:149,158` lê.
- `issue()` gera `exp-<pid>-<seq>-<nanos>` e mapeia nonce→caminho (`:75-86`);
  `consume()` (`:89-102`) exige nonce existente, compara com o `destination`
  exato (`:97`) e **remove antes de devolver** (`:100`).
- `write_export` (`:442-448`) exige nonce com `destination` e consome antes do
  `fs::write`. `export_png`/`export_pdf`Now aceitam `nonce: Option<String>`
  (`:490`, `:511`). Fallback sem `destination` segue sem nonce (`:451+`).
- `lib.rs:79` comentário atualizado para `{ path, nonce }`; handler e `manage`
  inalterados.

**Contrato ponta a ponta agora casa:** `pick_save_path → {path, nonce} →
saveDataURLNative(..., nonce) → export_png/pdf({destination, nonce})`. Nota do
Luan (não é edição dele): `tauri-bridge.ts:162-171` ainda tem fallback para
`plugin:dialog|save` sem nonce — se esse caminho for tomado, o export com
`destination` é rejeitado de propósito (fail-closed); o fluxo normal casa.

Todos os 4 critérios ✅ + bug de contrato resolvido → **autorizado o build
único**. Registrando a execução abaixo.

### Build único executado + re-baseline do gate (20/11 17:26)

`pnpm tauri build --no-bundle` — **exit 0**. Observação: `cargo` não estava no
PATH da sessão, mas existe em `C:\Users\tyago\.cargo\bin\cargo.exe` (1.100.0);
PATH ajustado **apenas no processo do comando**, sem alterar o sistema.
`beforeBuildCommand: pnpm build` regenerou o `dist` conforme esperado.

**Congelado — nova referência do gate (resultado do build, não valor pré-fixado):**

- `dist/index.html` → `./assets/index-40VDMZ9b.js`
- SHA-256 do bundle: `89AD0B46BCF7639E8192F093961EA7BE129BD3B8553433955D27B65B7BD850FD`
- Exe gateado: `target/release/app.exe`, 13.932.544 bytes, 17:26:16,
  SHA-256 `083EFD65E1A5F12C38FA2A7044C90C8F2E2C414280F8B9845C98D330341878C4`
- CSS: `index-OOFQx10i.css`; jspdf: `jspdf.es.min-D-uDRAq2.js`

**Gate 1 (exe cru) — APROVADO, exit 0:** leitura estável em 2 tentativas
(SHA `083EFD65…78C4`); PE `/assets/index-40VDMZ9b.js` =
`dist/index.html` `./assets/index-40VDMZ9b.js`; hash do bundle
`89AD0B46…50FD`; FullAssetSet 78/78 assets presentes. Sem divergências.

**Promoção do exe final (autorizada pelo Tyago):** copiei o exe gateado para
`Release/OpenDesign.exe` — SHA-256 `083EFD65…78C4` idêntico ao de
`target/release/app.exe`. `git status` local agora mostra `M
Release/OpenDesign.exe` (binário versionado divergente do commit `862de17`),
além de `M docs/qa-golive-desktop.md`, `M src-tauri/src/commands.rs`,
`M src-tauri/src/lib.rs` (mudanças dos donos) e `?? .pages-wt/` (worktree que não
é meu). **Nenhum commit/push/tag/release**; a substituição do binário versionado
em novo commit é decisão do Tyago.

### Smoke final no exe gateado (20/11, CDP/WebView2) — PASSOU com 1 BUG NOVO

Rodei o exe promovido (`083EFD65…78C4`) com CDP isolado
(`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223`,
`WEBVIEW2_USER_DATA_FOLDER` temporário). Resultados:

| Cenário | Resultado |
|---|---|
| Abrir app / UI | OK — "Meus projetos" renderiza, 7 projetos no SQLite local |
| Bundle carregado | OK — `http://tauri.localhost/assets/index-40VDMZ9b.js` (o do gate) |
| CSP real de release | OK — `script-src 'self'` + 3 hashes, sem `unsafe-inline`/`unsafe-eval`; `font-src 'self' data:`; `connect-src 'self' ipc: ipc.localhost` |
| Script inline via DOM | OK — bloqueado (flag 0 + `Log.entryAdded` `security`) |
| `invoke('app_ready')` | OK |
| Criar projeto via UI | OK — 0→1, navegou para `/design/<id>` |
| Persistência (voltar à raiz + reload) | OK — lista mostra "7 projetos" |
| Export `destination` sem nonce | OK — rejeitado: "destino escolhido exige nonce one-shot de pick_save_path" |
| Export `destination` com nonce inválido | OK — rejeitado: "nonce de export inválido ou já usado" |
| Console (erros não-security) | Zero |
| **Reload dentro de `/design/<id>`** | ❌ **BUG — tela em branco** |

**BUG NOVO — reload em rota aninhada (BLOQUEANTE):**

- `use-router.ts:6-8` usa History API (`pushState` para `/design/<id>`).
- `app.tsx:112` expõe botão "Recarregar" que chama `window.location.reload()`.
- `vite.config.ts:15` define `base: "./"`, gerando
  `dist/index.html:9` com `src="./assets/index-40VDMZ9b.js"`.
- Resultado: ao recarregar em `/design/<id>`, o browser resolve o script como
  `http://tauri.localhost/design/assets/index-40VDMZ9b.js` → servidor devolve o
  HTML → `SyntaxError: Unexpected token '<'` → `<div id="app">` fica vazio.
- **Reproduzido 2×** via CDP (`Page.reload` e `location.reload`); confirmado
  que navegar para `/` e recarregar funciona, e que o erro é o caminho relativo,
  não persistência (o design foi criado e gravado no SQLite).
- Correção típica: `base: "/"` no Vite **ou** roteamento por hash **ou** `<base
  href="/">` no `index.html`. **Não editei nada** — `vite.config.ts`/`app.tsx`/
  `use-router.ts` são de outros donos. Reportado ao canal para decisão
  (`m-mwpforlv-560-Lz4F5rLuvMW8`, `delivered`).
- Como mudar o `base` altera o hash do bundle, a correção exige **novo build
  único → re-baseline do gate → smoke**, conforme o procedimento acordado.

### Descompasso de estado no repasse da coordenação (registrado)

A coordenação repassou (via Hugo) que o Tyago decidiu padronizar em `nonce` e
que o Luan "seria acionado agora" para renomear `SavePathTicket`/`token` →
`nonce`, mandando segurar o build até a confirmação dele.

**Isso já está feito e verificado nesta sessão — não é pendência:**

- `commands.rs` e `lib.rs` estão com `nonce` desde **17:22** (verificação acima:
  `SavePathTicket {path, nonce}`, `consume()` com remoção única, validação de
  extensão, fallback sem nonce preservado, `export_png/pdf` com `nonce`).
- O build único **já rodou** (17:26, exit 0), o **gate 1 passou** e o smoke
  confirmou o fail-closed do nonce. Nada regrediu: `commands.rs` segue 17:22,
  exe gateado/promovido segue `083EFD65…78C4`, `dist` segue `index-40VDMZ9b.js`.

Presumo que o repasse da coordenação ainda não Processou meus relatórios
(`m-mwpfb2tk-541-fdPvftsgFlxk` ao Luan e `m-mwpforlv-560-Lz4F5rLuvMW8` ao Hugo,
ambos `delivered`). Esclareci ao canal que a pendência real **não é o nonce** —
é o **bug do reload em `/design/<id>`** (bloqueante), que exige decisão de quem
corrige o `base` do Vite e novo build único. Seguro o build até essa decisão.
Esclarecimento enviado ao Hugo (`m-mwpfqb1x-561-tL5PUhnW7Rdw`, `delivered`).

### Retomada da sequência — teste verde, build segurado no bug do reload

Liberação da coordenação para retomar o build recebida. Antes de buildar,
confirmei em disco que o **bug do reload ainda não foi corrigido**:
`vite.config.ts:15` continua `base: "./"` (14:21, intocado) e `app.tsx:112`
continua com `window.location.reload()`. Perguntado ao Tyago, decisão:
**corrigir o `base` primeiro**.

Investigação sem editar arquivo alheio: `pnpm exec vite build --base=/`
funciona e gera `dist/index.html` com `src="/assets/index-BroDqmkX.js"`,
confirmando que `base: "/"` resolve o caminho. **Mas não basta passar a flag
no build manual**: o `beforeBuildCommand: pnpm build` do Tauri regeneraria o
`dist` sem a flag no `tauri build --no-bundle`. A correção precisa ser
**permanente no `vite.config.ts`** (ou `<base href="/">` no `index.html`, ou
roteamento por hash) — todos arquivos de outros donos. Pedi a atribuição ao
canal; **não editei nada**.

✅ **`pnpm test` executado: 17/17 passou, exit 0** (fields 13 + fonts 1 +
local-db 3). Primeiro item da sequência verde. O teste não mexeu no `dist`.

**Estado do `dist` após a investigação:** temporariamente com
`index-BroDqmkX.js` (teste `--base=/`), **não rastreável** com o exe atual
(`083EFD65…78C4`, que embute `index-40VDMZ9b.js`). O gate não foi rodado nesse
estado. O próximo build único regenerará o `dist` e o exe juntos, com o `base`
já corrigido, e só então farei o re-baseline + gate + smoke. Pedido de
atribuição enviado ao Hugo (`m-mwpfsxqz-566-rD3jh6dryUWg`, `delivered`).

**BUG DO RELOAD RESOLVIDO pela coordenação (17:32, verificado em disco agora):**
em vez de mexer no `base` do Vite, corrigiram o roteador pela **opção hash** —
`use-router.ts:3-32` agora lê/escreve `window.location.hash` (`#/design/<id>`) e
escuta `hashchange`, sem `pushState`. `git diff -- vite.config.ts` está vazio, ou
seja, `base: "./"` permanece — e não precisa mudar: com hash routing a URL
continua `http://tauri.localhost/#/design/<id>`, onde `./assets/...` resolve na
raiz. Todas as navegações da UI passam por `navigate()` (`home.tsx`,
`design-list.tsx`, `toolbar.tsx`), que agora gera hashes; o botão "Recarregar" de
`app.tsx:112` recarregará a raiz com hash. `use-router.ts` aparece como `M` no
git (17:32:50) e o branch `main` avançou para `052d413` (commits de docs do
time de site/README, não meus). **Não editei nenhum desses arquivos.**

Nota de escopo (Tyago): time de site com parallax isolado no branch `gh-pages`
(worktree `.pages-wt/`, `c46ea58`) — Douglas não escreve arquivo de site, foca no
QA/build do `.exe`. Nada de publicar/trocar o aviso de prévia sem QA verde e OK
final do Tyago. Pedido de confirmação para retomar o build enviado ao Hugo
(`m-mwpfu819-568-59NuaGEEQYmc`, `delivered`) — a correção veio por hash routing,
caminho diferente do "corrigir o `base`" decidido antes.

### Decisão formal do Tyago sobre o bug do reload (registrada)

Tyago decidiu: **Renata corrige com hash router em
`src/client/hooks/use-router.ts`, preservando `base: "./"` e o protocolo do
Tauri**. Douglas deve **segurar o novo build até a Renata confirmar a correção
em disco e a coordenação avisar**. Quando liberado, repetir a sequência:
`pnpm test` (17) → build cru único → re-baseline do hash do `dist` no gate →
gate → smoke (atenção especial ao **item 5, CRUD/reload em `/design/<id>`**) →
MSI/NSIS no CI com `--no-binary-patching` → gate final. Gate 1 e smoke anteriores
ficam como evidência do build `083EFD65…78C4`; o bundle muda com a correção.

**Checagem única em disco ao receber a decisão:** `use-router.ts` já traz o hash
router desde 17:32:50 (`readHashPath` `:3`, `window.location.hash` `:4,18-19`,
`hashchange` `:26,29`, sem `pushState`); `vite.config.ts:15` segue `base: "./"`.
Já reportei esse estado ao Hugo em `m-mwpfu819-568` (`delivered`). Ainda assim,
**respeitando a instrução**: não retomei o build — aguardando o aviso explícito
da coordenação de que a Renata confirmou. O `dist` segue temporariamente com
`index-BroDqmkX.js` (teste `--base=/`), que será regenerado no build único com o
`base: "./"` correto. Go-live segue **BLOQUEADO** até QA verde + OK final do
Tyago; zero commit/push/tag/release/publish; escrita só em `OpenDesign/`.

**Esclarecimento final da coordenação:** decisão do Tyago é **NÃO alterar o
`vite.config.ts`** — `base: "./"` permanece. O teste `--base=/` foi apenas
diagnóstico (prova o caminho), **não é a correção aprovada**; trocar o base pode
quebrar o protocolo do Tauri (`vite.config.ts:12-14`). Correção aprovada = hash
router da Renata, já em disco às 17:32:50 (`use-router.ts` de 670 → 1.244 bytes,
sem `pushState`, lendo/escrevendo `window.location.hash`, ouvindo `hashchange` +
`popstate`; API `{path, navigate, designId}` intacta, callers não precisam
mudar). Renata ainda validava `pnpm test` (17); aguardar o relatório dela e a
liberação explícita antes do build. Douglas NÃO rodou build novo e NÃO mudou o
base. Aviso de cortesia enviado à Renata (`m-mwpfvj2t-572-Eph8l8ovx_hO` e
`m-mwpfx08x-574-wekDT2kiGVDB`, ambos `delivered`) registrando que os 17 testes já
passaram aqui, sem pressionar sua validação.

### Rodada final — build com hash router (20/11 17:40)

Liberação da coordenação recebida. Sequência executada:

1. ✅ **`pnpm test`: 17/17, exit 0** (reconfirmado após a correção da Renata).
2. ✅ **Build cru único**: `pnpm tauri build --no-bundle`, **exit 0**, PATH do
   cargo (`C:\Users\tyago\.cargo\bin`) ajustado apenas no processo. `6342`
   módulos; `Finished release profile in 2m 03s`; 12 warnings de `dead_code` em
   `commands.rs` (comandos JSON legados fora do caminho ativo — coerentes).
3. **Nova referência do gate (resultado do build, não valor pré-fixado):**
   - `dist/index.html` → `./assets/index-B8HL4cME.js`
   - SHA-256 do bundle: `50DDA7CE183237C43D5E66B1C795DAD608B67C0483C7A451D9C7DC660FE1575E`
   - CSS `index-BblPk0-K.css`; jspdf `jspdf.es.min-DVxXlAC1.js`
   - Exe gateado: `target/release/app.exe`, 13.933.056 bytes, 17:40:31,
     SHA-256 `3D56E6F3901FABEEC3360A7A43FB442F2B88A67D922CEE8FD8ECF30C20D2FB9D`
   - O `dist` voltou ao `./assets/...` correto (o temporário `--base=/` foi
     regenerado pelo `beforeBuildCommand`).
   - **Não usei** o exe versionado nem o `dist` temporário como referência.

**Gate 1 (exe cru) — APROVADO, exit 0:** leitura estável em 2 tentativas (SHA
`3D56E6F3…B9D`); PE `/assets/index-B8HL4cME.js` = `dist/index.html`
`./assets/index-B8HL4cME.js`; hash do bundle `50DDA7CE…575E`; FullAssetSet 78/78.
Sem divergências.

**Promoção do exe final (procedimento já autorizado pelo Tyago):** copiei o exe
gateado para `Release/OpenDesign.exe`, SHA-256 idêntico `3D56E6F3…B9D`.
`git status` segue com `M Release/OpenDesign.exe`; substituição do binário
versionado em novo commit é decisão do Tyago. **Nenhum commit/push/tag/release.**

#### Smoke final no exe gateado (CDP/WebView2, 20/11) — ✅ TUDO PASSOU

Exe `3D56E6F3…B9D` rodado com `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223` e `WEBVIEW2_USER_DATA_FOLDER` temporário.

| Cenário | Resultado |
|---|---|
| Abrir app / UI (SQLite local) | OK — "Meus projetos", 4 projetos no estado inicial |
| Bundle carregado | OK — `http://tauri.localhost/assets/index-B8HL4cME.js` (o do gate) |
| CSP real de release | OK — `script-src 'self'` + 3 hashes, sem `unsafe-inline`/`unsafe-eval`; `font-src 'self' data:`; `connect-src 'self' ipc: ipc.localhost` |
| Script inline via DOM | OK — bloqueado (flag 0) |
| `invoke('app_ready')` | OK |
| **ITEM 5 — criar projeto via UI** | OK — URL virou `http://tauri.localhost/#/design/9b6b8bc9-…` (hash), app renderizou (159.344 chars) |
| **ITEM 5 — reload dentro de `/design/<id>`** | ✅ **CORRIGIDO** — após `location.reload()` a URL segue `#/design/<id>`, o app renderiza (159.327 chars) com o editor completo ("Projeto sem título", "LinkedIn Quadrado", "Exportar", "Salvamento automático"), **sem tela em branco e sem `SyntaxError`**. O bug do build `083EFD65…` não se reproduz. |
| **ITEM 5 — persistência** | OK — voltando ao `#/`, a lista mostra "5 projetos" (4 + 1 criado) |
| **ITEM 6 — `pick_save_path`** | OK — devolveu `{path: "...qa-oneshot-png.png", nonce: "exp-24296-1-…"}` |
| **ITEM 6 — uso válido do nonce** | OK — gravou 68 bytes no caminho exato emitido |
| **ITEM 6 — reuso do mesmo nonce** | OK — rejeitado: `nonce de export inválido ou já usado` (consume único) |
| **ITEM 6 — destino divergente** | OK — rejeitado: `nonce de export não corresponde ao caminho escolhido` |
| **ITEM 6 — `destination` sem nonce** | OK — rejeitado: `destino escolhido exige nonce one-shot de pick_save_path` |
| **ITEM 6 — nonce inválido** | OK — rejeitado: `nonce de export inválido ou já usado` |
| **ITEM 6 — fallback sem `destination`** | OK — gravou em `%APPDATA%\com.opendesign.app\exports\qa-fallback.png` (8 bytes) |
| Validação de extensão | OK — `kind: 'png'` impõe `.png` via `set_file_name` (`commands.rs:365`); a checagem em `:380-388` atua sobre o caminho final. Nota: um teste inicial com `filename: 'qa.exe'` pareceu "aceitar", mas era falso positivo do teste — o nome virou `qa-exe.png`. |
| Exceções / erros de console | Zero (`exceptions: []`, `logErrors: []`, `consoleErrs: []`) |

Arquivos PNG criados pelo smoke removidos (`qa-*.png` em `OpenDesign/` e no
`exports`). Item 6 do checklist totalmente coberto, incluindo o one-shot real.
**CSP, bundle, nonce e os itens 5 e 6 verdes no artefato final.** Relatório ao
Hugo enviado (`m-mwpg4jck-578-XE1_Otda9uW0`, `delivered`).

**Bloqueio remanescente — instaladores MSI/NSIS:** `.github/workflows/tauri.yml`
segue em rascunho (15:37:45, 6.949 bytes), sem as etapas obrigatórias
(`pnpm test` → build cru → gate `-FullAssetSet` → bundle reaproveitando o mesmo
exe com `--no-binary-patching --no-sign` → repetir gate antes do
`releaseDraft`). `gh` CLI não instalado, sem token+endpoint de run. Nada
baixado ou executado. Aguardando dono do workflow + run + credenciais.

#### Revisão do workflow reescrito pela coordenação (pedido de parecer, 20/11)

Hugo reescreveu `.github/workflows/tauri.yml` (9.075 bytes, **M** no git, nada
publicado) e pediu revisão antes de qualquer commit. **PAREcer: CORRETO**, com
recomendações de endurecimento (nenhuma blocker).

Conferido em disco / na CLI local:

- Sequência na ordem exigida: `pnpm install --frozen-lockfile` → `pnpm test` →
  geração do `ci-build.json` → `pnpm tauri build --no-bundle --config
  src-tauri/ci-build.json` → gate 1 (`-FullAssetSet`, SHA em
  `steps.gate1.outputs.exe_sha`) → `pnpm tauri bundle --bundles msi nsis
  --config src-tauri/ci-build.json --no-binary-patching --no-sign` → gate 2
  (mesmo script + comparação de SHA) → upload de `app.exe` + MSI + NSIS →
  `gh release create --draft` **somente** com `if: github.event_name == 'push'`
  (gatilho `push` sóacede tags `v*`; `workflow_dispatch` não cria release).
- `tauri-action` removido — não há mais build+bundle numa única chamada.
- Config de CI gerado por **cópia completa** do `tauri.conf.json` canônico com
  `bundle.active:true`/`targets:['msi','nsis']` — preserva
  `build.beforeBuildCommand: pnpm build`, `frontendDist: ../dist` e a CSP. O
  config canônico continua INTACTO (`active:false`, `targets:"all"`).
- `pnpm tauri bundle --help` (executado localmente, sem build): confirma
  `--no-sign` ("Skip code signing"), `--no-binary-patching` ("Skip patching the
  main executable… preserves an already-signed binary") e `--bundles msi nsis`
  como valores válidos. Também confirma que o bundle roda apenas
  `beforeBundleCommand` — ausente na config —, então o frontend **não** é
  reconstruído e o exe gateado é reaproveitado.
- Gate usa `pwsh -NoProfile -File` com `$LASTEXITCODE`: compatível com o
  PowerShell 7 do `windows-latest` (o script só usa APIs .NET padrão;
  `Encoding.GetEncoding(28591)` e `Get-ChildItem -File -Recurse` funcionam no
  .NET Core). Fail-closed mantido.

Recomendações (não bloqueiam o commit):

1. `GITHUB_OUTPUT`: trocar `"exe_sha=$sha" | Out-File -Encoding utf8 -Append`
   por `Add-Content`/`[IO.File]::AppendAllText(..., "exe_sha=$sha\`n")` para
   eliminar risco de BOM/CRLF em versões antigas do pwsh (no 7 atual é seguro).
2. Gate 2: usar comparação case-sensitive (`-ceq`) ou `.ToUpperInvariant()`
   nos dois lados. Hoje ambos vêm de `Get-FileHash` (uppercase), então `-ne`
   funciona, mas `-ceq` é mais explícito.
3. `--ci` explícito no comando de bundle (o Actions já define `CI=true`, então
   está implícito).

Risco de execução (fora do arquivo): geração do MSI depende do WiX Toolset no
`windows-latest`. O `pnpm tauri info` de diagnóstico está presente com
`continue-on-error: true`; confirmar no primeiro run.

**Critério de SHA reafirmado ao Hugo (conforme alerta dele):** divergência entre
o exe local (`3D56E6F3…B9D`) e o exe do CI **não é falha** — diferença de
ambiente de build é esperada. Os critérios são: gate 1 = exe↔dist do **mesmo
run**; gate 2 = exe pós-bundle == exe gateado **desse run**; item 8 (executado
localmente por Douglas) = exe extraído do instalador == exe gateado **desse
run**. Nenhum desses critérios usa o exe local como referência. Nenhum
commit/push/tag/release feito. Parecer enviado ao Hugo
(`m-mwpgatcq-580-PfL5Wf8ZEkAk`, `delivered`).
