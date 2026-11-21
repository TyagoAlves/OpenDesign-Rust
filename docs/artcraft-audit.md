---
id: AUDIT-ARTCRAFT-OPENDESIGN
data: 2026-11-20
responsavel: Douglas — QA e segurança (coordenação da auditoria técnica)
status: auditoria documental concluída; Gate 2 do MCP integrado auditado em 21/11/2026 e BLOQUEADO (não PRONTO) — ver docs/mcp-qa.md §8; Opção B para C-01 APROVADA e formalizada na §4.1, preservando D4 como histórico; nenhuma integração ArtCraft, build publicado, baseline nova, commit, push, tag, release ou publicação; CSP/capability inalteradas
escopo: nesta frente, somente OpenDesign/docs/artcraft-audit.md e docs/mcp-qa.md; nenhum outro arquivo modificado
---

# Auditoria comparativa — família ArtCraft × OpenDesign

## 0. Síntese executiva

- O **Gate 1 do MCP isolado está PRONTO** (6/6 SIM; crítica cega de Flávia sem achados). O **Gate 2 da versão integrada vem primeiro** e foi **auditado em 21/11/2026 com 20 subagentes**, resultando em **BLOQUEADO — não PRONTO**; o registro está em [`docs/mcp-qa.md`](mcp-qa.md) §8. A ordem original (auditoria → Gate 2 → C-01 → spikes → OpenDesign Engine) foi preservada: C-01 só é formalizado agora, depois do Gate 2.
- Foram lançados **20 subagentes** em paralelo; todos retornaram, nenhum editou arquivo e nenhum rodou build/commit/publish. O inventário está no [Anexo A](#anexo-a--subagentes-consolidados).
- **Veredito geral:** adotar **ideias, contratos e, no máximo, código selecionado sob MIT**, nunca copiar apps inteiros. O OpenDesign permanece MIT; marca ArtCraft, assets do estúdio e canais de controle sem autenticação ficam bloqueados.
- **Decisões recebidas nesta conversa:** ordem Gate 2 primeiro; todos os cinco grupos de módulos entram na auditoria, inclusive Motion/Video/Deck em profundidade igual; nenhuma mudança de CSP/capability sem OK novo; formato ArtCraft canônico **por tipo de documento**; documento criado neste caminho; Douglas como responsável técnico.
- **Conflito crítico C-01 — RESOLVIDO pela Opção B (21/11/2026):** a decisão de formato canônico por tipo colidia com o **AC-08** do Gate 2 (`SQLite local é a única fonte da verdade`). A Opção B foi aprovada: a verdade passa a ser o **modelo canônico unificado do OpenDesign**, persistido no SQLite com `schema_version`, `revision` e `content_hash`. D4 permanece registrada como histórico na §4; os formatos ArtCraft viram adaptadores de importação/exportação, não fontes da verdade. Nenhuma migration, tool, schema ou baseline foi alterada — a decisão é documental e depende de autorização separada para implementação.
- **Maturidade:** VectorCraft e PhotoCraft = **4/5** (engenharia sólida, ainda alpha); DesignCraft e FigCraft = **3/5**; EffectCraft/FilmCraft/DeckCraft entram na auditoria completa, mas com prontidão declarada baixa (~45–56%) e releases 0.x.
- **Não houve** alteração em `CHANGELOG.md`: este é um documento interno de planejamento, sem mudança visível ao usuário final do app.

---

## 1. Decisões registradas e limites

| # | Decisão recebida | Como foi registrada |
|---|---|---|
| D1 | Gate 2 do MCP integrado antes de qualquer integração ArtCraft | Bloqueio de entrada para qualquer spike; nada é executado até OK novo do Tyago. |
| D2 | Auditoria inicial inclui VectorCraft, PhotoCraft, DesignCraft, FigCraft **e** Motion/Video/Deck | Todos os sete módulos têm seção própria neste documento, com o mesmo nível documental. |
| D3 | Nenhuma alteração de CSP/capability sem OK novo | Equivale a AC-12/AC-18 do gate; qualquer mudança dispara nova rodada de QA. |
| D4 | Formato canônico do OpenDesign = formato ArtCraft **por tipo de documento** | Registrado na §4 e **preservado como histórico**; conflito C-01 resolvido pela Opção B na §4.1 (modelo canônico unificado no SQLite é a verdade). |
| D5 | Criar `OpenDesign/docs/artcraft-audit.md` | Este arquivo. Fora dos dois arquivos da frente anterior, autorizado explicitamente. |
| D6 | Douglas é o responsável pela auditoria técnica | Campo `responsavel` do frontmatter e §2. |
| D7 | Sem build, CI, baseline nova, commit, push, tag, release ou publicação | Nenhum comando deste tipo foi executado. |

**Canal:** as dúvidas circularam por este chat porque a Bridge não está disponível aqui. Este documento **não fala em nome de Hugo, Tyago ou terceiros**; atribuições a decisões antigas são apenas as já registradas em `docs/mcp-qa.md`.

**Fora de escopo nesta frente:** `Release/`, `README`, landing/`gh-pages`, `.github/`, CI, build, instaladores, `src/`, `src-tauri/`, `shared/world/`, `server/world/`, `CHANGELOG.md` e qualquer arquivo além deste.

---

## 2. Matriz E0–E4

| Eixo | Pergunta que responde | Evidência consolidada | Status |
|---|---|---|---|
| **E0 — Governança** | Em que ordem e sob qual autoridade? | Gate 1 PRONTO; Gate 2 §8 auditado e BLOQUEADO; D1–D7; responsável Douglas; sem build/commit. | Concluído; Gate 2 bloqueante. |
| **E1 — Licenças, marca e proveniência** | Podemos reusar sem perder o MIT? | MIT **OR** Apache-2.0 em todos os apps; NOTICE/ATTRIBUTION/ASSETS; marca fora da licença; assets "not covered" no estúdio; regras LIC/MAR. | Concluído; bloqueios duros definidos. |
| **E2 — Formato e fonte da verdade** | O que é canônico e como se converte? | Envelopes por tipo (§4, histórico); `.vectorcraft` v1–4, `.pcraft`, `.designcraft`, `.figcraft`, `.ecproj`, `.deckcraft`; perdas e IR adaptador. | **Opção B aprovada (§4.1):** modelo unificado no SQLite é a verdade; envelopes são payloads de troca preservados. |
| **E3 — Integração e segurança** | Como entra no Tauri sem ampliar privilégio? | Rust orquestra; CLI headless opt-in; WASM fora; CSP/capability inalteradas; 8788 restrito ao MCP; `--control` nunca cru. | Concluído; depende de OK para mudanças. |
| **E4 — Maturidade e roadmap** | O que vale spike e quando? | Scores 4/4/3/3;Effect/Film/Deck em alpha declarado; Fases 0–3 pós-Gate 2; go/no-go por app. | Concluído; spike nenhum executado. |

---

## 3. Inventário dos módulos

| Módulo | Licença | Formato nativo | Maturidade | Veredito para o OpenDesign |
|---|---|---|---|---|
| VectorCraft | MIT OR Apache-2.0 | `.vectorcraft` v1–4 | 4/5, alpha (~62% "real work") | Referência arquitetural e vetor canônico condicionado a C-01. |
| PhotoCraft | MIT OR Apache-2.0 | `.pcraft` | 4/5, early alpha | Referência de raster/engenharia; raster canônico condicionado a C-01. |
| DesignCraft | MIT OR Apache-2.0 | `.designcraft` | 3/5, pre-alpha (~47%) | Referência de PDF/páginas; bloqueio até #3054/#3055. |
| FigCraft | MIT OR Apache-2.0 | `.figcraft` | 3/5, alpha (~49–53%) | Referência de frames/componentes; sem collab/server/plugins. |
| EffectCraft | MIT OR Apache-2.0 | `.ecproj` | Alpha, ~45% produção | Auditoria completa; spike só após Gate 2. |
| FilmCraft | MIT OR Apache-2.0 | formato nativo a confirmar no spike | Alpha, ~56% produção | Auditoria completa; atenção a `symphonia` MPL-2.0. |
| DeckCraft | MIT OR Apache-2.0 | `.deckcraft` / PPTX próprio | Alpha, ~55% produção | Auditoria completa; import `.ppt` é somente leitura. |
| Estúdio ArtCraft | MIT OR Apache-2.0 (código) | — | 0.x, `artcraft-v0.41.1` | **Não reutilizar assets**: bloco "not covered". |

### 3.1 VectorCraft

**Achados**

- Licença dual confirmada: `LICENSE-MIT` + `LICENSE-APACHE`; `NOTICE` e `ASSETS.md` com inventário por arquivo, hashes e licenças; fontes OFL-1.1 (Inter, JetBrains Mono, Source Sans 3, Source Serif 4, `craft-fonts` CJK/árabes); ícones Lucide ISC/MIT; IJG, Adobe CMaps BSD-3, hyph-*.tex MIT.
- Marca ArtCraft é `LicenseRef-ArtCraft-Trademark`, fora de MIT/Apache. Forks modificados devem remover marcas; permitido apenas texto simples "baseado no VectorCraft, da equipe ArtCraft".
- `v0.24.1` em 12/11/2026, 16 workflows ativos, badge verde, ~967 issues e ~366 PRs abertos, documentação MCP extensa. Ainda assim o próprio roadmap declara alpha: ~62% pronto para trabalho real, estabilidade ~60%. **Score 4/5.**
- `.vectorcraft`: JSON versionado 1–4, gzip opcional e cauda `\n\0VCBLOBS\0` para blobs; `craft-doc` só entrega `outline` (canvas/pages/layers de topo), não renderiza. Campos como `blend`, `mesh`, `repeat`, `symbolInstance`, `variables`, `patterns`, `svg_filters`, threading e Kinsoku não mapeiam 1:1 para Fabric v6.
- MCP: base `2025-06-18`, aceita famílias antigas; `2026-07-28` é aditivo; `resultType`, `ttlMs`/`cacheScope`, resource templates, `depth`/`childLimit` com `childCount`, erros `-32003` (ocupado) e `will not run` vs `still running`.
- `--control <porta>` escuta `127.0.0.1:7979`, **sem autenticação**; `vectorcraft-cli mcp` sem flag tenta 7979 e cai para headless; issue #1470 mostra backend escolhido só na startup; #7301 mostra uma sessão por servidor.
- CLI segura: `--safe-mode mcp --headless` com `--automation-read-root`, `--automation-write-root`, `VECTORCRAFT_CONFIG_DIR` descartável e `VECTORCRAFT_NO_PREFS=1`. `run`/`bench`/`convert`/`info` **não** confinam caminhos.

**Para o OpenDesign**

- Preferir **crate embutida `vectorcraft-engine` (L0–L5)**, sem `ui-egui`, sem eframe e sem WASM no desktop. Fabric continua dono da UI/seleção; Rust faz geometria, efeitos e export.
- Se CLI for usada, somente opt-in, headless, com roots, perfil temporário e morte controlada da árvore de processos (Job Object no Windows; `kill_on_drop`/process group no POSIX).
- Adotar como comportamento, sem copiar código: cache versionado, leitura resumida/fatiada, `childCount`, busy/cancel, roots de leitura/escrita e artefatos assinados com checksum. **Não adotar** fallback silencioso, 7979 nem sessão única.

### 3.2 PhotoCraft

**Achados**

- `.pcraft` = zip com `manifest.json` + tiles `blake3+zstd` content-addressed; `TiledSurface` esparso 256² com COW; smart objects com fonte + transform + smart filters; compositor CPU como oráculo e GPU validado contra ele.
- OpenRaster descarta máscaras, ajustes, estilos, texto, smart objects e perfis não-sRGB. PNG é sempre render derivado, nunca verdade.
- MCP com read/write roots separados, ~500–1000 comandos em registro único, token em `agent-connection.json` — **não** em `env`; porta padrão do bridge é 7878, diferente da nossa 8788.
- `v0.23.1` em 12/11/2026, 27 releases, 36 workflows, ~1.700 testes declarados, ~3.903 issues e ~1.759 PRs abertos. Early alpha assumido. **Score 4/5.**

**Para o OpenDesign**

- Troca por **referência de asset imutável**, não por cópia de pixels nem por tradução semântica `FabricImage ↔ LayerContent`.
- Guardar no `canvas_json` apenas `{ assetId, revision, kind: "raster", previewUrl, transform }`; preview `(assetId, revision, scale)` é cache regenerável.
- Fase 1: PNG achatado + asset versionado. Fase 2: Smart Object linkado apontando para o mesmo asset store, com read/write roots restritos à pasta de assets.
- Adaptar o padrão de roots e registro de comandos; **substituir** token em arquivo por token somente em `env`.

### 3.3 DesignCraft

**Achados**

- `.designcraft` = zip versionado com `document.json`, `assets/`, `meta.json`, `preview.png`; ~446 comandos via `Session::execute`, `Arc` + COW, coordenadas em points, undo barato.
- PDF é a parte mais forte: `craft-pdf` + Krilla patchado + Hayro; texto real com subconjuntos, CMYK/RGB/spot, bleed/marks, tagged PDF, PDF/X-4, PDF/A-2b, `validate-pdf`. Sem veraPDF/callas no CI; PDF/X-3 e `.joboptions` ausentes.
- **Bloqueio documental:** issues #3054/#3055 abertas — o resultado de Data Merge guarda o cache inteiro da fonte, inclusive campos não usados e mesmo com merge limitado a 1 registro; o template "vazio" também contém a base completa.
- Pre-alpha, ~47% "real work", ~80% breadth, ~789 issues e ~464 PRs. Release agendada falhou em 21/11. **Score 3/5.**
- `AGENTS.md` upstream exige "Rust only", sem Tauri/webview — incompatível com a stack do OpenDesign como reuso direto.
- `NOTICE` e `Cargo.toml` divergem quanto ao pin de `craft-libs`; `hypher/slovak` traz risco GPL-2.0-or-later por feature unification.

**Para o OpenDesign**

- Aproveitar: `Session::execute`, proveniência/versionamento, pipeline de PDF e roots de filesystem.
- Não aproveitar: UI egui, `.designcraft` como schema corrente, marca, `--control` sem auth, grafo `hypher` sem `cargo tree -e features`.
- Se `.designcraft` virar canônico de páginas (§4), #3054/#3055 precisam estar fechadas e verificadas; até lá, usar apenas como referência de export/import com relatório explícito de campos descartados.

### 3.4 FigCraft

**Achados**

- Documento com mapa persistente de nós e IDs estáveis; `Component`, `ComponentSet`, `Instance` com `source` por camada e `overrides` por grupo; `Slot`, `PropDef` (Boolean/Text/InstanceSwap/Variant/Slot); auto layout horizontal/vertical/wrap/grid com `fr`, Fixed/Hug/Fill, constraints; variables com modos e aliases.
- Registro único de 400+ comandos usado por UI, CLI, control channel e MCP; snapshots com `Arc` + structural sharing; "never crashes" sem `unwrap`/`expect`/`panic!` em código shipped.
- Alpha: ~49% (README) a ~53% (ROADMAP), ~256 issues e ~104 PRs, ~5,2k stars. **Score 3/5.** Import `.fig` best-effort; export `.fig` experimental; sem corpus real validado.
- Collab/server é preview: TLS, mas **sem E2E**, arquivo em claro no servidor; bug high #2495: "Stop sharing" pode não revogar acesso.
- Brand license separada; fontes via `craft-fonts` OFL; catálogo latino filtra Source Sans 3/Source Serif 4 por serem Adobe; pt-BR é draft.

**Para o OpenDesign**

- Melhor ganho conceitual: transformar `fieldName` em **propriedade de componente com dono**, com mestre, instância, overrides explícitos e slots — sem copiar engine Rust.
- Adotar convenção `explicit / derived / tokens / unsupported` no contrato agêntico; registry único de comandos com IDs e docs de parâmetros.
- Manter colaboração, servidor público, plugins WASM e "Dev Mode" marca registrada **fora do escopo**. Não copiar catálogos de i18n drafts; revisão nativa antes de `i18n:check`.

### 3.5 EffectCraft (auditoria completa)

- Dual MIT/Apache; `NOTICE`, `ATTRIBUTION.md`, marca separada. `v0.24.1` (12/11), criado em 01/10/2026, ~9,0k stars, ~1,3k issues abertas.
- README declara "young and moving fast", **alpha**, ~91% de cobertura de features, mas só ~45% prontos para produção. `.ecproj` próprio: não lê `.aep`, plugins After Effects não rodam, fidelidade de render em refinamento, bugs básicos em Linux/Windows.
- Para o OpenDesign: usar apenas como referência de pipeline de efeitos/parâmetros. Nenhuma promessa de compatibilidade AE. Spike após Gate 2, com commit pinado.

### 3.6 FilmCraft (auditoria completa)

- Dual MIT/Apache; `NOTICE`/`ATTRIBUTION.md`; sem código GPL/LGPL no core declarado, mas `symphonia` é **MPL-2.0** (copyleft fraco por arquivo) e `craft-fonts` é OFL-1.1. `ffmpeg` aparece só como oráculo de teste.
- `v0.20.1` (12/11), criado em 30/09/2026, ~18,7k stars, ~2,4k issues abertas. Alpha: ~86% de features, ~56% pronto para trabalho real.
- Sem import `.prproj`, sem plugins VST3/OpenFX, só H.264 como codec de entrega por software, render de cor/export ainda em CPU, mídia de câmera pouco testada.
- Para o OpenDesign: nenhum uso de codec em runtime sem auditoria de `symphonia` e da cadeia MPL; nenhuma inclusão de `ffmpeg` no bundle.

### 3.7 DeckCraft (auditoria completa)

- Dual MIT/Apache; `NOTICE`, diretório `licenses/pdf-writer/`, `craft-pdf` com import desativado, forma/editor PPTX própria.
- `v0.18.1` (12/11), criado em 07/10/2026, ~4,9k stars, ~928 issues. "Early development"/alpha: ~84% de features, ~55% pronto para trabalho real.
- PPTX próprio; import `.ppt/.pot/.pps` somente leitura; dependências de runtime em Linux (Vulkan/ALSA/xdg-desktop-portal); sem build musl nos artefatos.
- Para o OpenDesign: `.deckcraft`/PPTX como envelope de slides condicionado a C-01; reuso de writer PDF apenas se o grafo de licenças for aprovado.

### 3.8 Estúdio ArtCraft e `craft-libs` — fontes de risco

- O repositório do **estúdio** tem `NOTICE` com bloco explícito **"Material not covered by the license above"**: `resources/sound/` (Nintendo), `resources/memes/`, `resources/skybox/`, `resources/pose/Lumine Idle cycle.vmd` (MMD), `resources/characters_gif/` (Mixamo). São de terceiros, sem direito concedido e "serão retirados com o tempo" — ou seja, ainda presentes.
- No estúdio não há `docs/brand/LICENSE-brand.txt` nem `ATTRIBUTION.md`. Nos apps da família esses arquivos existem; no estúdio, apenas reserva de direitos.
- `craft-libs`: `acadrust` MPL-2.0, ALAC Apache-2.0-only, Unicode-3.0, `slovak-gpl` GPL-2.0-or-later atrás de feature; backend `artcraft-services` é fair-source — **não vendorizar**.
- Regra: **copiar somente código** de apps específicos, com commit pinado, `NOTICE`/`ATTRIBUTION` daquele commit e zero assets do estúdio.

---

## 4. Formato canônico por tipo de documento

Decisão D4 registrada: o envelope ArtCraft passa a ser a fonte da verdade **por tipo**, não um formato único. Mapeamento proposto, a confirmar no spike:

| Tipo no OpenDesign | Envelope canônico | Origem | Risco principal | Ação |
|---|---|---|---|---|
| Vetor / shapes | `.vectorcraft` v1–4 | VectorCraft | Perdas para Fabric (blend, mesh, variables, threading) | Preservar blob original; `ImportReport`/`ExportReport` nunca silenciosos. |
| Raster / camadas | `.pcraft` | PhotoCraft | Máscaras/ajustes não sobrevivem a ORA/PNG | Asset store content-addressed + `assetId/revision`. |
| Páginas / diagramação | `.designcraft` | DesignCraft | #3054/#3055 vazam cache de Data Merge | Bloqueado até correção verificada. |
| Frames / componentes | `.figcraft` | FigCraft | Alpha; `.fig` best-effort; collab fora | Modelo `source/overrides/slots` como referência. |
| Efeitos / motion | `.ecproj` | EffectCraft | Não lê `.aep`; plugins não rodam | Spike pós-Gate 2. |
| Vídeo | a confirmar | FilmCraft | MPL-2.0; sem `.prproj`; H.264 only | Confirmar extensão e grafo de licenças no spike. |
| Deck / slides | `.deckcraft` / PPTX próprio | DeckCraft | Import legado somente leitura | Confirmar round-trip no spike. |

### 4.1 Conflito C-01 — RESOLVIDO: Opção B aprovada em 21/11/2026

**Histórico preservado.** A decisão D4 (registrada na §4) estabelecia o envelope ArtCraft como
fonte da verdade **por tipo de documento**. Ela colidia com o AC-08 do Gate 2 (“SQLite local é a
única fonte da verdade”) e com a recomendação majoritária dos subagentes de manter um IR
interno/Rust/SQLite como verdade. D4 **não é apagada**: permanece como registro do que foi decidido
na auditoria e como base do mapeamento por tipo abaixo. O que muda agora é a resolução de C-01.

**Decisão aprovada — Opção B / modelo canônico unificado.**

- A **fonte única da verdade** é o **modelo canônico unificado do OpenDesign**, persistido no
  SQLite local. Não existem verdade por tipo de documento nem envelopes ArtCraft canônicos.
- Toda persistência carrega `schema_version`, `revision` e `content_hash`. Toda transformação vinda
  de um adaptador é **validada antes da persistência transacional**, e **degradações nunca são
  silenciosas** — perdas viram relatório explícito (`ImportReport`/`ExportReport`), não aceite
  implícito.
- **ArtCraft passa a ser adaptador de importação/exportação.** Os payloads nativos são
  **preservados** (blob original + `assetId/revision`) como evidência de origem, mas não são a
  verdade do OpenDesign. O IR unificado é a memória de trabalho e o contrato entre adaptadores.
- **Implementação inicial do formato próprio:** IR versionado no SQLite + envelope de exportação
  auditável. Não há novo formato de arquivo complexo nesta etapa; envelopes por tipo podem ser
  usados apenas como payload de troca, com conversão validada e trilha de auditoria.
- **Escopo atual é documental.** Nenhuma migration, tabela, tool, `canvas_json`, CSP, capability,
  build, baseline ou `Release/OpenDesign.exe` foi alterado. Qualquer implementação depende de OK
  específico, novo QA e — se tocar no binário — nova baseline do mesmo run (§6 de `mcp-qa.md`).

**Relação com o Gate 2.** A formalização de C-01 ocorre **depois** da auditoria do Gate 2
(conforme a ordem preservada). O Gate 2 terminou **BLOQUEADO**, por divergências alheias a C-01
(registradas em `docs/mcp-qa.md` §8.3): material GPL no caminho do bundle, token HTTP em header em
vez de `env`, export MCP sem `pick_save_path`/nonce, par de artefatos dessincronizado e ausência de
suíte integrada. NEG-03 e a Fase 2 de NEG-04 seguem **MANUAL/PENDENTE**. A Opção B não altera a
matriz §8, não a torna verde e não autoriza publicação.

**Licenças e marca (inalteradas).** MIT mantido; `NOTICE`/`ATTRIBUTION` obrigatórios se houver
reuso sob permissiva; marcas e assets do estúdio ArtCraft continuam bloqueados; dependências
GPL/AGPL/SSPL/BUSL/CC-BY-NC/CC-BY-SA continuam proibidas (LIC-01); nenhuma mudança de
CSP/capability sem OK novo. Rust segue como orquestrador; CLI headless é opt-in; o material do Drift
não pode entrar no produto.

### 4.2 Contrato adaptador (quando autorizado)

```
React + Fabric v6 ──toJSON/fromJSON──▶ projeção de canvas
        │ IPC Tauri (comandos first-party)
        ▼
Envelope ArtCraft canônico por tipo ◀──▶ IR interno ◀──▶ SQLite/índice + assets por sha256
        │ Decode / Encode / Project
        ▼
UI · CLI headless · MCP 8788 (off, token no env) — nenhum transporte é verdade
```

- `Decode`/`Encode`/`Project` com `sniff → info → check → migrate → read`.
- `source_ref` + `kept` preservam campos desconhecidos; nunca destruir dados na ida e volta.
- `ImportReport`/`ExportReport` com `Diagnostic { severity, code, node_id, message }`, `unsupported` e contagem de `kept`.
- Unidade canônica px com DPI explícito; cor sRGB + ICC; tokens como tabela de primeira classe.
- Regra de ouro: nenhum adaptador escreve direto no SQLite; nenhuma conversão é silenciosa; nenhum transporte vira fonte da verdade.

---

## 5. Licenças, marca e SBOM

### 5.1 Eleição e obrigações

- Todos os apps ArtCraft são **MIT OR Apache-2.0, à opção do usuário**. Para manter o OpenDesign MIT, **eleger MIT** e manter `LICENSE-MIT`, `LICENSE-APACHE` e o `NOTICE` verbatim no pacote de terceiros.
- Se algum arquivo for modificado sob Apache-2.0, acrescentar aviso de modificação e preservar o `NOTICE`; se houver exposição patentária relevante, avaliar Apache com jurídico antes.
- Assets e fontes **não** são cobertos pela licença do código: OFL-1.1 por família, com texto integral, RFN preservado e sem venda isolada da fonte.
- `jpeg-encoder 0.6.1` exige agradecimento ao IJG: *"This software is based in part on the work of the Independent JPEG Group."*
- SQLite = domínio público (`LicenseRef-OpenDesign-SQLite-public-domain`); WebView2 = `LicenseRef-Microsoft-WebView2-Runtime`; logo Tauri = **CC-BY-NC-ND**, não reutilizar em material derivado/comercial.

### 5.2 Regras de bloqueio

| ID | Regra | Waiver |
|---|---|---|
| LIC-01 | Proibir `GPL-*`, `AGPL-*`, `SSPL-*`, `BUSL-*`, `CC-BY-NC-*`, `CC-BY-SA-*` em dependência, bundle, WASM, vendor ou CDN. | Relicenciamento escrito ou substituição. |
| LIC-02 | Proibir link/embed de GPL/AGPL no mesmo processo: crate, npm, FFI, shared memory, structs complexas. | Processo separado + protocolo simples + parecer jurídico. |
| LIC-03 | Proibir AGPL modificado com interação remota; proibir bind fora de loopback na 8788; proibir binário AGPL sem Corresponding Source. | Publicar fonte ou remover componente. |
| LIC-04 | Proibir código copiado sem origem/licença rastreável; licença desconhecida = bloqueio. | Prova de licença/relicenciamento. |
| LIC-05 | Revisão obrigatória para LGPL, MPL-2.0, EUPL, OFL e CC-BY em runtime/assets. | Avisos, NOTICE, RFN, SBOM. |
| LIC-06 | License drift em atualização dispara reauditoria e re-pin. | Revisão registrada. |
| MAR-01 | Proibir `Drift`/`DRIFT` em nome, feature, domínio, handle, logo, i18n e marketing. | Autorização escrita. |
| MAR-02 | Proibir `ArtCraft`, `ArtCraft Team`, `storytold`, `getartcraft`, logos e ícones em identidade, domínio, store ou UI. | Texto factual permitido somente se houver derivação real. |
| MAR-03 | Proibir alegação de parceria, endosso, certificação ou "powered by". | Autorização escrita. |
| MAR-04 | Proibir uso derivado/comercial do logo Tauri. | Permissão específica. |
| MAR-05 | Menção nominativa de compatibilidade só em texto simples, sem stylização, com disclaimer. | Para Drift, escalar antes. |

> Nota sobre o AC-15 local: os AC-15/16/17 citados neste documento são os do gate do OpenDesign — **token em `env` / porta 8788 fixa / stdio + HTTP** — e não os do NIST SP 800-53. A subagent de canal de controle usou o mapeamento NIST; aqui ele foi corrigido para o vocabulário do `docs/mcp-qa.md`.

### 5.3 SBOM e notices

- **SPDX 2.3 JSON** como SBOM canônico de compliance; **CycloneDX 1.6** como saída secundária de segurança/VEX, gerados da mesma fonte.
- `packages[]` com PURL (`pkg:cargo`, `pkg:npm`, `pkg:github`), `licenseDeclared: "MIT OR Apache-2.0"`, `licenseConcluded: "MIT"`; `files[]` com SHA-256 para código copiado e assets; `relationships[]` com `GENERATED_FROM` quando aplicável.
- `THIRD_PARTY_NOTICES.md` gerado (não editado à mão), com índice, tabela mestra, `NOTICE`/`ATTRIBUTION` verbatim, fontes OFL por família, IJG, runtime/plataforma e Instruções de regeneração.
- Estrutura sugerida: `sbom/openDesign.spdx.json`, `sbom/openDesign.cdx.json`, `licenses/OFL-1.1/<Família>/OFL.txt`, `licenses/ISC/lucide.txt`, `licenses/Microsoft/WebView2-EULA.txt`, `third_party/ARTCRAFT-NOTICE.txt`, `third_party/ARTCRAFT-ATTRIBUTION.md`, `third_party/FONT-MANIFEST.txt`.
- **Nunca** registrar token MCP, segredo ou telemetria no SBOM/notices.

---

## 6. Integração técnica e segurança

### 6.1 CSP e capabilities

- Caminho preferido: frontend `invoke()` → comando Rust → engine/crate ou sidecar. **CSP permanece idêntica**; nenhuma origem nova.
- Se o frontend precisar fazer `fetch` ao MCP 8788, aí sim acrescentar explicitamente `connect-src http://127.0.0.1:8788 http://localhost:8788` — somente com OK novo e nova QA.
- Manter `assetProtocol.enable: false`; não usar plugin `localhost`; não usar `dangerousDisableAssetCspModification`; não adicionar `'wasm-unsafe-eval'` salvo WASM real.
- Capabilities são ativadas automaticamente quando existem em `src-tauri/capabilities/`. Para manter CLI/SIDECAR "default off", explicitar a lista em `app.security.capabilities` e incluir a capability do CLI somente quando habilitada.
- Se sidecar for chamado pelo Rust, **não** dar `shell:*` ao WebView. Se for inevitável, usar `shell:allow-execute` com `sidecar: true`, `name` fixo, args por regex, janela dedicada, sem `windows: ["*"]`, sem `args: true`, sem `cmd.exe`/`.bat`.
- Usar `AppManifest::commands()` no `build.rs` para limitar comandos próprios; evitar `remote.urls`.
- Gatilhos de QA: qualquer mudança em `csp`/`devCsp`/headers/`vite.config.ts`, capability, sidecar/args/validador, ativação da 8788, `assetProtocol` ou upgrade de Tauri/plugin-shell.

### 6.2 Rust embutido × CLI × WASM

| Opção | Veredito | Motivo |
|---|---|---|
| **Crate embutida** (`vectorcraft-engine` L0–L5, sem `ui-egui`) | **Preferida** | Um processo, sem nova capability, sem listener extra, CSP intacta, Fabric continua UI. |
| CLI externa / sidecar | Opt-in, headless, para lote/export | Isolamento bom, mas duplica processo e exige `externalBin`, versionamento e protocolo. |
| WASM no webview | Fora do escopo desktop | Exige `'wasm-unsafe-eval'`, perde paralelismo, adiciona ~13 MB (~5 MB comprimido) e difere entre WebView2/WKWebView/WebKitGTK. |

### 6.3 Configuração segura do CLI headless

```powershell
$base = <pasta temporaria do OpenDesign>
New-Item -ItemType Directory -Force "$base\in", "$base\out", "$base\profile"

$env:VECTORCRAFT_NO_PREFS = "1"
$env:VECTORCRAFT_CONFIG_DIR = "$base\profile"

& <caminho absoluto>\vectorcraft-cli.exe `
  --safe-mode mcp --headless `
  --automation-read-root "$base\in" `
  --automation-write-root "$base\out"
```

Bloquear no adaptador: `plugin.*`, `script.run`, `script.check`, `prefs.*`, `actionSet.*`, `file.save*`, `app.open` fora do read root, `screenshot {path}`, `file.export.svg.browser`, `print.*` e `command_batch` irrestrito. Nunca usar `--connect`, `--allow-plugin-grants`, `cmd /c` ou `sh -c`. Usar caminho absoluto do binário, args como array, timeout por request, EOF do stdout para reinício com backoff, `kill_on_drop` no filho direto e Job Object no Windows para matar a árvore. Não repetir comando após resposta `still running`/`outcome unknown`.

### 6.4 Protocolo MCP — o que adaptar

1. **P1:** fechar o contrato de cache da spec moderna — `ttlMs`/`cacheScope` também em `server/discover`, gate por `2026-07-28`, `ttlMs: 0` em leitura de estado vivo, `public` só para catálogo estático.
2. **P1:** alinhar códigos de erro: `-32600` para JSON-RPC malformado; `-32602` para parâmetro/recurso não encontrado (não replicar `-32002` do VectorCraft); manter `-32020`/`-32022` locais.
3. **P2:** leitura de recursos com resumo primeiro, `depth`/`childLimit` e `childCount` para truncamento nunca silencioso; sem token na URI.
4. **P2:** busy/cancel para export longo (`-32003` dizendo que **não** executou), sem replay automático.
5. **P3:** rejeitar `initialize` moderno com `-32601` (`Method not found`); `initialize` só nas famílias legadas (`2025-11-25`/`2025-06-18`), `server/discover` como probe na família moderna; roots explícitos para arquivos.
6. **Não implementar agora:** MRTR, streaming, subscriptions, progresso e sessão por cliente.

### 6.5 Canal de controle

- `--control` do VectorCraft é loopback **sem autenticação**; falhaAC-17(10) e não pode ser ponto de aplicação da política.
- Preferir sempre `vectorcraft-cli mcp --headless` via stdio, spawnado pelo gateway Rust, com roots por sessão.
- Se alguma sessão "live" for inevitável, somente opt-in, atrás do mesmo gateway autenticado, com allowlist de ferramentas, roots obrigatórios, auditoria, timeout e kill switch. Nunca expor 7979 por port-forward/proxy/túnel; nunca reusar a 8788 para outro app.

### 6.6 Preservação dos AC locais

| AC local | Significado no gate | Como a auditoria preserva |
|---|---|---|
| AC-15 | Token entregue só no campo `env` do snippet | Nenhum subagent propôs token em argv/query/arquivo; PhotoCraft é o contraexemplo a corrigir. |
| AC-16 | HTTP fixo em `127.0.0.1:8788`, sem fallback | Nenhuma porta ArtCraft é herdada; 7979/7878 ficam de fora. |
| AC-17 | stdio + HTTP obrigatórios na V1 | stdio é preferential para subprocessos; HTTP continua exclusivo do MCP OpenDesign. |
| AC-18 | Sem mudança de CSP/capability sem OK novo | Reforçado por D3; qualquer sidecar/WASM dispara nova QA. |

---

## 7. Maturidade, prioridade e go/no-go

| App | Score | Pronto para produção (declarado) | Prioridade de spike pós-Gate 2 |
|---|---|---|---|
| PhotoCraft | 4/5 | ~45% | 1 — referência geral de engenharia/MCP. |
| VectorCraft | 4/5 | ~62% "real work" | 2 — vetor/engine; control/MCP é o ponto instável (RFC #647). |
| FigCraft | 3/5 | ~49–53% | 3 — isolamento e componentes; collab fora. |
| DesignCraft | 3/5 | ~47% | 4 — somente após #3054/#3055. |
| EffectCraft | atribuído em §3.5 | ~45% | 5 — auditoria completa já registrada; spike depois. |
| FilmCraft | atribuído em §3.6 | ~56% | 6 — auditoria completa; revisar MPL-2.0. |
| DeckCraft | atribuído em §3.7 | ~55% | 7 — auditoria completa; confirmar round-trip PPTX. |

**Critérios comuns de go/no-go**

| Dimensão | Go | No-go |
|---|---|---|
| Gate 2 | Aprovação explícita registrada | Qualquer código de canal de controle antes disso. |
| Rede | Offline por default | Qualquer chamada externa. |
| Escopo de arquivo | Root temporário explícito | Home, Desktop, Documentos. |
| Segredos | Env isolado, nunca commitado | Token em argv/repositório/arquivo de config. |
| Portas | Nenhuma pré-gate; pós-gate autenticada | Fixa, aberta ou não autenticada. |
| API | Versão/commit pinado | `main` móvel. |
| Licença | MIT/Apache-2.0 OK; marcas removidas | Reuso de logos/wordmarks, GPL/AGPL embarcado. |
| Determinismo | Golden tests | Outputs variáveis. |
| Consentimento | Por sessão/ação, revogável | Default-on. |

---

## 8. Roadmap pós-Gate 2 (não executado)

| Fase | Entrega | Go | No-go |
|---|---|---|---|
| **F0 — Descoberta** (1–2 dias) | Matriz por app, pin de versão/commit, matriz de ameaças, definição de dados verdadeiros. | Documentação suficiente para spike offline; nenhuma porta/attach. | Descobrir capacidade via `?control`, `window.*` ou `--attach`. |
| **F1 — Spikes headless** (3–5 dias) | PhotoCraft, VectorCraft, FigCraft e demais com input/output em disco, zero rede, zero GUI. | Determinismo, roots não ampliáveis, contrato estável. | Exigência de login, `--control` ou token vivo. |
| **F2 — Endurecimento** (1–2 semanas) | Schema de export, sanitizador, política de roots, `no-network`, adapters versionados, runbook de consentimento. | Consentimento por sessão, auditoria local, kill switch, testes de falha. | Consentimento implícito, porta fixa, escrita fora da raiz. |
| **F3 — Piloto de canal** (somente após Gate 2) | stdio com token e roots; depois loopback autenticado; nunca `window.*`. | Gate 2 assinado, transporte autenticado, bind loopback, rollback testado. | Porta aberta, "é só local", replay de comando incerto. |

---

## 9. Riscos abertos e decisões pendentes

| ID | Item | Impacto | Próximo passo |
|---|---|---|---|
| C-01 | Formato ArtCraft canônico × AC-08 (SQLite como verdade) | **Resolvido pela Opção B em 21/11/2026** | Modelo canônico unificado no SQLite é a verdade; ArtCraft é adaptador. Implementação documental, sem mudança de schema/build; execução depende de OK novo e QA (§4.1). |
| C-02 | Gate 2 primeiro × auditoria documental agora | Médio | Doc existe; integração segue bloqueada. |
| C-03 | CSP/capability | Alto | Nenhuma mudança sem OK novo + QA. |
| C-04 | Alpha generalizado (0.x, churn diário) | Alto | Pinar commit/tag em qualquer spike; nunca depender de `main`. |
| C-05 | PhotoCraft persiste token em arquivo | Alto | Adaptar para `env`; não herdar. |
| C-06 | DesignCraft #3054/#3055 | Alto | Bloqueio de páginas canônicas até correção verificada. |
| C-07 | Assets "not covered" do estúdio ArtCraft | Alto | Nunca copiar/redistribuir. |
| C-08 | `--control` sem autenticação e 7979 fallback | Alto | Nunca integrar; usar stdio/headless. |
| C-09 | RFC VectorCraft #647 pode unificar control/MCP | Médio | Reavaliar adaptadores antes de investir fundo. |
| C-10 | Extensão nativa de vídeo não confirmada | Baixo | Confirmar no spike FilmCraft. |

---

## 10. Fontes primárias

- VectorCraft: <https://github.com/storytold/vectorcraft> · <https://github.com/storytold/vectorcraft/blob/main/docs/mcp.md> · <https://github.com/storytold/vectorcraft/blob/main/docs/control-protocol.md> · <https://github.com/storytold/craft-libs/blob/main/crates/vectorcraft-format/README.md> · <https://github.com/storytold/vectorcraft/blob/main/ASSETS.md>
- PhotoCraft: <https://github.com/storytold/photocraft> · <https://raw.githubusercontent.com/storytold/photocraft/main/docs/architecture.md> · <https://raw.githubusercontent.com/storytold/photocraft/main/docs/ora.md> · <https://raw.githubusercontent.com/storytold/photocraft/main/docs/control-protocol.md>
- DesignCraft: <https://github.com/storytold/designcraft> · <https://raw.githubusercontent.com/storytold/designcraft/main/docs/architecture.md> · <https://raw.githubusercontent.com/storytold/designcraft/main/docs/pdf-backend.md> · <https://github.com/storytold/designcraft/issues/3054> · <https://github.com/storytold/designcraft/issues/3055>
- FigCraft: <https://github.com/storytold/figcraft> · <https://raw.githubusercontent.com/storytold/figcraft/main/docs/architecture.md> · <https://raw.githubusercontent.com/storytold/figcraft/main/docs/mcp.md> · <https://github.com/storytold/figcraft/issues/2495>
- EffectCraft / FilmCraft / DeckCraft: <https://github.com/storytold/effectcraft> · <https://github.com/storytold/filmcraft> · <https://github.com/storytold/deckcraft> · <https://getartcraft.com/apps>
- Estúdio e `craft-libs`: <https://github.com/storytold/artcraft/blob/main/NOTICE> · <https://github.com/storytold/craft-libs/blob/main/NOTICE> · <https://github.com/storytold/craft-fonts/blob/main/ATTRIBUTION.md>
- Licenças/marcas: <https://raw.githubusercontent.com/storytold/photocraft/main/docs/brand/LICENSE-brand.txt> · <https://www.apache.org/licenses/LICENSE-2.0> · <https://opensource.org/license/mit> · <https://openfontlicense.org/open-font-license-official-text>
- Tauri: <https://v2.tauri.app/security/csp> · <https://v2.tauri.app/security/capabilities> · <https://v2.tauri.app/develop/sidecar> · <https://v2.tauri.app/plugin/shell> · <https://v2.tauri.app/blog/cve-2024-24576>
- Gate local: [`docs/mcp-qa.md`](mcp-qa.md) · [`docs/mcp-planejamento.md`](mcp-planejamento.md) · [`docs/mcp-ux.md`](mcp-ux.md)

---

## Anexo A — subagentes consolidados

| # | Session ID | Tema |
|---|---|---|
| 1 | `ses_e03fde6b5ffdbDzLtKOscMxuOY` | Licenças VectorCraft |
| 2 | `ses_e03fde6afffdr60wX4iRblPhbw` | Licenças PhotoCraft |
| 3 | `ses_e03fde696ffd6uRe59zqsQFk18` | Licenças DesignCraft |
| 4 | `ses_e03fde68cffdTkYpSMJ9qGyz4x` | Licenças FigCraft |
| 5 | `ses_e03fde662ffdMd1oGUKORNMTBZ` | Módulos adiados (Effect/Film/Deck) |
| 6 | `ses_e03fde661ffe4jDxXaRhi5JgSH` | Formato `.vectorcraft` |
| 7 | `ses_e03fde661ffdPD8zw7W16qHKhh` | Modelo raster PhotoCraft |
| 8 | `ses_e03fde661ffcgmy24IXklrjm86` | Diagramação e PDF DesignCraft |
| 9 | `ses_e03fde661ffb1RCkkIV56MjWhX` | Componentes/frames FigCraft |
| 10 | `ses_e03fde661ffaDhHdXiBDHYtzvP` | Protocolo MCP |
| 11 | `ses_e03fde660ffeB5rdPUzYrlU08C` | Canal de controle |
| 12 | `ses_e03fde656ffd5rpqVpmzJC6DFp` | CLI headless |
| 13 | `ses_e03fde63effdVXadhy38flb0IL` | Integração Rust × Tauri |
| 14 | `ses_e03fde63effcVezpIBWCE97FU8` | Maturidade VectorCraft |
| 15 | `ses_e03fde63effbi8MimewVJ1Rjqs` | Maturidade pares |
| 16 | `ses_e03fde63dffejTJ5CgOazHp7Dj` | SBOM e notices |
| 17 | `ses_e03fde63dffdSyoKLvpEnWttz4` | CSP e capability |
| 18 | `ses_e03fde634ffeFAaojVjBAoLP2U` | Contágio GPL/AGPL e marcas |
| 19 | `ses_e03fde633ffeYNL7VJUOLEPC3N` | Camada adaptadora |
| 20 | `ses_e03fde632ffelA2S2OdkmKgUIq` | Roadmap de spikes |

Todos os 20 retornaram. Nenhum editou arquivo, rodou build, commitou ou publicou algo.
