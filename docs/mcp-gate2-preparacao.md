# Gate 2 integrado — preparação e fechamento

> **Veredito final: `PRONTO`.** §1–§8 registram o congelamento de estado, a revisão do diff, a etapa restrita de correções P1–P4 e alinhamento documental (§7) e a etapa B executada localmente (§8): build pareado, gate `-FullAssetSet` 78/78, smoke integrado e item 8 (MSI/NSIS) no worktree isolado. §9 registra o fechamento: matriz 28/28 (24 SIM + 4 MANUAL, sem PENDENTE e sem NÃO), commit `8c1c932` publicado na `dev`, baseline de CI do mesmo run `44894873417`, item 8 nos instaladores da CI e autorização de publicação do usuário. As frases "sem commit/push/tag/release" em §1–§8 são históricas, válidas naquele momento; o estado final é o de §9. `Release/` e a baseline antiga `D57E2866…ACF74` permanecem intactas: nenhuma promoção local.

## 1. Escopo autorizado

A revisão e a preparação (§1–§6) foram autorizadas primeiro. Depois foi autorizada uma **etapa restrita separada**, somente para corrigir P1–P4 e alinhar a documentação (registro em §7). O restante deste documento — em especial §5 — continua como **receita não executada** para a etapa B. O congelamento de §2 permanece como linha de corte; a etapa restrita não tocou binário, `dist/`, `target/`, `.pages-wt/`, CSP, capabilities nem catálogo.

| Permitido | Não permitido (nesta etapa) |
|---|---|
| Ler status, diff, logs e artefatos; calcular hashes; consultar tags/remotes em modo leitura | `pnpm build`, `pnpm tauri build`, `bundle`, `check-embedded-bundle.ps1` (gate 1 e gate 2) |
| Criar este documento de preparação | Executar `smoke.mjs`, `roundtrip-gate2.mjs`, `roundtrip-release.mjs` ou comparadores de SHA |
| Registrar comando + critério + evidência para a etapa B | `git commit`, `git push`, `git tag`, `gh release create/edit/upload/publish`, `gh workflow run` |
| Decidir onde ficará o worktree isolado | Criar o worktree, promover exe para `Release/`, gerar MSI/NSIS, tocar `gh-pages`/`.pages-wt` |
| — | Normalizar CRLF, editar `shared/locales/*`, tocar `shared/world/**` ou `server/world/**` |

`pnpm test` e `npm run i18n:check` não estão vetados como leitura, mas **não** substituem gate nem autorizam re-baseline.

## 2. Estado congelado

Medido em 21/11/2026, em modo somente leitura. Qualquer divergência destes valores é ponto de parada.

| Item | Valor |
|---|---|
| HEAD raiz `bloaudhab` | `f60c65e92aec01b62bf6f8d28d58205abdc178f2` (`v1.1.2`), 22 modificados + 9 untracked |
| HEAD `OpenDesign` | `7a304a924f797acebb5d80f19e9379f746c4a449` (`v1.1.0-beta-mcp-r6`), 16 modificados + 4 untracked (+ este documento) |
| Baseline go-live | `Release/OpenDesign.exe`, 13.946.880 bytes, SHA-256 `D57E2866D9BF7390A799882137060761222CC1F53A200C0AEA94AA147A8ACF74` — conteúdo idêntico ao HEAD, intacta |
| Run/artefato da baseline | run `44818112977`, artefato `14671391681`, ZIP `sha256:400de06ad0318d23244119ba88ab036da1574e6b94cd76401258b6f8fd96c40d` |
| Bundle da baseline | `88f36d9eb651188abac2b0687e5872951ea34fd0`, bundle `index-BCxGHaIP.js`, SHA `C9FEDB139DFDEE3BEF79E815442776C080046DB30F78E8ECF1904CE4F8FD0A9D` |
| Tags | raiz: `v1.1.0`, `v1.1.1`, `v1.1.2`; OpenDesign: `v1.1.0-beta-mcp-r3`, `r5`, `r6` (sem `r4`, sem `r7`) |
| Par local | **inválido**: `target/release/app.exe` `3D56E6F3…2FB9D` embute `index-B8HL4cME.js`; `dist/index.html` referencia `index-CS_UnruI.js` |
| Resultado local antigo | `75/78` — registro histórico da auditoria, **não** baseline, **não** "ajuste de expectativa" |
| Portas verificadas livres | 8788, 9333, 9334, 9343, 18878, 8787, 5173, 1420, 4787 |
| Processo alheio | `app.exe` do run `44854068897` em `C:\Users\tyago\Downloads\...`, PID 23180, sem listener nas portas acima — **não** reaproveitar |

**Publicação:** a afirmação honesta é "nenhuma publicação **nova** durante esta etapa de preparação". A release `r6` já existe como prerelease publicada. Consultas `git ls-remote --tags/--heads` nos dois remotes, `git tag --list` e API pública de releases confirmaram o conjunto acima; a consulta web anônima de releases do repositório raiz retornou 404, então lá só se confirmam tags. Nenhum token ou segredo foi exibido.

### 2.1 Linha de corte da sujeira

- Frente MCP atual: 21/11 a partir de ~00:19. Na raiz, **apenas `CHANGELOG.md`** é desta frente; os outros 21 modificados e 9 untracked são de 18/11 e 20/11.
- `shared/locales/{en,es,fr}.ts`: mtime 20/11 21:08:40, índice em LF e cópia sem conversão de EOL. `git diff --check` emite milhares de avisos de `trailing whitespace` que são o próprio CR (`0x20 0x0D 0x0A` = zero ocorrências); delta real é 42/2 por arquivo com `--ignore-cr-at-eol`. **Não normalizar.** `i18n:check` 3021/3139 é baseline de 20/11, não regressão.
- Em `OpenDesign/`: 16 modificados + `roundtrip-gate2.mjs`, `roundtrip-release.mjs`, `docs/artcraft-audit.md` e `.pages-wt/` como untracked. Os dois harnesses e `.pages-wt/` são pré-existentes; `artcraft-audit.md` é desta frente.
- Risco de processo: `git add -A` na raiz misturaria ~30 entradas de outras frentes no escopo Gate 2. `.pages-wt/` é worktree aninhado em `gh-pages` e vira **gitlink** com `git add -A`; nunca commitar/pushar dentro dele.

## 3. Revisão do diff — confirmado

- **AC-15:** `use-mcp-access.ts:28-38` e `agent-access-panel.tsx:25-33` entregam o token só em `env.OPENDESIGN_MCP_TOKEN`; `Authorization: Bearer` fica apenas em runtime, nunca em URL/argumento/snippet/log.
- **NEG-06:** `backend-tauri.ts:161-188` valida `data_url`, chama `pickSavePath` (`:164`), autoriza (`:172-178`) e só depois grava (`:181-183`); destino e nonce aparecem na descrição/chave; fila em `confirm.ts:11,18-41` serializa pedidos; mensagens de falha são fixas e sem caminho/stack.
- **Protocolo:** `mcp-core.mjs:297-301` rejeita `initialize` moderno (`2026-07-28`) com `-32601`; headers `Mcp-Method`/`Mcp-Name` opcionais e validados se presentes; quatro versões legadas (`2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`).
- **Catálogo/CSP:** 6 caixas / 15 tools idênticos em protótipo e integrado; CSP de 161 bytes com SHA `73EDE1DD3A4905698645C6DCF1B0922E271C0CDB20793E5FD48613C91A1C76C9`; 5 capabilities inalteradas. Nenhuma alteração em `shared/world/**` ou `server/world/**` nesta frente.
- **Textos/strings:** toasts em PT e literais exigidos por `testes-seguranca.mjs` e `roundtrip-gate2.mjs` intactos — `"env": { "OPENDESIGN_MCP_TOKEN"` (`docs/mcp-ux.md:90,104`), `Porta 8788 em uso` (`docs/mcp-qa.md:246,271`), `` `export:${esperado}:${args.filename}:${destino}` `` (`backend-tauri.ts:177`), ordem dos 15 nomes, códigos `-32601/-32602/-32022`. `Serviço recuperado automaticamente.` continua **previsto, não emitido**.
- **Validação local já executada (não é Gate 2):** `node --check` em 8 `.mjs` exit 0; `testes-seguranca.mjs` 6/6 SIM; `i18n:check` 3021/3139; `git diff --check` limpo nos arquivos da frente; varredura Drift/GPLv3 zero em `src/`, `.mcp-prototype/`, `vite.config.ts`, `index.html`; `pnpm test` 17/17.

## 4. Pendências de decisão antes da etapa B

P1–P4 foram corrigidos na etapa restrita autorizada depois desta revisão (registro completo em §7); P5–P8 permanecem sem alteração. Correção local e validação isolada **não** convertem nenhuma linha da matriz §8.2 em executada no app integrado e **não** autorizam o build pareado.

| # | Achado | Impacto |
|---|---|---|
| P1 (**CORRIGIDO — §7**) | `agent-access-panel.tsx:134` inverteu `copyNotice ?? access.notice` (HEAD) para `access.notice ?? copyNotice`; o `useEffect` de `:130-132` só limpa `copyNotice` quando `access.notice` muda, e `use-mcp-access.ts:74,83` não limpa o notice depois de `Agente desconectado.` | Após um "Agente desconectado.", clicar em Copiar seta `copyNotice` mas a UI continua mostrando o notice antigo: `Snippet copiado.` não aparece (contraria `docs/mcp-ux.md:61`). **Regressão de toast** a corrigir antes do smoke. |
| P2 (**CORRIGIDO — §7**) | `src/client/mcp/mcp-core.mjs:287-288` (`case "notifications/initialized"`) é inalcançável: `:269` já retorna `null` para todo `notifications/*`. Comentário em `:266-267` também impreciso para o HEAD | Código morto e enganoso; comportamento correto (`null`) permanece. Limpeza opcional, sem efeito no gate. |
| P3 (**CORRIGIDO — §7**) | `.mcp-prototype/roundtrip-release.mjs:230,237,256` exige `Authorization` no snippet e afirma "snippet da UI sem campo `env`" | Harness desatualizado vs AC-15: falharia num build pareado mesmo com o transporte correto. Precisa ser adaptado ao snippet `env` antes de ser usado como evidência. |
| P4 (**CORRIGIDO — §7**) | Protótipo rejeitava `notifications/initialized` **com `id`** com `-32601` (`.mcp-prototype/mcp-core.mjs:261-270`); integrado aceita silenciosamente (`src/client/mcp/mcp-core.mjs:265-269,286-288`) | Única divergência funcional entre os dois cores. O protótipo não pode servir de referência de paridade para este caso. |
| P5 | `backend-tauri.ts:171` usa `picked.path.trim()` para exibição/chave, mas `:182` grava `picked.path` bruto | `autorizado ≠ gravado` se houver espaços nas pontas; nonce no Rust fica no caminho bruto, sem bypass. |
| P6 | `docs/mcp-ux.md:187-190` generaliza D2 ("escolher destino e autorizar antes de gravar") para escrita de projeto; `docs/mcp-planejamento.md` mantém ~20 passagens do estado "protótipo isolado"; `docs/mcp-qa.md:6,13-14,24-27,463,470-471,543` tem conflitos de autoria/escopo, texto obsoleto, referência de seção quebrada, legenda MANUAL sem AC-07 e descrição imprecisa do `git diff --check`; `artcraft-audit.md:221` rotula D4 como "canônico" | Inconsistências documentais. Registrar como pendência; **não** converter SIM estático em "executado no app integrado". |
| P7 | `CHANGELOG.md:31,59` dizem que a Política de Cookies foi "publicada" | Bullet pré-existente da frente de cookies, fora do escopo MCP. Não alterar nesta frente. |
| P8 | Mensagens de protocolo em inglês (`Method not found:`, `HeaderMismatch:`) e quatro strings da raiz em inglês pass-through (`shell`, `shells`, `{0} shells`, `replay`) | Pré-existentes; decisão de PT só dentro de `OpenDesign/` nesta frente. Não tocar `shared/locales`. |

## 5. Matriz de comandos da etapa B (comando + critério + evidência)

Não executar agora. Convenção de variáveis:

```powershell
$OD  = 'C:\Users\tyago\Projeto\bloaudhab\OpenDesign'
$WT  = 'C:\Users\tyago\AppData\Local\Temp\opencode\od-gate2-pareado'
$EV  = 'C:\Users\tyago\AppData\Local\Temp\opencode\gate2-evidencias'
New-Item -ItemType Directory -Force -Path $EV | Out-Null
```

### 5.1 Build pareado em worktree isolado

**Comando (sequência):**

```powershell
# B0 — re-congelar
git -C 'C:\Users\tyago\Projeto\bloaudhab' rev-parse HEAD
git -C $OD rev-parse HEAD
git -C $OD status --short --branch
(Get-FileHash -LiteralPath "$OD\Release\OpenDesign.exe" -Algorithm SHA256).Hash

# B1 — capturar o estado exato sem commit e aplicar no worktree
git -C $OD diff --binary --output="$EV\correcoes.patch" HEAD
(Get-FileHash -LiteralPath "$EV\correcoes.patch" -Algorithm SHA256).Hash
git -C $OD worktree add --detach $WT 7a304a924f797acebb5d80f19e9379f746c4a449
git -C $WT apply --whitespace=nowarn "$EV\correcoes.patch"
Copy-Item "$OD\.mcp-prototype\roundtrip-gate2.mjs" "$WT\.mcp-prototype\"
Copy-Item "$OD\.mcp-prototype\roundtrip-release.mjs" "$WT\.mcp-prototype\"
Copy-Item "$OD\docs\artcraft-audit.md" "$WT\docs\"
git -C $WT status --short

# B2 — pré-checks
Set-Location $WT
pnpm install --frozen-lockfile
pnpm test
$env:PATH = "C:\Users\tyago\.cargo\bin;$env:PATH"

# B3 — ÚNICO build (beforeBuildCommand = pnpm build já regenera dist/)
pnpm tauri build --no-bundle
```

**Critério:** HEAD `7a304a9…` idêntico e os 16 arquivos rastreados aplicados por patch; **não** buildar com o HEAD puro (as correções não estão commitadas). Worktree em `--detach` porque `main` já está ocupada. **Não** copiar `dist/`, `target/`, `.pages-wt/`, `.env`, `data.db*`, `uploads/` nem `Release/`. **Não** rodar `pnpm build` separado antes/depois do `tauri build`; **não** editar `vite.config.ts`, `tauri.conf.json`, `Cargo.toml`, fontes ou `package.json` entre build e gate; **não** usar `--config src-tauri/ci-build.json` localmente. Same-build = `dist/index.html` aponta para o bundle embutido no PE.

**Evidência:** `$EV\B0-estado.txt`, `$EV\correcoes.patch` + hash, `$EV\B1-worktree.txt`, `$EV\B2-testes.log`, log integral do build, nome e SHA-256 de `dist/assets/index-*.js`, SHA-256 de `target/release/app.exe`, bytes/timestamps, e cópia imutável do par em `$EV` (`exe-cru-gateado.exe`, `index.html`, `assets/`). Toolchain: pnpm 12.21.0, Node 22, Rust stable (local 1.100.0; `rust-version = 1.90`), MSVC Build Tools 2022 com `link.exe`, Windows SDK, WebView2.

### 5.2 Gate `-FullAssetSet` — 78/78 (AC-11)

**Comando:**

```powershell
Set-Location $WT
powershell -NoProfile -File scripts/check-embedded-bundle.ps1 -Exe target/release/app.exe -DistDir dist -FullAssetSet
```

**Critério:** `-FullAssetSet` não tem lista fixa de 78: deriva as expectativas de `src`/`href` com `/assets/` em `dist/index.html` e de todos os arquivos em `dist/assets/`, e testa cada **nome** no PE (não conteúdo). `78/78` exige, na saída integral: duas leituras estáveis do PE com o mesmo SHA, `PE /assets/index-*.js (unicos)` com **um** nome igual ao `<script src>` do `dist/index.html`, `FullAssetSet: 78 asset(s) exigido(s)`, **zero** linhas `FAIL:`, `GATE: APROVADO` e `exit 0`. Qualquer contagem diferente é re-baseline, nunca "ajuste de expectativa". O `75/78` antigo é inválido: PE com `index-B8HL4cME.js` × `dist` com `index-CS_UnruI.js`, 3 assets divergentes (tamanho igual não prova pareamento).

**Evidência:** stdout integral + exit code em `$EV\B4-gate1.log`, SHA do exe, nome e SHA do bundle, SHA de `dist/index.html`, lista de assets, e o hash do próprio `scripts/check-embedded-bundle.ps1`. Um `exit 0` isolado, sem contagem e hashes, não serve.

### 5.3 Item 8 — Bundle rastreável

**Comando (somente após autorização de bundle/instalação):**

```powershell
Set-Location $WT
pnpm tauri bundle --bundles msi nsis --config src-tauri/ci-build.json --no-binary-patching --no-sign --ci
# reaplicar o gate 5.2 no exe pós-bundle e comparar SHA com o do gate 1 (-ceq)

$msi  = (Get-ChildItem "$WT\target\release\bundle\msi" -Filter '*.msi' -File).FullName
$nsis = (Get-ChildItem "$WT\target\release\bundle\nsis" -Filter '*.exe' -File).FullName
msiexec /a $msi /qn TARGETDIR="$EV\msi"
& $nsis /S /D=$EV\nsis\install
$gate = (Get-FileHash -LiteralPath "$WT\target\release\app.exe" -Algorithm SHA256).Hash
foreach ($p in @("$EV\msi\PFiles\OpenDesign\app.exe", "$EV\nsis\install\app.exe")) {
  $h = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash
  if ($h -cne $gate) { throw "ITEM 8 REPROVADO: $p" }
}
powershell -NoProfile -File "$WT\scripts\check-embedded-bundle.ps1" -Exe "$EV\msi\PFiles\OpenDesign\app.exe" -DistDir "$WT\dist" -FullAssetSet
powershell -NoProfile -File "$WT\scripts\check-embedded-bundle.ps1" -Exe "$EV\nsis\install\app.exe" -DistDir "$WT\dist" -FullAssetSet
```

**Critério:** é o item 8 do checklist de aceite do go-live (`docs/qa-golive-desktop.md:689-702`), **não** o antigo item 8 de API/arquitetura nem AC-08. Extrair o exe do **MSI e do NSIS** (extração administrativa / instalação silenciosa); SHA-256 de ambos igual, com `-ceq`, ao exe gateado **deste mesmo run**; reaplicar `-FullAssetSet` no exe extraído com 78/78. `--no-binary-patching` é obrigatório: sem ele o bundler reescreve o PE e muda o SHA. Não varrer MSI/NSIS comprimido (falso negativo). Não comparar com `D57E2866…ACF74` (baseline antiga) nem com `3D56E6F3…`.

**Evidência:** run/build IDs, exit codes, SHA dos instaladores, SHA dos dois exes extraídos, saída dos dois gates reaplicados, tamanhos e registro de desinstalação. Um `78/78` local com exe/`dist` novos prova só a coerência do par local: **não** prova a baseline publicada nem autoriza publicação — a baseline exige novo CI/run/artefato com digest validado.

### 5.4 Smoke integrado

**Comando:**

```powershell
node .mcp-prototype/smoke.mjs                 # isolado, sem binário
node .mcp-prototype/roundtrip-release.mjs "$WT\target\release\app.exe"
```

**Critério:** `smoke.mjs` cobre protocolo/adaptadores com backend falso (16 asserções, 5 amostras, `SMOKE OK — n/n`); `roundtrip-release.mjs` recebe o exe por argv, imprime `EXE`/`SHA256` e cobre HTTP (401/400/404/405, `no-store`, sem CORS, discover, 15 tools, `catalog_status`, `save:false`, `-32700`, toggle) e stdio zero-TCP, terminando com `RESULTADO: N OK / N FALHA` e exit 0. Pré-requisitos: portas 8788 (HTTP), 9343 (CDP release), 9333/9334 (CDP debug do gate2), 18878 (só checagem fail-closed, sem bind); perfis WebView2 próprios em `Temp\opencode\`.

**Armadilhas a resolver antes de usar como evidência:** (1) P3 — o harness de release ainda espera `Authorization` no snippet e "sem campo `env`"; (2) `roundtrip-gate2.mjs:24-25` fixa `...\OpenDesign\target\debug\app.exe` e `cwd` em `src-tauri`, e reaproveita GUI existente (`:462-500`): não aponta para o worktree e pode testar o PID 23180 de outro run; (3) o HTTP do gate2 depende do import `/src/client/mcp/bridge.ts` do dev server Vite `:5173`; (4) `18878` não é usada pelos harnesses. Tokens T1/T2/T3 ficam só em memória; toda evidência usa `<TOKEN_MASCARADO>`.

**Evidência:** logs integrais mascarados, `RESULTADO`, SHA do exe sob teste, varredura pelo valor exato do token no diretório de evidências com **0 ocorrências**; se aparecer, descartar e refazer. Checklist de smoke dos instaladores 0–8 preenchido separadamente para MSI e NSIS, com desinstalação e resíduos registrados.

### 5.5 Matriz §8 e fechamento

**Comando/critério:** executar as 28 linhas de `docs/mcp-qa.md` §8.2 contra o binário do run pareado. Cada linha só vira SIM com execução no app integrado: a coluna "Estático" **nunca** converte PENDENTE em SIM, e a suíte 6/6 do protótipo não é reutilizada. Crédito local (`pnpm test` 17/17, CSP byte a byte, "inalterado") precisa de revalidação no run. AC-11 é o único `NÃO` histórico (`NÃO (local)`), inválido como baseline. **AC-07, NEG-03 e a Fase 2 de NEG-04 permanecem `MANUAL/PENDENTE`**; a parte V1 de NEG-04 é executável. Sem decisão explícita sobre essas exceções, 28/28 é inatingível.

**Fechamento do próximo ciclo:** 28/28 linhas diferentes de PENDENTE, nenhum `NÃO`, máscara aplicada, build pareado `78/78` + item 8, baseline nova do mesmo run, smoke e OK explícito de publicação. Mesmo assim, a etapa B entrega **evidência local pareada** e mantém Gate 2 `BLOQUEADO` até autorização final (estado da etapa B; fechamento em §9).

**Evidência por linha:** ID, timestamp, comando exato, SHA do exe e do `dist/` do mesmo run e `run_id`; screenshot/log/JSON mascarados. Nenhuma frase em nome de terceiros; Bridge indisponível, chat usado como relay.

## 6. Guardrails de encerramento

`Release/` fica congelada em `D57E2866…ACF74` até QA verde + OK final. Não promover exe, não re-baselinear, não commitar/pushar/tagar/criar release/rascunho, não disparar CI, não publicar `gh-pages`. Não assinar, não criar secrets, não alterar CSP/capabilities. Não servir snippets com `--token`, `?token=` ou `Authorization` no texto; não reintroduzir `Serviço recuperado automaticamente.` como emitido; não reescrever as strings listadas na §3; não normalizar CRLF; não tocar `shared/locales`, `shared/world/**` ou `server/world/**`.

Pontos de parada: divergência de HEAD/hash no B0; patch que não aplica ou arquivo de correção faltando no B1; `pnpm test` < 17/17 ou CSP/capability diferentes no B2; par exe↔`dist` dessincronizado no B3; qualquer `FAIL:`/contagem ≠ 78 no B4/5.2; divergência de SHA no item 8; smoke vermelho. Em todos os casos: **parar**, não "ajustar expectativa", não reutilizar hash antigo.

## 7. Etapa restrita P1–P4 + alinhamento documental — executada

**Autorização:** etapa separada da etapa B, somente correções P1–P4 e alinhamento documental. Não houve build, `check-embedded-bundle.ps1`, smoke, baseline, commit, push, tag, release, deploy ou publicação nova. Não foram alterados CSP, capabilities, catálogo de ferramentas, `Release/OpenDesign.exe`, `dist/`, `target/`, `.pages-wt/`, `shared/locales/**`, `shared/world/**` ou `server/world/**`. HEADs e baseline congelados de §2 permanecem; os sistemas de arquivos citados não foram tocados. Tokens: nenhum valor real; apenas aliases `T1`/`T2`/`T3` e `<TOKEN_MASCARADO>`.

### 7.1 Alterações (cada uma com arquivo, motivo e resultado)

| # | Arquivo | Antes → depois | Motivo / resultado |
|---|---|---|---|
| P1a | `src/client/components/agent-access-panel.tsx:134` | `access.notice ?? copyNotice` → `copyNotice ?? access.notice` | Restaura a precedência do HEAD. `use-mcp-access.ts:74,83` não limpa `Agente desconectado.`, e o `useEffect` de `:130-132` continua limpando `copyNotice` quando `access.notice` muda. Com isso `Snippet copiado.` volta a ser exibido após copiar, sem alterar o contrato dos notices. |
| P1b | `.mcp-prototype/roundtrip-release.mjs:230` | snippet aceito só se contivesse `Authorization` → aceito se contiver `OPENDESIGN_MCP_TOKEN` | O snippet real (`use-mcp-access.ts:28-38`) entrega `env.OPENDESIGN_MCP_TOKEN`; o harness antigo nunca encontraria o snippet e falharia antes de testar o transporte. |
| P1c | `.mcp-prototype/roundtrip-release.mjs:237` | `cfg.headers?.Authorization` com strips de `Bearer` → `cfg.env?.OPENDESIGN_MCP_TOKEN` | Mesmo contrato AC-15; o Bearer é montado em runtime pelo cliente, não escrito no snippet. Continua mascarado em toda evidência. |
| P1d | `.mcp-prototype/roundtrip-release.mjs:256` | `checar("snippet da UI sem campo env", !("env" in cfg))` → `checar("snippet da UI com token em env.OPENDESIGN_MCP_TOKEN", …64 hex…)` + `checar("snippet da UI sem headers.Authorization", !("headers" in cfg))` | Substitui a asserção invertida por duas verificações do contrato real, sem enfraquecer o formato `64 hex` já checado na linha seguinte. |
| P2a | `.mcp-prototype/mcp-core.mjs:255-270` | `ehNotificacao`/versão/headers antes do prefixo → `if (msg.method.startsWith("notifications/")) return null;` antes de versão/headers; docblock e comentário alinhados ao integrado | Define o comportamento canônico: toda `notifications/*`, com ou sem `id`, é aceita silenciosamente antes de versão/headers. Elimina a única divergência funcional entre protótipo e integrado (P4). |
| P2b | `src/client/mcp/mcp-core.mjs:259,286-288` | docblock ajustado; removido `case "notifications/initialized": return respostaOk(...)` | O `case` era inalcançável porque `:269` já retornava `null` para todo `notifications/*`. Contrato inalterado: `null` → `202` sem corpo em `src-tauri/src/mcp/http.rs:256-262`. |
| P2c | `docs/mcp-ux.md:16,187-190,206` | D1 passou a ser descrito como backend de dados (backend HTTP só no dev; transporte MCP em `127.0.0.1:8788` é D3); FAQ de D2 limitada a `mcp_exportar`, com ressalva de que `projeto_salvar`/`templates_preencher` não pedem consentimento por arquivo na V1 | Remove a generalização indevida de D2 e a confusão entre backend HTTP e transporte MCP. Strings sensíveis (`"env": { "OPENDESIGN_MCP_TOKEN"` em `:90,104`; `Porta 8788 em uso`) preservadas. |
| P2d | `docs/mcp-planejamento.md` (§1, §2, §3, §4, §5, §6, §7, §8, §9, §10) | Passagens do estado "protótipo isolado / Fase 1 a autorizar / não integrado" alinhadas à integração em árvore de trabalho sob Gate 2 bloqueado; Protocolo ganhou o comportamento canônico de notificações; fases marcadas como entregues/pendentes conforme o código | O documento deixou de contradizer o estado efetivo sem transformar código em evidência de gate. Nenhuma linha da matriz virou SIM por isso. |
| P2e | `docs/mcp-qa.md` (frontmatter, §0, §6 nota, §8.2 legenda/AC-10/AC-18, §8.3) | Estado/escopo atualizados; "plano, não implementação" substituído por "plano de QA, não evidência de gate"; referência `§8.3 "Divergências corrigidas"` corrigida; legenda e parágrafo de manuais incluem AC-07; AC-10/AC-18 esclarecidos como verificação local; descrição do `git diff --check` restrita aos arquivos da frente; protocolo e nova subseção da etapa restrita adicionados | Remove inconsistências documentais sem reclassificar PENDENTE como SIM. `78/78` e matriz integrada continuam fora de escopo. |
| P2f | `docs/mcp-gate2-preparacao.md` (topo, §1, §4, §7) | Registro da etapa restrita, P1–P4 marcados como corrigidos, P5–P8 mantidos, esta seção criada | Atende "registrar cada alteração e resultado no plano de preparação". |

### 7.2 Validações locais executadas (não são Gate 2)

| Comando | Resultado |
|---|---|
| `node --check .mcp-prototype/mcp-core.mjs` | exit 0 |
| `node --check .mcp-prototype/roundtrip-release.mjs` | exit 0 |
| `node --check src/client/mcp/mcp-core.mjs` | exit 0 |
| `node .mcp-prototype/testes-seguranca.mjs` | exit 0 — `RESULTADO: 6/6 SIM` (R1…R6); **não é evidência do Gate 2** |
| `node C:\Users\tyago\AppData\Local\Temp\opencode\verificar-notificacoes.mjs` | `PARIDADE OK — 5/5`, exit 0: notificação sem id, com id e com id + versão/headers inválidos → `null` nos dois cores; `initialize` moderno → `-32601`; `server/discover` legado → `result`. Script fora da árvore, não commitado; a primeira execução falhou apenas por import ESM com caminho Windows e foi corrigida para `file://` antes do resultado acima. |
| `git diff --check -- src/client/components/agent-access-panel.tsx src/client/mcp/mcp-core.mjs .mcp-prototype/mcp-core.mjs` | exit 0, sem saída nos arquivos rastreados (apenas avisos de LF→CRLF do Git, não whitespace). `shared/locales/*` não foi incluído. |
| Verificação à parte de trailing whitespace em `.mcp-prototype/roundtrip-release.mjs` e `docs/mcp-gate2-preparacao.md` | 0 linhas com whitespace no fim. **Ressalva:** ambos são untracked, portanto `git diff --check` não os examina, mesmo quando listados no comando; por isso a verificação foi feita separadamente. |

Não foram reexecutados `pnpm test`, `i18n:check`, gate `-FullAssetSet`, smoke nem comparadores de SHA: a autorização cobria somente as correções e validações dirigidas acima.

### 7.3 Estado após a etapa restrita

Naquele ponto, Gate 2 permanecia `BLOQUEADO — não PRONTO` (fechamento em §9). P1–P4 estavam corrigidos na árvore de trabalho; build pareado com `78/78`, item 8 e smoke foram executados localmente (§8), mas a matriz AC/NEG não foi executada no app integrado e não existe baseline nova de CI do mesmo run. P5 (`picked.path.trim()` vs path bruto), P6 (documentação — tratada parcialmente em P2c–P2f; `artcraft-audit.md:221` permanece), P7 (cookies) e P8 (mensagens em inglês) seguem como pendências registradas, sem alteração.

**Próximo passo obrigatório:** nova **revisão independente do diff** destas correções antes de iniciar a etapa B. A revisão deve confirmar, no mínimo: precedência do toast com o `useEffect` preservado; nenhuma expectativa de `Authorization` no harness; paridade exata dos dois cores em `notifications/*`; nenhuma alteração de CSP/capabilities/catálogo; nenhum arquivo de `Release/`, `dist/`, `target/` ou `.pages-wt/` modificado; HEADs e hash da baseline idênticos a §2. Somente depois dessa revisão e de autorização explícita se discute o build pareado.

### 7.4 Nova revisão independente do diff — concluída

Executada depois das correções e **antes** de qualquer build pareado, em modo somente leitura (`git status/diff/show`, `grep`, `Get-FileHash/Get-Item`, `node --check`), por um segundo revisor sem contexto da implementação. Veredito: **`REVISÃO INDEPENDENTE: OK`**. Nenhum arquivo foi editado; nenhum build, gate, smoke, commit ou publicação foi executado por essa revisão.

| Critério (§7.3) | Resultado |
|---|---|
| Precedência do toast | PASS — `copyNotice ?? access.notice`, `useEffect` preservado, nenhum literal visível fora de `tr()` |
| Harness de release | PASS — sem expectativa de `Authorization` nem "sem campo `env`"; `cfg.env.OPENDESIGN_MCP_TOKEN` + `64 hex`; nenhum token real em evidência |
| Protocolo `notifications/*` | PASS — prefixo antes de versão/headers nos dois cores, com e sem `id`; sem `case` inalcançável; `initialize` moderno segue `-32601`; `null → 202` intacto |
| Documentação | PASS — D2/D1 alinhados, plano fora do estado "protótipo isolado", matriz sem conversão de PENDENTE em SIM, strings sensíveis preservadas |
| Fora de escopo | PASS — CSP 161 bytes/SHA `73EDE1DD…C76C9`, capabilities e catálogo inalterados; exe `D57E2866…ACF74`; `dist/`, `target/`, `.pages-wt/`, `shared/locales/**`, `shared/world/**`, `server/world/**` intocados; HEADs `f60c65e9…` e `7a304a92…` |
| Coerência do registro | PASS — §7.1 lista cada alteração; validações reproduzíveis; Gate 1 não trocado por Gate 2 |

**Ajuste feito a partir da revisão:** a linha de `git diff --check` em §7.2 e a passagem equivalente em `docs/mcp-qa.md` §8.3 foram corrigidas para declarar que o Git não examina arquivos untracked; `.mcp-prototype/roundtrip-release.mjs` e `docs/mcp-gate2-preparacao.md` foram verificados à parte (0 linhas com trailing whitespace).

A etapa B de build pareado passou a ser autorizada depois desta revisão (registro na §8); o resultado local ali descrito **não** altera o veredito do Gate 2.

## 8. Etapa B — build pareado e gate local (executados)

**Autorização:** pedido explícito do usuário para "gerar o exe", depois da revisão independente de §7.4. Escopo interpretado como build local no worktree isolado e validação pareada; **não** houve autorização para instaladores, publicação, baseline, commit, tag, release ou deploy. Nada foi promovido para `Release/`; a baseline `D57E2866…ACF74` permanece intacta.

### 8.1 Execução (B0→B3)

| Etapa | Comando / ação | Resultado |
|---|---|---|
| B0 | `git rev-parse HEAD` (raiz e OpenDesign), `git status --short`, `Get-FileHash Release\OpenDesign.exe` | Raiz `f60c65e92aec01b62bf6f8d28d58205abdc178f2`, OpenDesign `7a304a924f797acebb5d80f19e9379f746c4a449`, exe `D57E2866D9BF7390A799882137060761222CC1F53A200C0AEA94AA147A8ACF74`; worktree ainda inexistente |
| B1 | `git diff --binary --output="$EV\correcoes.patch" HEAD`; `git worktree add --detach $WT 7a304a9…`; `git apply --whitespace=nowarn`; cópia de `roundtrip-gate2.mjs`, `roundtrip-release.mjs` e `docs/artcraft-audit.md` | Patch SHA-256 `371D93E2378124EE24815E4A9B2C558ECB2D388EEFBB8E9C7B5941D8B3245B22`; 16 arquivos rastreados aplicados + 3 untracked copiados; `dist/`, `target/`, `Release/`, `.pages-wt/` **não** copiados |
| B2 | `pnpm install --frozen-lockfile`, `pnpm test`, `$env:PATH` com `C:\Users\tyago\.cargo\bin` | pnpm 12.21.0, Node v22.23.4, install exit 0 (lockfile inalterado, 313 pacotes do store); `pnpm test` **17/17**, exit 0, 0 falhas/skipped/todo/cancelled, apenas `ExperimentalWarning` de SQLite; rustc/cargo 1.100.0 |
| B3 | **único** `pnpm tauri build --no-bundle` em `$WT` | `BUILD_EXIT=0`; `beforeBuildCommand` executou `pnpm build` internamente (23,44 s); Rust release terminou em 3m43s; `app.exe` gerado somente no worktree |

**Caminho do exe:** `C:\Users\tyago\AppData\Local\Temp\opencode\od-gate2-pareado\target\release\app.exe`. Logs integrais: `$EV\B2-install.log`, `$EV\B2-testes.log`, `$EV\B3-build.log`.

### 8.2 Par pareado e gate `-FullAssetSet` (AC-11)

| Medição | Valor |
|---|---|
| Exe gateado | SHA-256 `51D5A6EB6BE4F7D5916E534805DF19B70DD05C9E8956AA1DA6890535D1180121`, 14.028.800 bytes |
| `dist/index.html` | SHA-256 `D01A57B1DF5E893FC5C084C659EEA2777A3B88E79C65FF2642234DCE622268E9` |
| `<script src>` | `./assets/index-BDtBGonU.js` |
| Bundle embutido no PE | `/assets/index-BDtBGonU.js` — **igual** ao `<script src>` |
| SHA do bundle no `dist` | `B3F4092E78D6B6690C1E8C3A16AEFAB342ACBEE7C858895EA9010B9D68F13128` |
| Assets em `dist/assets` | 78 arquivos |
| Gate | `powershell -NoProfile -File scripts/check-embedded-bundle.ps1 -Exe target/release/app.exe -DistDir dist -FullAssetSet` → duas leituras estáveis do mesmo SHA, `PE /assets/index-*.js (unicos)`, `FullAssetSet: 78 asset(s) exigido(s)`, zero `FAIL:`, `GATE: APROVADO`, **exit 0** |

Log integral em `$EV\B4-gate1.log`. Cópia imutável do par em `$EV\exe-cru-gateado.exe`, `$EV\index.html` e `$EV\assets\`. O exe local **não** é a baseline: não foi promovido, não recebeu instalador e não substitui o run `44818112977`.

### 8.3 Estado depois do build

O par local está coerente e o `78/78` local está aprovado; o smoke integrado (§8.4) e o item 8 (§8.5) também foram executados localmente no mesmo par. Naquele ponto o Gate 2 continuava **`BLOQUEADO — não PRONTO`** (fechamento em §9): matriz AC/NEG de 28 linhas, baseline nova de CI do mesmo run e OK explícito de publicação seguem pendentes. AC-07, NEG-03 e Fase 2 de NEG-04 permanecem `MANUAL/PENDENTE`. Nenhum commit, push, tag, release, deploy ou publicação nova foi executado.

### 8.4 Smoke integrado no exe isolado (executado)

**Autorização:** "começar pelo smoke integrado", restrito ao executável isolado, **sem instalação ou publicação**. Não houve bundle, MSI/NSIS, extração de instalador, promoção para `Release/`, baseline nova, commit, push, tag, release ou deploy. O exe testado é exatamente o de §8.2 (`51D5A6EB…0121`), lido do worktree.

**Pré-checagem:** portas 8788, 9333, 9334, 9343, 18878, 8787, 5173, 1420 e 4787 livres. O `app.exe` alheio de `C:\Users\tyago\Downloads\opendesign-windows-44854068897\` (PID 23180) estava presente, sem listener, e **não** foi reaproveitado.

| Comando | Resultado |
|---|---|
| `node .mcp-prototype/smoke.mjs` | `SMOKE OK — 16/16`, exit 0; 5 amostras de caixas não-catálogo (`projeto_listar`, `templates_preencher` com `save:true`, `brand_kits_criar`, `export_salvar_png` com confirmação antes da gravação e `snapshot_ler` com offset/hash), backend falso, sem binário |
| `node .mcp-prototype/roundtrip-release.mjs "$WT\target\release\app.exe"` | `EXE` e `SHA256` idênticos a §8.2; HTTP: token mascarado gerado pela UI, `env.OPENDESIGN_MCP_TOKEN` sem `headers.Authorization`, endpoint fixo, 401/400/404/405, `no-store`, sem CORS, discover moderno, notificação com `id` → 202 sem `-32601`, initialize/notificação/tools/list em quatro versões legadas, 15 tools, `catalog_status` sem token/caminho, `save:false` reprovado, JSON inválido → `-32700`, desligar pela UI encerra o listener; stdio: discover/initialize/tools/list/catalog_status, notificação com `id` sem `-32601`, zero TCP, stdout só JSON-RPC, token ausente em stdout/stderr, sem panic WebView2, EOF limpo; stdio com GUI aberta sem `0x800700AA`. **`RESULTADO: 48 OK / 0 FALHA`, exit 0** |

Logs: `$EV\B5-smoke-isolado.log`, `$EV\B5-roundtrip-release.log` (final) e `$EV\B5-roundtrip-release-v1.log` (execução anterior).

**Ajuste de evidência:** a primeira execução imprimiu "campo env ausente ou inválido" como *detalhe de uma checagem aprovada* — redação enganosa do harness, não falha do app. O texto foi trocado por "64 hex validado" na árvore de trabalho e no worktree; `node --check` deu exit 0 nas duas cópias e a reexecução repetiu `48 OK / 0 FALHA`. Nenhuma asserção foi enfraquecida: `env.OPENDESIGN_MCP_TOKEN`, formato `64 hex` e ausência de `headers` continuam exigidos.

**Mascaramento:** varredura por `[0-9a-fA-F]{64}` nos logs encontrou apenas três valores conhecidos e não secretos — SHA do exe gateado, SHA do PNG de 1×1 da amostra e SHA do canvas da amostra. Nenhum token real foi gerado, exibido ou gravado; as evidências usam `<token>`.

**Pós-smoke:** portas 8788 e 9343 voltaram a ficar livres; nenhum processo iniciado pelo harness ficou órfão. O PID alheio 23180 **não** estava mais presente ao final; o harness só chama `taskkill` nos PIDs que ele mesmo cria, então não há evidência de que o tenha encerrado — registrado como observação, não como ação desta frente.

**Estado:** smoke local verde valida comportamento real do exe, mas **não** executa a matriz AC/NEG e **não** converte nenhum `PENDENTE`/`MANUAL` em SIM. Matriz, baseline nova de CI e OK de publicação permaneciam pendentes; Gate 2 seguia `BLOQUEADO — não PRONTO` até o fechamento de §9.

### 8.5 Item 8 — bundle rastreável (executado)

**Autorização do usuário:** gerar MSI e NSIS do mesmo build pareado, extrair os exes, comparar SHA-256, reaplicar `-FullAssetSet`, guardar logs/evidências; **sem** promover baseline, publicar, deployar, commitar ou taggear. Extração com instalação silenciosa + desinstalação foi autorizada explicitamente depois que a opção "só extrair" foi recusada; elevação via UAC foi autorizada depois que `msiexec /a` falhou sem ela (1603/2502).

**Config temporário:** `src-tauri/ci-build.json` **não existe em disco por design** — o workflow `.github/workflows/tauri.yml:103-119` o gera no runner a partir de `tauri.conf.json`, alterando só `bundle.active: true` e `bundle.targets: ['msi','nsis']`. Recriado com esse mesmo código **somente no worktree** (`CI_BUILD_SHA256=1EB24C1105E58F9F8FFCB1CC51D7A4E6202F8576C763F330DB92D33D3771E468`), usado apenas no `bundle` e removido ao final. `tauri.conf.json`, CSP, capabilities e catálogo intactos.

| Ação | Comando / resultado |
|---|---|
| Bundle | `pnpm tauri bundle --bundles msi nsis --config src-tauri/ci-build.json --no-binary-patching --no-sign --ci` → `BUNDLE_EXIT=0`; WiX 3.14.1 e NSIS 3.13 baixados/verificados pelo CLI (auto-download, sem instalação manual); aviso `Skipping binary patching ... due to --no-binary-patching flag.`; `beforeBuildCommand` **não** rodou; `app.exe` e `dist/` inalterados |
| Gate pós-bundle | `check-embedded-bundle.ps1 -Exe target/release/app.exe -DistDir dist -FullAssetSet` → 78/78, `GATE: APROVADO`, exit 0 |
| MSI | `OpenDesign_1.1.0-1_x64_en-US.msi` — SHA-256 `DFBA507851FBB2FC9348149432EB2E739CB5534C94CAFA50D41C16DD02302765`, 6.344.704 bytes |
| NSIS | `OpenDesign_1.1.0-1_x64-setup.exe` — SHA-256 `2984C27CB61C1F7B83369E06D08C79D4CF0934587A4316C717CE22E157593715`, 5.015.574 bytes |
| Extração MSI | `msiexec /a <msi> /qn /norestart TARGETDIR=$EV\B6-msi /L*v ...` com `-Verb RunAs` → exit 0; `app.exe` em `B6-msi\PFiles\OpenDesign\app.exe` |
| Extração NSIS | `<setup.exe> /S /D=<sem aspas>` → exit 0; `app.exe` em `B6-nsis\install\app.exe`; desinstalado com `uninstall.exe /S` → exit 0 |
| `-ceq` | 4/4 `IGUAL` contra `51D5A6EB…0121`: exe gateado, cópia congelada, exe do MSI, exe do NSIS (todos 14.028.800 bytes) |
| Gates reaplicados | MSI e NSIS, cada um com `-DistDir $WT\dist -FullAssetSet` → `FullAssetSet: 78 asset(s) exigido(s)`, `GATE: APROVADO`, exit 0, `/assets/index-BDtBGonU.js` |

**Limpeza:** chave de desinstalação e atalho do NSIS **não existiam antes e não ficaram**; nenhum processo `app.exe` órfão; `ci-build.json` removido do worktree. Baseline `D57E2866…ACF74` e exe pareado `51D5A6EB…0121` reconfirmados intactos ao final. Nada foi promovido para `Release/`, publicado ou deployado.

**Evidências em `$EV`:** `B6-preparar-bundle.txt`, `B6-bundle.log` (3 tentativas registradas: cargo ausente, stderr terminante, sucesso), `B6-gate-pos-bundle.log`, `B6-msi-extract.log`, `B6-msi-msiexec-verbose.log` (falha 1603/2502 sem elevação), `B6-msi-msiexec-verbose-elevado.log`, `B6-nsis-extract.log`, `B6-extracao-encontrados.txt`, `B6-sha-ceq.log`, `B6-gate-msi.log`, `B6-gate-nsis.log`, `B6-side-effects.txt`, `B6-resumo.txt`, `B6-varredura-final.txt` (varredura por 64 hex nos logs: **0 valores desconhecidos**; apenas hashes conhecidos do exe, baseline, patch, `dist`, instaladores, config e amostras do smoke), cópias em `B6-exes\`.

**Estado naquele momento:** item 8 local aprovado provava apenas que MSI e NSIS do **mesmo par local** embedam o exe gateado e preservam os 78 assets. Não era baseline publicada, não substituía o run `44818112977` e **não autorizava publicação** naquele instante; matriz AC/NEG, baseline nova e OK final estavam pendentes. O fechamento posterior está em §9.

## 9. Fechamento do Gate 2 — matriz, CI do mesmo run e publicação (21/11/2026)

**Autorização.** O usuário autorizou explicitamente: "Autorizar publicação", "resolver o gate 2",
"GitHub Release", "Executar pendências + CI", "Sim — somente esses arquivos", "branch `dev`" e
"resolver bloqueio". Escopo: branch `dev`, commit escopado, execução das pendências, CI e publicação
final. `main` intacto; `Release/` congelada; a raiz do Habblaud (inclusive `CHANGELOG.md`) ficou
fora do escopo dos arquivos autorizados. Nenhum arquivo de `shared/world/**` ou `server/world/**`
foi tocado.

**Commit imutável.** `8c1c932` (`chore: consolida estado do Gate 2 (sem publicar)`) na `dev`,
exatamente 19 arquivos (16 modificados + 3 untracked de Gate 2/P1–P4), nenhuma mudança na raiz.
Push para `origin/dev` feito com reescrita HTTPS (`git -c
url.https://github.com/.insteadOf=git@github.com:`) porque o remote SSH falha por publickey.
`.pages-wt/` **não** foi commitado.

**CI do mesmo run.** Run `44894873417`, job `136818273729`, artefato `14703532928`
(`opendesign-windows-44894873417`), conclusão `success`, no mesmo commit `8c1c932`. O log integral
(`C:\Users\tyago\AppData\Local\Temp\opencode\ci-job.log`) registra:

| Verificação | Resultado da CI |
|---|---|
| `pnpm test` | `# tests 17`, `# pass 17`, `# fail 0`, `0` skipped/todo/cancelled |
| Gate `-FullAssetSet` pré-bundle | `78 asset(s) exigido(s)`, `GATE: APROVADO`, exit 0 |
| Gate `-FullAssetSet` pós-bundle | `78/78`, `GATE: APROVADO`, exit 0 |
| Bundle | `index-BDtBGonU.js`, SHA `B3F4092E78D6B6690C1E8C3A16AEFAB342ACBEE7C858895EA9010B9D68F13128` |
| Exe antes/depois do bundle | SHA `F18E847899A536992E1492B57F09326166DC8942435C18EFC03285ED642EDBA1` nos dois (inalterado) |
| Roundtrip no exe do artefato | `RESULTADO: 48 OK / 0 FALHA` (`roundtrip-ci.log`) |

**Item 8 nos instaladores da CI.** MSI
`OpenDesign_1.1.0-1_x64_en-US.msi` — SHA
`D1DF3AF4E9DED48E3AD8E4743BDD32D1F2345D2255F79C4E168985C88FFB791D` — extraído com `msiexec /a`
elevado; NSIS `OpenDesign_1.1.0-1_x64-setup.exe` — SHA
`D3A322804372A9A3981AD6219932DEFA9E0F3EF56BF9B9277E1FA6A9F1A14BEE` — instalado silenciosamente.
Os dois exes extraídos têm SHA `F18E847899A536992E1492B57F09326166DC8942435C18EFC03285ED642EDBA1`,
idêntico ao exe gateado do mesmo run. O gate `-FullAssetSet` foi reaplicado nos dois com `78/78`,
`GATE: APROVADO`, exit 0. Nada foi promovido para `Release/`; a baseline antiga permanece
`D57E2866D9BF7390A799882137060761222CC1F53A200C0AEA94AA147A8ACF74`.

**Matriz 28/28.** Executada no app integrado com os harnesses de
`.mcp-prototype/`, contra o exe pareado `51D5A6EB…0121` e contra o exe da CI. Resultado:
**24 SIM + 4 MANUAL = 28/28**, nenhum `PENDENTE` e nenhum `NÃO`. Detalhamento por linha, atalhos de
evidência (`R`, `A`, `B`, `N3`, `A21`, `RES`, CI), hashes e limitações em `docs/mcp-qa.md` §8.2 e
§8.4. O antigo `NÃO (local 75/78)` de AC-11 foi substituído pela baseline de CI do mesmo run, não
por reclassificação local. O harness `B` tem 10 OK na parte NEG-02 e 7 FALHA do método de stub de
`invoke` abandonado; AC-21/NEG-06 foram executados de fato por `A21` (`26 OK / 0 FALHA`, sem stub).

**Limitações que permanecem MANUAL, sem conversão em SIM.** AC-09 (firewall/proxy/UDP/DNS não
automatizáveis neste ambiente; varredura TCP/processos/strings favorável); AC-07 e Fase 2 de NEG-04
(recursos de lote não existem na V1, portanto não há o que executar); NEG-03 (as duas vias pedidas
passaram em `N3` com 30 OK; aba de documento do editor e child stdio ficam fora do fluxo HTTP
automatizado). Também ficam registradas a varredura de perfil com 10 arquivos ilegíveis (AC-13) e a
impossibilidade de observar reuso do nonce autêntico (NEG-06), sem exagerar a cobertura.

**Estado final.** Gate 2 **`PRONTO`** com matriz 28/28 e baseline de CI do mesmo run. Tag e GitHub
Release são gerenciados fora deste documento, a partir do commit `8c1c932`; nenhuma baseline local
foi promovida e `Release/` segue congelada.
