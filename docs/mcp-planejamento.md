# MCP local do OpenDesign — planejamento (V1)

**Status:** proposta executada: o protótipo isolado e a integração ao app estão na árvore de trabalho sob Gate 2 **`BLOQUEADO — não PRONTO`** (`docs/mcp-qa.md` §8; receita em `docs/mcp-gate2-preparacao.md`). Não há build/CI pareado, baseline nova, item 8, smoke da matriz integrada nem autorização de publicação. `README`, CI, `Release/`, landing e `gh-pages` não foram tocados; nenhuma publicação nova, commit, push, tag ou release.

**Autoria/licença:** implementação própria, em TypeScript/JavaScript, sobre o protocolo MCP público e sobre a API já existente do OpenDesign. O Drift é GPLv3 e o OpenDesign é MIT: **nenhum código, texto, nome de arquivo ou string do repositório do Drift foi copiado**. A inspiração se limita ao comportamento observável (servidor local, desligado por padrão, token por sessão, stdio/HTTP) e ao protocolo MCP, que é público.

---

## 1. Objetivo e escopo

Oferecer a agentes de IA uma forma **local, explícita e auditável** de usar o OpenDesign: catálogo de ferramentas organizado em caixas (*toolboxes*), projetos, templates/campos, brand kits, snapshot e export.

**Princípios**

1. Nada de nuvem: o servidor só escuta em `127.0.0.1`.
2. Desligado em **cada launch**; opt-in não persiste entre execuções.
3. A aplicação é a dona do consentimento: token rotacionado por sessão, gerado na inicialização, nunca gravado em arquivo, log ou URL.
4. Reaproveitar o que já existe — `local-db.ts`, rotas `/api/*` e a bridge Tauri — sem duplicar regras de negócio.
5. Nenhuma dependência npm nova.

**Fora de escopo nesta etapa:** publicação, installer, CI, `README`, landing, `gh-pages`, `Release/` e qualquer alteração ao gate 78/78 ou ao `pnpm test` 17/17. As mudanças em `src/`, `src-tauri/` e no catálogo já existem na árvore de trabalho como integração Gate 2, sem build pareado; nada aqui autoriza promovê-las.

---

## 2. O que já existe (inventário)

| Recurso | Onde | Uso no MCP |
| --- | --- | --- |
| `/api/designs` (GET/POST/PUT), `/api/designs/{id}`, `/pages` | `src/server/index.ts` | `projeto_listar`, `projeto_abrir`, `projeto_salvar` |
| `/api/designs/{id}/fields`, `/fill` (`save`) | `src/server/index.ts` + `src/server/fields.ts` | `templates_campos`, `templates_preencher` |
| `/api/templates` | `src/server/index.ts` | `templates_listar` |
| `/api/brand-kits` (GET/POST/PUT) | `src/server/index.ts` | caixa Brand kits |
| `localApi(method, path, body)` | `src/client/lib/local-db.ts` | despacho local SQLite no desktop, sem HTTP |
| `saveDesignNative`, `loadDesignNative`, `saveDataURLNative`, `dataURLKind` | `src/client/lib/tauri-bridge.ts` | `projeto_salvar_nativo`, `snapshot_ler` nativo, export |
| histórico de undo/redo | `src/client/hooks/use-canvas.ts` | **não** acessível pela API → undo de lote é Fase 2 |
| Settings → Agent access | `src/client/components/agent-access-panel.tsx` (Gate 2 integrado) | D5 entregue na árvore de trabalho; no protótipo isolado o opt-in é `OPENDESIGN_MCP_ENABLE=1` por launch |

---

## 3. Protocolo suportado

O núcleo (protótipo e integrado) aceita **duas famílias** para não depender de qual versão o cliente agente usar:

| Família | Versões | Handshake | Particularidades |
| --- | --- | --- | --- |
| Moderna (preferida) | `2026-07-28` | nenhum; `server/discover` | stateless, `_meta.io.modelcontextprotocol.*`, `resultType: "complete"` em toda resposta, `ttlMs`/`cacheScope` em `tools/list`, headers opcionais `Mcp-Method` e `Mcp-Name` no HTTP (validados se presentes) |
| Legada | `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05` | `initialize` + `notifications/initialized` | sem `resultType`, `protocolVersion` devolvido no `initialize` |

Detalhes implementados nos dois núcleos (`.mcp-prototype/mcp-core.mjs` e `src/client/mcp/mcp-core.mjs`):

- `server/discover` obrigatório; `tools/list`, `tools/call`; `initialize` só para legado.
- Ordem determinística das ferramentas (cache de cliente).
- Validação de `inputSchema` antes de chamar o backend.
- Ferramenta desconhecida → erro JSON-RPC `-32602`; método desconhecido → `-32601`; versão não suportada → `-32022`; header inconsistente → `-32020`.
- Falha de execução (inclusive erro do backend) → resultado com `isError: true`, não erro de protocolo — o modelo consegue se corrigir.
- Redação profunda de segredos em `content` **e** `structuredContent`.
- Comportamento canônico de notificações: toda `notifications/*` — com ou sem `id` — é aceita silenciosamente pelo núcleo (`null`), antes da validação de versão e headers. No HTTP o `null` vira `202 Accepted` sem corpo (`src-tauri/src/mcp/http.rs:256-262`); nunca `-32601`.

> Nota de compatibilidade: a spec 2026-07-28 removeu o GET de stream e as sessões de protocolo (`Mcp-Session-Id`). Os transportes HTTP (protótipo e integrado) expõem apenas `POST /mcp` e devolvem `405` para outros métodos. Não há `initialize` no caminho moderno.

---

## 4. Arquitetura (protótipo e integração)

```
.mcp-prototype/
  catalog.mjs            catálogo V1: 6 toolboxes, 15 ferramentas, schemas
  mcp-core.mjs           JSON-RPC, negociação, validação, redação, tools/list|call
  backend-dev-http.mjs   adaptador HTTP -> API local em 127.0.0.1:8787 (somente dev — D1)
  backend-tauri.ts       esboço -> localApi() (D1) + tauri-bridge.ts; na integração é src/client/mcp/backend-tauri.ts
  server-stdio.mjs       transporte stdio (uma mensagem por linha)
  server-http.mjs        transporte Streamable HTTP em 127.0.0.1, Bearer + timingSafeEqual
  smoke.mjs              16 asserções, sem dependências e sem servidor real
```

O núcleo não sabe nada sobre transporte nem sobre token. O transporte HTTP mantém o segredo e o injeta como `secrets` para redação; o stdio não recebe token (o limite de confiança é o processo pai).

Na integração Gate 2 os mesmos papéis são ocupados por `src/client/mcp/{mcp-core.mjs,catalog.mjs,backend-tauri.ts,confirm.ts,bridge.ts}`, `src/client/hooks/use-mcp-access.ts`, `src/client/components/agent-access-panel.tsx` e `src-tauri/src/mcp/{http.rs,stdio.rs}`. Catálogo e protocolo são idênticos aos do protótipo; o que muda é o backend e o ciclo de vida do token, gerado pelo app.

### Catálogo V1 (15 ferramentas)

| Caixa | Ferramentas |
| --- | --- |
| Catálogo | `catalog_toolboxes`, `catalog_status` |
| Projeto | `projeto_listar`, `projeto_abrir`, `projeto_salvar`, `projeto_salvar_nativo` |
| Templates/campos | `templates_listar`, `templates_campos`, `templates_preencher` |
| Brand kits | `brand_kits_listar`, `brand_kits_criar`, `brand_kits_atualizar` |
| Snapshot | `snapshot_ler` |
| Export | `export_salvar_png`, `export_salvar_pdf` |

`catalog_status` expõe somente ID público da sessão, transporte e versão negociada — nunca o token, nunca caminhos de arquivo.

**Decisão de segurança no preenchimento (D4, aprovada):** `templates_preencher` exige `save: true` no pedido — único valor aceito no schema — e sempre o envia à API, criando um **novo** design. Isso evita que um agente sobrescreva o template de origem. O custo é não poder "pré-visualizar sem salvar" na V1.

---

## 5. Segurança

| Controle | Protótipo isolado | Integração Gate 2 (árvore de trabalho) |
| --- | --- | --- |
| Bind | `127.0.0.1:8788`, **porta fixa**, nunca `0.0.0.0` | mesma porta fixa; se ocupada, falha explícita, sem fallback |
| Opt-in | `OPENDESIGN_MCP_ENABLE=1` por launch; sem isso o processo encerra | D5: toggle em Settings → Agent access, **sem persistência** entre launches |
| Token | `OPENDESIGN_MCP_TOKEN` por env; servidor falha fechado se ausente/curto | gerado pela app a cada launch com `randomBytes(32)`, passado por `env` ao cliente no snippet |
| Comparação | `timingSafeEqual`, com checagem de tamanho | igual |
| Exposição | nunca em stdout/stderr/logs/URL; rejeitado em query; `catalog_status` mostra só ID público | igual, inclusive no snippet da UI (`env`, nunca `argv`/`Authorization`/URL) |
| Headers | `Mcp-Method`/`Mcp-Name` opcionais no HTTP; se enviados, `Mcp-Method` é conferido com o método da mensagem e `Mcp-Name` não pode ser vazio | igual |
| Body | limite de 40 MB; `cache-control: no-store`; sem CORS | igual |
| Backend | D1: HTTP de **dados** só no dev, apenas `http://127.0.0.1` e sem token MCP repassado à API | desktop usa `localApi()` direto; o HTTP em 8788 é o **transporte MCP** (D3), não o backend de dados |

Risco residual: um processo local com o token pode agir como o usuário. Por isso o toggle é explícito e `mcp_exportar` passa por consentimento por arquivo na UI (D2, já no Gate 2). Escrita de projeto não tem consentimento por arquivo nesta V1: `templates_preencher` grava com `save:true` (D4) e `projeto_salvar` com `id` sobrescreve pela API local (lacuna registrada em `docs/mcp-qa.md` §8.3).

**AC-13…22 nos dois núcleos:** AC-13 = nenhuma preferência persistida; AC-14 = 6 caixas/15 tools; AC-15 = token por `env`, query rejeitada e redação profunda; AC-16 = `127.0.0.1:8788` fixo, erro se ocupado, sem fallback; AC-17 = núcleo único para stdio e HTTP; AC-18 = nenhuma CSP/capability alterada; AC-19 = HTTP só no dev, desktop por `localApi()`; AC-20 = `save:true` exigido no schema e forçado no envio; AC-21 = export por arquivo com "lembrar" só em memória; AC-22 = nenhuma tool de lote. `snapshot_ler` expõe `offset` consumível e devolve hash do conteúdo para conferir o total.

---

## 6. Plano por fases

### Fase 0 — Protótipo isolado (concluída)
- [x] Catálogo, núcleo de protocolo e dois transportes em `.mcp-prototype/`.
- [x] Smoke 16/16 sem dependências.
- [x] `pnpm test` 17/17 inalterado; nenhum arquivo de produção tocado naquela entrega.
- **Critério de saída:** protótipo funciona e não altera gate nem testes. ✅

### Fase 1 — Fundação no app (entregue na árvore de trabalho; Gate 2 **BLOQUEADO**)
- [x] Criado **Settings → Agent access** (D5): toggle **por sessão**, texto claro sobre o que é exposto e botão "copiar comando".
- [x] Token gerado por launch (`randomBytes(32)`) e entregue ao cliente por `env` no snippet; listener HTTP gerenciado pelo app.
- [x] Publicado o ID público da sessão na UI (nunca o token).
- [x] Backend canônico (D1): **desktop usa `localApi()`**; HTTP de dados fica somente no desenvolvimento. Adaptador desktop ligado.
- [x] Mantidos **stdio + HTTP na V1** (D3), com o mesmo bind local.
- [ ] Testes do núcleo no conjunto existente: `package.json` segue com 17 testes; nenhum `*.test.*` cobre MCP (AC-10 verde não cobre integração).
- **Critério de saída:** implementado na árvore de trabalho; **não** significa matriz executada nem gate aprovado — ver `docs/mcp-qa.md` §8.

### Fase 2 — Desktop, export e consentimento (parcial: export entregue; lote/undo permanece pendente)
- [x] Adaptador `backend-tauri.ts` efetivo: `projeto_salvar_nativo`, `snapshot_ler` `origem:"nativo"`, `export_salvar_png/pdf`.
- [x] Export **não gera** o PNG/PDF: o agente só salva um data URL que o editor já produziu. Diálogo nativo (`pick_save_path` + `nonce`) com **confirmação por arquivo** e opção **"lembrar nesta sessão"** (D2). O "lembrar" vale apenas para o processo atual: nunca persiste em disco.
- [ ] Lotes de edição com **um único undo** (D6): depende de expor um "commit de lote" no hook `use-canvas.ts`. O histórico é interno ao React/Fabric e inalcançável pela API → **fora da V1**, conforme `AC-07`/`NEG-04` Fase 2.
- **Critério de saída:** export com OK por arquivo entregue; lote/undo segue como **MANUAL/PENDENTE** até exposição e decisão explícita.

### Fase 3 — Hardening e operação
- Rate limiting por sessão e limites por ferramenta.
- Auditoria local append-only de chamadas (sem token, sem conteúdo de canvas).
- Tratamento de `server/discover` como probe em stdio, timeouts e reconexção.
- Revisão de segurança antes de qualquer decisão de distribuição — que **não** está autorizada nesta proposta.

---

## 7. Riscos e mitigação

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Agente fazer escrita acidental | Sobrescrever design do usuário | `templates_preencher` com `save:true` (D4); consentimento na UI na Fase 2; sem `DELETE` no catálogo V1 |
| Export para arquivo errado | Arquivo do usuário sobrescrito | confirmação **por arquivo** (D2) + diálogo nativo com `nonce`; "lembrar nesta sessão" não persiste |
| Token vazar em log/URL | Terceiro local agir como usuário | falha fechada, `timingSafeEqual`, redação profunda, rejeição de query, `no-store` |
| Porta local acessível por outro processo | Exposição de dados locais | bind `127.0.0.1` + token obrigatório + opt-in por launch |
| Porta ocupada / conflito com o dev server | Falha de init | porta fixa 8788 (separada do dev 8787); erro explícito no init, sem fallback |
| Cliente usar versão antiga | Incompatibilidade de handshake | aceitar `2025-11-25`/`2025-06-18` com `initialize`; moderno sem handshake |
| `canvas_json` muito grande | Memória/CPU | limite de body 40 MB e limite de amostra em `snapshot_ler` |
| Dois backends divergirem (HTTP vs SQLite) | Comportamento inconsistente | D1 resolvida: desktop usa `localApi()`, **backend HTTP de dados** só no dev; o HTTP em 8788 é transporte MCP (D3); contrato único de tool → rota |
| Undo de lote prometido e não entregue | Frustração | D6: explicitamente fase 2; V1 não expõe tool de lote |
| Reaproveitar código do Drift | Contaminação GPLv3 | implementação própria; protocolo público; nenhum arquivo/texto copiado |
| Mexer em áreas proibidas | Quebrar gate/QA | nesta etapa, escrita restrita às correções P1–P4 e ao alinhamento documental; `Release/`, `dist/`, `target/`, `.pages-wt/`, CSP, capabilities e catálogo intocados |

---

## 8. Decisões registradas (Tyago, 20/11/2026)

As seis decisões pendentes foram respondidas uma a uma e **todas seguiram a recomendação** do protótipo. Não há mais decisões em aberto para a V1.

| ID | Tema | Decisão | Onde reflete |
| --- | --- | --- | --- |
| **D1** | Backend canônico | `localApi()` no desktop; HTTP **somente no dev** | §4, §5, Fase 1, risco de divergência; `backend-dev-http.mjs` e `backend-tauri.ts` |
| **D2** | Consentimento do export | Confirmação **por arquivo**, com opção **"lembrar nesta sessão"** (sem persistência) | Fase 2, riscos; `backend-tauri.ts` |
| **D3** | Transportes na V1 | **stdio + HTTP**, com o mesmo bind local | §4, Fase 1; `server-stdio.mjs` e `server-http.mjs` já existem |
| **D4** | `templates_preencher` | **`save:true` sempre**; cria novo design, nunca sobrescreve o template de origem | §4, riscos; `catalog.mjs` e ambos os backends |
| **D5** | Settings → Agent access | Criado na integração Gate 2 (árvore de trabalho, **BLOQUEADO**) | §2, §5, Fase 1 |
| **D6** | Undo de lote | **Fase 2**; V1 não promete lote com undo único | §2, Fase 2, riscos; nenhuma tool de lote no catálogo |

**Efeito no protótipo:** nenhuma reescrita de protocolo. O esboço `backend-tauri.ts` explicita D1 (desktop via `localApi()`) e D2 (confirmação por arquivo com "lembrar nesta sessão" em memória); transportes e catálogo já atendiam D3 e D4. Na integração, as seis decisões estão no código da árvore de trabalho sob Gate 2 bloqueado: D1/D2/D3/D4/D5 implementados, D6 fora da V1. Nada disso foi publicado.

---

## 9. Validação desta entrega

Comandos **históricos** da entrega do protótipo isolado — não são evidência do Gate 2. A revalidação local desta etapa está em `docs/mcp-qa.md` §8.3 e o plano de validação futura em `docs/mcp-gate2-preparacao.md`:

```
node .mcp-prototype/smoke.mjs     -> 5 amostras (uma tool por caixa não-catálogo) + SMOKE OK — 16/16
pnpm test                         -> pass 17 / fail 0
node .mcp-prototype/testes-seguranca.mjs (suíte externa, somente leitura) -> 6/6 SIM
git status --short                -> apenas paths novos permitidos

As amostras carregam evidência auditável: `snapshot_ler` aceita `offset` e
devolve `total_caracteres` + `sha256_canvas` do conteúdo real; `export_salvar_png`
declara `dimensoes`, `bytes_decodificados` e `semantica` de pass-through (a tool
não renderiza o design); `templates_preencher` declara `operacao` e `destino_id`.
```

O gate de rastreabilidade (78/78) segue **sem baseline nova**: o par local antigo é `75/78` e inválido (exe↔`dist/` dessincronizados), não é "ajuste de expectativa". Nenhum binário, `dist/`, `Release/`, CI ou landing foi promovido nesta etapa; ver `docs/mcp-qa.md` §8.3 e `docs/mcp-gate2-preparacao.md` §5.

---

## 10. Arquivos desta entrega

- `docs/mcp-planejamento.md` — este documento.
- `.mcp-prototype/catalog.mjs`, `mcp-core.mjs`, `backend-dev-http.mjs`, `backend-tauri.ts`, `server-stdio.mjs`, `server-http.mjs`, `smoke.mjs`.

Na etapa restrita atual também foram escritos os arquivos das correções P1–P4 e o plano `docs/mcp-gate2-preparacao.md`. Nenhum commit, push, tag, release, deploy ou publicação nova; Gate 2 permanece `BLOQUEADO — não PRONTO`.
