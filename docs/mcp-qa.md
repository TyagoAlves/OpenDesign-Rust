---
id: QA-MCP-OPENDESIGN
data: 2026-11-20
responsavel: Douglas — QA e segurança
status: GATE 1 PRONTO (protótipo isolado: 6/6 SIM, crítica cega Flávia `ses_e04c30a8cffeRxJb5yFAaicyEZ` = NÍVEL MÁXIMO nenhum); Gate 2 da versão integrada PREPARADO no §8, reexecução completa após integração com novo OK do Tyago; baseline intacta; sem build, publicação ou commit
escopo: somente C:\Users\tyago\Projeto\bloaudhab\OpenDesign\docs\mcp-qa.md e .mcp-prototype\testes-seguranca.mjs
---

# MCP no OpenDesign — plano de QA e segurança

## 0. Premissas, baseline e limites

- **Isto é um plano, não uma implementação.** Nada aqui está implementado. O editor hoje não tem
  tela de `Settings`, não tem MCP integrado e não tem servidor/serviço próprio além do IPC do Tauri.
- **Referência conceitual, não cópia.** O Drift (GPLv3) serviu apenas de inspiração para o
  padrão “opt-in local, desligado por padrão, token por sessão”. Nenhum código, documento,
  config, nome, string, ícone ou marca do Drift pode entrar no OpenDesign (MIT, `LICENSE`).
  A única menção permitida é esta ressalva de licença em documentos de planejamento.
- **Go-live fechado e intocável.** A baseline aprovada continua sendo o artefato do CI
  `44818112977`, artefato `14671391681`, ZIP `sha256:400de06ad0318d23244119ba88ab036da1574e6b94cd76401258b6f8fd96c40d`.
  Exe publicado: `Release/OpenDesign.exe`, 13.946.880 bytes, SHA-256
  `D57E2866D9BF7390A799882137060761222CC1F53A200C0AEA94AA147A8ACF74`.
  Qualquer evidência local de `dist/`, `target/` ou builds antigos **não** substitui essa baseline.
- **Fora de escopo deste documento e da frente:** `Release/`, `README`, landing/`gh-pages`,
  `.github/`, CI, build, instaladores, commit, push, tag, release, draft e publicação.
  Os únicos arquivos escritos nesta frente são este gate e a suíte isolada
  `.mcp-prototype/testes-seguranca.mjs` (§3.1).
- **UX e escopo de referência:** [`docs/mcp-ux.md`](mcp-ux.md) propõe
  `Configurações → Acesso do agente`, default off, token oculto/copiável e os estados
  `Desligado` → `aguardando agente` → `Agente conectado`.
  [`docs/mcp-planejamento.md`](mcp-planejamento.md) define o catálogo V1, o protocolo e as decisões
  D1–D6 do Rafael. Este plano não altera nenhum dos dois; ele define como validá-los.
- **Protótipo isolado:** `.mcp-prototype/` é prova de conceito, não produto. Ele não altera bundle,
  PE, assets, CSP, comandos Tauri, gate ou baseline. A integração dele ao app **sim** dispara §6.
- **Decisões do Tyago registradas em 20/11/2026:** não há pendências em aberto para a V1. As seis
  respostas levantadas neste documento foram aceitas e o escopo de tools segue o plano do Rafael.
  Ver §7. Qualquer reversão é mudança de escopo e volta ao §6.
- **Gate 1 ≠ Gate 2.** O `PRONTO` desta frente cobre apenas o protótipo isolado (§3.1). Com o Gate 1
  autorizado, o QA da versão integrada está preparado no §8; a matriz completa AC-01…22/NEG-01…06
  só é reexecutada depois da integração, com build/CI/baseline nova e OK novo do Tyago.

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

Gate 1 autorizado: o pacote do Gate 2 está preparado no **§8**. Nenhum item da tabela acima foi
executado nesta frente; build, nova baseline, CI e publicação dependem de OK novo do Tyago.

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

## 8. Gate 2 — QA da versão integrada (preparado; não executado)

O `PRONTO` de §3.1 vale **somente** para o Gate 1 (protótipo isolado): 6 negativos 6/6 SIM e crítica
cega Flávia (`ses_e04c30a8cffeRxJb5yFAaicyEZ`, `NÍVEL MÁXIMO: nenhum`). Ele **não** atesta o app
integrado. Com o Gate 1 autorizado pelo Tyago, este §8 prepara o Gate 2. A reexecução completa da
matriz AC-01…22/NEG-01…06 fica para **depois da integração**, com build/CI/artefato/baseline nova,
item 8, smoke e OK explícito do Tyago. Nada disso foi feito aqui: não houve build, nova baseline,
commit, push, tag, release ou publicação. A baseline permanece `D57E2866…ACF74`.

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
  `-FullAssetSet` != 78/78, CSP/capability alteradas sem nova rodada e OK do Tyago, ou qualquer
  material do Drift no build.

### 8.2 Matriz integrada — AC-01…22 e NEG-01…06

| ID | Verificação no app integrado (Gate 2) | Evidência exigida | Estado |
|---|---|---|---|
| AC-01 | Sem listener/stdio/token/verde ao abrir, inclusive após uso anterior e restart. | Snapshot + `netstat`/process list antes do clique. | Não executado |
| AC-02 | Só `Settings → Agent access` liga; nada por CLI, env, flag ou migration. | Clique deliberado + revisão de código/log. | Não executado |
| AC-03 | Bind apenas `127.0.0.1`; conexão pelo IP da máquina falha. | `netstat -ano` com PID do app. | Não executado |
| AC-04 | Token aleatório por sessão; T1≠T2; T1 morto no disable/close/restart. | T1/T2 mascarados + chamadas recusadas. | Não executado |
| AC-05 | Nenhum valor do token em log, console, snapshot, DB, UI, argv ou evidência. | Varredura com valor exato mascarado. | Não executado |
| AC-06 | stdio e HTTP após opt-in, mesma capacidade e semântica de erro. | Matriz §2.2 nos dois transportes. | Não executado |
| AC-07 | Fase 2 condicional: lote atômico/desfazível só se exposto. | Gate MCP-09 antes de qualquer exposição. | Não executado |
| AC-08 | Um SQLite (`app_config_dir`), sem 2º storage, SQL arbitrário ou path escape. | Caminho do DB + hashes + escopo por design. | Não executado |
| AC-09 | Sem egresso: nuvem, telemetry, DNS externo, `:4747`, Wrangler/D1/R2. | Firewall/proxy + `netstat` + varredura do bundle. | Não executado |
| AC-10 | Suíte local permanece verde. | `pnpm test` 17/17. | Não executado |
| AC-11 | Bundle embutido íntegro e único. | Gate `-FullAssetSet` 78/78 + SHA do bundle. | Não executado |
| AC-12 | CSP/capability byte a byte iguais às aprovadas. | Diff da string + `capabilities/default.json`. | Não executado |
| AC-13 | Auto-start não sobrevive ao restart; desligar volta a desmarcado. | MCP-03 + inspeção de storage/DB após restart. | Não executado |
| AC-14 | Catálogo exato 6/15 nos dois transportes; `catalog_status` sem token/path. | `tools/list` + diff + varredura da resposta. | Não executado |
| AC-15 | Token apenas no `env` do snippet; query rejeitada; falha fechada se ausente/curto. | Snippet + `Win32_Process` + varredura. | Não executado |
| AC-16 | HTTP fixo em `127.0.0.1:8788`, erro explícito se ocupada, sem fallback. | `netstat` + erro na UI + retry. | Não executado |
| AC-17 | Paridade stdio/HTTP em catálogo, erros e regras de token. | Matriz §2.2 + famílias do protocolo. | Não executado |
| AC-18 | Nenhuma mudança de CSP/capability sem nova rodada e OK do Tyago. | §6 + diff + OK registrado. | Não executado |
| AC-19 | Desktop via `localApi()`; HTTP backend só no dev; token não vai à API local. | Revisão do adaptador + `netstat`. | Não executado |
| AC-20 | `templates_preencher` com `save:true`; origem intacta; novo `id`. | NEG-05 + hashes antes/depois. | Não executado |
| AC-21 | Export com confirmação por arquivo; “lembrar” só em memória. | MCP-16 + NEG-06 + restart sem preferência. | Não executado |
| AC-22 | V1 sem tool de lote; `-32602` e DB/canvas intactos. | `tools/list` + chamada de lote. | Não executado |
| NEG-01 | Ausente/curto/aleatório/revogado/outra sessão/query: 401/403, corpo genérico, 10 tentativas sem crash/troca de porta/eco; stdio fechado. | Response, console, `netstat` antes/depois. | Não executado |
| NEG-02 | 8788 ocupada: erro claro, sem fallback, sem token ativo; retry com token novo após liberar. | `netstat`, screenshot sem token, PID, retry green. | Não executado |
| NEG-03 | Aba/janela fechada e toggle: sem escrita/undo, listener/child encerrados, token inválido, sem órfão, DB íntegro. | `netstat`, process list, hash do DB. | Não executado |
| NEG-04 | V1 `-32602` sem tool/efeito; Fase 2 aborta transação, DB byte-idêntico, undo único. | `tools/list`, hashes, histórico de undo, response. | Não executado |
| NEG-05 | `save:false`, `save` omitido e `id` da origem barrados; `save:true` forçado; novo design. | Body, hashes, `isError:true`. | Não executado |
| NEG-06 | Sem arquivo sem consentimento; cancelamento sem gravação; nonce one-shot; “lembrar” some no restart. | Diretório antes/depois, diálogo, restart, varredura. | Não executado |

NEG-03 e a Fase 2 de NEG-04 continuam como verificações manuais/gate MCP-09; as exceções aceitas no
Gate 1 não dispensam a execução delas no app integrado. O `PRONTO` do Gate 1 não é reutilizado como
evidência desta matriz.

## 9. Referências internas

- `docs/mcp-ux.md` — proposta de UX/copy do `Settings → Agent access`.
- `docs/mcp-planejamento.md` — catálogo V1, protocolo, backend e decisões D1–D6 do Rafael.
- `docs/qa-golive-desktop.md` — evidência do go-live, run `44818112977`, item 8, hashes e smoke.
- `docs/banco-local.md`, `SEGURANCA.md` — SQLite local, CSP aprovada e menor privilégio.
- `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json`.
- `scripts/check-embedded-bundle.ps1`, `.github/workflows/tauri.yml`, `package.json`.
- `.mcp-prototype/testes-seguranca.mjs` — suíte isolada dos 6 negativos (§3.1); não entra no build.
