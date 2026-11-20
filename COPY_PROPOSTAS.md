# OpenDesign — propostas de copy (string atual → proposta)

**Data:** 2026-11-20 · **Responsável:** Camila (AG-04, Copy) · **Aplicação:** Heitor / Renata
**Escopo:** somente `C:\Users\tyago\Projeto\bloaudhab\OpenDesign\`.
**Formato:** toda linha é `string atual → proposta`. As propostas são **pt-BR**. O app não tem
catálogo de i18n; a aplicação foi feita diretamente nos literais da interface.
**Estado:** **APLICADO** pelo Heitor/Renata em 2026-11-20 (interface + documentação). Auditoria
posterior: 0 pendências reais. Ver §15, item 2 (Redo), e §16.

> Legenda: **➕** = string encontrada na leitura do código que não constava no levantamento
> enviado no briefing original. **⚠** = achado de copy que precisa de decisão antes de aplicar.
> **🖥** = não é texto visível na interface (log/`console` ou metadado).

---

## 1) Título do app e metadados

| String atual | → | Proposta / decisão |
|---|---|---|
| `productName: "OpenDesign"` (raiz e `src-tauri/tauri.conf.json`) | → | `OpenDesign` — **manter** (já correto) |
| `app.windows[main].title: "OpenDesign"` (ambos os configs) | → | `OpenDesign` — **manter** |
| `app.windows[splashscreen].title: "OpenDesign"` (ambos os configs) | → | `OpenDesign` — **manter** |
| `<title>OpenDesign</title>` (`index.html` e `public/splashscreen.html`) | → | `OpenDesign` — **manter** |
| `description = "A Tauri App"` (`src-tauri/Cargo.toml`) | → | `description = "OpenDesign - local design editor for social media graphics"` — **JÁ APLICADO** |
| 🖥 `description` no topo de `tauri.conf.json` | → | **Não usar**: chave inválida no Tauri 2 (CLI 2.12.6). O schema só aceita `$schema`, `productName`, `mainBinaryName`, `version`, `identifier`, `app`, `build`, `bundle`, `plugins`. O metadado correto é `package.description` no `Cargo.toml`. |

**Idioma dos metadados:** mantidos em inglês, coerentes com `README.md` e com o produto.
Este documento é pt-BR por ser material de coordenação do time.

---

## 2) App / navegação (`src/client/app.tsx`)

| String atual | → | Proposta pt-BR |
|---|---|---|
| `Loading...` | → | `Carregando…` ⚠ uniformizar reticência |
| `Recent designs` | → | `Projetos recentes` |
| `Reload` | → | `Recarregar` |
| ➕ `Design` (rótulo no `AppNav`) | → | `Projeto` (ou manter `Design`, termo corrente em pt-BR) |
| ➕ `Designs` (rótulo no `AppNav`) | → | `Projetos` |

---

## 3) Home (`src/client/components/home.tsx`)

| String atual | → | Proposta pt-BR |
|---|---|---|
| `My Designs` | → | `Meus projetos` |
| `New Design` | → | `Novo projeto` ⚠ duplicata da CTA abaixo |
| `Create Design` | → | `Criar projeto` ⚠ recomendado unificar como `Novo projeto` |
| `Start from a template` | → | `Comece por um modelo` |
| `No designs yet` | → | `Nenhum projeto ainda` |
| `Create your first design to get started` | → | `Crie seu primeiro projeto para começar` |
| `Recent designs` | → | `Projetos recentes` |

---

## 4) Barra de ferramentas (`src/client/components/toolbar.tsx`)

| String atual | → | Proposta pt-BR |
|---|---|---|
| `All changes saved` | → | `Todas as alterações salvas` |
| `Unsaved changes` | → | `Alterações não salvas` |
| `Save failed` | → | `Falha ao salvar` |
| `Auto-save` | → | `Salvamento automático` |
| `Save changes automatically after a short pause` | → | `Salvar alterações automaticamente após uma breve pausa` |
| `Back to designs` | → | `Voltar aos projetos` |
| `Export this design` | → | `Exportar este projeto` |
| `Carousel PDF` | → | `PDF de carrossel` |
| `PNG at 2x` | → | `PNG em 2x` |
| `All pages` | → | `Todas as páginas` |
| `This page` | → | `Esta página` |
| `Custom` | → | `Personalizado` |
| `Custom width in pixels` | → | `Largura personalizada em pixels` |
| `Custom height in pixels` | → | `Altura personalizada em pixels` |
| `Resize` | → | `Redimensionar` |
| `Restore the previous size and layout` | → | `Restaurar o tamanho e o layout anteriores` |
| `Undo resize` | → | `Desfazer redimensionamento` |
| `Undo (Cmd+Z)` | → | `Desfazer (Ctrl+Z)` ⚠ conferir o atalho real no Windows antes de trocar |
| `Redo (Cmd+Shift+Z)` | → | `Refazer (Ctrl+Shift+Z)` — **DECISÃO VALIDADA**: o código implementa `Ctrl+Shift+Z` (`use-canvas.ts:628-633`); a sugestão original `Ctrl+Y` estava errada e foi corrigida na aplicação |
| `Zoom in` | → | `Aumentar zoom` |
| `Zoom out` | → | `Diminuir zoom` |
| `Fit to screen` | → | `Ajustar à tela` |
| ➕ `Export` | → | `Exportar` |
| ➕ `Preparing...` | → | `Preparando…` ⚠ uniformizar reticência |
| ➕ `All {n} pages, ready for LinkedIn` | → | `{n} páginas, prontas para o LinkedIn` |
| ➕ `{n} separate PNGs at 2x` | → | `{n} PNGs separados em 2x` |
| ➕ `Save` | → | `Salvar` |
| ➕ `Saving...` | → | `Salvando…` ⚠ |
| ➕ `Untitled design` | → | `Projeto sem título` |

---

## 5) Sidebar esquerda — trilha de ícones e painéis (`src/client/components/left-sidebar.tsx`)

### 5.1 Rótulos da trilha (`SECTIONS`)

| String atual | → | Proposta pt-BR |
|---|---|---|
| `Templates` | → | `Modelos` |
| `Brand` | → | `Marca` |
| `Elements` | → | `Elementos` |
| `Text` | → | `Texto` |
| `Uploads` | → | `Enviar arquivos` |
| `Bg` | → | `Fundo` |
| `Designs` | → | `Projetos` |

### 5.2 Títulos dos painéis (`SECTION_TITLES`)

| String atual | → | Proposta pt-BR |
|---|---|---|
| `Templates` | → | `Modelos` |
| `Brand Kit` | → | `Kit de marca` |
| `Elements` | → | `Elementos` |
| `Text` | → | `Texto` |
| `Uploads` | → | `Enviar arquivos` |
| `Background` | → | `Plano de fundo` |
| `Designs` | → | `Projetos` |

### 5.3 Conteúdo dos painéis

| String atual | → | Proposta pt-BR |
|---|---|---|
| `No templates yet.` | → | `Nenhum modelo ainda.` |
| `Click a template to apply` | → | `Clique em um modelo para aplicar` |
| `Click to add text` | → | `Clique para adicionar texto` |
| `Add a heading` | → | `Adicionar um título` |
| ➕ `Montserrat Bold, 48px` | → | `Montserrat Negrito, 48 px` |
| `Add a subheading` | → | `Adicionar um subtítulo` |
| ➕ `Inter Medium, 32px` | → | `Inter Médio, 32 px` |
| `Add body text` | → | `Adicionar texto de corpo` |
| ➕ `Inter Regular, 18px` | → | `Inter Regular, 18 px` |
| `Click to add a shape` | → | `Clique para adicionar uma forma` |
| ➕ `Rectangle` | → | `Retângulo` |
| ➕ `Circle` | → | `Círculo` |
| ➕ `Triangle` | → | `Triângulo` |
| ➕ `Line` | → | `Linha` |
| `Upload images to add to canvas` | → | `Envie imagens para adicionar à tela` |
| ➕ `Uploading...` | → | `Enviando…` |
| `Click or drag images here` | → | `Clique ou arraste imagens aqui` |
| `PNG, JPG, SVG, WebP` | → | `PNG, JPG, SVG, WebP` — **manter** |
| `Solid colors` | → | `Cores sólidas` |
| `Custom color` | → | `Cor personalizada` |
| `Gradient presets` | → | `Gradientes predefinidos` |
| `Background image` | → | `Imagem de fundo` |
| `Upload image` | → | `Enviar imagem` |
| 🖥 `Upload failed:` | → | **Não é UI**: é `console.error`. Se quiser traduzir o log: `Falha no envio:` |
| 🖥 `Bg upload failed:` | → | **Não é UI**: é `console.error`. Se quiser traduzir o log: `Falha no envio de fundo:` |

---

## 6) Brand Kit (`src/client/components/brand-kit-panel.tsx`)

| String atual | → | Proposta pt-BR |
|---|---|---|
| `Active brand kit` | → | `Kit de marca ativo` |
| `New brand kit` | → | `Novo kit de marca` |
| `My Brand` | → | `Minha marca` |
| `Kit name` | → | `Nome do kit` |
| `No brand kit yet` | → | `Nenhum kit de marca ainda` |
| `Add brand color` | → | `Adicionar cor da marca` |
| `Add at least one brand color first` | → | `Adicione pelo menos uma cor da marca primeiro` |
| `Apply to this page` | → | `Aplicar a esta página` |
| `Apply brand fonts and colors to this page` | → | `Aplicar fontes e cores da marca a esta página` |
| `Heading font` | → | `Fonte do título` |
| `Body font` | → | `Fonte do texto` |
| `Logos` | → | `Logos` — **manter** |
| `Upload logo` | → | `Enviar logo` |
| `Remove logo` | → | `Remover logo` |
| `Add logo to canvas` | → | `Adicionar logo à tela` |
| 🖥 `Logo upload failed:` | → | **Não é UI**: é `console.error`. Se quiser traduzir o log: `Falha no envio do logo:` |
| `Import` | → | `Importar` |
| `Export` | → | `Exportar` |
| `Delete this kit` | → | `Excluir este kit` |
| `Delete this brand kit` | → | `Excluir este kit de marca` |
| `That file is not an OpenDesign brand kit.` | → | `Esse arquivo não é um kit de marca do OpenDesign.` |

---

## 7) Sidebar direita — tela e propriedades (`src/client/components/right-sidebar.tsx`)

| String atual | → | Proposta pt-BR |
|---|---|---|
| `Canvas` | → | `Tela` |
| `Dimensions` | → | `Dimensões` |
| `Width` | → | `Largura` — é o `placeholder` do campo de espessura do contorno |
| `Alignment` | → | `Alinhamento` |
| `Layer order` | → | `Ordem das camadas` |
| `To back` | → | `Para o fundo` |
| `To front` | → | `Para a frente` |
| ➕ `Forward` | → | `Avançar` |
| ➕ `Backward` | → | `Recuar` |
| `Flip` | → | `Inverter` (espelhar) |
| `Style` | → | `Estilo` |
| `Fill color` | → | `Cor de preenchimento` |
| `Background color` | → | `Cor de fundo` |
| `Stroke color` | → | `Cor do contorno` |
| `Color` | → | `Cor` |
| `Border radius` | → | `Raio da borda` |
| `Opacity` | → | `Opacidade` |
| `Font family` | → | `Família da fonte` |
| `Font size` | → | `Tamanho da fonte` |
| `Line height` | → | `Altura da linha` |
| `Letter spacing` | → | `Espaçamento entre letras` |
| `Delete` | → | `Excluir` |
| `Duplicate` | → | `Duplicar` |
| `Field name` | → | `Nome do campo` |
| `e.g. headline` | → | `ex.: título` |
| `Name it to fill it from data or an agent.` | → | `Nomeie-o para preenchê-lo com dados ou por um agente.` |
| ➕ `Fillable through the design's /fill endpoint.` | → | `Preenchível pelo endpoint /fill do projeto.` |
| ➕ `Text` / `Image` / `Shape` (cabeçalho) | → | `Texto` / `Imagem` / `Forma` |

---

## 8) Área de canvas (`src/client/components/canvas-area.tsx`)

| String atual | → | Proposta pt-BR |
|---|---|---|
| `Add page` | → | `Adicionar página` |
| `Add page below` | → | `Adicionar página abaixo` |
| `Duplicate page` | → | `Duplicar página` |
| `Delete page` | → | `Excluir página` |

---

## 9) Barra de páginas (`src/client/components/pages-bar.tsx`)

| String atual | → | Proposta pt-BR |
|---|---|---|
| `Add page` | → | `Adicionar página` |
| `Rename` | → | `Renomear` |
| `Duplicate` | → | `Duplicar` |
| `Delete` | → | `Excluir` |

---

## 10) Lista de projetos (`src/client/components/design-list.tsx`)

| String atual | → | Proposta pt-BR |
|---|---|---|
| `New Design` | → | `Novo projeto` ⚠ igual à Home — unificar |
| `No saved designs yet` | → | `Nenhum projeto salvo ainda` |

---

## 11) Cartão de modelo (`src/client/components/template-card.tsx`)

| String atual | → | Proposta pt-BR |
|---|---|---|
| `Loading...` | → | `Carregando…` |

---

## 12) Seletor de fontes (`src/client/components/font-picker.tsx`)

| String atual | → | Proposta pt-BR |
|---|---|---|
| `Aa 123` | → | `Aa 123` — **manter** (amostra visual) |
| `Available fonts` | → | `Fontes disponíveis` |
| `Import font from computer…` | → | `Importar fonte do computador…` |
| `Could not import the font.` | → | `Não foi possível importar a fonte.` |

---

## 13) Formatos de canvas (`src/client/context.tsx` — `CANVAS_SIZES`)

| String atual | → | Proposta pt-BR |
|---|---|---|
| `Instagram Portrait` | → | `Instagram Retrato` |
| `Instagram Story` | → | `Instagram Story` — **manter** (termo corrente) |
| `LinkedIn Carousel` | → | `LinkedIn Carrossel` |
| `LinkedIn Landscape` | → | `LinkedIn Paisagem` |
| `LinkedIn Portrait` | → | `LinkedIn Retrato` |
| `LinkedIn Square` | → | `LinkedIn Quadrado` |
| `Pinterest Pin` | → | `Pinterest Pin` — **manter** |
| ➕ `Presentation 16:9` | → | `Apresentação 16:9` |
| `YouTube Thumbnail` | → | `Miniatura do YouTube` |

---

## 14) Splash (`public/splashscreen.html`)

| String atual | → | Proposta pt-BR |
|---|---|---|
| `<title>OpenDesign</title>` | → | `OpenDesign` — **manter** |
| Wordmark `OpenDesign` | → | `OpenDesign` — **manter** |
| `Visual design workspace` | → | `Espaço de design visual` (recomenda-se **manter** por ora; é reposicionamento de marca) |
| `aria-label="OpenDesign loading"` | → | `aria-label="Carregando OpenDesign"` ⚠ erro gramatical do original |

---

## 15) Achados que precisam de decisão (⚠)

1. **CTA duplicada:** `New Design` (topo da Home) e `Create Design` (estado vazio) fazem a mesma
   coisa; `New Design` ainda aparece na lista da sidebar. Recomendo um único rótulo: `Novo projeto`.
2. **Atalhos de Mac em app Windows — RESOLVIDO:** conferido o comportamento real em
   `use-canvas.ts:628-633`: `Ctrl+Z` desfaz e `Ctrl+Shift+Z` refaz. Portanto a sugestão original
   `Refazer (Ctrl+Y)` estava incorreta. A aplicação pelo Heitor/Renata usou
   `Desfazer (Ctrl+Z)` / `Refazer (Ctrl+Shift+Z)`, que está **correto** — decisão validada.
3. **Pontuação mista:** `Loading...`, `Preparing...`, `Saving...` e `Uploading...` usam três pontos;
   o toolbar também tem `Saving…` com reticência. Uniformizar para `…`.
4. **`aria-label="OpenDesign loading"`** no splash é inglês quebrado (ver §14).
5. **`Width`** é placeholder, não rótulo — se o intuito era rotular a espessura do contorno,
   a proposta mais clara é `Espessura` (mantive `Largura` pela tradução literal).
6. **Escopo de tradução:** traduzir só os textos desta tabela deixaria o app bilíngue (README,
   metadados e logs seguem em inglês). A decisão de migrar o produto inteiro é do Tyago.

---

## 16) Estado desta entrega

- **Aplicado pelo Heitor/Renata** nos `.tsx`/`.html` e na documentação (`README.md`, `agent.md`),
  por autorização do Tyago em 2026-11-20. Nenhum `tauri.conf.json` foi alterado por esta entrega.
- Auditoria pós-aplicação: das **130 propostas acionáveis únicas, 0 pendências reais**. Os dois
  achados restantes são falsos positivos: `Add a heading` em comentário (`brand.ts:55`) e
  `Delete` como `e.key` (`use-canvas.ts:635`). Decisão do Redo validada em §15, item 2.
- Arquivo de proposta: `COPY_PROPOSTAS.md` (este documento).
- Já aplicado na etapa anterior, dentro de `OpenDesign/`: `src-tauri/Cargo.toml`
  (`description`), `README-TAURI.md`, `docs/copy-janela-ui-tauri.md`.
- **Zero commit / push / publish.** Nada escrito fora de `OpenDesign/`.
- Go-live do desktop segue **NÃO APROVADO** (`docs/qa-golive-desktop.md`) — este documento é
  só proposta de copy e não altera esse veredito.
