---
id: QA-MCP-OPENDESIGN
data: 2026-11-21
responsavel: Douglas — QA e segurança
status: GATE 1 PRONTO (protótipo isolado: 6/6 SIM, crítica cega Flávia `ses_e04c30a8cffeRxJb5yFAaicyEZ` = NÍVEL MÁXIMO nenhum); Gate 2 da versão integrada **PRONTO** em 21/11/2026 — matriz 28/28 sem PENDENTE e sem NÃO (24 SIM + 4 MANUAL com limitação declarada), executada no exe pareado `51D5A6EB…0121`; baseline nova de CI do mesmo run `44894873417` (commit `8c1c932`, `pnpm test` 17/17, gate `-FullAssetSet` 78/78 antes e depois do bundle, exe inalterado), roundtrip 48/48 no exe da CI, item 8 fechado nos instaladores da CI (MSI e NSIS com SHA idêntico ao exe gateado e gate reaplicado 78/78). AC-07, AC-09, NEG-03 e Fase 2 de NEG-04 permanecem MANUAL, sem conversão em SIM; baseline antiga `D57E2866…ACF74` intacta; `Release/` congelada; nenhuma promoção local
escopo: matriz AC/NEG executada com harnesses em `.mcp-prototype/` contra o build pareado e contra o exe da CI; evidências em `C:\Users\tyago\AppData\Local\Temp\opencode`; `dev` publicada em `8c1c932`; nenhuma promoção para `Release/`, nenhuma alteração em `shared/world/**` ou `server/world/**`
---

# MCP no OpenDesign — plano de QA e segurança

## 0. Premissas, baseline e limites

- **Plano de QA + evidência de gate.** O protótipo isolado e a integração Gate 2 existem como
  código na árvore de trabalho — inclusive a tela `Settings → Agent access` e o serviço local —.
  A matriz §8.2 foi executada no app integrado em 21/11/2026 (§8.4): 24 SIM e 4 MANUAL, sem
  PENDENTE e sem NÃO. Quatro linhas permanecem MANUAL por limitação de ambiente/decisão
  registrada (AC-07, AC-09, NEG-03, Fase 2 de NEG-04); nenhuma foi convertida em SIM por
  evidência estática. Não há nuvem, conta ou acesso remoto.
- **Referência conceitual, não cópia.** O Drift (GPLv3) serviu apenas de inspiração para o
  padrão “opt-in local, desligado por padrão, token por sessão”. Nenhum código, documento,
  config, nome, string, ícone ou marca do Drift pode entrar no OpenDesign (MIT, `LICENSE`).
  A única menção permitida é esta ressalva de licença em documentos de planejamento.
- **Go-live fechado e intocável.** A baseline aprovada continua sendo o artefato do CI
  `44818112977`, artefato `14671391681`, ZIP `sha256:400de06ad0318d23244119ba88ab036da1574e6b94cd76401258b6f8fd96c40d`.
  Exe publicado: `Release/OpenDesign.exe`, 13.946.880 bytes, SHA-256
  `D57E2866D9BF7390A799882137060761222CC1F53A200C0AEA94AA147A8ACF74`.
  Qualquer evidência local de `dist/`, `target/` ou builds antigos **não** substitui essa baseline.
- **Fora de escopo nesta etapa restrita:** `Release/`, `README`, landing/`gh-pages`, `.github/`,
  CI, build, instaladores, commit, push, tag, release, draft e publicação. Os únicos arquivos
  escritos nesta etapa são os do `escopo` no frontmatter: correções P1–P4, alinhamento documental
  e o registro em `docs/mcp-gate2-preparacao.md`.
- **UX e escopo de referência:** [`docs/mcp-ux.md`](mcp-ux.md) define
  `Configurações → Acesso do agente`, default off, token oculto/copiável e os estados
  `Desligado` → `aguardando agente` → `Agente conectado`.
  [`docs/mcp-planejamento.md`](mcp-planejamento.md) define o catálogo V1, o protocolo e as decisões
  D1–D6 do Rafael, já refletidas na integração da árvore de trabalho. Este plano define como
  validá-los no app integrado; não altera a baseline.
- **Protótipo isolado:** `.mcp-prototype/` é prova de conceito, não produto. Ele não altera bundle,
  PE, assets, CSP, comandos Tauri, gate ou baseline. A integração dele ao app **sim** dispara §6.
- **Decisões do Tyago registradas em 20/11/2026:** não há pendências em aberto para a V1. As seis
  respostas levantadas neste documento foram aceitas e o escopo de tools segue o plano do Rafael.
  Ver §7. Qualquer reversão é mudança de escopo e volta ao §6.
- **Gate 1 ≠ Gate 2.** O `PRONTO` do Gate 1 cobre apenas o protótipo isolado (§3.1). A versão
  integrada foi auditada em 21/11/2026 (20 subagentes, somente leitura) e, depois da autorização
  de publicação, teve a matriz AC-01…22/NEG-01…06 executada no app integrado. O resultado está no
  §8: **Gate 2 PRONTO** (24 SIM + 4 MANUAL = 28/28), com baseline de CI do mesmo run e item 8
  fechado nos instaladores da CI. Quatro linhas seguem MANUAL por limitação declarada, sem
  conversão em SIM.

### 1. Critérios de aceite — visão geral

| ID | Critério | Evidência mínima de aceite |
|---|---|---|
| AC-01 | Desligado por padrão **a cada launch**: sem listener, sem stdio, sem token e sem indicador verde ao abrir o app, mesmo após uso anterior. | Snapshot de estado + `netstat`/process list antes de qualquer clique; restart sem opt-in. |
| AC-02 | Ativação **explícita** em `Settings → Agent access` (`Configurações → Acesso do agente`). Nada liga por CLI, env, flag, migration ou preferência persistida. | Clique deliberado no toggle; diff/revisão de código; log de teste sem auto-enable. |
| AC-03 | HTTP escuta **somente** `127.0.0.1`. Nunca `0.0.0.0`, `::`, IP de LAN, hostname externo ou fallback automático de porta. | `Get-NetTCPConnection`/`netstat -ano` com PID do app; tentativa de conexão pelo IP da máquina falha. |
| AC-04 | Token **aleatório, por sessão, trocado a cada ciclo de ativação**. Token antigo morre no disable, no close e no restart. | T1≠T2; chamadas com T1 após revogação/restart recusadas. |
| AC-05 | Token **nunca** em logs, console, snapshots, DB, `localStorage`, URL/query, título de janela, tooltip, argv, dump ou evidência de QA. | Varredura pelo valor exato do token em todos os artefatos; evidências mascaradas. |
| AC-06 | Transportes **stdio e HTTP** disponíveis após opt-in, com o mesmo conjunto de capacidades e a mesma semântica de erro. | Matriz de testes stdio/HTTP; nenhum bind de rede no stdio. |
| AC-07 | **Fase 2 (condicional):** quando o lote for exposto, ele é atômico e desfazível em uma única ação. | Gate da Fase 2; na V1 a aceitação é AC-22 (nenhuma tool de lote). |
| AC-08 | SQLite local é a única fonte da verdade: mesmo `sqlite:opendesign.db` em `app_config_dir`, sem 2º storage, sem SQL arbitrário do MCP, sem path escape. | Caminho do DB; hashes; escopo por design; nenhum arquivo novo fora da pasta do app. |
| AC-09 | **Nenhum egresso de nuvem**: sem conta, sync, telemetry, DNS externo, chamada à bridge `:4747`, Wrangler/D1/R2 ou fetch externo. | Firewall/proxy de teste + netstat + varredura estática do bundle. |
| AC-10 | `pnpm test` continua **17/17**. | Saída do comando no CI/local, sem saltos. |
| AC-11 | Gate de bundle continua **78/78** (`scripts/check-embedded-bundle.ps1 -FullAssetSet`), com um único `/assets/index-*.js` no PE. | Saída do gate + SHA do bundle. |
| AC-12 | CSP de release permanece **exatamente** a aprovada; capability permanece mínima. | String comparada byte a byte; `capabilities/default.json` sem novas permissões. |
| AC-13 | Auto-start **não sobrevive ao restart**. Pode valer somente depois do clique de ligar, dentro da sessão; ao desligar, volta a desmarcado. | MCP-03 + inspeção de `localStorage`/DB após restart; nenhuma preferência de auto-enable. |
| AC-14 | Catálogo V1 = **6 toolboxes / 15 tools**, exatamente as do plano do Rafael: `catalog_toolboxes`, `catalog_status`; `projeto_listar`, `projeto_abrir`, `projeto_salvar`, `projeto_salvar_nativo`; `templates_listar`, `templates_campos`, `templates_preencher`; `brand_kits_listar`, `brand_kits_criar`, `brand_kits_atualizar`; `snapshot_ler`; `export_salvar_png`, `export_salvar_pdf`. `catalog_status` mostra só ID público da sessão, transporte e versão negociada — nunca token ou caminho de arquivo. | `tools/list` completo nos dois transportes; diff do catálogo; varrer respostas por token/paths. |
| AC-15 | Token entregue ao cliente pelo campo **`env` do snippet** (`OPENDESIGN_MCP_TOKEN`), **nunca** em argv, URL/query, stdout/stderr, logs ou snapshots. Servidor falha fechado se ausente/curto; token em query é rejeitado. | Snippet gerado pela UI + `Get-CimInstance Win32_Process` + varredura de logs/responses. |
| AC-16 | HTTP em **porta fixa `8788`**, bind `127.0.0.1:8788`. Se ocupada, falha explícita; **sem fallback** para 8787, porta efêmeral ou outro endereço. | `netstat` com PID; erro na UI; retry após liberar 8788; 8787 segue sendo só o dev server. |
| AC-17 | **stdio + HTTP obrigatórios na V1**, com paridade de catálogo, erros e regras de token. | Matriz §2.2 nos dois transportes e nas famílias de protocolo do plano do Rafael. |
| AC-18 | Nenhuma mudança de CSP ou capability sem nova rodada de QA e OK do Tyago. | MCP-14 + §6; string da CSP e `capabilities/default.json` comparadas byte a byte. |
| AC-19 | Backend canônico do desktop é `localApi()`; HTTP backend fica **somente no dev**. Token MCP nunca é repassado à API local. | Revisão do adaptador + netstat: desktop não conecta em `127.0.0.1:8787`. |
| AC-20 | `templates_preencher` envia **`save:true` sempre**, criando um novo design; nunca sobrescreve o template de origem. | NEG-05 + comparação do template antes/depois; novo `id` devolvido. |
| AC-21 | Exportação usa confirmação **por arquivo**; “lembrar nesta sessão” vale só em memória e não persiste. `export_salvar_png`/`export_salvar_pdf` apenas salvam data URL já gerada pelo editor. | MCP-16 + NEG-06 + restart sem preferência de confirmação gravada. |
| AC-22 | A V1 **não expõe tool de lote**. Tentativa de chamar nome de lote retorna erro JSON-RPC `-32602` e não altera DB/canvas. | `tools/list` sem lote + NEG-04 parte V1. |

---

## 2. Matriz de testes positivos

### 2.1 Default off, opt-in e ciclo de vida

**MCP-01 — cold start limpo**
1. Instalar/iniciar o binário em máquina de QA com perfil novo.
2. Antes de abrir `Configurações`, registrar: `netstat -ano`, processos `OpenDesign*`, estado do toggle,
   presença de token na UI, conteúdo de `localStorage`/DB.
3. Repetir após ter usado o MCP e fechado o app.

Esperado: nenhum socket em listen criado pelo app, nenhum child stdio, toggle desligado, token
ausente, chip de conexão ausente, nenhuma preferência que religue o acesso.

**MCP-02 — opt-in explícito e snippet com `env`**
1. Abrir `Configurações → Acesso do agente`.
2. Clicar em `Permitir acesso do agente`.
3. Observar transição para `Serviço local ativo — aguardando agente`; gerar T1.
4. Clicar em copiar snippet e inspecionar o texto copiado **antes** de mascarar T1.

Esperado: estado muda somente após o clique; token aparece oculto por padrão; snippet/copy
habilitado; `Agente conectado` **não** aparece antes de uma conexão real; o snippet contém
`"env": { "OPENDESIGN_MCP_TOKEN": "<T1>" }` e **nenhum** `--token`, `?token=`, `Authorization` em URL
ou argv; nenhum log imprime T1.

**MCP-03 — restart não religa (decisão confirmada)**
1. Ligar, conectar, marcar o auto-start, desligar o app sem clicar em `Desligar e revogar token`.
2. Reabrir o app.

Esperado: default off (AC-01/AC-13); toggle desligado, checkbox de auto-start desmarcado, T1
inválido. O auto-start só poderia ter efeito dentro da mesma sessão, depois do clique de ligar.
Se religar sozinho, é **falha de segurança**, não bug cosmético.

**MCP-04 — desligar/revogar**
1. Com agente conectado, clicar em `Desligar e revogar token`.
2. Tentar reutilizar T1; verificar listener/child/estado/UI.

Esperado: listener encerrado, child stdio encerrado, T1 recusado, campo de token limpo, checkbox de
auto-start desmarcado, volta a `Desligado` com texto+ícone (não só cor).

**MCP-05 — rotação por sessão**
1. Ligar → T1. Desligar. Ligar → T2. Fechar app. Abrir e ligar → T3.
2. Testar T1 e T2 contra o serviço ativo com T3.

Esperado: T1≠T2≠T3; somente T3 funciona; nenhum token antigo é reemitido, reutilizado ou persistido.

### 2.2 Transportes (V1 obrigatórios)

**MCP-06 — HTTP local positivo, porta fixa 8788**
1. Após opt-in, usar exatamente `http://127.0.0.1:8788/mcp` com `Authorization: Bearer <T>` e o token
   também presente no `env` do cliente conforme o snippet.
2. Exercitar as duas famílias do plano do Rafael: moderna `2026-07-28` (`server/discover` obrigatório,
   sem `initialize`, `POST /mcp`, demais métodos `405`) e legada `2025-11-25`/`2025-06-18`
   (`initialize` + `notifications/initialized`).
3. Executar `tools/list`, `tools/call`, leitura de design e uma tool de escrita permitida.
4. Capturar `Get-NetTCPConnection` e tentar o endpoint pelo IP da LAN e por `localhost:8787`.

Esperado: somente `127.0.0.1:8788` escutando pelo PID do OpenDesign; conexão pelo IP da LAN recusada;
`8787` continua sendo exclusivo do dev; cabeçalhos `Mcp-Method`/`Mcp-Name` coerentes; body com limite
de 40 MB, `cache-control: no-store`, sem CORS; nenhuma requisição sai da máquina; erro sem token em
body/header.

**MCP-07 — stdio positivo**
1. Após opt-in, iniciar o comando stdio gerado pela UI, com o token no campo `env` do snippet.
2. Repetir `server/discover`/`initialize`, `tools/list` e uma leitura/escrita equivalente ao HTTP.
3. Enviar EOF/`SIGTERM` equivalente e desligar pela UI.

Esperado: nenhuma porta TCP aberta pelo child stdio; mesmo catálogo e mesma semântica de erro do
HTTP; token **não** aparece em `wmic process get CommandLine`, `Get-CimInstance Win32_Process`,
stdout/stderr, título ou logs — apenas no ambiente do processo filho; ausência de token faz o child
falhar fechado; processo morre limpo, sem órfão e sem porta residual.

**MCP-08 — paridade stdio × HTTP e protocolo**
Comparar `server/discover`/`initialize`, `tools/list`, `tools/call`, leitura, escrita e erro de token
nos dois transportes e nas três versões suportadas.

Esperado: mesma semântica funcional e de erro; diferenças apenas de enquadramento do transporte.
Erros esperados: `-32602` tool/schema inválida, `-32601` método desconhecido, `-32022` versão não
suportada, `-32020` header inconsistente. Falha de backend vem como resultado `isError: true`, não
como erro de protocolo. O frontend não faz `fetch()` para `127.0.0.1`; isso exigiria mudar a CSP (§6).

### 2.3 Catálogo, edição e SQLite

**MCP-09 — lote desfazível em uma ação (Fase 2, condicional)**
1. Abrir design de teste; registrar hash do DB, JSON do design e screenshot do canvas.
2. Enviar lote com 3–5 edições válidas (texto, posição, página, por exemplo).
3. Confirmar que o editor reflete todas as edições.
4. Acionar **uma** vez o undo (atalho/botão do editor).
5. Comparar DB, JSON e canvas com o estado inicial.

Esperado quando a Fase 2 expuser o lote: uma única entrada no histórico; um undo reverte **todas**
as edições; nenhuma modificação parcial visível; editor utilizável. **Na V1 este teste é substituído
por AC-22/NEG-04 parte V1:** não existe tool de lote e nenhuma escrita ocorre.

**MCP-10 — isolamento do SQLite e backend canônico**
1. Verificar que o adaptador usa `sqlite:opendesign.db` resolvido pelo plugin em `app_config_dir`
   (`%APPDATA%\com.opendesign.app\` no Windows observado), o mesmo de `src/client/lib/local-db.ts`.
2. Confirmar que as tools do desktop despacham via `localApi()` e que o adaptador HTTP só existe no
   dev; nenhum token MCP é repassado à API.
3. Criar dois designs; tentar ler/editar o design B enquanto o escopo ativo é o A.
4. Tentar caminho absoluto, `..`, URI alternativa ou SQL arbitrário pelo MCP.

Esperado: um único DB, tabelas vivas `designs`, `pages`, `templates`, `brand_kits`, `uploads`; nenhum
2º `.db`; nenhuma escrita fora da pasta de config do app; escopo respeitado; SQL arbitrário recusado;
nenhuma conexão do desktop a `127.0.0.1:8787`. A migration `0001_init.sql` não é reescrita.

**MCP-11 — sem nuvem**
1. Com o MCP ativo, bloquear egresso com regra temporária de firewall (removida ao final) ou proxy
   de teste que nega tudo; capturar conexões com `netstat`/`Get-NetTCPConnection`.
2. Repetir leitura, escrita, exportação e `snapshot_ler`.
3. Varrer `dist/` e o PE por URLs externas, `localhost:8787`, `:4747`, `wrangler`, `D1`, `R2`.

Esperado: funcionalidade integralmente local; nenhum DNS/HTTPS externo, nenhuma chamada à bridge
do Habblaud, nenhum telemetry; regra de firewall removida e registrada como limpa.

**MCP-15 — catálogo V1 e `templates_preencher`**
1. Chamar `catalog_toolboxes` e `tools/list` nos dois transportes; conferir 6 caixas e 15 tools do
   plano do Rafael, sem tool de lote.
2. Chamar `catalog_status`; varrer a resposta por token e por caminhos de arquivo.
3. Chamar `templates_preencher`; inspecionar o body enviado ao backend e o design criado.

Esperado: catálogo idêntico ao de `docs/mcp-planejamento.md`; `catalog_status` só com ID público da
sessão, transporte e versão negociada; `save:true` enviado sempre; novo design criado; template de
origem byte-idêntico; redação profunda de segredos em `content` **e** `structuredContent`.

**MCP-16 — export com consentimento**
1. Chamar `export_salvar_png` e `export_salvar_pdf` sem confirmação; depois confirmar um arquivo.
2. Marcar “lembrar nesta sessão”, usar outra tool de export e fechar/reabrir o app.

Esperado: nenhum arquivo escrito sem confirmação; diálogo nativo com `pick_save_path` + nonce
one-shot; cada arquivo confirmado separadamente; data URL salva é a já produzida pelo editor;
“lembrar” vale apenas no processo atual e não reaparece após restart.

### 2.4 Compatibilidade com gates publicados

**MCP-12 — testes unitários**
`pnpm test` → **17/17**: 13 em `src/server/fields.test.ts`, 1 em `src/client/fonts.test.ts`,
3 em `src/client/lib/local-db.test.ts`. Testes novos do núcleo MCP ficam em arquivo separado e são
rodados à parte até autorização de integração; a contagem base não pode cair.

**MCP-13 — gate de bundle**
`powershell -File scripts/check-embedded-bundle.ps1 -Exe <exe> -DistDir dist -FullAssetSet`
→ exit 0, **78/78** no estado publicado, com exatamente um `/assets/index-*.js` embutido e igual ao
`<script src>` de `dist/index.html`. O número 78 é derivado de `src`/`href` + arquivos em
`dist/assets/`; se uma implementação legítima mudar a contagem, é **re-baseline**, não “ajuste de expectativa”.

**MCP-14 — CSP e capability**
Comparar byte a byte:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ipc: ipc.localhost
```

Esperado: idêntica. `capabilities/default.json` continua com apenas `core:default`,
`dialog:allow-save`, `sql:allow-load`, `sql:allow-select`, `sql:allow-execute`. Novas permissões
`http:*`, `fs:*`, `shell:*`, `process:*` ou `window:allow-*` extras exigem nova rodada (§6), conforme
decisão do Tyago.

**MCP-17 — snippet e variável de ambiente**
1. Copiar o snippet com o MCP ligado; conferir `env` com `OPENDESIGN_MCP_TOKEN`, sem token em argv,
   URL, corpo de config extra ou comentário.
2. Iniciar stdio e HTTP com o `env`; depois repetir com `env` ausente e com token curto.

Esperado: ambiente é o único canal de entrega ao cliente; servidor falha fechado nas duas variações
inválidas; comparação com `timingSafeEqual`; nenhum valor tentado é logado; token em query string é
rejeitado mesmo que o `env` esteja correto.

---

## 3. Testes negativos obrigatórios

| ID | Cenário | Setup | Resultado esperado | Evidência |
|---|---|---|---|---|
| NEG-01 | Token inválido / ausente / em query | Serviço ativo com T1; enviar token ausente, curto, aleatório, revogado, T de outra sessão e `?token=T1`. | HTTP `401` para ausente/inválido, `403` para revogado (ou política única aprovada); query token rejeitado; corpo genérico, sem stack, sem eco do token, sem detalhe de config. stdio falha fechado e não expõe tools. Após 10 tentativas: sem crash, sem troca de porta, sem log com o valor tentado. | Response redigida, console, `netstat` antes/depois. |
| NEG-02 | Porta **8788** ocupada | Ocupar previamente `127.0.0.1:8788` com socket local; clicar em ligar. | Fail closed: erro claro `Porta 8788 em uso`; **sem fallback** para 8787, efêmera, `0.0.0.0` ou `::`; sem token ativo deixado para trás. Ao liberar somente 8788, novo clique funciona e gera token novo. | `netstat`, screenshot sem token, PID, retry green. |
| NEG-03 | Editor/app fechado | **(a)** fechar a aba/documento com o MCP conectado; **(b)** fechar a janela/app; **(c)** desligar pelo toggle. | (a) chamadas ao design retornam `not_found`/`editor_closed`, sem escrita e sem undo novo. (b)(c) listener 8788 encerra, child stdio morre, token do `env` inválido, nenhum processo órfão segurando porta; restart volta ao default off. DB íntegro. | `netstat`, process list, hash do DB, resposta de erro. |
| NEG-04 | Batch — V1 e Fase 2 | **V1:** chamar qualquer nome de tool de lote. **Fase 2:** lote com 3 edições válidas + 1 que falha na etapa 3 (dado inválido/gancho de teste, sem código de produção só para testar). | **V1:** `-32602`, nenhuma tool no catálogo, DB/canvas intatos. **Fase 2:** transação inteira abortada; DB byte-idêntico; canvas idêntico; nenhuma edição parcial; nenhuma entrada de undo órfã; um único `isError:true`; editor responsivo; depois lote corrigido funciona e **um** undo reverte tudo. | `tools/list`, hashes DB/JSON, screenshot, histórico de undo, response. |
| NEG-05 | `templates_preencher` tenta sobrescrever | Enviar `save:false`, omitir `save` ou apontar para o `id` do template de origem. | `save:true` é forçado; novo design criado; template de origem com hash idêntico; nenhuma rota de `DELETE`/update de template no catálogo V1; erro estruturado se o pedido tentar sobrescrever. | Body da chamada, hashes antes/depois, `isError:true`. |
| NEG-06 | Export sem consentimento / “lembrar” persistido | Chamar export sem confirmação; cancelar diálogo; marcar “lembrar nesta sessão” e reiniciar app. | Nenhum arquivo gravado sem confirmação; cancelamento não cria arquivo; nonce reutilizado/inválido recusado; preferência de “lembrar” inexistente após restart; nenhum token em nome de arquivo ou log. | Diretório de export antes/depois, diálogo, restart, varredura de log. |

Regras comuns aos negativos: nenhum segredo em mensagem de erro; nenhuma repetição infinita de
handshake; nenhuma mudança de estado global após falha; falha registrada como `FAIL` se o app
“se recuperar” escondendo efeito parcial.

### 3.1 Suíte isolada de negativos — execução e evidência

Os seis cenários executáveis vivem em `.mcp-prototype/testes-seguranca.mjs`, fora do bundle, do PE e
do CI. Rodar com `node .mcp-prototype/testes-seguranca.mjs`; o script usa só Node built-ins e módulos
do próprio protótipo, não importa nem executa código de produção (a conferência do nonce one-shot é
leitura estática de texto), não grava arquivo e libera as portas que abre. O `node --check` no mesmo
arquivo é o gate sintático. A suíte cobre R1–R6 abaixo: a parte V1 de NEG-04 (nenhuma tool de lote) é
verificada em R4 por catálogo e por chamada com `-32602`, enquanto NEG-03 (editor fechado) segue como
verificação manual e a parte Fase 2 de NEG-04 continua sendo o gate de MCP-09 — nenhuma delas é
substituída por esta suíte.

| Relatório | Cenário (contrato) | AC / NEG | Decisão de origem | Resultado obtido em 20/11/2026 |
|---|---|---|---|---|
| R1 | token ausente | AC-13 / AC-15 / AC-17 / NEG-01 | Tyago 3 | **SIM** — token só no `env` do snippet (sem `--token`); ciclo AC-13 no protótipo: `OPENDESIGN_MCP_ENABLE=1` abre 8788 e aceita o token, `SIGTERM` encerra o child e o listener e torna o token antigo inalcançável, relaunch volta a `off` (exit 2, sem tools); opt-in por launch nos dois transportes e nenhuma preferência persistida; sem token exit 3 sem bind; com a app já ligada, 401 sem `Bearer` e 400 com token em query; `-32602` idêntico em stdio e HTTP; varredura de logs/snapshots sem segredo. |
| R2 | token curto | AC-15 / NEG-01 | Tyago 3 | **SIM** — partida: token de 3 caracteres encerra exit 3 sem bind nem eco; stdio sem opt-in encerra exit 2 com stdout vazio e nenhuma tool exposta, e com opt-in e token inválido nada é anunciado nem ecoado; HTTP ativo: `timingSafeEqual` recusa curto/ausente/mesmo tamanho (401 para ambos, 200 só para o correto); 10 tentativas inválidas continuam 401 com corpo genérico `{erro}`, sem stack/eco, sem crash e sem troca de porta; token antigo/de outra sessão recusados pela mesma política 401 nos dois transportes; varredura de logs/snapshots sem segredo. |
| R3 | porta 8788 ocupada | AC-16 / NEG-02 | Tyago 4 | **SIM** — host fixo `127.0.0.1` e `PORT=8788`, sem `0.0.0.0`; 8788 ocupada → `EADDRINUSE` explícito para o token ativo e para o token novo no retry, ambos sem listener (nenhum token MCP ativo deixado para trás, só o socket ocupante sem token), mensagem de UI “Porta 8788 em uso” documentada e nenhum bind alternativo; após liberar sobe em `127.0.0.1:8788` com o token novo e recusa o antigo com 401; 8787 não é usado pelo MCP (reservado ao dev). |
| R4 | sobrescrita de template | AC-14 / AC-19 / AC-20 / AC-22 / NEG-05 / NEG-04 | D4 / Tyago 2 | **SIM** — catálogo 6/15 completo e idêntico em stdio e HTTP, sem tool de lote; `lote_editar` → `-32602` com backend intacto; `catalog_status` só metadados, sem token e sem caminho; desktop via `localApi()`, backend HTTP só no dev e API local sem token/header extra. Fluxo inválido: `save:false`, `save` omitido e `id_origem` extra → `isError:true` e zero chamadas ao backend. Fluxo válido: `POST /fill` com `save:true` forçado, nenhuma rota `/api/templates`, origem intacta e novo `id` `design-novo` devolvido. |
| R5 | export sem consentimento | AC-21 / NEG-06 | D2 | **SIM** — cancelamento faz `autorizar` lançar antes de `saveDataURLNative`; `data_url` validada e passada direto à bridge, sem geração; confirmação por arquivo (nome e `chaveSessao` com `a.png`); nonce one-shot conferido estaticamente na bridge/Rust (emitido, vinculado ao caminho, consumido antes da gravação e reutilização recusada). |
| R6 | não persistência de “lembrar nesta sessão” | AC-21 / NEG-06 | D2 | **SIM** — `Set` local, chave por arquivo; varredura de storage sem preferência gravada; novo launch (Set novo) pede confirmação; nenhuma API de disco/`localStorage` no adaptador. |

Evidência local desta rodada: `node --check` exit 0; suíte **6/6 SIM**; `pnpm test` **17/17**. O gate
`-FullAssetSet` **78/78** é o registro do go-live (`docs/qa-golive-desktop.md`, run `44818112977`);
ele **não** foi reexecutado aqui porque `dist/`/`target/` locais divergem da baseline publicada.
`Release/OpenDesign.exe` segue inalterado: 13.946.880 bytes, SHA-256 `D57E2866…ACF74`.

**Revisão cega — rodada atual (20/11/2026).** Crítica cega única — Flávia, ID real devolvido pela
ferramenta de subagente nesta sessão: `ses_e04c30a8cffeRxJb5yFAaicyEZ`. Material enviado: somente os 6 relatórios
SIM/NÃO e as listas AC-13…22 e NEG-01…06 (sem script, diffs, raciocínio, conversa ou recados).
**Veredito final registrado: `NÍVEL MÁXIMO: nenhum` — nenhum achado。** O ID anterior
`ses_e04df65d6ffea56EunsXqVlK3I` não aparece no snapshot e foi descartado; nenhum veredito dele é
usado como gate. Com o crítico real em `nenhum`, a suíte 6/6 SIM, `pnpm test` 17/17 e a baseline
SHA-256 `D57E2866…ACF74` intacta, a frente passa para **PRONTO** sem build, publicação ou commit.

**Decisão do Tyago (20/11/2026):** manter NEG-03 como verificação manual no binário e aceitar como
exceção conhecida o apontamento cego decorrente da presença de NEG-03 no material obrigatório. A
decisão foi incorporada somente como anotação de escopo na linha NEG-03 do material cego; NEG-03
continua no pacote, nenhuma cobertura adicional foi inserida na suíte isolada e nada mudou em CSP ou
capability.

Regra de ouro: qualquer `NÃO` em R1–R6 bloqueia a frente. Um `SIM` aqui não autoriza integrar o
protótipo, mudar CSP/capability nem publicar — isso continua no §6 e depende de OK explícito do Tyago.
NEG-03 (editor/app fechado) e a parte Fase 2 de NEG-04 seguem como verificação manual e gate de MCP-09;
a suíte isolada não substitui nenhum dos dois e não autoriza integração ao binário. O Tyago decidiu
manter ambos como manuais e aceitar as exceções no material cego; AC-18 permanece verificado pelo
registro do go-live (diff byte a byte da CSP/capability e OK do Tyago), sem mudança nesta frente.

---

## 4. Verificações transversais de segurança

### 4.1 Token — ciclo de vida completo
- Gerado somente depois do opt-in, com CSPRNG (`randomBytes(32)` no desenho do Rafael); nunca
  derivado de hora, PID, nome de usuário ou dado do projeto.
- **Decisão do Tyago:** entrega ao cliente pelo campo `env` do snippet, usando `OPENDESIGN_MCP_TOKEN`.
  Nunca em argv, URL/query, stdout/stderr, logs, dump, tooltip, `aria-label`, título de janela,
  snapshot MCP (inclusive `structuredContent`) ou evidência de QA.
- Falha fechada se `env` estiver ausente ou curto; comparação com `timingSafeEqual`; redaction profunda
  em `content` e `structuredContent`; `cache-control: no-store`; nenhum CORS.
- Vive em memória no app e no ambiente do processo filho; não vai para disco, DB, `localStorage` ou
  `sessionStorage`. A varredura é feita pelo **valor exato capturado em memória durante o teste**, não
  por regex frágil. O valor nunca é escrito no relatório; se aparecer em artefato, o artefato é
  descartado e refeito com máscara.

### 4.2 Bind e superfície de rede
- **Porta HTTP fixa `8788`**, bind restrito a `127.0.0.1:8788`; nenhum `0.0.0.0`, `::1`, IP de LAN,
  mDNS, UPnP, tunelamento, fallback para 8787 ou escolha efêmera.
- `8787` continua sendo exclusivo do dev server; o MCP não o usa e não conversa com ele no desktop.
- Firewall do Windows não é usado como única defesa; o bind é a defesa.
- stdio não abre socket algum; se abrir, reprova.
- Nenhuma dependência/runtime externa iniciada (`externalBin`/sidecar continuam ausentes).

### 4.3 Catálogo, backend e consentimento
- Catálogo V1 exatamente o de `docs/mcp-planejamento.md`; nenhuma tool improvável adicionada “de graça”.
- `catalog_status` nunca devolve token nem caminho de arquivo.
- Desktop usa `localApi()`; HTTP backend é somente do dev; token MCP não é repassado à API.
- `templates_preencher` com `save:true`; export com confirmação por arquivo e “lembrar” em memória.

### 4.4 Clean-room e licença
- Revisão de diff e grep por nomes/strings/configs do Drift antes de qualquer merge de implementação.
- Nenhum arquivo, trecho, tradução, ícone ou doc do Drift copiado; nome do projeto/nosso prefixo
  (`OpenDesign`, `OPENDESIGN_*`) em qualquer config nova.
- Auditoria de dependências: não entrar GPL/AGPL; licenças MIT/Apache-2.0/BSD/ISC com registro em
  `LICENCAS.md` se alguma dependência nova for adotada.
- Se surgir código GPL no caminho de build/distribuição: **bloqueio imediato**, remoção e novo QA.

### 4.5 Evidências sem vazamento
Todo pacote de evidência deve conter: saída de `pnpm test`, saída do gate, CSP comparada,
`netstat`/process list, hashes do DB antes/depois, responses redigidas, screenshots com token
oculto/mascarado e a lista de comandos executados. Antes de anexar, rodar varredura pelo valor do
token em todo o diretório de evidências. **Se o token aparecer, a evidência não é anexada.**

---

## 5. Regras de reprovação (fail-fast)

- Qualquer auto-enable no launch, mesmo que “só para desenvolvimento”; auto-start que sobreviva ao restart.
- Qualquer bind fora de `127.0.0.1:8788`, qualquer fallback de porta e qualquer uso do MCP em 8787.
- Token em argv, URL/query, stdout/stderr, log, DB, snapshot ou persistência; token ausente/curto aceito.
- Catálogo diferente de 6 caixas/15 tools; `catalog_status` vazando token ou caminho.
- Tool de lote na V1; batch com efeito parcial; undo em múltiplas etapas; histórico órfão na Fase 2.
- `templates_preencher` sem `save:true` ou que sobrescreva o template de origem.
- Export sem confirmação por arquivo, nonce reutilizado ou preferência “lembrar” persistida.
- Desktop usando HTTP backend em vez de `localApi()`; token repassado à API.
- MCP com SQL arbitrário, segundo DB, escrita fora de `app_config_dir` ou acesso a outro design.
- Qualquer egresso externo, ainda que “opcional” ou só telemetry.
- `pnpm test` < 17/17, gate != 78/78 no estado atual, CSP/capability alteradas sem nova rodada e OK do Tyago.
- Uso de material do Drift (código/doc/config/branding) ou dependência GPL/AGPL.

---

## 6. Gatilhos de novo QA do binário publicado

A publicação atual está fechada e **nenhum** item abaixo pode ser feito “por conta própria”.
Todo gatilho exige: novo CI, novo run, novo artefato, nova baseline **do mesmo run**, verificação
exe↔dist e instalador↔exe (item 8), smoke dos instaladores e OK explícito do Tyago antes de qualquer
publicação. Reutilizar hash/run antigo é reprovação automática.

| Mudança | Por que exige novo QA | Pacote mínimo |
|---|---|---|
| Qualquer código em `src/client/**`, `src/server/**`, `index.html`, CSS, fontes ou assets | Muda o bundle/hash embutido e a contagem do `FullAssetSet` | `pnpm test` → build → gate 1 → bundle → gate 2 → SHA equality → item 8 → smoke |
| Nova rota/tela `Settings`, snippet/copy e strings pt-BR de `mcp-ux.md` | Novo chunk/asset; risco de mais de um `index-*.js` no PE | Idem + validação visual/aria do toggle e do `env` |
| Integrar `.mcp-prototype/**` ao app, catálogo/tools, porta 8788 ou variável `OPENDESIGN_MCP_TOKEN` | Novo processo/porta/contrato externalizado; muda o modelo de ameaça | Idem + matriz §2/§3 completa + auditoria de licença |
| `src-tauri/src/lib.rs`, `commands.rs`, `Cargo.toml`, migration ou qualquer comando Tauri | Muda o binário Rust e a superfície IPC | Idem + smoke CDP de `invoke` + verificação de permissões |
| `capabilities/default.json` (novo `http:*`, `fs:*`, `shell:*`, `process:*` etc.) | Amplia privilégio; quebra menor privilégio aprovado | Idem + parecer de segurança + OK do Tyago |
| `tauri.conf.json` CSP (`csp`/`devCsp`) ou `connect-src` para `127.0.0.1` | A CSP aprovada deixa de ser a do binário; muda o contrato de segurança | Idem + smoke real de CSP (não só estático) |
| Backend desktop deixar de usar `localApi()`, ou HTTP backend entrar no release | Contrato D1 muda; risco de dois storages/egresso | Idem + NEG-01/NEG-02/NEG-05 + varredura de rede |
| Mudança nas decisões D2/D4/D6 (export, `save:true`, undo de lote) | Reabre riscos de sobrescrita e consentimento | Idem + testes específicos alterados + OK do Tyago |
| Schema/migration do SQLite (`0001_init.sql`, `local-db.ts`) | Pode corromper DB já aplicado; migration v1 não pode ser reescrita | Idem + teste de upgrade a partir de DB real legado |
| `scripts/check-embedded-bundle.ps1`, `package.json`, workflow, instaladores | Muda o próprio gate/CI; baseline não é mais comparável | Idem + re-baseline aprovado pelo Tyago |
| Material/licença do Drift descoberto no build | Contágio GPL em produto MIT | Bloquear, remover, auditoria, rebuild completo |
| Escrever/revisar `.mcp-prototype/testes-seguranca.mjs` e este gate | Arquivos isolados: não entram no bundle, no PE, no CSP, nos comandos Tauri nem no CI | **Não** exige novo QA do binário; revalidar `node --check` + 6/6 SIM |
| **Somente documentos (`docs/mcp-qa.md`, `docs/mcp-ux.md`, `docs/mcp-planejamento.md`)** | Não altera bundle, PE, assets, CSP, comandos ou CI | **Não** exige novo QA do binário |

Gate 1 autorizado: o pacote do Gate 2 está no **§8**. Nenhum item da tabela acima foi executado
nesta frente: não houve build, nova baseline, CI, smoke, commit nem publicação. O resultado local
do gate `-FullAssetSet` (75/78, par exe↔`dist/` dessincronizado) está registrado no §8.3 e **não**
substitui a baseline publicada do run `44818112977`.

Nota: os artefatos locais atuais (`dist/index-B8HL4cME.js`, `target/release/app.exe` com SHA
`3D56E6F3…`) divergem da baseline publicada; eles não podem ser usados como referência de
“já passou”. A referência é o run `44818112977`/artefato `14671391681`.

---

## 7. Decisões do Tyago (20/11/2026) — incorporadas

| # | Decisão | Onde reflete neste plano |
|---|---|---|
| 1 | Auto-start continua **sem sobreviver ao restart**, como em `mcp-ux.md`. | AC-13, MCP-03, §5. |
| 2 | Escopo das tools segue o plano do Rafael: Projeto, Fields/Templates, Brand kits, Export e Snapshot; **`templates_preencher` com `save:true`**. | AC-14, AC-20, MCP-15, NEG-05; catálogo de 6 caixas/15 tools. |
| 3 | Token entregue ao cliente por **`env` do snippet** (`OPENDESIGN_MCP_TOKEN`); nunca em argv/URL/logs. | AC-15, MCP-02, MCP-07, MCP-17, §4.1, NEG-01. |
| 4 | HTTP em **porta fixa 8788**; falha explícita se ocupada; sem fallback silencioso. | AC-16, MCP-06, NEG-02, §4.2. |
| 5 | **stdio + HTTP obrigatórios na V1**. | AC-06, AC-17, MCP-06/07/08. |
| 6 | Nenhuma mudança de CSP/capability sem nova rodada de QA. | AC-12, AC-18, MCP-14, §6. |

**Alinhamento adicional ao plano do Rafael (D1–D6):** D1 (desktop via `localApi()`, HTTP só no dev)
→ AC-19/MCP-10; D2 (export com confirmação por arquivo e “lembrar” em memória) → AC-21/MCP-16/
NEG-06; D3 (stdio + HTTP) → decisão 5 acima; D4 (`save:true`) → decisão 2 acima; D5 (Settings na
Fase 1) → AC-02/MCP-02; D6 (undo de lote na Fase 2) → decisão registrada abaixo.

**Reconciliação do requisito original de lote desfazível:** ele **não foi cancelado**, mas passou a
seguir D6: a V1 não expõe tool de lote (AC-22/NEG-04 parte V1), e AC-07/MCP-09/NEG-04 parte Fase 2
são o gate obrigatório antes de qualquer integração que prometa lote com undo único. Antecipar isso
para a V1 é mudança de escopo e exige nova decisão do Tyago.

**Não há pendências em aberto para a V1.** Qualquer reversão destas decisões volta ao §6.

---

## 8. Gate 2 — QA da versão integrada (auditado, reavaliado e fechado em 21/11/2026; **PRONTO**)

O `PRONTO` de §3.1 vale **somente** para o Gate 1 (protótipo isolado): 6 negativos 6/6 SIM e crítica
cega Flávia (`ses_e04c30a8cffeRxJb5yFAaicyEZ`, `NÍVEL MÁXIMO: nenhum`). Ele **não** atesta o app
integrado. Em 21/11/2026, com autorização para escopo **completo local, sem publicar**, foram
lançados **20 subagentes** em modo **leitura + comandos locais de diagnóstico** — nenhum editou
arquivo, rodou build, commitou ou publicou. Os 20 retornaram; depois das correções aprovadas, uma
nova rodada de **20 subagentes** reavaliou o estado em modo leitura + diagnóstico. A consolidação
está no §8.3.

**Correções aprovadas após a auditoria (reavaliadas em §8.3):** AC-15 (snippet HTTP passou a entregar
`OPENDESIGN_MCP_TOKEN` em `env`), NEG-06 (export MCP passou a usar `pickSavePath` + nonce, destino no
diálogo e confirmações serializadas), `initialize` moderno recusado com `notifications/initialized`
com `id` aceito no core do app, `Mcp-Method`/`Mcp-Name` documentados como opcionais, toasts/copy do
ux (`Token revogado.`, `Agente desconectado.`, `Snippet copiado.`) e checkbox apenas visual sem
persistência. `Serviço recuperado automaticamente.` permanece **registrado como texto previsto, não
emitido**. Também foi removida a ressalva de material GPL do grafo de build. Essas correções são
implementação em árvore de trabalho; **não** são execução da matriz, não geraram build pareado e não
autorizam publicação.

**Veredito: Gate 2 PRONTO.** A matriz AC-01…22/NEG-01…06 foi executada no app integrado
(§8.4): **24 SIM + 4 MANUAL = 28/28**, nenhum PENDENTE e nenhum NÃO. A baseline é a do CI do
mesmo run `44894873417` (commit `8c1c932`): `pnpm test` 17/17, gate `-FullAssetSet` 78/78 antes
e depois do bundle, exe inalterado e item 8 aprovado nos instaladores. A baseline antiga
`D57E2866…ACF74` e `Release/` permanecem intactas — nenhuma promoção local. AC-07, AC-09,
NEG-03 e Fase 2 de NEG-04 permanecem **MANUAL** com limitação declarada (§8.2), sem conversão
em SIM. A aprovação de publicação do usuário está registrada; tag e release são geridas fora
deste documento.

### 8.1 Regras de ouro do Gate 2

- **Token só no `env`:** o snippet da UI entrega `OPENDESIGN_MCP_TOKEN` no campo `env`; nunca em
  argv, URL/query, stdout/stderr, log, snapshot, DB, título de janela, tooltip ou evidência de QA.
  Evidência: snippet gerado + `Get-CimInstance Win32_Process` sem o valor + varredura mascarada.
- **8788 sem fallback:** bind exclusivo `127.0.0.1:8788`; se ocupada, erro explícito na UI, nenhum
  bind em 8787, porta efêmeral, `0.0.0.0` ou `::`, nenhum token deixado ativo. Evidência: `netstat`
  com PID, screenshot sem token e retry após liberar somente 8788.
- **Falha fechada:** default off a cada launch; sem opt-in não há listener, stdio, token nem
  indicador verde; token ausente/curto não sobe; desligar/fechar encerra listener e child, revoga o
  token e não deixa processo órfão; restart volta ao default off.
- **Reprovação automática:** qualquer `NÃO`/`FAIL` na matriz abaixo, `pnpm test` < 17/17, gate
  `-FullAssetSet` != 78/78, CSP/capability alteradas sem nova rodada e OK do Tyago, ou reintrodução
  de material GPL/Drift no build (removido em 21/11/2026; §8.3 "Divergências da auditoria já corrigidas").

### 8.2 Matriz integrada — AC-01…22 e NEG-01…06

Legenda: **SIM** = executado/verificado no app integrado com evidência desta rodada (§8.4);
**NÃO** = divergência em aberto que reprova (nesta rodada, **nenhuma** — o antigo `NÃO` local de
AC-11 foi resolvido pela baseline de CI do mesmo run); **PENDENTE** = não executado no app
integrado (**nenhuma linha**); **MANUAL** = verificação parcialmente automatizada cuja limitação
é explicitamente declarada, sem conversão em SIM (AC-07, AC-09, NEG-03 e Fase 2 de NEG-04). A
coluna “Evidência (§8.4)” identifica o harness/log real; a coluna “Estático” registra o que os 20
subagentes leram e **nunca** converte PENDENTE em SIM, conforme “Gate 1 não é reutilizado”.

| ID | Verificação no app integrado (Gate 2) | Evidência (§8.4) | Estático (20 subagentes) | Estado |
|---|---|---|---|---|
| AC-01 | Sem listener/stdio/token/verde ao abrir, inclusive após uso anterior e restart. | `A02`, `N3`, `R` | `McpInner::default()` off; `use-mcp-access.ts:56`; limpeza no `Exit`. | **SIM** |
| AC-02 | Só `Settings → Agent access` liga; nada por CLI, env, flag ou migration. | `RES` bloco AC-02 — 14 OK | `mcp_start` só no clique; `OPENDESIGN_MCP_ENABLE` não é lido no binário. | **SIM** |
| AC-03 | Bind apenas `127.0.0.1`; conexão pelo IP da máquina falha. | `RES` bloco AC-03 — 5 OK | `mcp/mod.rs:24-25`, `http.rs:42-43`; sem `0.0.0.0`/`::`. | **SIM** |
| AC-04 | Token aleatório por sessão; T1≠T2; T1 morto no disable/close/restart. | `N3` (T1/T2/T3), `B` (401 token antigo) | CSPRNG 32 bytes + `timingSafeEqual` + redação em `token.rs`. | **SIM** |
| AC-05 | Nenhum valor do token em log, console, snapshot, DB, UI, argv ou evidência. | `RES` bloco AC-05 — 6 OK, 0 ocorrência | Nenhum valor real coletado nesta rodada; canais proibidos sem ocorrência. | **SIM** |
| AC-06 | stdio e HTTP após opt-in, mesma capacidade e semântica de erro. | `R` — HTTP e stdio, 4 versões | Mesmo `core.handle`; stdio sem listener; divergências de versão/header (§8.3). | **SIM** |
| AC-07 | Fase 2 condicional: lote atômico/desfazível só se exposto. | V1 não expõe lote (`RES` AC-22/NEG-04) | V1 não expõe lote. | **MANUAL** |
| AC-08 | Um SQLite (`app_config_dir`), sem 2º storage, SQL arbitrário ou path escape. | `A` (33 OK / 2 FALHA; FALHA só em AC-09/AC-13) | Um DB ativo; storage nativo latente não registrado (§8.3). | **SIM** |
| AC-09 | Sem egresso: nuvem, telemetry, DNS externo, `:4747`, Wrangler/D1/R2. | Varredura estática + `A` parcial | Varredura estática: **SEM EGRESSO**; PEs sem `:4747`/`:8787`/`wrangler`. | **MANUAL** |
| AC-10 | Suíte local permanece verde. | CI run `44894873417` — `17` pass, `0` fail | 17/17 na auditoria de 21/11; reexecutado na CI. | **SIM** |
| AC-11 | Bundle embutido íntegro e único. | CI `78/78` pré/pós-bundle + item 8 nos instaladores da CI | O antigo `75/78` era do par local; substituído pela baseline do mesmo run. | **SIM** |
| AC-12 | CSP/capability byte a byte iguais às aprovadas. | diff — CSP `73EDE1DD…C76C9`, 5 permissões | CSP SHA `73EDE1DD…C76C9`; 5 permissões, nenhuma nova. | **SIM** |
| AC-13 | Auto-start não sobrevive ao restart; desligar volta a desmarcado. | `N3` (restart off + Desligar), `A02` (toggle desmarcado), `A` | Sem persistência de opt-in; checkbox renderiza, desabilitado/desmarcado no launch e marcável só após bind OK. | **SIM** |
| AC-14 | Catálogo exato 6/15 nos dois transportes; `catalog_status` sem token/path. | `R` — `tools/list` 15, `catalog_status` 946B, nos dois transportes | 6/15 idênticos nos dois catálogos; `save:true`; sem lote. | **SIM** |
| AC-15 | Token apenas no `env` do snippet; query rejeitada; falha fechada se ausente/curto. | `R` — snippet sem `headers`, `400` na query, `401` sem Bearer | Snippet HTTP e preview usam `env.OPENDESIGN_MCP_TOKEN`, sem `headers.Authorization`. | **SIM** |
| AC-16 | HTTP fixo em `127.0.0.1:8788`, erro explícito se ocupada, sem fallback. | `B` — 10/10 (porta ocupada, sem fallback, retry green) | Bind único; `AddrInUse` → `port_in_use`; nenhum fallback. | **SIM** |
| AC-17 | Paridade stdio/HTTP em catálogo, erros e regras de token. | `R` — 4 versões, notificação com `id`, `tools/list` nos dois | Catálogo/erros iguais; `initialize` moderno recusado; headers opcionais validados. | **SIM** |
| AC-18 | Nenhuma mudança de CSP/capability sem nova rodada e OK do Tyago. | diff — inalteradas | Diff byte a byte na auditoria; inalteradas também nesta etapa restrita. | **SIM** |
| AC-19 | Desktop via `localApi()`; HTTP backend só no dev; token não vai à API local. | `A` (item AC-19) | `api.ts:9` + `local-db.ts`; token só como `secrets`. | **SIM** |
| AC-20 | `templates_preencher` com `save:true`; origem intacta; novo `id`. | `RES` bloco AC-20 — 9 OK, hash da origem idêntico | `enum:[true]`, envio literal `save:true`, só INSERT. | **SIM** |
| AC-21 | Export com confirmação por arquivo; “lembrar” só em memória. | `A21` — 26 OK / 0 FALHA (fluxo real, sem stub) | `pickSavePath` + nonce; destino na chave; `Set` volátil; fila serializa. | **SIM** |
| AC-22 | V1 sem tool de lote; `-32602` e DB/canvas intactos. | `RES` bloco AC-22 — 3 OK (`-32602`, DB idêntico) | Nenhuma tool `lote`/`batch`; `lote_editar` → `-32602` no protótipo. | **SIM** |
| NEG-01 | Ausente/curto/aleatório/revogado/outra sessão/query: 401/403, corpo genérico, 10 tentativas sem crash/troca de porta/eco; stdio fechado. | `R` (401/400/404/405, sem crash), `B` (token antigo 401), `RES` AC-05 | 6/6 SIM **somente no protótipo** (§3.1); não reutilizado aqui. | **SIM** |
| NEG-02 | 8788 ocupada: erro claro, sem fallback, sem token ativo; retry com token novo após liberar. | `B` — 10 OK na parte NEG-02 (as 7 FALHA do harness vêm do stub abandonado, coberto por `A21`) | `EADDRINUSE`/`port_in_use`, bind antes de mutar estado, retry sem resíduo. | **SIM** |
| NEG-03 | Aba/janela fechada e toggle: sem escrita/undo, listener/child encerrados, token inválido, sem órfão, DB íntegro. | `N3` — 30 OK / 2 FALHA (as duas vias pedidas passaram) | Limpeza no `Exit` por código. | **MANUAL** |
| NEG-04 | V1 `-32602` sem tool/efeito; Fase 2 aborta transação, DB byte-idêntico, undo único. | `RES` bloco NEG-04 — V1 OK, DB idêntico; Fase 2 não existe na V1 | Parte V1 coerente com o catálogo; Fase 2 não existe na V1. | **MANUAL** |
| NEG-05 | `save:false`, `save` omitido e `id` da origem barrados; `save:true` forçado; novo design. | `RES` bloco NEG-05 — 5 OK, origem íntegra | Validação antes do backend; `additionalProperties:false`. | **SIM** |
| NEG-06 | Sem arquivo sem consentimento; cancelamento sem gravação; nonce one-shot; “lembrar” some no restart. | `A21` — 26 OK / 0 FALHA (Negar sem gravação, nonce inválido rejeitado, lembrar some no restart) | `pickSavePath` + `{path, nonce}`; confirmação mostra arquivo e destino; `Set` volátil. | **SIM** |

**Resultado: 24 SIM + 4 MANUAL = 28/28, nenhum PENDENTE e nenhum NÃO.** Os quatro `MANUAL`
não são convertidos em SIM: AC-09 (egresso — firewall/proxy/UDP/DNS não automatizáveis neste
ambiente; varredura estática favorável); AC-07 e Fase 2 de NEG-04 (recursos de lote não existem
na V1, então não há o que executar); NEG-03 (duas vias executadas com 30 OK, restando a aba de
documento do editor e o child stdio, fora do fluxo HTTP automatizado). Nenhuma linha foi marcada
como SIM por evidência estática. O `PRONTO` do Gate 1 e a suíte 6/6 SIM **não são reutilizados**;
as reexecuções locais foram anexadas somente como complemento (§8.3).

### 8.3 Consolidação da rodada de auditoria (21/11/2026)

**Autorização e limites.** Escopo **completo local, sem publicar**: build/CI local, `pnpm test`, gate
`-FullAssetSet`, baseline local e smoke permitidos como diagnóstico. Prontidão auditada primeiro.
20 subagentes rodaram em **leitura + comandos locais de diagnóstico**, sem edição, build, commit ou
publicação. Não houve commit, push, tag, release, deploy, alteração de CSP/capability, catálogo ou
`Release/OpenDesign.exe`. O chat foi usado como relay; o Bridge não estava disponível. Este
documento não fala em nome de Hugo, Tyago ou terceiros.

**Comandos executados e resultados locais**

| Verificação | Resultado |
|---|---|
| `node --check .mcp-prototype/testes-seguranca.mjs` | exit 0 |
| `node .mcp-prototype/testes-seguranca.mjs` | exit 0 — `RESULTADO: 6/6 SIM` (SIM 6, NÃO 0); **não é evidência do Gate 2** |
| `pnpm test` | **17/17**, exit 0, 0 falhas/skipped/todo/cancelled; apenas `ExperimentalWarning` de SQLite |
| `powershell -File scripts/check-embedded-bundle.ps1 -Exe target/release/app.exe -DistDir dist -FullAssetSet` | exit 1 — **75/78 por nome** + divergência do bundle principal |
| Baseline publicada `Release/OpenDesign.exe` | 13.946.880 bytes, SHA-256 `D57E2866D9BF7390A799882137060761222CC1F53A200C0AEA94AA147A8ACF74` — **íntegra** |

**Revalidação local pós-correções (fechamento desta frente — somente validação local e docs, sem build).**
A autorização acima era da auditoria; o fechamento limitou-se a validar as correções na árvore de
trabalho. Não houve build, gate `-FullAssetSet`, smoke com binário, nova baseline, commit, tag,
release ou publicação — a tabela anterior permanece como registro histórico da auditoria, não como
resultado desta revalidação. Os 20 subagentes da segunda rodada também atuaram somente em leitura +
diagnóstico. Resultados **executados nesta frente**:

| Verificação | Resultado real |
|---|---|
| `node --check` nos 8 `.mjs` afetados (protótipo e `src/client/mcp`) | exit 0 para todos; nenhum `SyntaxError` |
| `node .mcp-prototype/testes-seguranca.mjs` | exit 0 — `RESULTADO: 6/6 SIM` (R1…R6, SIM 6, NÃO 0); **não é evidência do Gate 2** |
| `npm run i18n:check` (repo-pai) | exit 0 — `3021/3139` nos três idiomas; ruído pré-existente de `shared/locales` (não editados nesta frente) |
| `git diff --check` (restrito aos arquivos escritos nesta frente, em OpenDesign) | sem saída — nenhum whitespace real nesses arquivos. `shared/locales/*` **não** entrou neste comando; o aviso de CRLF pré-existente (mtime 20/11) permanece e não foi normalizado |
| Varredura `Drift`/`GPLv3` em `src/`, `.mcp-prototype/`, `vite.config.ts` e `index.html` | 0 ocorrências; ressalvas apenas em `docs/` |
| `pnpm test` (por fim) | **17/17**, exit 0, 0 falhas/skipped/todo/cancelled; apenas `ExperimentalWarning` de SQLite |

Nenhum desses resultados, por si só, executa a matriz no app integrado nem substitui o par de
artefatos 78/78. Eles são registro da auditoria; a execução da matriz e a baseline do mesmo run
ficam registradas em §8.4.

**Por que o 78/78 local falhou (e por que isso não é um “ajuste de expectativa”).** O par local é
incoerente: `target/release/app.exe` tem SHA `3D56E6F3…B9D`, embute `/assets/index-B8HL4cME.js`,
enquanto `dist/index.html` referencia `./assets/index-CS_UnruI.js` (SHA do bundle local
`BD75877B…EDB5`). Faltam 3 assets exigidos no PE. O gate do go-live (run `44818112977`, artefato
`14671391681`, ZIP `sha256:400de06a…8c40d`, exe `D57E2866…ACF74`, bundle `88f36d9` com SHA
`C9FEDB13…0A9D`) usou exe e `dist/` do **mesmo build**. O resultado local não prova a baseline e
também não a contradiz: prova apenas que é preciso build pareado novo, fora desta rodada.

**Divergências da auditoria já corrigidas nas correções aprovadas (favoráveis, mas não bastam para o
gate).** As correções abaixo foram aplicadas à árvore de trabalho **após** a auditoria de 21/11 e
**reavaliadas estaticamente**; nenhuma gerou build, baseline, smoke ou execução da matriz:

- **Material GPL removido do caminho do bundle.** A docblock com “Drift (GPLv3)” foi substituída em
  `src/client/mcp/catalog.mjs:6` e `.mcp-prototype/catalog.mjs:6` por texto de proveniência genérico;
  a ressalva permanece somente em documentos de planejamento. Varredura confirma 0 ocorrências em
  `src/client/**`, `.mcp-prototype/**` e `vite.config.ts`.
- **AC-15 — token no `env`.** `src/client/hooks/use-mcp-access.ts` e
  `src/client/components/agent-access-panel.tsx` entregam `env.OPENDESIGN_MCP_TOKEN` no snippet HTTP
  (preview e real), sem `headers.Authorization`; o Bearer é montado em runtime pelo cliente. O Rust
  permanece inalterado.
- **NEG-06 — export com consentimento.** `src/client/mcp/backend-tauri.ts` agora chama
  `pickSavePath`, exige `{path, nonce}`, mostra o destino no diálogo, inclui o destino na chave de
  sessão e repassa ambos a `saveDataURLNative`; falhas de gravação viram mensagem fixa sem caminho.
  `src/client/mcp/confirm.ts` enfileira confirmações para não sobrepor pedidos.
- **Protocolo/UX com decisão registrada.** `initialize` é recusado em `2026-07-28` com `-32601` nos
  dois núcleos; toda `notifications/*` — com ou sem `id` — é aceita silenciosamente nos dois cores
  (`null`; no HTTP, `202` sem corpo), antes da validação de versão/headers, e o `case` inalcançável
  no integrado foi removido sem alterar o contrato; `Mcp-Method`/`Mcp-Name` são opcionais e validados
  se presentes; versões extras `2025-03-26`/`2024-11-05` permanecem por decisão híbrida;
  `ttlMs`/`cacheScope` seguem em avaliação.
  Checkbox `Iniciar automaticamente após eu ligar o acesso` renderiza desabilitado/desmarcado no launch
  e marcável só após bind OK, **apenas visual, sem persistência nem recuperação**; toasts
  `Token revogado.`, `Agente desconectado.`, `Snippet copiado.` e falha de cópia ligados;
  `Serviço recuperado automaticamente.` fica **registrado como texto previsto, não emitido**. Status
  usa travessão `—` conforme `docs/mcp-ux.md`.

**Etapa restrita P1–P4 + alinhamento documental (separada da etapa B).** Autorizada somente para
corrigir as pendências encontradas na preparação; build, gate, smoke, baseline, commit e publicação
continuaram fora de escopo. Registro integral em `docs/mcp-gate2-preparacao.md` §7.

| Correção | Arquivo(s) | Mudança e resultado local |
|---|---|---|
| P1 — precedência dos toasts | `src/client/components/agent-access-panel.tsx:134` | Restaurado `copyNotice ?? access.notice`; `useEffect` que limpa `copyNotice` quando `access.notice` muda foi preservado. `Snippet copiado.` volta a aparecer sobre um notice anterior. |
| P1 — harness de release | `.mcp-prototype/roundtrip-release.mjs` | Snippet lido por `OPENDESIGN_MCP_TOKEN`; token de `cfg.env.OPENDESIGN_MCP_TOKEN`; checagens "token em `env.OPENDESIGN_MCP_TOKEN`" e "sem `headers.Authorization`" substituíram a expectativa de `Authorization`/sem `env`. |
| P2/P4 — protocolo canônico | `.mcp-prototype/mcp-core.mjs`, `src/client/mcp/mcp-core.mjs` | Toda `notifications/*`, com ou sem `id`, retorna `null` antes de versão/headers nos dois cores; `case` inalcançável removido no integrado; `-32601` de `initialize` moderno preservado. |
| P2 — documentação | `docs/mcp-ux.md`, `docs/mcp-planejamento.md`, `docs/mcp-qa.md` | FAQ de D2 limitada a `mcp_exportar`; D1 esclarecido como backend de dados (o HTTP 8788 é transporte MCP, D3); plano atualizado do estado "protótipo isolado" para integração na árvore de trabalho sob Gate 2 bloqueado; frontmatter, premissas, legenda, AC-10/AC-18, referência de seção e `git diff --check` alinhados. |

Resultados **executados nesta etapa** (locais, não evidência do Gate 2): `node --check` nos 3 `.mjs`
alterados → exit 0; `node .mcp-prototype/testes-seguranca.mjs` → exit 0, `6/6 SIM`; checagem
dirigida de paridade `core.handle` protótipo ↔ integrado → `5/5` (notificação sem id, com id e com
id + versão/headers inválidos devolvem `null` nos dois; `initialize` moderno → `-32601`;
`server/discover` legado → `result`); `git diff --check` nos arquivos rastreados alterados → sem saída (os dois arquivos novos, untracked, foram verificados à parte para trailing whitespace: 0 linhas).
Nenhum valor real de token foi gerado ou exibido: aliases `T1`/`T2`/`T3` e `<TOKEN_MASCARADO>`.

**Smoke integrado local (etapa B, após o build pareado).** Executado no exe do worktree
(`51D5A6EB…0121`), sem instalação, promoção de baseline ou publicação:
`node .mcp-prototype/smoke.mjs` → `SMOKE OK — 16/16`, exit 0;
`node .mcp-prototype/roundtrip-release.mjs <exe>` → `RESULTADO: 48 OK / 0 FALHA`, exit 0, cobrindo
HTTP (token em `env`, 401/400/404/405, `no-store`, sem CORS, quatro versões legadas, 15 tools,
notificação com `id` → 202 sem `-32601`, desligar pela UI encerra o listener) e stdio (zero TCP,
sem eco de token, EOF limpo, sem panic WebView2 com GUI aberta). Registro integral em
`docs/mcp-gate2-preparacao.md` §8.4. É evidência **local do par pareado**; a baseline que vale
para o gate é a do CI do mesmo run (§8.4 abaixo). Nenhuma linha MANUAL foi convertida em SIM por
este smoke.

**Item 8 local (etapa B, após o smoke).** MSI e NSIS gerados do **mesmo** build pareado com
`pnpm tauri bundle --bundles msi nsis --config src-tauri/ci-build.json --no-binary-patching --no-sign --ci`
(`BUNDLE_EXIT=0`, `ci-build.json` recriado só no worktree a partir do workflow e removido depois),
extração administrativa do MSI com elevação autorizada e instalação/desinstalação silenciosa do NSIS,
com SHAs dos dois exes extraídos **iguais com `-ceq`** a `51D5A6EB…0121` e `-FullAssetSet`
reaplicado em cada um: 78/78, `GATE: APROVADO`, exit 0. Nenhuma promoção de baseline, publicação
ou alteração de CSP/capabilities/catálogo; `Release/OpenDesign.exe` segue `D57E2866…ACF74`.
Registro integral em `docs/mcp-gate2-preparacao.md` §8.5. Também é evidência **local do par
pareado**; o item 8 que vale para o gate foi reaplicado nos instaladores do CI do mesmo run
(§8.4 abaixo), com os mesmos SHAs.

**Bloqueios que haviam impedido o `PRONTO` — todos resolvidos com evidência (§8.4):**

1. ~~Artefatos locais pareados, mas sem baseline de CI do mesmo run.~~ Commit imutável `8c1c932`
   publicado na `dev`; CI run `44894873417` verde no mesmo commit, com `pnpm test` 17/17 e
   `-FullAssetSet` 78/78 antes e depois do bundle. O exe da CI passou no roundtrip 48/48 e o item 8
   foi fechado nos dois instaladores daquele artefato.
2. ~~Sem suíte integrada.~~ `package.json` segue com os 17 testes; a cobertura da integração foi
   feita pelos harnesses de evidência listados em §8.4, sem alterar a suíte.
3. ~~Árvore suja / ausência de commit imutável.~~ As correções e os harnesses foram consolidados no
   commit `8c1c932` na `dev`; os harnesses finais desta rodada são registrados em §8.4.
4. ~~Matriz não executada.~~ As 28 linhas foram executadas no app integrado: 24 SIM e 4 MANUAL.
   As quatro linhas MANUAL permanecem com limitação declarada, sem conversão em SIM.

**Verificações favoráveis (estáticas, não suficientes para o gate)**

- **CSP/capability CONFORMES:** string de produção com 161 bytes e SHA `73EDE1DD3A4905698645C6DCF1B0922E271C0CDB20793E5FD48613C91A1C76C9`,
  idêntica à aprovada; `devCsp` também idêntica ao registro. Capabilities com exatamente
  `core:default`, `dialog:allow-save`, `sql:allow-execute/load/select` — nenhuma nova permissão.
- **Porta/bind:** `127.0.0.1:8788` fixo nos dois transportes, sem `0.0.0.0`, `::`, 8787 do MCP,
  porta efêmeral ou fallback; token em query → 400; falha de bind antes de qualquer mutação de
  estado, sem token ativo. Ressalva de UI: `port-error` pode ser transitório no polling.
- **SQLite/`localApi()`:** um DB ativo em `app_config_dir`, queries constantes com parâmetros ligados,
  IDs validados, token nunca repassado à API local. Ressalvas: storage nativo latente
  (`save_design`/`load_design` não registrados no `invoke_handler`, deixando 2 tools quebradas) e
  `kit-transfer.ts:41-49` com `fetch(url)` de kit importado, mitigado pela CSP.
- **Catálogo:** 6 toolboxes/15 tools idênticos em protótipo e integrado; `templates_preencher` com
  `save: {enum:[true]}`, `required` e envio literal `save:true`; ausência de ferramenta de lote.
- **`templates_preencher`:** validação antes do backend, `additionalProperties:false`, apenas
  INSERT com novo UUID; nenhuma rota de escrita em `/api/templates`. Lacuna residual fora da tool:
  `projeto_salvar` com `id` sobrescreve via `PUT /api/designs/{id}` sem consentimento no adaptador.
- **Auto-start:** estado nasce `off`, sem flag/migration/storage persistida; limpeza no `Exit`.
- **Egresso:** varredura estática **SEM EGRESSO** — 0 `XMLHttpRequest`/`WebSocket`/`EventSource`/
  `sendBeacon`, 0 telemetry/DNS, 0 `:4747` em código/bundle/PEs; Wrangler/D1/R2 e URLs externas
  são dev-only ou código inalcançável no desktop. `kit-transfer.ts:43` aceita URL de arquivo de kit
  importado (ação do usuário, sem endpoint embutido). `netstat`/firewall não executados.

**Mascaramento de token.** Na execução da matriz (§8.4) o token real existiu somente em memória no
Node e foi substituído integralmente por `<token>` em toda saída. Os documentos preservam os aliases
`T1`/`T2`/`T3` e o placeholder `<TOKEN_MASCARADO>`; nenhum valor real foi anexado ou exibido. AC-05
foi executado com varredura pelo valor exato em log, console/stderr do app, DB, argv, UI e arquivos
de evidência: **0 ocorrências** em cada canal (`RES`, bloco AC-05). A ressalva das rodadas de
auditoria — "varredura não pôde ser executada" — era válida apenas para aquelas rodadas, nas quais
nenhum valor real circulava; não se aplica à execução final.

**Critério de fechamento (executado em 21/11/2026).** 28/28 linhas com resultado diferente de
PENDENTE (24 SIM + 4 MANUAL), nenhum NÃO, máscara aplicada, build pareado com gate
`-FullAssetSet` 78/78 antes e depois do bundle, item 8 nos instaladores da CI do mesmo run, smoke
integrado + roundtrip 48/48, baseline nova de CI do mesmo run `44894873417` e OK explícito de
publicação do usuário. Nenhuma promoção para `Release/`: baseline antiga `D57E2866…ACF74` segue
intacta. Tag e GitHub Release são gerenciados fora deste documento, a partir do commit `8c1c932`.

### 8.4 Execução da matriz — evidência integrada (21/11/2026)

Todos os harnesses abaixo rodaram contra o **exe pareado** `51D5A6EB…0121` (worktree isolado) e/ou o
exe da CI `F18E8478…EDBA1`. Nenhum deles altera `Release/`, `dist/`, `target/`, CSP, capabilities ou
catálogo; nenhum imprime o valor real do token. Logs integrais em
`C:\Users\tyago\AppData\Local\Temp\opencode\`.

| Atalho | Harness / fonte | Resultado real | O que cobre |
|---|---|---|---|
| `R` | `.mcp-prototype/roundtrip-release.mjs` — `roundtrip-final.log`, `roundtrip-ci.log` | `48 OK / 0 FALHA` no exe pareado **e** no exe da CI | AC-06, AC-14, AC-15, AC-17, NEG-01 |
| `A` | `.mcp-prototype/gate2-pendencias-a.mjs` — `gate2-A-final.log` | `33 OK / 2 FALHA` | AC-08, AC-09 (parcial), AC-13, AC-19 |
| `B` | `.mcp-prototype/gate2-pendencias-b.mjs` — `gate2-B-verificado.log` | `10 OK / 7 FALHA` — as 10 OK são NEG-02; as 7 FALHA vêm do stub abandonado | NEG-02 |
| `N3` | `.mcp-prototype/gate2-neg03.mjs` — `gate2-neg03-wmclose.log` | `30 OK / 2 FALHA` | AC-01, AC-04, AC-13, NEG-03 |
| `A21` | `.mcp-prototype/gate2-ac21-real.mjs` — `gate2-ac21-real6.log` | `26 OK / 0 FALHA` | AC-21, NEG-06 (fluxo real, sem stub) |
| `RES` | `.mcp-prototype/gate2-restante.mjs` — `gate2-restante.log` | `42 OK / 0 FALHA` | AC-02, AC-03, AC-05, AC-20, AC-22, NEG-04-V1, NEG-05 |
| CI | run `44894873417`, job `136818273729`, artefato `14703532928` | `success`, `17` pass / `0` fail, gate `78/78` pré/pós-bundle | AC-10, AC-11 |

**Baseline do mesmo run.** O commit `8c1c932` foi publicado em `dev` e o CI `tauri.yml` gerou o run
`44894873417`. O log do job registra `pnpm test` com `# tests 17`, `# pass 17`, `# fail 0`, o gate
`-FullAssetSet` com `78 asset(s) exigido(s)` e `GATE: APROVADO` antes e depois do bundle
(`ci-job.log`), bundle `index-BDtBGonU.js` com SHA `B3F4092E…F13128` e exe com SHA
`F18E847899A536992E1492B57F09326166DC8942435C18EFC03285ED642EDBA1` — idêntico antes e depois do
bundle. O exe do artefato passou no roundtrip `48/48` (`roundtrip-ci.log`).

**Item 8 nos instaladores da CI.** MSI `OpenDesign_1.1.0-1_x64_en-US.msi` (`D1DF3AF4…FFB791D`) e
NSIS `OpenDesign_1.1.0-1_x64-setup.exe` (`D3A32280…A14BEE`) foram extraídos; ambos os exes extraídos
têm SHA `F18E8478…EDBA1`, idêntico ao exe gateado daquele run. O gate `-FullAssetSet` foi reaplicado
nos dois: `78/78`, `GATE: APROVADO`, exit 0. Extração do MSI com `msiexec /a` elevado e do NSIS com
instalação silenciosa; nada foi promovido para `Release/`.

**Resultado da matriz.** 28 linhas: 24 **SIM**, 4 **MANUAL**, 0 **PENDENTE**, 0 **NÃO**. Os quatro
MANUAL são AC-09 (cobertura TCP/processos/strings favorável em `A`, mas firewall/proxy/UDP/DNS não
automatizáveis aqui), AC-07 e Fase 2 de NEG-04 (lote não existe na V1, logo não há o que executar) e
NEG-03 (as duas vias pedidas passaram em `N3`; aba de documento e child stdio ficam fora do fluxo
HTTP automatizado). Nenhuma dessas linhas foi convertida em SIM por evidência estática.

**Ressalva sobre o harness `B`.** A tentativa de stubar `__TAURI_INTERNALS__.invoke` falhou no Tauri
release (`metodo: 'nenhum'`), então as 7 asserções de AC-21/NEG-06 daquele harness são FALHA por
limitação do método, não por divergência do app. O fluxo real foi executado por `A21` com 26 OK
e 0 FALHA, sem stub. `B` é usado nesta matriz somente para NEG-02, onde tem 10 OK.

**Limitações declaradas que permanecem.** Varredura de perfil em `A` encontrou 10 arquivos
ilegíveis (AC-13); varredura de egresso não cobre UDP/DNS (AC-09); aba de documento e child stdio
fora do alcance de `N3` (NEG-03); lote atômico/Undo da Fase 2 inexistente na V1 (AC-07/NEG-04).
Nenhuma foi convertida em SIM.

## 9. Referências internas

- `docs/mcp-ux.md` — proposta de UX/copy do `Settings → Agent access`.
- `docs/mcp-planejamento.md` — catálogo V1, protocolo, backend e decisões D1–D6 do Rafael.
- `docs/qa-golive-desktop.md` — evidência do go-live, run `44818112977`, item 8, hashes e smoke.
- `docs/banco-local.md`, `SEGURANCA.md` — SQLite local, CSP aprovada e menor privilégio.
- `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json`.
- `scripts/check-embedded-bundle.ps1`, `.github/workflows/tauri.yml`, `package.json`.
- `.mcp-prototype/testes-seguranca.mjs` — suíte isolada dos 6 negativos (§3.1); não entra no build.
