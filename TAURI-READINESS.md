# OpenDesign — prontidão para desktop Tauri (Apoio AG-02)

Data: 2026-11-20 · Responsável pela checagem: Heitor (AG-02) · Liderança: Renata

> **Coordenação (atualização do Tyago em 2026-11-20):** os rótulos HUGO, GAEL e PAULA não
> correspondem a agentes, responsáveis ou canais e foram retirados das instruções antigas. Este
> documento os menciona apenas em registros históricos já consolidados — não devem ser
> endereçados nem aguardados. Coordenação técnica: Renata e canal do Tyago; decisões finais: só
> Tyago. Regras inalteradas: nada fora de `OpenDesign/`, zero commit/push/publish/tag/release sem
> OK explícito do Tyago.

## O que foi feito

1. `vite.config.ts`: adicionado `base: "./"` (mantido `build.outDir: "dist"`, aliases Preact/Fabric e o
   `server.proxy` de `/api` — que continua **dev-only**, não afeta o bundle).
2. `dist/` apagado e reconstruído do zero com `npm run build` (✓ 13,56 s; apenas o aviso de chunk >500 kB,
   já esperado por causa do Fabric + jsPDF).
3. `dist/index.html` gerado com URLs **relativas** (`./assets/index-*.js`, `./assets/index-*.css`) — antes
   eram `/assets/...`.
4. Varredura do bundle: `localhost:8787` = **0**, `127.0.0.1` = **0**. Não há URL absoluta com host/porta
   do wrangler no `dist/`.

## Teste de isolamento (sem Hono, sem wrangler)

Servi `dist/` com um servidor HTTP estático mínimo (Node puro, porta 4399) e carreguei no Edge headless:

- HTML, CSS, JS e as 72 fontes carregaram normalmente; o app renderizou.
- **Falha bloqueante:** o bootstrap emite 4 chamadas e todas recebem 404:

```
REQ GET /api/designs
REQ GET /api/templates
REQ GET /api/brand-kits
REQ GET /api/fonts
```

- O bundle contém **26 referências root-relative a `/api/*`** (10 designs, 5 pages, 4 brand-kits,
  4 uploads, 2 fonts, 1 templates). No Tauri essas URLs apontam para a origem do próprio webview
  (`http://tauri.localhost/api/...` no Windows) — onde não há listener algum, nem mesmo um 404 útil.
- O log também registrou `GET /__clawnify/presence.js` — vindo de `@clawnify/app`, outro recurso
  root-relative que não existirá no desktop. Precisa de tratativa junto com os `/api`.
- `/favicon.ico` e `/favicon.svg` (adicionados ao `index.html` pela Renata) também são root-relative;
  o `dist/index.html` atual ainda não os incorporou. Com `base: "./"` o Vite deve convertê-los,
  mas vale reconferir após o próximo build dela.

### Arquivos que dependem de `/api`

`src/client/api.ts`, `hooks/use-designs.ts`, `hooks/use-brand-kits.ts`, `fonts.ts`,
`components/left-sidebar.tsx`, `components/brand-kit-panel.tsx`, `lib/kit-transfer.ts`,
`components/home.tsx`.

## Conclusão

**O frontend NÃO roda isolado.** A config de build está pronta para o Tauri, mas a persistência
(designs, páginas, templates, brand kits, fontes e uploads) ainda depende 100% do backend Hono/D1/R2.
Não é um problema de `vite.config.ts` nem de caminho absoluto de proxy — é dependência de API.

## Decisão pendente (Renata / Tyago)

Não implementei nenhuma substituição de persistência — é decisão de arquitetura e está fora do meu escopo.
Opções, da menos para a mais invasiva:

1. **Adaptador local em `src/client/api.ts`** (recomendado): manter a assinatura `api(method, path, body)`
   e implementar as rotas com IndexedDB/localStorage + `File`/DataURL para uploads. Nenhum backend, nenhuma
   dependência nova. Preserva os hooks atuais.
2. **Sidecar Rust/Hono**: empacotar o worker como processo filho e expor `/api` localmente. Funciona, mas
   contraria o requisito "sem backend Hono" e aumenta muito o binário.
3. **Backend remoto**: descartado — não é app isolado.

Nota final (Tyago, 2026-11-20 — prevalece sobre o retorno consolidado anterior): o Tyago
aprovou o endurecimento do CSP proposto pelo Emanuel. Em `src-tauri/tauri.conf.json` a produção já
usa `connect-src 'self' ipc: ipc.localhost` e o `devCsp` mantém `http://localhost:* ws://localhost:*`
só para HMR; o `beforeDevCommand` já aponta para `npm run dev:desktop`. Eu criei o script
`"dev:desktop": "vite"` em `package.json`, mantendo `"dev"` intacto para o navegador. Não editei
nenhum dos dois `tauri.conf.json` — o Emanuel é o dono. A divisão de arquivos é:
`api.ts`/`local-db.ts` com Daniela, `tauri.conf.json` com Emanuel, `tauri-bridge.ts`/`public/`/
`docs/`/`export.ts` com Renata, `lib.rs`/`capabilities` com Luan, e `vite.config.ts`/`dist/`/
`package.json`/build comigo (Heitor). Nenhum arquivo de outro agente foi reescrito — apenas
edições de trecho, com anúncio prévio na bridge (houve overwrite concorrente no `lib.rs` às 14:38).

## Revalidação 2026-11-20 — após a ligação do `local-db.ts` (Daniela, AG-06)

Decisão do Tyago: **opção 1**, adaptador local em `src/client/api.ts`, sem
segundo storage e sem backend Hono/sidecar. O `handles()` de `src/client/lib/local-db.ts` agora
desvia `designs`, `pages`, `templates` e `brand-kits` para SQLite (`tauri-plugin-sql`) antes do
`fetch`. Refiz o build do zero (`npm run build`, 22,51 s; só o aviso de chunk >500 kB) e o teste
de isolamento com servidor HTTP estático puro (Node, porta 4399, sem Hono/wrangler).

### Resultado por rota

| Rota chamada pelo cliente | Classificação no desktop | Origem |
| --- | --- | --- |
| `GET/POST /api/designs` | **LOCAL** (SQLite) | `hooks/use-designs.ts:48,123,136` |
| `GET/PUT/DELETE /api/designs/:id` | **LOCAL** | `hooks/use-designs.ts:95,153,173,190,210` |
| `POST /api/designs/:id/pages` | **LOCAL** | `hooks/use-designs.ts:208` |
| `GET/PUT/POST/DELETE /api/pages/:id` (+ `/duplicate`) | **LOCAL** | `hooks/use-designs.ts:78,224,230,247,262` |
| `GET /api/templates` | **LOCAL** | `hooks/use-designs.ts:49` |
| `GET/POST/PUT/DELETE /api/brand-kits` | **LOCAL** | `hooks/use-brand-kits.ts:20,30,41,49` |
| `GET /api/fonts` | **LOCAL** (SQLite + interceptador) | `fonts.ts:103` (via `api()`) |
| `POST /api/fonts` | **LOCAL** | `fonts.ts:87` (`fetch` direto interceptado) |
| `POST /api/uploads` | **LOCAL** | `left-sidebar.tsx:77,96`, `brand-kit-panel.tsx:45`, `kit-transfer.ts:44` |
| `GET /api/uploads/:filename` | **LOCAL** (bytes no SQLite, URL `data:`/`Response`) | URLs retornadas pelo servidor e consumidas por `<img>`/`fetch` |

As 10 rotas recebem 404 no servidor estático (esperado: ele não simula `__TAURI_INTERNALS__`),
mas no Tauri são atendidas localmente. A Daniela estendeu o `handles()` para `fonts`/`uploads`,
moveu os bytes para a tabela `uploads` do SQLite e instalou `installLocalAssetFetch()` em
`api.ts`, que intercepta os `fetch()` diretos sem exigir mudança nos componentes. O bundle
revaliado contém `__opendesignLocalFetch`, `/api/fonts`, `/api/uploads` e `window.fetch`. ✔

### Demais achados

- **Assets:** `/`, JS, CSS e os dois favicons retornaram 200 no estático. O `dist/index.html`
  final usa `./assets/...` para JS, CSS e favicons — o root-relative da origem foi resolvido pelo
  Vite com `base: "./"`. ✔ **Favicon é pendência encerrada** (confirmação do Tyago).
- **Bundle:** nenhuma ocorrência de `localhost:8787` ou `127.0.0.1` no `dist/`. ✔
- **`/__clawnify/presence.js`:** 404 no estático. No bundle vem de `@clawnify/app`
  (`detectSelfHosted()`, `node_modules/@clawnify/app/dist/client/index.js:99-105`): é um `fetch`
  cuja única função é decidir se exibe o cartão/diálogo "Built on Clawnify". O `.catch(() => false)`
  faz com que falha de rede seja inofensiva; se o webview devolver 404, o cartão pode aparecer.
  Não bloqueia o app, mas é efeito colateral visual a confirmar com a Renata.
- **`reportLocation(path)` (guarda aplicada):** em `app.tsx` o `useEffect` passou a chamar
  `if (!isTauri()) reportLocation(path);` (linha 38), com `isTauri` importado de `./lib/tauri`.
  A chamada original faz `post({ source: "clawnify-app", type: "location", ... })`; no desktop só
  postaria para si mesmo. É edição de 2 trechos, anunciada na bridge antes de mexer. Observação:
  isso cobre o `post` de localização — o `fetch` do `presence.js` acima é um efeito separado do
  `@clawnify/app` e permanece (inofensivo).
- **CSP — `font-src data:` (RESOLVIDO pelo Emanuel):** o `csp` de produção e o `devCsp` tinham
  `data:` só em `img-src`, enquanto `loadCustomFont` (`fonts.ts:71`) usa `new FontFace(family,
  'url("data:font/woff2;base64,...")')` — sujeito a `font-src`, que caía em `default-src 'self'` e
  bloquearia fontes customizadas uploadadas no desktop. Conferi em leitura que ambos os CSPs agora
  incluem `font-src 'self' data:`. ✔ Eu não editei `tauri.conf.json`. (Nota: o comentário no
  `local-db.ts` sobre `font-src` estava desatualizado — a Daniela está cuidando da doc.)
- **Uploads:** resolvidos pela Daniela — os bytes ficam na tabela `uploads` do SQLite, o POST
  grava e o GET devolve uma URL `data:` ou uma `Response` com o MIME correto. ✔

### Pendências

1. Confirmar com a Renata se o cartão do `@clawnify/app` deve ser suprimido no build desktop
   (a supressão no Tauri já aparece em `app.tsx:71-72`; vale só confirmar o cartão do `presence.js`).
2. `COPY_PROPOSTAS.md` segue aprovado como proposta — aplicar nos `.tsx` somente com autorização.

### Decisões consolidadas (registradas em 2026-11-20)

- **(a) Favicons:** resolvidos — conferidos no `dist/index.html`, não são mais pendência.
- **(b) CSP `connect-src localhost:*`:** decisão final — **Tyago aprovou** a remoção em produção;
  `connect-src` virou `'self' ipc: ipc.localhost`, com localhost/ws só no `devCsp`. Emanuel editou,
  Heitor não tocou no arquivo.
- **(c) `beforeDevCommand`:** decisão final — `npm run dev:desktop` (vite puro, sem wrangler/Hono).
  Heitor criou o script em `package.json`; Emanuel atualizou o `tauri.conf.json`. `devUrl` 5173 e o
  proxy `/api` do `vite.config.ts` ficaram como estavam (dev-only, inerte no desktop). Atenção:
  não rodar `tauri dev` com `npm run dev` já aberto na 5173.
- **Divisão de arquivos:** `api.ts` e `tauri.conf.json` pertencem à frente de persistência
  (Renata/Daniela/Luan/Emanuel); eu fico com `vite.config.ts` e build. Editar trechos, nunca
  reescrever arquivos inteiros.
- **Copy:** pacote aprovado como proposta em `OpenDesign/COPY_PROPOSTAS.md`; a aplicação nos `.tsx`
  é minha/da Renata, somente quando autorizado. Não apliquei o copy — o único `.tsx` que editei foi
  `app.tsx`, para a guarda do `reportLocation` e o banner de erro de persistência (ambos anunciados
  na bridge), nunca por copy.

## Re-teste final (após a entrega da Daniela e o `dev:desktop`)

Build limpo refeito (`npm run build`, 9,25 s; só o aviso de chunk >500 kB) e mesmo teste de
isolamento (HTTP estático puro na porta 4399). Resultado: **todas as 10 rotas `/api` do bundle
são classificadas como LOCAL** pelo `handles()` atual — incluindo `/api/fonts` e `/api/uploads`,
que antes eram FETCH. O interceptador de `fetch` está presente no bundle. HTML, JS, CSS e os dois
favicons relativos retornaram 200; nenhuma URL `localhost:8787`/`127.0.0.1` no `dist/`.
Único 404 restante: `/__clawnify/presence.js` (inofensivo, ver acima).

Depois da guarda do `reportLocation` em `app.tsx`, refiz o build e o re-teste: segue 10/10 LOCAL,
mesmo interceptador no bundle, e o `/__clawnify/presence.js` continua como único 404 inofensivo.
No `src-tauri/tauri.conf.json` conferi (somente leitura) `beforeDevCommand: "npm run dev:desktop"`,
CSP de produção `'self' ipc: ipc.localhost` e `devCsp` com localhost/ws para HMR — alinhados ao
script criado e **já com `font-src 'self' data:` nos dois**. Não rodei `tauri dev` (evita conflito
de porta com o `npm run dev` na 5173).

**Smoke do script `dev:desktop` (pedido do Emanuel):** com a porta 5173 livre, rodei
`npm run dev:desktop` — Vite v6.4.1 `ready in ~1,3 s`, escutando em `::1:5173`, e
`GET http://localhost:5173/` respondeu **HTTP 200** (506 bytes). É Vite puro, sem wrangler/Hono;
o `devUrl` do Tauri usa exatamente `http://localhost:5173`. Processo encerrado e porta liberada
após o teste. **Divergência encerrada:** `beforeBuildCommand` é `pnpm build` (`tauri.conf.json:10`);
o Emanuel confirmou na bridge que essa é a intenção dele (pnpm 12.21.0 instalado), então não é
mais pendência. (`bundle.active` é `false`, mantido para o teste do `.exe` cru pelo Douglas.)

## Robustez: erro de persistência visível (pedido do Douglas/QA)

O Douglas relatou que o `createDesign` "engole erro e não cria design no desktop". Diagnóstico: o
`console.error` existia (`use-designs.ts:130`), mas os chamadores (`home.tsx:29-32`,
`design-list.tsx:26`) fazem `if (id) navigate(...)` e ignoram o `undefined` — o usuário clica em
"Novo projeto" e não vê nada; no build Tauri sem devtools o console também não ajuda.

Correção (2 arquivos, anunciada na bridge antes de editar — `use-designs.ts` não é meu):

- `src/client/hooks/use-designs.ts`: todos os `catch` passaram por um helper `reportFailure` que
  faz `console.error("[use-designs] ...", cause)` **e** seta um estado `error` com mensagem em
  português + detalhe da exceção. `createDesign`/`createFromTemplate` limpam o erro ao retry. O
  `catch` best-effort antes de duplicar página virou `console.warn` (não mais silencioso). Hook
  expõe `error` e `clearError`. Nenhuma mudança de arquitetura/persistência.
- `src/client/app.tsx`: banner `role="alert"` fixo no topo, com botão de fechar, renderizado na
  tela inicial, no editor e na tela de erro de fontes (padrão visual igual ao de
  `font-picker.tsx:76`). Não mexi em `home.tsx` (edição recente de outro agente) nem em
  `design-list.tsx`.

Validação: `npm run build` limpo (14,26 s; só aviso de chunk >500 kB), `npm test` **14/14** e o
mesmo re-teste de isolamento — 10/10 rotas `/api` locais, HTML/JS/CSS/favicons 200, único 404
inofensivo de `presence.js`. Confirmei no bundle as strings das mensagens e do banner.

**Revalidação após o `pnpm run build` da Daniela (15:32, bundle `index-BR6iqW27.js`):** a leitura
que circulou na bridge (`use-designs.ts:121-132` com "só `console.error` + `undefined`") está
**desatualizada**. O código atual está em `use-designs.ts:129-141`: `clearError()` no sucesso e
`reportFailure(...)` no `catch`; o helper está nas linhas 34-39 e o `error`/`clearError` são
devolvidos nas linhas 322-323. O banner `role="alert"` está em `app.tsx:91-101` e é renderizado
nas telas 110/136/164. Hashes conferidos: `use-designs.ts` `7468a0bf…`, `app.tsx` `ed22e775…` —
inalterados desde a correção. O bundle regenerado contém `Não foi possível criar o projeto`,
`Fechar aviso`, `[use-designs]` e `bg-red-600`.

Teste com falha forçada de persistência (`invoke` mockado lançando `SQLITE_CONSTRAINT` no
`INSERT INTO designs`): o erro propaga com o detalhe e o banner mostraria:

```
Não foi possível criar o projeto. SQLITE_CONSTRAINT: UNIQUE constraint failed: designs.id (código 1555)
```

Ou seja, **não há mais erro engolido na UI**: se o Douglas ainda vir o clique sem efeito, precisamos
do texto do banner/console para investigar a causa real no SQLite (não falta de backend).

## Confirmação: restauração multi-página (dúvida do Luan)

Confirmado ao Luan e registrado aqui para o canal do Tyago. No `dist/` isolado, o re-teste classifica `GET /api/designs/:id` como
LOCAL (10/10 rotas). Para não responder só por leitura, montei um harness dinâmico com esbuild +
`window.__TAURI_INTERNALS__.invoke` mockado (sem Hono, sem wrangler, sem Tauri) exercitando o
adaptador real que vai no bundle:

- `POST /api/designs` criou o design e a primeira página;
- `POST /api/designs/:id/pages` criou mais duas;
- injetei uma quarta página **fora de ordem** no store (`sort_order` cru: `0,1,2,1`);
- `GET /api/designs/:id` devolveu as 4 páginas em `0,1,1,2` — reordenadas pelo
  `ORDER BY sort_order` em `local-db.ts:323` (com `:321` o SELECT do design e `:324` o
  `return { ...row, pages }`) — e o design correspondente. **Correção do Luan:** as linhas 267 e
  273 também têm `ORDER BY sort_order`, mas pertencem a `/fields` GET e `/fill` POST, não ao
  `GET /api/designs/:id`. Antes do revert da Daniela às 15:50 a query estava na linha 342.
  Comportamento inalterado; só o número da linha mudou. O `docs/tauri-bridge-ag07.md` do Luan agora
  cita a query em vez do número da linha.

No cliente, `loadDesign` (`use-designs.ts:159-179`) faz `updatePages(d.pages)` e, havendo páginas,
`setActivePageId(d.pages[0].id)`. Observação: as linhas citadas pelo Luan (`local-db.ts:218-224` e
`use-designs.ts:149-168`) mudaram — a Daniela editou o `local-db.ts` e eu editei o `use-designs.ts`
para o tratamento de erro. O `dist/` está atualizado (bundle mais novo que o `local-db.ts`).
Fontes/uploads saíram do "fora de escopo": o Tyago decidiu nesta rodada que a Daniela cobre
`/api/fonts` e `/api/uploads/*` no adaptador com **DataURL no SQLite** (sem plugin-fs, sem
`asset://`) — detalhe verificado na seção seguinte.

## Verificação do FormData em fonts/uploads (decisão do Tyago nesta rodada)

O Tyago pediu conferência do point técnico: `api.ts` JSON-stringifica qualquer body, então um
`FormData` de `fonts.ts` precisa de tratamento especial no branch `isTauri()`. **Confirmei que o
risco é real**, com harness dinâmico (esbuild + `__TAURI_INTERNALS__.invoke` e `window.fetch`
mockados, sem Hono/wrangler/Tauri), refeito com o `local-db.ts` mais recente da Daniela:

| Chamada | Resultado |
| --- | --- |
| `window.fetch("/api/fonts", { method: "POST", body: FormData })` — é o que `fonts.ts:87` faz hoje | **200**, fonte salva (interceptador `__opendesignLocalFetch` extrai `.get("file")`) |
| `api("POST", "/api/fonts", FormData)` | **FALHA**: `Nenhum arquivo de fonte enviado` |
| `api("POST", "/api/fonts", File)` | **sucesso** — é o que `dispatch` espera (`local-db.ts:517`) |
| `api("GET", "/api/fonts")` | lista as fontes com `url: data:font/ttf;base64,...` |

Nenhuma chamada vazou para o `fetch` nativo (0 acessos à rede). Conclusão: **hoje não há bug
visível**, porque `fonts.ts:87` usa `fetch()` direto e o interceptador já lida com FormData. O
problema aparece se `fonts.ts` passar a chamar `api()` — aí o `FormData` chega ao `dispatch`, que
faz `body instanceof File` e rejeita. O tratamento especial no branch `isTauri()` de `api.ts`
está **com a Daniela**; eu não editei `api.ts`, `fonts.ts` nem `local-db.ts`.

Re-teste do `dist/` isolado (servidor HTTP estático puro, sem Hono/wrangler): 10/10 rotas `/api`
classificadas como LOCAL no bundle, HTML/JS/CSS/favicons 200, único 404 inofensivo de
`/__clawnify/presence.js`. **Atenção:** o `dist/` foi reconstruído por outros agentes três vezes
durante esta verificação (`index-Bwi-_kH8.js` → `index-BHWflTva.js` → `index-DbD7ieMa.js`); os
hashes abaixo são um snapshot, não uma entrega congelada. Não rodei `npm run build` para não
sobrescrever o build concorrente.

CSP: o Emanuel confirmou na bridge que `font-src 'self' data:` **já está** no `csp` e no `devCsp`
(`tauri.conf.json:43-44`) desde a decisão DataURL — não há ação duplicada a fazer.

## Validação final da Daniela: data: URLs no CSP + reload (pedido dela)

**CSP testado de verdade, não só por leitura.** Subi um servidor que injetava o header
`Content-Security-Policy` **exato** de `app.security.csp` do canônico
`src-tauri/tauri.conf.json`, servindo um PNG real (`src-tauri/icons/32x32.png`) e um woff2 real
do `dist/` como `data:` URLs, e abri num Chromium. Resultado:

```
{ img: "ok (32x32)", font: "ok", violations: [] }
```

Ou seja, `img-src 'self' data: blob:` e `font-src 'self' data:` realmente permitem as data: URLs
geradas pelo adaptador; **zero** eventos `securitypolicyviolation`.

**Config da raiz:** não existe mais `OpenDesign/tauri.conf.json`. O único legado é
`docs/tauri.conf.raiz-legado.json.bak` (movido pelo Emanuel), que **não** participa do build —
o `dist/` não contém meta tag de CSP e o Vite não lê config Tauri. Portanto o build isolado **não**
usa a config desatualizada: nada a ajustar na orientação. ✔

**Cenário sugerido pela Daniela** (harness com `invoke`/fetch mockados, SQLite simulado e
reload do módulo com o mesmo store):

```
POST /api/fonts (FormData)      -> 200, Custom-... , url data:font/ttf;base64,...
POST /api/uploads (FormData)    -> 200, url data:image/png;base64,...
bootstrap 2 ("reload")          -> fonte e logo reaparecem, mesmas data: URLs  [PASS]
URL legada /api/uploads/...     -> 404 JSON, sem exceção                     [PASS]
fetch nativo                    -> 0 chamadas (nada vazou para a rede)
```

`/__clawnify/presence.js`: a sugestão da Daniela (`if (!isTauri()) reportLocation(path)`) **já
está aplicada** em `src/client/app.tsx:38`, e o `AppNav`/cartão Clawnify já é suprimido no Tauri
(`app.tsx:71-72`). O `fetch` de `presence.js` vem de dentro de `@clawnify/app` e seu `.catch`
torna o 404 inofensivo. Não foi necessária nova edição em `app.tsx`.

## Validação de CSP rígido para o Luan (pedido do Tyago)

Feita no `dist/` atual (`index-BR6iqW27.js`, gerado pelo `pnpm run build` da Daniela):

- `dist/index.html`: **nenhum `<script>` inline** — único script é
  `<script type="module" crossorigin src="./assets/index-BR6iqW27.js">`; sem handlers inline.
- bundle: **`eval(` = 0**, **`new Function(` = 0**, `Function(` = 0. (Há 7 `setTimeout(`, normais.)
- `csp` de release: `script-src 'self'` — sem `unsafe-inline`/`unsafe-eval`; estes só aparecem no
  `devCsp`, que é esperado para HMR. ✔

`pnpm exec vite` testado na prática como **validação funcional apenas** (não como defesa de
mudança): Vite v6.4.1 `ready in 1,2 s`, `::1:5173`, `GET http://localhost:5173/` → **HTTP 200**
(506 bytes), porta liberada depois. Não exige mudança em `package.json` (`dev:desktop`/`dev`
intactos).

**Pendências de config — não editei (`tauri.conf.json` é do Emanuel):**

1. `beforeDevCommand` segue `npm run dev:desktop` (`tauri.conf.json:9`). **DECISÃO FINAL do Tyago
   (comunicada diretamente neste canal):** "foco no menos pesado" → **manter** `npm run dev:desktop`
   e o script `"dev:desktop": "vite"` como estão. **Não** trocar para `pnpm exec vite` e não refazer
   teste por causa disso. Isso resolve a divergência de repasses anterior (Luan × Emanuel); nada a
   aplicar e nenhum arquivo editado. **Reforço (Luan, rodada atual):** nunca pedi a Renata/Emanuel
   que trocassem para `pnpm exec vite` — o teste que fiz com esse comando foi só validação
   funcional (Vite 6.4.1, GET / 200), nunca defesa de mudança. Conferido em disco: `package.json`
   (`dev:desktop: vite`, hash `b97f50fb…`) e `tauri.conf.json` (`3434c5e8…`) não contêm
   `pnpm exec vite`. Luan avisado na bridge: `m-mwpcl5qs-477`.
2. `connect-src` segue `'self' ipc: ipc.localhost` — tem o esquema `ipc:` e o host `ipc.localhost`,
   mas **não** a forma literal `http://ipc.localhost`. O Luan inicialmente chamou o canal de
   obrigatório, mas depois concluiu que o host-source sem scheme tende a casar com
   `http://ipc.localhost` no Windows e que há fallback via `postMessage`; sem falha observada no
   smoke, **não alterar** sem decisão do Tyago. Concordo com o Emanuel em manter como está.

## Decisões finais do Tyago (rodada atual) — COPY e presence.js

### (b) `COPY_PROPOSTAS.md` — já aplicado, 0 pendências
O documento da Camila registra "Estado: **APLICADO** ... 0 pendências reais" (§7/§16). Auditoria
independente em disco: extraídas **112 strings antigas verificáveis** das tabelas e comparadas com
todos os `.tsx` de `src/client`. Restaram 24 correspondências literais, mas **todas** são
comentários (`{/* Add page button */}`, `{/* Border radius */}`, `{/* Fill color */}`, ...),
identificadores de código (`setBackground`, `startRename`, `canvasWidth`, `handleExport`, ...),
tipos (`Dimensions`, `BrandKit`, `CustomFont`) ou propriedades de fabric/CSS (`strokeWidth`,
`fillStyle`, `cornerStyle`). **Zero textos visíveis em inglês pendentes.** Exemplos confirmados em
disco: `Meus projetos`, `Novo projeto`, `Carregando…`, `Projetos recentes`, `Kit de marca ativo`,
`Desfazer (Ctrl+Z)`, `Refazer (Ctrl+Shift+Z)`, `Nenhum projeto salvo ainda`, `Importar fonte do
computador…`. Em `public/splashscreen.html`: `aria-label="Carregando OpenDesign"` e
`Espaço de design visual`. Não houve nova edição em nenhum `.tsx`; `COPY_PROPOSTAS.md` não foi
tocado (é da Camila).

**Checagem de sincronia `public/` × `dist/` (alerta da Renata sobre `aria-label`):** conferido em
disco e **não há divergência** — `public/splashscreen.html` e `dist/splashscreen.html` têm o mesmo
SHA-256 `4086a5ffac2c2f006110c489511b4ba026524a044627c7010a5a4147726a3af9`, ambos com
`aria-label="Carregando OpenDesign"` (sem o "o") na linha 90; `git diff --no-index` entre eles
retornou exit 0. Varredura recursiva em `OpenDesign/`: só essas duas cópias, com o mesmo hash. Não
houve rebuild nem recopia (nada a corrigir); a leitura com "Carregando o OpenDesign" era de versão
anterior. Se o QA ainda vir o texto antigo, procurar artefato fora do `dist/` atual (ex.: cópia em
`Release/`). Aviso à Renata na bridge: `m-mwpcc96e-460-pmqAmY1gr4RA`.

### (c) `/__clawnify/presence.js` — já suprimido no desktop (prova em navegador)
Origem localizada no SDK `@clawnify/app/dist/client/index.js`: `PLATFORM_PROBE_PATH` (linha 86) e
`detectSelfHosted()` → `fetch(PLATFORM_PROBE_PATH)` (linha 103), chamados por `useCloneNotice` dentro
do `AppNav` (linha 746). No desktop o `AppNav` **não é montado** (`app.tsx:72`: `isTauri() ? null :
<AppNav ...>`) e o `reportLocation` já é guardado (`app.tsx:38`), então o caminho não é executado.

O 404 que eu havia reportado antes era **artefato do próprio harness** (`isolation-test.cjs:84`),
que sonda `/__clawnify/presence.js` incondicionalmente — não um request do app.

**Prova em navegador real:** servi o `dist/` atual com o CSP exato de release e um shim injetando
`__TAURI_INTERNALS__` antes do bundle, registrando todo request no servidor. Resultado:
`isTauri: true`, Home renderizada ("Meus projetos / 0 projetos / Novo projeto"), **43 requests,
`presenceRequests: []`**. Ou seja, **zero** chamadas a `/__clawnify/presence.js` no desktop. Nenhuma
edição de código foi necessária; nenhuma dependência nova. O `dist/` segue com
`index-BR6iqW27.js` e foi revalidado por esse teste (não rodei build, conforme instrução).

**Reabertura do ponto pela Daniela (fechada):** ela voltou a registrar `presence.js` como pendência
em `docs/banco-local.md:32,37`, citando a linha antiga `app.tsx:36`. Reconferi o disco: `app.tsx`
inalterado (`ed22e775…`, mtime 15:16:56), guarda na linha **38** e `AppNav` suprimido na linha
**72**. Respondi na bridge (Daniela `m-mwpcb8t0-456`, Renata `m-mwpcb8t7-457`, ambas entregues)
pedindo o ajuste das duas linhas — `docs/` é da Renata, não editei. Reforcei a regra de coordenação:
HUGO/GAEL/PAULA não são agentes/canais; Tyago decide e Renata coordena. Decisão 4 segue parada no
contrato Luan↔Daniela, com o fallback `data:` intacto.

## Re-teste final pedido pela Daniela (fonts/uploads, código vigente)

Re-fiz o bundle de teste a partir da **fonte atual em disco** (não reaproveitei o anterior) porque o
`local-db.ts` mudou durante a verificação: a Daniela revertou a versão intermediária FS/`asset://`
(hash `56940f7c…`) para o caminho `data:` em SQLite às 15:50 (hash vigente `a92d284…`). O `dist/`
entregue (`index-BR6iqW27.js`, 15:32:42) é **anterior** a esse revert; o build do `.exe`
(`beforeBuildCommand: pnpm build`) pegará o código vigente.

Bundle de teste reconstruído: `api-bundle.cjs` SHA-256
`b5a4d97d834950c331f4efc06a58d32d4ef35a71ee7428149d70fd44758b525c`.

**Harness (upload novo + fonte importada + reload), código vigente:**

```
POST /api/fonts (FormData)  -> 200 Custom-... data:font/ttf;base64,AAEAAAA...
POST /api/uploads (FormData) -> 200 data:image/png;base64,iVBORw...
reload (mesmo store)         -> fonte e logo reaparecem como data:            [PASS]
URL legada /api/uploads/...  -> 404 {"error":"Rota local não implementada..."} sem crash [PASS]
fetch nativo                 -> 0 chamadas
```

**Testes com o código vigente:** `npm test` **14/14** e adaptador (`local-db.test.ts`) **3/3**
(`banco local: fontes e uploads viram data: URLs`, `interceptador local responde fetch direto…`).

**Browser real (bundle do `dist/`, CSP exato de release, shim `__TAURI_INTERNALS__`, store
persistente entre reloads)** — prova final, sem `fontsError` e sem `Failed to fetch`:

```
marker: true | isTauri: true
POST /api/fonts   -> 200 {"family":"Custom-...","name":"minha","url":"data:font/ttf;base64,AAEAAAA..."}
POST /api/uploads -> 200 {"url":"data:image/png;base64,iVBORw0KGgo="}
GET  /api/fonts   -> 200 [{"family":"Custom-...","url":"data:font/ttf;base64,AAEAAAA..."}]
GET  /api/uploads/:key -> 200 content-type: image/png, 8 bytes
reload -> fontes: 1 (mesma data: URL) | logo: 200 image/png (mesmos bytes)
consoleBefore: [] | consoleAfter: []
```

Conclusão enviada à Daniela: **re-teste passou integralmente**, nenhum erro de console para ajustar.
Não criei módulo novo, não implementei camada de persistência e não editei `api.ts`, `local-db.ts`
nem `local-db.test.ts` (são dela). Efeito colateral apenas: `dist/` regenerado por build dela e os
harnesses temporários em `%TEMP%` (fora do repo). `presence.js` **não é pendência**: guarda em
`app.tsx:38`, 0 requests reais no browser (o 404 antigo era artefato do `isolation-test.cjs:84`).

## Pré-requisitos para a decisão 4 (FS + `asset://`) — gaps registrados, nada editado

A versão intermediária do `local-db.ts` (hash `56940f7c…`, já revertida) exercitou o contrato
FS/`asset://` com sucesso no harness (`asset://localhost/%2F…`, SQLite só com metadados, bytes no
FS, sobrevive ao reload, 0 fetch nativo). Para o rollout real faltam, **fora do meu escopo**:

1. **Capabilities** (`src-tauri/capabilities/default.json`, Luan): hoje só `core:default`,
   `dialog:allow-save` e `sql:allow-{execute,load,select}`. Faltam `plugin:fs` (criar/escrever/ler no
   diretório de assets) e `plugin:path` (`resolve_directory`) — o código já invoca
   `plugin:path|resolve_directory` e `plugin:fs|{mkdir,write_file,read_file}`.
2. **Plugin Rust** (`src-tauri/src/lib.rs`, Luan): registrar `tauri-plugin-fs` e `tauri-plugin-path`
   (os mocks do harness não existem no app real).
3. **CSP + `assetProtocol`** (`tauri.conf.json`, Emanuel/Renata): o `csp` atual cobre `data:` em
   `img-src`/`font-src`, mas **não** cobre `asset:` nem `http://asset.localhost`; `connect-src` é
   `'self' ipc: ipc.localhost`. Para `asset://`/`asset.localhost` renderizarem é preciso autorizar o
   esquema e configurar `assetProtocol` com `scope` apontando para o diretório de assets.
4. **URLs legadas**: `/api/uploads/x.png` gravado em kit antigo e usado direto em `<img src>` não
   passa pelo `fetch` interceptado — não renderiza no desktop (`inlineAsset()` devolve `null`, sem
   crash). Migrar via reexportar/reimportar (vira `data:` hoje) e, no rollout `asset://`, prevêer
   tratamento equivalente para URLs legadas.

Enquanto 1–3 não existem, o fallback `data:` em SQLite permanece — decisão explícita da Daniela
para o QA não ficar sem upload. Não alterei nenhum desses arquivos.

**CONFIRMAÇÃO FINAL DO TYAGO (congela a rodada):** DataURL no SQLite é a solução **desta rodada**
para `/api/fonts` e `/api/uploads/*` no adaptador local — **sem plugin-fs e sem `asset://`**. CSP já
aprovada e ativa (Emanuel confirmou). **Nada a alterar até o QA final e o OK explícito do Tyago.**
Os gaps 1–4 acima ficam suspensos (registro técnico para rodada futura), **não pendentes**.

Conferido em disco ao receber a confirmação (nenhuma edição feita):

```
a92d2847304fc95d922602cf6cca18298ce342983c6b2df5d7adf1d6d7dce642  src/client/lib/local-db.ts
8d2cb3b68ec1c4da95569ed8f118fdb6a228eea985b6f198c256e8c4c3b5c3f7  src/client/api.ts
3434c5e8ec2e95581e9c48fcffcb50edb6c6746fbd315c3c5ffb7950755edff2  src-tauri/tauri.conf.json
0c16cd9f55f5c8081ea64cf30e697fe8178910d4fca91eadd77a09152ce1df4d  src-tauri/capabilities/default.json
```

`local-db.ts:17,112` descrevem bytes em base64 no SQLite devolvidos como `data:` URLs;
`installLocalAssetFetch()` em `:445`. CSP de release: `img-src 'self' data: blob:`,
`font-src 'self' data:`, `connect-src 'self' ipc: ipc.localhost`; `devCsp` igual + localhost/ws para
HMR. Capabilities: só `core:default`, `dialog:allow-save` e `sql:allow-{execute,load,select}` — sem
`plugin:fs`/`plugin:path`. `lib.rs` sem `plugin_fs`/`plugin_path`/asset protocol. Tudo alinhado.

## CONGELAMENTO DO `dist/` E GATE — decisão do Tyago (após a dúvida `m-mwpcxi52-499`)

**Congelar o `dist/` a partir deste ponto.** Referência do gate é o bundle **vigente**
`index-BHWflTva.js` (SHA `05b6ea977d382bb62ad5dbec160ced38db6b1b0b24057fe8bab3ec535785980a`) e
`dist/index.html` (SHA `cae1907ec8523295fa7711da0d8bb37b39758fd266c2c155c38658686d6fb1a7`), que
substituíram o antigo `index-BR6iqW27.js` (`b54f0a8b…`).

**Snapshot de congelamento tirado agora (somente leitura):** 80 arquivos em `dist/`, SHA-256
agregado (nome+hash ordenados) `54a943a330c6903a3aca0966943fd9ed0644848c320d74408141f36388b86cc4`.
Arquivos-chave: `assets/index-BHWflTva.js` `05b6ea97…`, `assets/index-OOFQx10i.css` `85896e4c…`,
`index.html` `cae1907e…`, `splashscreen.html` `4086a5ff…`, favicons `ddc21ae3…`/`9de821c3…`.
O snapshot completo está no log da sessão; qualquer mudança no `dist/` a partir de agora quebra o
congelamento.

**Responsabilidades:** quem gera o ÚNICO `.exe` novo é o **Douglas (AG-09)**, não eu — sem
autorização de build para o Heitor nesta rodada. Depois do build e do gate, **ninguém** roda
`pnpm build` até o smoke. Go-live segue **NÃO APROVADO** até gate verde + smoke verde. Zero
commit/push/tag/release/publicação.

Gate = conferir a string ASCII `/assets/index-BHWflTva.js` dentro do PE do novo `.exe`. Os `.exe`
atuais embutem `/assets/index-DbD7ieMa.js` (vide retratação abaixo) e **não** passam no gate.

## RETRATAÇÃO — NÃO smokear/promover o `OpenDesign-FRESH-20261120-1533.exe`

A orientação anterior de smoke test (mensagem `m-mwpbmsd3-418-rxEOMM8-g42m`) está **retratada**.
Auditoria **somente leitura** confirmou que o timestamp engana:

```
SHA-256 7f47b6d4fdab2478eff5ea35971a8a1ad74143cb5562a4c815dd02b42d63f7e1  target/release/app.exe
SHA-256 7f47b6d4fdab2478eff5ea35971a8a1ad74143cb5562a4c815dd02b42d63f7e1  Release/OpenDesign.exe
SHA-256 7f47b6d4fdab2478eff5ea35971a8a1ad74143cb5562a4c815dd02b42d63f7e1  Release/OpenDesign-FRESH-20261120-1533.exe
   todos 13.979.136 b, mtime 15:33:53, e a string ASCII embutida é /assets/index-DbD7ieMa.js
```

Ou seja: o link de 15:33 capturou o bundle **intermediário** `DbD7ieMa`, não o congelado às
15:32 (`index-BR6iqW27.js`, SHA `b54f0a8b…`). Nenhum dos três `.exe` contém a string
`/assets/index-BR6iqW27.js`. O `dist/` atual é ainda mais novo (`index-BHWflTva.js`, 15:52:07).

**Procedimento obrigatório antes de qualquer smoke:** congelar `dist/`, gerar um **NOVO** `.exe`,
verificar a string ASCII `/assets/index-BR6iqW27.js` (ou a do bundle congelado) dentro do PE —
somente então smokear. **Não promover nem publicar sem OK explícito do Tyago.**

Comando de checagem (somente leitura):

```powershell
$p='...\Release\OpenDesign\....exe'; $txt=[Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($p)); [regex]::Matches($txt,'/assets/index-[A-Za-z0-9_-]+\.js') | % { $_.Value } | Sort-Object -Unique
```

Não smokeei, não promovi, não publiquei e não rodei build.

## Auditoria final — aguardar build ativo e conferir par `index-*.js` ↔ `index.html`

**Build ativo: nenhum.** Varredura de processos (`Get-CimInstance Win32_Process`) não encontrou
`cargo`, `rustc`, `tauri`, `pnpm`, `npm`, `vite` nem `esbuild` — só `node dist/server/index.js`
(servidor da bridge). Os arquivos `target/debug/.cargo-{build,artifact,}-lock` são os lockfiles
permanentes do Cargo, não trava de build; teste de abertura com `FileShare.None` nos três retornou
**LIVRE**. Ou seja, o build terminou; não iniciei smoke test nem build.

**O hash do checkpoint estava desatualizado em relação ao disco.** Conferido às 15:52+:

```
dist/assets/index-BHWflTva.js   05b6ea977d382bb62ad5dbec160ced38db6b1b0b24057fe8bab3ec535785980a
dist/index.html                 cae1907ec8523295fa7711da0d8bb37b39758fd266c2c155c38658686d6fb1a7
  referencia: ./assets/index-BHWflTva.js  (existe, hash confere)
  referencia: ./assets/index-OOFQx10i.css (existe, 85896e4c…)
  favicons: favicon-D5-mih_Y.svg, favicon-CP8q6shQ.ico (existem)
index-BR6iqW27.js  -> NAO existe mais
index-Bwi-_kH8.js  -> NAO existe mais
```

`index-BR6iqW27.js` (hash `b54f0a8b…`, citado pela auditoria) foi substituído por
`index-BHWflTva.js`. Não há nenhum `index-*.js` de build no disco fora desse (os outros
`index-*.js` encontrados são do `node_modules`). Bundle vigente contém `__opendesignLocalFetch`,
`/api/fonts`, `/api/uploads` e `Não foi possível criar o projeto`; `eval(`/`new Function(` = 0.
Splashscreen íntegra: `public/` e `dist/` com o mesmo SHA-256 `4086a5ff…`.

**Atenção para o smoke test:** o `target/release/app.exe` tem mtime **15:33:53**, anterior ao
`dist/` atual (**15:52:07**). Se o binário embutiu o frontend no build das 15:33, ele contém o
bundle antigo (`index-BR6iqW27.js`), não o vigente. Confirmar com o Douglas/Renata se o `.exe` do
QA foi recompilado depois do build das 15:52 — caso contrário o smoke test exercita um frontend
desatualizado. Não publiquei nada.

## Correção autorizada: `package.json` `test` passa a 17 testes

Autorização explícita do Tyago (via coordenação, especificação do Douglas/AG-09) para editar
`OpenDesign/package.json:9` (arquivo meu). Incluí `src/client/lib/local-db.test.ts` no esbuild e
`.test-build/client/lib/local-db.test.mjs` no `node --test`.

- Hash de `package.json` após a edição: `db4339e0253e21af1168b77b65e6ec81fbb4c78d1de098491d6b96848719fa21`.
- `npm test` (dentro de `OpenDesign/`): **17/17** — 1 `fonts.test.ts` + 3 `local-db.test.ts`
  (`banco local: designs…`, `banco local: fontes e uploads viram data: URLs`, `interceptador local…`)
  + 13 `fields.test.ts`. Antes eram 14.

**Sobre "adicionar o step no CI": não aplicado — fora do escopo autorizado.** O CI é
`.github/workflows/ci.yml:29` (`npm test` na **raiz**, ou seja, `vitest run` do Habblaud: os 17
testes do próprio Blaudhab). Ele **não** executa os testes do `OpenDesign/`. Como a autorização
restringia escrita a `OpenDesign/`, não editei `.github/workflows/ci.yml` — isso exigiria uma
autorização separada do Tyago e seria feito pelo dono do CI (Manuela/AG-08). Reportei a limitação
na bridge. Não rodei build (somente o Douglas builda).

## Hashes do build entregue (SHA-256)

```
b97f50fb19d4a152962ccc89179af9a0ad27dfc6956c2ace60c090d52334d939  package.json
e5b06611187bb2cb1215998fe0395af1cf6c54016720b1d43402334b7b9a372c  vite.config.ts
7468a0bf6cd67b24ebc1f633128f59f64ce39f213245901f155f9234527c4f2b  src/client/hooks/use-designs.ts
ed22e7755e05ab2be61639d5e0637fb8f5ca9c9dae631d2469313070fe9e3189  src/client/app.tsx
8d2cb3b68ec1c4da95569ed8f118fdb6a228eea985b6f198c256e8c4c3b5c3f7  src/client/api.ts
9dd448bb06f6289f83f18fa13ad5ca04d9f31692578e7e0a0939f7d819de76e0  src/client/fonts.ts
a92d2847304fc95d922602cf6cca18298ce342983c6b2df5d7adf1d6d7dce642  src/client/lib/local-db.ts  (vigente, revertido p/ data: às 15:50)
8db3ae2096f619e425f18c6768a2a41b7a0ebc6a3245b51f2dcd75c4a4b0533d  src/client/lib/local-db.test.ts
3434c5e8ec2e95581e9c48fcffcb50edb6c6746fbd315c3c5ffb7950755edff2  src-tauri/tauri.conf.json
1892e59cd6bf3ae38556701cea87adc4814f44b19c6d3b370efdf9e5fbbc45d1  dist/index.html
b54f0a8b18eba44b34629df8b76301f0d1a452891a9961db278d4c6a305d06c2  dist/assets/index-BR6iqW27.js
85896e4c6a180a5dc3472a27751166dac7414399ce22427248f9fa5adf16b092  dist/assets/index-OOFQx10i.css
```

Snapshot tirado após a verificação do FormData; o `dist/` pode ter mudado depois disso (build
concorrente de outros agentes).

Nada publicado, commitado ou enviado. Nenhuma dependência nova instalada. Alteração restrita a
`OpenDesign/package.json` + `OpenDesign/vite.config.ts` + `OpenDesign/src/client/app.tsx` (guarda do
`reportLocation` + banner de erro) + `OpenDesign/src/client/hooks/use-designs.ts` (só tratamento de
erro, anunciado na bridge) + `OpenDesign/dist/` + este relatório.
