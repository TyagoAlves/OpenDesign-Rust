# OpenDesign Desktop — README do empacotamento Tauri

> Documento de entrega de copy e handoff (Camila / AG-04). Escopo estrito: esta pasta
> (`OpenDesign/`). Nada publicado, nada commitado, nenhuma conta externa criada.
> Status do go-live: **NÃO APROVADO** pelo QA (ver `docs/qa-golive-desktop.md`) —
> este README descreve o estado atual, não libera o app para distribuição.

## Identidade do app

| Item | Texto | Onde está aplicado |
|---|---|---|
| Nome do produto | `OpenDesign` | `productName` nos dois `tauri.conf.json`, `index.html`, `public/splashscreen.html` |
| Título da janela principal | `OpenDesign` | `app.windows[label=main].title` nos dois `tauri.conf.json` |
| Título da janela de splash | `OpenDesign` | `app.windows[label=splashscreen].title` nos dois `tauri.conf.json` |
| Wordmark do splash | `OpenDesign` | `<h1 class="wordmark">` em `public/splashscreen.html` |
| Tagline do splash | `Visual design workspace` | `<p class="tag">` em `public/splashscreen.html` |
| Título da janela do browser (dev) | `OpenDesign` | `<title>` em `index.html` |
| Descrição do pacote | `OpenDesign - local design editor for social media graphics` | `description` em `src-tauri/Cargo.toml` |

**Nota sobre a descrição:** em Tauri 2 (CLI 2.12.6), `description` **não é chave válida**
no topo de `tauri.conf.json` — o schema só aceita `$schema`, `productName`,
`mainBinaryName`, `version`, `identifier`, `app`, `build`, `bundle` e `plugins`.
Por isso o texto foi aplicado em `src-tauri/Cargo.toml` (metadado do pacote Rust),
que é o local correto e não quebra o build. Não alterei `productName`: já é
`OpenDesign`, o nome aprovado.

## Comandos

A estrutura Tauri já existe (`src-tauri/`, ícones, capabilities), então `tauri init`
não precisa ser repetido. O CLI `@tauri-apps/cli` já está em `devDependencies`
(`package.json`); o comando de instalação abaixo é idempotente.

```bash
# 1. frontend
npm run build

# 2. CLI Tauri (já instalado — só necessário numa máquina limpa)
npm install --save-dev @tauri-apps/cli

# 3. desenvolvimento (WebView + Vite em http://localhost:5173)
npx tauri dev

# 4. build de produção
cd src-tauri
npx tauri build
```

**Atenção:** rode `tauri build` sempre dentro de `src-tauri/` (a partir da raiz,
o comando falha com `No package info in the config file`). O `tauri.conf.json`
duplicado na raiz foi removido e está em
`docs/tauri.conf.raiz-legado.json.bak`; a config canônica é
`src-tauri/tauri.conf.json`. A decisão foi executada pela Renata com a
autorização do Tyago. Hugo, Gael e Paula não existem como responsáveis ou
canais — decisões finais somente com o Tyago.

## Estrutura relevante

```
tauri.conf.json            # config da raiz (ver atenção acima)
src-tauri/
  tauri.conf.json          # config canônica do Tauri 2
  Cargo.toml               # metadados do pacote (description aplicada aqui)
  src/                     # main.rs, lib.rs, commands.rs (ponte nativa, AG-07)
  capabilities/default.json
  icons/                   # ico/icns/png usados no bundle
public/splashscreen.html   # tela de abertura (textos em inglês)
src/client/                # frontend Preact + Fabric.js (textos em inglês, sem i18n)
dist/                      # frontend gerado (frontendDist)
docs/                      # entregas e QA do time
```

## Textos da interface

O frontend **não usa `tr()`/i18n**: as strings estão diretas nos `.tsx`, em inglês.
O inventário completo, com os textos atuais e propostas de versão pt-BR
(**propostas, não aplicadas**), está em `docs/copy-janela-ui-tauri.md`.
A tradução da UI para pt-BR foi aplicada e auditada (ver `COPY_PROPOSTAS.md`:
estado APLICADO, 0 pendências reais). Coordenação técnica com a Renata;
decisões finais somente com o Tyago.

## Estado conhecido do empacotamento

- Build do frontend: verde (`npm run build`).
- App desktop: go-live reprovado — o frontend ainda depende de `/api/*` do
  backend Hono/D1/R2, que não entra no bundle; falta MSVC (`link.exe`) na máquina
  de build; o CSP segue permissivo para produção. Detalhes em
  `TAURI-READINESS.md` e `docs/qa-golive-desktop.md`.
- Ponte nativa (`save_design`, `load_design`, `list_designs`, `delete_design`,
  `export_png`, `export_pdf`) entregue por AG-07 em `docs/tauri-bridge-ag07.md`;
  o adaptador local de persistência ainda é decisão arquitetural da Renata.

## Regras

- Nada de commit, push, publish, assinatura ou distribuição sem OK explícito do Tyago.
- Nada fora desta pasta `OpenDesign/`.
- Nenhuma conta, domínio ou serviço externo foi criado.
