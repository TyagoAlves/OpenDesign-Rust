# MCP local do OpenDesign — planejamento (protótipo V1)

**Status:** proposta + protótipo isolado. Nada disso está integrado ao app, ao build, ao `README`, ao CI, ao `Release/`, à landing nem ao `gh-pages`. Sem commit, push, tag, release ou publicação.

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

**Fora de escopo desta proposta:** publicação, installer, alteração de `package.json`, CI, `README`, landing, `gh-pages`, mudanças em `src/` e `src-tauri/`, e qualquer alteração que afete o gate 78/78 ou o `pnpm test` 17/17.

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
| Settings → Agent access | **ainda não existe** | D5: criar na Fase 1; hoje o protótipo usa `OPENDESIGN_MCP_ENABLE=1` por launch |

---

## 3. Protocolo suportado

O protótipo aceita **duas famílias** para não depender de qual versão o cliente agente usar:

| Família | Versões | Handshake | Particularidades |
| --- | --- | --- | --- |
| Moderna (preferida) | `2026-07-28` | nenhum; `server/discover` | stateless, `_meta.io.modelcontextprotocol.*`, `resultType: "complete"` em toda resposta, `ttlMs`/`cacheScope` em `tools/list`, headers `Mcp-Method` e `Mcp-Name` no HTTP |
| Legada | `2025-11-25`, `2025-06-18` | `initialize` + `notifications/initialized` | sem `resultType`, `protocolVersion` devolvido no `initialize` |

Detalhes implementados no núcleo (`.mcp-prototype/mcp-core.mjs`):

- `server/discover` obrigatório; `tools/list`, `tools/call`; `initialize` só para legado.
- Ordem determinística das ferramentas (cache de cliente).
- Validação de `inputSchema` antes de chamar o backend.
- Ferramenta desconhecida → erro JSON-RPC `-32602`; método desconhecido → `-32601`; versão não suportada → `-32022`; header inconsistente → `-32020`.
- Falha de execução (inclusive erro do backend) → resultado com `isError: true`, não erro de protocolo — o modelo consegue se corrigir.
- Redação profunda de segredos em `content` **e** `structuredContent`.

> Nota de compatibilidade: a spec 2026-07-28 removeu o GET de stream e as sessões de protocolo (`Mcp-Session-Id`). O transporte HTTP do protótipo expõe apenas `POST /mcp` e devolve `405` para outros métodos. Não há `initialize` no caminho moderno.

---

## 4. Arquitetura do protótipo

```
.mcp-prototype/
  catalog.mjs            catálogo V1: 6 toolboxes, 15 ferramentas, schemas
  mcp-core.mjs           JSON-RPC, negociação, validação, redação, tools/list|call
  backend-dev-http.mjs   adaptador HTTP -> API local em 127.0.0.1:8787 (somente dev — D1)
  backend-tauri.ts       esboço Fase 2 -> localApi() (D1) + tauri-bridge.ts (não compila hoje)
  server-stdio.mjs       transporte stdio (uma mensagem por linha)
  server-http.mjs        transporte Streamable HTTP em 127.0.0.1, Bearer + timingSafeEqual
  smoke.mjs              16 asserções, sem dependências e sem servidor real
```

O núcleo não sabe nada sobre transporte nem sobre token. O transporte HTTP mantém o segredo e o injeta como `secrets` para redação; o stdio não recebe token (o limite de confiança é o processo pai).

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

| Controle | Como está no protótipo | Como fica na Fase 1 |
| --- | --- | --- |
| Bind | `127.0.0.1:8788`, **porta fixa**, nunca `0.0.0.0` | mesma porta fixa; se ocupada, falha explícita, sem fallback |
| Opt-in | `OPENDESIGN_MCP_ENABLE=1` por launch; sem isso o processo encerra | D5: toggle em Settings → Agent access, **sem persistência** entre launches |
| Token | `OPENDESIGN_MCP_TOKEN` por env; servidor falha fechado se ausente/curto | gerado pela app a cada launch com `randomBytes(32)`, passado por env ao filho |
| Comparação | `timingSafeEqual`, com checagem de tamanho | igual |
| Exposição | nunca em stdout/stderr/logs/URL; rejeitado em query; `catalog_status` mostra só ID público | igual + logs de auditoria sem o valor |
| Headers | `Mcp-Method`/`Mcp-Name` obrigatórios no HTTP e conferidos com o método da mensagem | igual |
| Body | limite de 40 MB; `cache-control: no-store`; sem CORS | igual |
| Backend | D1: HTTP só no dev, apenas `http://127.0.0.1` e sem token MCP repassado à API | desktop usa `localApi()` direto |

Risco residual: um processo local com o token pode agir como o usuário. Por isso o toggle é explícito e operações de escrita/export passam por consentimento na UI na Fase 2.

**AC-13…22 no protótipo:** AC-13 = nenhuma preferência persistida; AC-14 = 6 caixas/15 tools; AC-15 = token por `env`, query rejeitada e redação profunda; AC-16 = `127.0.0.1:8788` fixo, erro se ocupado, sem fallback; AC-17 = núcleo único para stdio e HTTP; AC-18 = nenhuma CSP/capability alterada; AC-19 = HTTP só no dev, desktop por `localApi()`; AC-20 = `save:true` exigido no schema e forçado no envio; AC-21 = export por arquivo com "lembrar" só em memória; AC-22 = nenhuma tool de lote. `snapshot_ler` expõe `offset` consumível e devolve hash do conteúdo para conferir o total.

---

## 6. Plano por fases

### Fase 0 — Protótipo isolado (concluída nesta entrega)
- [x] Catálogo, núcleo de protocolo e dois transportes em `.mcp-prototype/`.
- [x] Smoke 16/16 sem dependências.
- [x] `pnpm test` 17/17 inalterado; nenhum arquivo de produção tocado.
- **Critério de saída:** protótipo funciona e não altera gate nem testes. ✅

### Fase 1 — Fundação no app (a autorizar)
- Criar **Settings → Agent access** (D5): toggle **por sessão**, texto claro sobre o que é exposto, e botão "copiar comando".
- Gerar token por launch (`randomBytes(32)`) e iniciar o filho HTTP com env; matar o filho ao fechar a app.
- Publicar o ID público da sessão na UI (nunca o token).
- Backend canônico já definido (D1): **desktop usa `localApi()`**; HTTP fica somente no desenvolvimento. Ligar o adaptador desktop.
- Manter **stdio + HTTP na V1** (D3), ambos com o mesmo bind local.
- Adicionar testes do núcleo ao conjunto existente **sem mudar o total 17/17 sem autorização** — preferir arquivo de teste separado e rodá-lo à parte até o Tyago aprovar integração.
- **Critério de saída:** opt-in visível, token rotacionado a cada launch, desligamento ao fechar, zero dependências novas, testes antigos intactos.

### Fase 2 — Desktop, export e consentimento
- Adaptador `backend-tauri.ts` efetivo: `projeto_salvar_nativo`, `snapshot_ler` `origem:"nativo"`, `export_salvar_png/pdf`.
- Export **não gera** o PNG/PDF: o agente só salva um data URL que o editor já produziu. Diálogo nativo (`pick_save_path` + `nonce`) com **confirmação por arquivo** e opção **"lembrar nesta sessão"** (D2). O "lembrar" vale apenas para o processo atual: nunca persiste em disco.
- Lotes de edição com **um único undo** (D6): isso depende de expor um "commit de lote" no hook `use-canvas.ts`. Hoje o histórico é interno ao React/Fabric e inalcançável pela API → **fase 2**, não prometido na V1.
- **Critério de saída:** operações destrutivas pedem OK; lote desfaz em um passo; bridge usada sem duplicar lógica.

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
| Dois backends divergirem (HTTP vs SQLite) | Comportamento inconsistente | D1 resolvida: desktop usa `localApi()`, HTTP só no dev; contrato único de tool → rota |
| Undo de lote prometido e não entregue | Frustração | D6: explicitamente fase 2; V1 não expõe tool de lote |
| Reaproveitar código do Drift | Contaminação GPLv3 | implementação própria; protocolo público; nenhum arquivo/texto copiado |
| Mexer em áreas proibidas | Quebrar gate/QA | escrita restrita a `docs/mcp-planejamento.md` e `.mcp-prototype/` |

---

## 8. Decisões registradas (Tyago, 20/11/2026)

As seis decisões pendentes foram respondidas uma a uma e **todas seguiram a recomendação** do protótipo. Não há mais decisões em aberto para a V1.

| ID | Tema | Decisão | Onde reflete |
| --- | --- | --- | --- |
| **D1** | Backend canônico | `localApi()` no desktop; HTTP **somente no dev** | §4, §5, Fase 1, risco de divergência; `backend-dev-http.mjs` e `backend-tauri.ts` |
| **D2** | Consentimento do export | Confirmação **por arquivo**, com opção **"lembrar nesta sessão"** (sem persistência) | Fase 2, riscos; `backend-tauri.ts` |
| **D3** | Transportes na V1 | **stdio + HTTP**, com o mesmo bind local | §4, Fase 1; `server-stdio.mjs` e `server-http.mjs` já existem |
| **D4** | `templates_preencher` | **`save:true` sempre**; cria novo design, nunca sobrescreve o template de origem | §4, riscos; `catalog.mjs` e ambos os backends |
| **D5** | Settings → Agent access | Criar na **Fase 1**, antes de qualquer integração | §2, §5, Fase 1 |
| **D6** | Undo de lote | **Fase 2**; V1 não promete lote com undo único | §2, Fase 2, riscos; nenhuma tool de lote no catálogo |

**Efeito no protótipo:** nenhuma reescrita de protocolo. Ajuste apenas no esboço `backend-tauri.ts` para explicitar D1 (desktop via `localApi()`) e D2 (confirmação por arquivo com "lembrar nesta sessão" em memória). Os transportes e o catálogo já atendiam D3 e D4. Nenhuma implementação de produção foi iniciada.

---

## 9. Validação desta entrega

Comandos executados **sem** alterar arquivos de produção:

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

O gate de rastreabilidade (78/78) não foi recalculado porque nenhum binário, `dist/`, `Release/`, CI ou landing foi tocado — permanece vigente como estava.

---

## 10. Arquivos desta entrega

- `docs/mcp-planejamento.md` — este documento.
- `.mcp-prototype/catalog.mjs`, `mcp-core.mjs`, `backend-dev-http.mjs`, `backend-tauri.ts`, `server-stdio.mjs`, `server-http.mjs`, `smoke.mjs`.

Nada mais foi escrito. Nenhum commit, push, tag, release ou publicação.
