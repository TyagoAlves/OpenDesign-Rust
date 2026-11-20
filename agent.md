# OpenDesign

Um editor de design para criar gráficos profissionais para redes sociais, especialmente posts do LinkedIn.

## Recursos
- Editor de canvas baseado em Fabric.js com arrastar e soltar
- Templates de posts do LinkedIn prontos (Quote Card, Stats Highlight, Announcement, Tips List, Profile Card, Minimal Text)
- Edição de texto com Google Fonts (Inter, Montserrat, Playfair Display)
- Brand kits — paleta, fontes de título/corpo e logos, aplicados a um design em uma
  única etapa e portáteis entre instalações como JSON (`/api/brand-kits`)
- Envio e posicionamento de imagens
- Vários tamanhos de canvas (1080x1080 quadrado, 1080x1350 carrossel, 1200x627 paisagem)
- Designs de várias páginas exportados como um único PDF, que é como um carrossel do LinkedIn é publicado
- Exportação de PNG 2x, de uma página ou de todas
- Salvar e gerenciar vários designs
- Campos de template — espaços nomeados que você pode preencher a partir de dados pela API

## Preenchimento de um design a partir de dados
Objetos em um design podem receber um nome de campo no editor, o que transforma o design em um
template que você pode controlar sem mexer no JSON do canvas:

- `GET /api/designs/{id}/fields` — o que pode ser preenchido neste design. Retorna `name`,
  `type` (`text` ou `image`), o `value` atual e as páginas em que o campo
  aparece.
- `POST /api/designs/{id}/fill` — `{"values": {"headline": "..."}}`. Retorna as páginas
  preenchidas mais `filled` e `unmatched`; o design armazenado permanece inalterado. Adicione
  `"save": true` para gravar o resultado como um novo design que você pode então abrir e
  exportar.

Prefira estes a editar `canvas_json` manualmente. Campos de texto recebem uma string, campos
de imagem recebem uma URL, e um mesmo nome pode abranger vários objetos ou páginas.

`save: true` produz um design editável, não uma imagem renderizada — não há renderizador no
servidor. Use-o para algumas poucas variantes. Não o execute em loop sobre uma lista grande:
cada variante se torna uma linha que `GET /api/designs` retorna por completo, e o usuário acaba
com entradas na galeria em vez de gráficos prontos.

## Quando usar este template
Use este template quando o usuário quiser:
- Criar imagens ou gráficos para posts de redes sociais
- Criar posts do LinkedIn, quote cards ou banners de anúncio
- Criar um carrossel do LinkedIn ou do Instagram e exportá-lo como PDF
- Criar uma ferramenta simples de design gráfico
- Criar conteúdo visual com a identidade da marca
- Gerar variantes de um design dentro da identidade da marca preenchendo-o com dados
- Manter uma equipe ou cliente dentro da identidade da marca em todos os gráficos (brand kit)
