# Licenças de ativos — OpenDesign

> Data: 2026-11-20 · Responsável: Renato (Buscador de Assets, apoio à Renata) · Escopo: ícones do app desktop/web (Tauri).

## Regra

- Registrar aqui todo ativo de ícone/imagem usado no empacotamento desktop com origem, autor/fonte, licença e data.
- Não usar ativos sem licença comercial verificável.

## Ícones do aplicativo (desktop Tauri + favicon web)

| Arquivo | Tamanho / formato | Origem | Autor / fonte | Licença | Data | Observações |
|---|---|---|---|---|---|---|
| `icon.svg` | 180×180, SVG | Arte original do projeto OpenDesign (arquivo-fonte de ícone) | Projeto OpenDesign / Clawnify (conforme `LICENSE`) | **MIT** (mesma licença do repositório, `LICENSE`) | 2026-11-20 (verificado) | Sem assets de terceiros; formas geométricas vetoriais originais. |
| `src-tauri/icons/32x32.png` | 32×32 PNG | Derivado de `icon.svg` (conjunto gerado para Tauri) | Projeto OpenDesign | MIT (derivado de arte própria do projeto) | 2026-11-20 (presente no repositório; verificado) | Referenciado em `tauri.conf.json` (`bundle.icon`). |
| `src-tauri/icons/128x128.png` | 128×128 PNG | Derivado de `icon.svg` | Projeto OpenDesign | MIT (derivado de arte própria do projeto) | 2026-11-20 | Referenciado em `tauri.conf.json`. |
| `src-tauri/icons/128x128@2x.png` | 256×256 PNG | Derivado de `icon.svg` | Projeto OpenDesign | MIT (derivado de arte própria do projeto) | 2026-11-20 | Referenciado em `tauri.conf.json`. |
| `src-tauri/icons/icon.icns` | ICNS (multi-size) | Derivado de `icon.svg` (bundle macOS/Tauri) | Projeto OpenDesign | MIT (derivado de arte própria do projeto) | 2026-11-20 | Referenciado em `tauri.conf.json`. |
| `src-tauri/icons/icon.ico` | ICO (256×256) | Derivado de `icon.svg` (bundle Windows/Tauri) | Projeto OpenDesign | MIT (derivado de arte própria do projeto) | 2026-11-20 | Referenciado em `tauri.conf.json`. |
| `src-tauri/icons/icon.png` | 512×512 PNG | Derivado de `icon.svg` | Projeto OpenDesign | MIT (derivado de arte própria do projeto) | 2026-11-20 | Ícone base em alta resolução do conjunto Tauri. |
| `src-tauri/icons/Square*.png`, `src-tauri/icons/StoreLogo.png` | PNG (vários tamanhos) | Derivados de `icon.svg` (conjunto gerado para Tauri/Windows) | Projeto OpenDesign | MIT (derivado de arte própria do projeto) | 2026-11-20 | Presentes no diretório `src-tauri/icons/`; mantidos como parte do conjunto de ícones do app. |
| `favicon.svg` | SVG (cópia fiel) | Cópia de `icon.svg` para uso como favicon web | Projeto OpenDesign | MIT (derivado de arte própria do projeto) | 2026-11-20 | Criado por Renato para atender pedido de favicon; sem alteração de conteúdo. Referenciado em `index.html`. |
| `favicon.ico` | ICO multi-size (16×16, 32×32, 48×48) | Derivado de `src-tauri/icons/32x32.png` e `128x128.png` (reescala com Pillow 13, Lanczos) | Projeto OpenDesign | MIT (derivado de arte própria do projeto) | 2026-11-20 | Criado por Renato; sem assets de terceiros. |
| `favicon-32x32.png` | 32×32 PNG | Cópia de `src-tauri/icons/32x32.png` | Projeto OpenDesign | MIT (derivado de arte própria do projeto) | 2026-11-20 | Criado por Renato. |
| `src-tauri/icons/favicon.ico` | ICO multi-size (16×16, 32×32, 48×48) | Mesmo derivado de `favicon.ico` (raiz) | Projeto OpenDesign | MIT (derivado de arte própria do projeto) | 2026-11-20 | Cópia para conveniência no diretório de ícones do Tauri. |

## Ativos novos nesta entrega

- **Novos arquivos criados:** `favicon.ico` (raiz), `favicon.svg` (raiz), `favicon-32x32.png` (raiz), `src-tauri/icons/favicon.ico`, e este `LICENCAS.md`.
- **Nenhum ativo de terceiros** foi introduzido: todos são cópias/derivações da arte original do projeto (`icon.svg` e ícones Tauri já presentes), sob **MIT** (compatível com uso comercial).
- **Ícones Tauri pré-existentes** (32×32, 128×128, 128×128@2x, icon.icns, icon.ico e demais em `src-tauri/icons/`) foram verificados como presentes e consistentes com a configuração de `tauri.conf.json`.

## Ferramentas / rastreabilidade

- Verificação de dimensões/formatos e geração de `favicon.ico` (multi-size): **Pillow 13** (Python, já presente no ambiente) — sem dependências novas instaladas no projeto.
- Nenhuma ferramenta de IA usada para gerar arte; nenhum recurso externo baixado.

## Observações

- `index.html` atualizado apenas para referenciar `favicon.svg` e `favicon.ico` (mudança mínima, dentro de `OpenDesign/`).
- Nada publicado, nada commitado (aguardando OK explícito do Tyago).
- Se Renata/Tyago quiserem substituir a identidade visual do ícone, fornecer novo `icon.svg`/fonte com licença comercial verificável e regenerar o conjunto (`tauri icon` ou equivalente), atualizando este arquivo.
