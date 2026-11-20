<img src="readme-banner.png" alt="Prévia do OpenDesign" width="100%" />

# OpenDesign: A alternativa open-source ao Canva para SaaS

[![Deploy with Clawnify](https://app.clawnify.com/deploy-button.svg)](https://app.clawnify.com/deploy?repo=clawnify/OpenDesign)

Um editor de design para criar gráficos profissionais para redes sociais — posts do LinkedIn, quote cards, anúncios e muito mais. Parte do ecossistema [OpenClaw](https://github.com/openclaw/openclaw). Sem dependências de nuvem — roda localmente com SQLite.

Construído com **Preact + Fabric.js + Tailwind CSS + Hono + SQLite**. Vem com uma interface de editor escura inspirada no Figma, renderização de canvas em retina e templates de posts do LinkedIn prontos para uso.

## O que é?

O OpenDesign é um editor de design gráfico pronto para produção, criado para a comunidade OpenClaw. Pense nele como uma alternativa open-source ao Canva — uma ferramenta de design visual que você pode auto-hospedar, personalizar e incorporar em qualquer produto SaaS.

Ao contrário do Canva ou do Adobe Express, ele roda inteiramente na sua própria infraestrutura. Sem assinaturas, sem marcas d'água, sem vendor lock-in. Crie gráficos para redes sociais com precisão de pixels e tipografia profissional, e exporte em resolução 2x.

## Recursos

- **Campos de template** — dê um nome a qualquer objeto de texto ou imagem e preencha-o a partir de dados ou de um agente pela API; um mesmo nome pode alimentar vários objetos e páginas de uma vez
- **Canvas com Fabric.js** — manipulação completa de objetos com renderização retina/HiDPI (2x device pixel ratio)
- **Templates prontos** — otimizados para o LinkedIn: Quote Card, Stats Highlight, Announcement, Tips List, Profile Card, Minimal Text
- **10 Google Fonts** — Inter, Playfair Display, Montserrat, Poppins, Roboto, Open Sans, Lora, Raleway, Source Sans Pro, Merriweather
- **Fontes personalizadas** — clique em **Importar fonte do computador…** em um seletor de fonte de texto ou de brand kit para enviar arquivos TTF, OTF, WOFF ou WOFF2 (até 10 MB). As fontes são salvas com o app, carregam antes da renderização do canvas e acompanham os brand kits exportados.
- **Edição de texto** — família da fonte, tamanho, peso, alinhamento, cor, altura da linha e espaçamento entre letras
- **Formas** — retângulos, círculos, triângulos e linhas com preenchimento, contorno e raio de borda
- **Envio de imagens** — arraste e solte ou clique para enviar e posicione no canvas
- **Brand kits** — salve uma paleta, um par de fontes de título/corpo e seus logos, e aplique-os a qualquer design com um clique. As cores da marca aparecem em qualquer lugar onde você escolher uma cor. Os kits exportam e importam como JSON simples, para que um kit se mova entre instalações ou para um cliente, em vez de ficar preso a uma conta
- **Planos de fundo** — cores sólidas, gradientes e imagens enviadas
- **Tamanhos de canvas** — LinkedIn Square (1080x1080), LinkedIn Carousel (1080x1350), LinkedIn Landscape (1200x627), LinkedIn Portrait (1200x1500), Instagram Story (1080x1920)
- **Desfazer/Refazer** — histórico completo com atalhos de teclado (Ctrl+Z / Ctrl+Shift+Z no Windows e Linux; Cmd+Z / Cmd+Shift+Z no macOS)
- **Exportação de PDF para carrossel**: todas as páginas em um único PDF de várias páginas, o único formato que o LinkedIn aceita para um carrossel deslizável
- **Exportação de PNG 2x**: esta página ou todas as páginas, exatamente no dobro do tamanho do design em qualquer tela
- **Salvamento automático** — os designs são persistidos no SQLite com salvamentos com debounce
- **Interface de modo duplo** — otimizada para humanos + otimizada para agentes de IA (`?agent=true`)

## Carrosséis

Um carrossel deslizável no LinkedIn é um **post de documento**. As próprias páginas de ajuda
do LinkedIn documentam o formato (PDF, DOC/DOCX ou PPT/PPTX, até 300 páginas e 100 MB), e o
carrossel nativo de várias imagens, lançado em 2022 e de curta duração, foi removido em junho de
2023, com os posts de carrossel existentes excluídos naquele dezembro. Enviar um documento é o caminho.

O OpenDesign cria tudo do início ao fim: adicione uma página por slide e depois **Exportar → PDF de carrossel**
grava todos em um único arquivo, na ordem do canvas, na proporção própria do slide. Envie esse PDF ao LinkedIn
como documento.

Formato e limites conforme [Ajuda do LinkedIn: enviar e compartilhar documentos](https://www.linkedin.com/help/linkedin/answer/a518909).
Note que os *Carousel Ads* são um produto separado de anúncios pagos, sem relação com isso.

Use o tamanho de canvas **LinkedIn Carousel** (1080x1350, 4:5). Ele ocupa o máximo de espaço na
tela de um celular. As exportações são montadas no navegador, então nada sai da máquina.

## Primeiros passos

```bash
git clone https://github.com/clawnify/OpenDesign.git
cd OpenDesign
pnpm install
pnpm run dev
```

Abra `http://localhost:5173` no seu navegador. Designs e envios são persistidos nos simuladores locais de D1 e R2 em `.wrangler/`.

### Modo agente (para OpenClaw / Claude Code)

Adicione `?agent=true` à URL:

```
http://localhost:5178/?agent=true
```

Isso ativa uma interface amigável para agentes, com:
- Botões explícitos sempre visíveis (sem revelar ao passar o mouse)
- Áreas de clique grandes para automação de navegador confiável
- Todos os controles acessíveis sem interações de arrastar
- Rótulos semânticos para navegação de IA

### Uso com o Claude Code

O Claude Code pode interagir com o editor de design pela API REST:

```bash
# Criar um novo design
curl -X POST http://localhost:3006/api/designs \
  -H "Content-Type: application/json" \
  -d '{"name": "Q1 Results", "width": 1080, "height": 1080}'

# Carregar um template
curl http://localhost:3006/api/templates/1

# Atualizar design com o JSON do canvas
curl -X PUT http://localhost:3006/api/designs/1 \
  -H "Content-Type: application/json" \
  -d '{"canvas_json": "{...}"}'
```

Agentes do OpenClaw também podem usar a ferramenta de navegador para interagir visualmente com o editor — navegar, clicar em templates, editar texto e exportar PNGs.

## Stack tecnológica

| Camada | Tecnologia |
|-------|-----------|
| **Frontend** | Preact, TypeScript, Tailwind CSS v4, Vite |
| **Canvas** | Fabric.js v6 (renderização retina, manipulação de objetos) |
| **Backend** | Hono, Node.js |
| **Banco de dados** | SQLite (better-sqlite3) |
| **Fontes** | Google Fonts (WebFontLoader) |
| **Ícones** | Lucide |

### Pré-requisitos

- Node.js 20+
- pnpm (ou npm/yarn)

## Arquitetura

```
schema.sql      — Schema do SQLite (designs, templates, pages)
demo/seed.sql   — Designs de exemplo para o workspace de demonstração do Clawnify
src/
  server/
    db.ts       — Wrapper do SQLite (query, get, run, transaction)
    index.ts    — API REST do Hono (CRUD de designs, templates, campos, envios)
    fields.ts   — Campos de template: lê o schema de preenchimento, substitui valores
    uploads.ts  — Envio de imagens no bucket R2 do app
    seed-templates.ts — Templates iniciais, inseridos na primeira requisição
  client/
    app.tsx           — Componente raiz
    fonts.ts          — Fontes do canvas incluídas
    context.tsx       — Contexto do editor + predefinições de tamanho de canvas
    hooks/
      use-canvas.ts   — Estado do Fabric.js, desfazer/refazer, zoom, exportação
      use-designs.ts  — CRUD de designs + salvamento automático + carregamento de templates
    components/
      editor.tsx        — Layout principal (barra de ferramentas + barras laterais + canvas)
      home.tsx          — Tela inicial: templates e designs recentes
      canvas-area.tsx   — Área rolável que contém o canvas de cada página
      page-canvas.tsx   — Canvas do Fabric.js de uma página
      pages-bar.tsx     — Adicionar, renomear, duplicar e excluir páginas
      toolbar.tsx       — Seletor de tamanho, desfazer/refazer, zoom, exportação, salvar
      left-sidebar.tsx  — Templates, texto, formas, imagens, planos de fundo
      right-sidebar.tsx — Painel de propriedades (contextual por seleção)
      template-card.tsx — Miniatura de template na galeria
      design-list.tsx   — Lista de designs salvos com renomear/excluir
```

### Modelo de dados

```sql
designs   (id, name, canvas_json, width, height, thumbnail_url, created_at, updated_at)
templates (id, name, category, canvas_json, width, height, thumbnail_url, sort_order)
```

### Endpoints da API

| Método | Endpoint | Descrição |
|--------|----------|-------------|
| GET | `/api/designs` | Listar todos os designs |
| POST | `/api/designs` | Criar um design |
| GET | `/api/designs/:id` | Obter um design |
| PUT | `/api/designs/:id` | Atualizar um design |
| DELETE | `/api/designs/:id` | Excluir um design |
| GET | `/api/designs/:id/fields` | Listar os campos preenchíveis do design |
| POST | `/api/designs/:id/fill` | Preencher esses campos com valores |
| GET | `/api/templates` | Listar todos os templates |
| GET | `/api/templates/:id` | Obter um template |
| POST | `/api/uploads` | Enviar um arquivo de imagem |
| GET | `/api/uploads/:filename` | Servir uma imagem ou fonte enviada |
| GET | `/api/fonts` | Listar fontes importadas |
| POST | `/api/fonts` | Importar um arquivo de fonte (multipart `file`, até 10 MB) |

## Campos de template

Crie algo uma vez e produza quantas variantes quiser, de acordo com o número de linhas de dados —
sem que nada do lado de fora precise entender o JSON do canvas.

Selecione um objeto de texto ou imagem no editor e dê a ele um **Nome do campo** no painel de
propriedades. Esse objeto agora é um espaço de preenchimento:

```bash
curl localhost:8787/api/designs/$ID/fields
```

```json
[
  { "name": "headline", "type": "text",  "value": "Your inspiring quote goes here", "page_ids": ["p1"] },
  { "name": "logo",     "type": "image", "value": "https://.../old.png",            "page_ids": ["p1", "p2"] }
]
```

Preencha-o. Campos de texto recebem uma string (números são aceitos e convertidos em string);
campos de imagem recebem uma URL:

```bash
curl -X POST localhost:8787/api/designs/$ID/fill \
  -H 'content-type: application/json' \
  -d '{"values": {"headline": "Q3 revenue up 40%", "logo": "https://.../new.png"}}'
```

A resposta traz as páginas preenchidas mais `filled` e `unmatched`, para que um nome que não
corresponde a nada seja reportado em vez de falhar a requisição. O design armazenado permanece
intacto — adicione `"save": true` (e opcionalmente `"name"`) para persistir o resultado como um
novo design.

### Até onde isso escala hoje

`save: true` grava um **novo design editável**, não uma imagem renderizada, porque não há
um rasterizador no servidor. Isso o torna a ferramenta certa para algumas poucas
variantes — um agente preenche um card, abre e exporta — e a errada para
uma planilha:

- Cada variante salva é uma linha em `designs`, e `GET /api/designs` retorna todas as linhas
  com o `canvas_json` completo e sem paginação. Um card com três objetos tem ~2,5 KB serializado;
  um design com marca e uma imagem tem 10 a 40 KB. Algumas centenas de variantes transformam a
  resposta da galeria em megabytes.
- Então algumas centenas de variantes salvas dão a você algumas centenas de entradas na
  galeria, não algumas centenas de gráficos prontos.

Para produção em massa de verdade, use `fill` sem `save` e rasterize no navegador — o
canvas já está lá, e esse loop é a peça que falta, em vez de um renderizador no servidor.
Até que ele exista, trate `save: true` como uma conveniência para pequenas
quantidades.

Vale saber:

- Um nome de campo pode se repetir. Um único `logo` em cinco páginas preenche todas as cinco,
  que é o que você quer para um carrossel.
- O que é gravado depende do objeto, não do tipo declarado: objetos de texto recebem `text`,
  objetos de imagem recebem `src`.
- Uma imagem substituta mantém a caixa do objeto original, então uma proporção diferente será
  esticada. Dimensione o espaço de acordo com as imagens que você pretende inserir nele.
- Somente objetos de texto e imagem podem ser campos. Dar um nome a uma forma não faz nada.
- A renderização em PNG ainda acontece no navegador — não há rasterizador no servidor, porque
  Workers não têm canvas.

## Comunidade e contribuições

Este projeto faz parte do ecossistema [OpenClaw](https://github.com/openclaw/openclaw). Contribuições são bem-vindas — abra uma issue ou envie um PR.

## Licença

MIT
