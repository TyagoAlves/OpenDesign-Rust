---
id: COPY-OPENDESIGN-TAURI
data: 2026-11-20
responsavel: Camila (AG-04 — Copy)
status: ENTREGUE — título/descrição aplicados; strings da UI catalogadas como PROPOSTA e depois APLICADAS em pt-BR (0 pendências; ver COPY_PROPOSTAS.md §16)
escopo: somente C:\Users\tyago\Projeto\bloaudhab\OpenDesign\
---

# Copy da janela e da interface — OpenDesign Desktop (Tauri)

## 1) Resposta às dúvidas 2/3 e 3/3 (briefing original)

- **Dúvida 2/3 (strings atuais):** resolvida por leitura permitida da pasta. As strings
  da interface estão nos `.tsx` de `src/client/` e no HTML de `public/splashscreen.html`.
  Inventário no §4 abaixo.
- **Dúvida 3/3 (i18n):** **não há i18n**. Busca por `tr(`, `i18n`, `locale`,
  `useTranslation`, `Intl` em `src/client/` retornou **zero ocorrências**. Os textos são
  literais em inglês. A regra `tr('texto em PT')` do Habblaud **não se aplica** ao
  OpenDesign — são produtos distintos.

## 2) Título e metadados — situação aplicada

| Alvo | Texto | Ação |
|---|---|---|
| `productName` (ambos `tauri.conf.json`) | `OpenDesign` | **Já correto** — não alterado |
| `app.windows[main].title` (ambos) | `OpenDesign` | **Já correto** — não alterado (bate com a entrega da Melissa, `docs/entrega-ui-tauri-melissa.md`) |
| `app.windows[splashscreen].title` (ambos) | `OpenDesign` | **Já correto** — não alterado |
| `<title>` de `index.html` e `public/splashscreen.html` | `OpenDesign` | **Já correto** — não alterado |
| `description` em `src-tauri/Cargo.toml` | `OpenDesign - local design editor for social media graphics` | **APLICADO** (substitui o placeholder `"A Tauri App"`) |

**Por que a description não foi para `tauri.conf.json`:** o schema do Tauri 2
(`node_modules/@tauri-apps/cli/config.schema.json`, CLI 2.12.6) aceita apenas
`$schema`, `productName`, `mainBinaryName`, `version`, `identifier`, `app`, `build`,
`bundle` e `plugins` no topo. Inserir `description` ali tornaria a config inválida.
O metadado equivalente no Rust é `package.description` — é onde ficou.

**Idioma:** os metadados seguem em **inglês** (coerentes com o produto), mas a
interface e a documentação foram migradas para **pt-BR** por decisão do Tyago,
com as propostas aplicadas pelo Heitor/Renata. A auditoria posterior encontrou
0 pendências reais; ver `COPY_PROPOSTAS.md` §16. Este documento mantém o
inventário original (`string atual → proposta`) como registro histórico.

## 3) Splash — copy original × estado aplicado

| Elemento | Texto original | Estado em disco |
|---|---|---|
| Wordmark | `OpenDesign` | Mantido |
| Tagline | `Visual design workspace` | Aplicado como `Espaço de design visual` |
| `aria-label` do `<main>` | `OpenDesign loading` | Aplicado como `Carregando OpenDesign` |

## 4) Inventário de strings da UI — atuais × propostas pt-BR

> **Registro histórico:** a coluna da direita era a proposta; as strings foram
> aplicadas depois pelo Heitor/Renata em pt-BR. A auditoria final está em
> `COPY_PROPOSTAS.md` §16 (0 pendências reais).

### Home (`src/client/components/home.tsx`)

| Atual | Proposta pt-BR |
|---|---|
| `My Designs` | `Meus projetos` |
| `New Design` | `Novo projeto` |
| `Create Design` | `Criar projeto` |
| `Start from a template` | `Comece por um modelo` |
| `No designs yet` | `Nenhum projeto ainda` |
| `Create your first design to get started` | `Crie seu primeiro projeto para começar` |
| `Recent designs` | `Projetos recentes` |

### Toolbar (`src/client/components/toolbar.tsx`)

| Atual | Proposta pt-BR |
|---|---|
| `Back to designs` | `Voltar aos projetos` |
| `Custom` | `Personalizado` |
| `Resize` | `Redimensionar` |
| `Undo resize` | `Desfazer redimensionamento` |
| `Zoom out` / `Zoom in` / `Fit to screen` | `Diminuir zoom` / `Aumentar zoom` / `Ajustar à tela` |
| `Export` / `Export this design` | `Exportar` / `Exportar este projeto` |
| `Preparing...` | `Preparando...` |
| `Carousel PDF` | `PDF de carrossel` |
| `All {n} pages, ready for LinkedIn` | `{n} páginas, prontas para o LinkedIn` |
| `This page` / `PNG at 2x` | `Esta página` / `PNG em 2x` |
| `All pages` / `{n} separate PNGs at 2x` | `Todas as páginas` / `{n} PNGs separados em 2x` |
| `Auto-save` | `Salvamento automático` |
| `Unsaved changes` / `Saving…` / `Save failed` / `All changes saved` | `Alterações não salvas` / `Salvando…` / `Falha ao salvar` / `Todas as alterações salvas` |
| `Save` / `Saving...` | `Salvar` / `Salvando...` |
| `Untitled design` (quando aplicável) | `Projeto sem título` |

### App (`src/client/app.tsx`)

| Atual | Proposta pt-BR |
|---|---|
| `Design` (título do `AppNav`) | `Projeto` (ou manter `Design`, termo corrente em pt-BR) |
| `Designs` / `Recent designs` | `Projetos` / `Projetos recentes` |
| `Loading...` | `Carregando...` |
| `Reload` | `Recarregar` |

> Inventário dos fluxos principais (home, toolbar, app, splash). Painéis laterais,
> seletor de fontes e páginas têm strings adicionais — se o time decidir traduzir,
> faço o levantamento completo antes de editar qualquer arquivo.

## 5) Achados de copy do levantamento original (resolvidos na aplicação)

> Estes eram os achados antes da aplicação. O item 2 foi validado como
> `Ctrl+Z` / `Ctrl+Shift+Z` (e não `Ctrl+Y`), e o item 4 virou
> `Carregando OpenDesign`. Detalhes em `COPY_PROPOSTAS.md` §15.

1. **Duas CTAs para a mesma ação:** `New Design` (topo) e `Create Design` (estado vazio).
   Recomendo um único rótulo: `Novo projeto`.
2. **Atalhos inconsistentes com a plataforma:** `title="Undo (Cmd+Z)"` e
   `"Redo (Cmd+Shift+Z)"` aparecem numa janela que também roda no Windows, onde o
   atalho é `Ctrl+Z` / `Ctrl+Shift+Y` (ou `Ctrl+Y`). Não é só texto: é preciso
   conferir o comportamento real antes de trocar o rótulo.
3. **Pontuação inconsistente:** `Preparing...` e `Saving...` usam três pontos, enquanto
   `Saving…` usa reticência (`…`). Uniformizar para `…`.
4. **`aria-label="OpenDesign loading"`** é inglês quebrado; ver §3.

## 6) Arquivos tocados nesta entrega

- `src-tauri/Cargo.toml` — `description` substituída.
- `README-TAURI.md` — novo (README do empacotamento Tauri).
- `docs/copy-janela-ui-tauri.md` — novo (este documento).

Nesta entrega original, nenhum `.tsx`, `index.html`, `splashscreen.html` ou
`tauri.conf.json` foi alterado. A aplicação posterior da tradução
(`COPY_PROPOSTAS.md` §16) editou os `.tsx`/`.html` e a documentação; nenhum
`tauri.conf.json` foi alterado por ela. Nada commitado, nada publicado, nada
fora de `OpenDesign/`.
