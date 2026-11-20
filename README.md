<img src="readme-banner.png" alt="Editor OpenDesign" width="100%" />

# OpenDesign — um editor de design que cabe num `.exe`

[Site](https://tyagoalves.github.io/OpenDesign-Rust/) · [Baixar `.exe`](#baixar-o-exe) · [Verificar o binário](#verificar-o-binário) · [Gerar o seu](#gerar-o-seu-exe)

OpenDesign é um editor de design gráfico open-source para Windows. Roda localmente, guarda os projetos em SQLite e não pede conta, nuvem ou assinatura. O aplicativo desktop é um único `.exe`: baixe, abra e crie posts, carrosséis e gráficos para redes sociais.

> **Release aprovada.** O binário publicado passou no gate de rastreabilidade e no QA final com MSI e NSIS; o go-live tem o OK explícito do Tyago. Relatório: [`docs/qa-golive-desktop.md`](docs/qa-golive-desktop.md).

## Baixar o `.exe`

| Download | Tipo | Tamanho | SHA-256 |
|---|---|---|---|
| [**OpenDesign.exe ↓**](https://github.com/TyagoAlves/OpenDesign-Rust/raw/refs/heads/main/Release/OpenDesign.exe) | Executável portátil | 13.946.880 bytes | `D57E2866D9BF7390A799882137060761222CC1F53A200C0AEA94AA147A8ACF74` |
| [**Instalador NSIS ↓**](https://github.com/TyagoAlves/OpenDesign-Rust/raw/refs/heads/main/Release/OpenDesign_1.0.0_x64-setup.exe) | Instala com atalhos e desinstalação limpa (recomendado) | 4.983.351 bytes | `FCD3949E3313484F311C56416EB31F752BF60053662CA805ADE7838F658EF1DD` |
| [**Instalador MSI ↓**](https://github.com/TyagoAlves/OpenDesign-Rust/raw/refs/heads/main/Release/OpenDesign_1.0.0_x64_en-US.msi) | Alternativa para implantação corporativa | 6.295.552 bytes | `3DA0A28ABCADCA7D7200D03B577891AF8046DE0FE7AC27B5DADFB5F1F25268BB` |

Os três embutem o mesmo exe gateado — conferido no item 8 do QA. Não precisa instalar Node, pnpm, wrangler nem dependências. Requer Windows com **WebView2** (presente no Windows 11; pode ser necessário instalar o runtime em versões antigas do Windows 10).

1. Baixe o `.exe` e dê dois cliques, ou execute um dos instaladores.
2. Crie um projeto, edite e exporte em PNG (esta página ou todas) ou PDF de carrossel.
3. Feche e reabra: projetos, páginas, brand kits e fontes importadas continuam no SQLite local.

Os dados ficam em `%APPDATA%\com.opendesign.app\opendesign.db`. Nada é enviado para servidor algum.

## Estado do binário

| Item | Publicado |
|---|---|
| Arquivo | `Release/OpenDesign.exe` (raw da `main`) |
| Tamanho | 13.946.880 bytes |
| SHA-256 | `D57E2866D9BF7390A799882137060761222CC1F53A200C0AEA94AA147A8ACF74` |
| Instalador NSIS | 4.983.351 bytes · SHA `FCD3949E3313484F311C56416EB31F752BF60053662CA805ADE7838F658EF1DD` |
| Instalador MSI | 6.295.552 bytes · SHA `3DA0A28ABCADCA7D7200D03B577891AF8046DE0FE7AC27B5DADFB5F1F25268BB` |
| Frontend embutido | `/assets/index-BCxGHaIP.js` (igual ao `dist/` do build `88f36d9`) |
| Gate de rastreabilidade | **Aprovado** — 78/78 assets, leitura estável do PE |
| QA dos instaladores | **Verde** — MSI e NSIS extraem o mesmo exe; smoke e desinstalação passaram |

O build veio do run [`44818112977`](https://github.com/TyagoAlves/OpenDesign-Rust/actions/runs/44818112977). O exe extraído de cada instalador tem exatamente o mesmo SHA do exe gateado; o smoke com CSP de release, hash router, contrato `nonce`, reload e a desinstalação limpa estão registrados em [`docs/qa-golive-desktop.md`](docs/qa-golive-desktop.md).

### Instaladores

O CI gera **MSI e NSIS** em separado, reaproveitando o mesmo `.exe` já gateado (`--no-binary-patching --no-sign`), e os dois instaladores estão publicados em `Release/`, com links no topo deste README e na landing. O NSIS passou por instalação silenciosa e desinstalação limpa; o MSI foi validado por extração administrativa. O workflow está em [`.github/workflows/tauri.yml`](.github/workflows/tauri.yml); o gatilho manual (`workflow_dispatch`) apenas produz artefatos e **não cria release**. Push de tag `v*` gera no máximo um **rascunho**, revisado antes de qualquer publicação. Até agora nenhuma tag/release foi criada. Detalhes em [`docs/tauri-ci.md`](docs/tauri-ci.md).

## Verificar o binário

O gate é somente leitura, falha fechado e não publica nada:

```powershell
powershell -NoProfile -File scripts/check-embedded-bundle.ps1 `
  -Exe target/release/app.exe -DistDir dist -FullAssetSet
```

Ele exige leitura estável do PE, **exatamente um** `/assets/index-*.js` embutido, igual ao `<script>` de `dist/index.html`, e todos os assets do `dist/`. `Exit 0` = passou; `Exit 1` = reprovou. Rode sempre no `.exe` cru recém-gerado, antes do smoke.

## Gerar o seu `.exe`

```powershell
pnpm install --frozen-lockfile   # pnpm 12.21.0
pnpm test                        # 17 testes
pnpm tauri build --no-bundle     # gera dist/ e target/release/app.exe
powershell -NoProfile -File scripts/check-embedded-bundle.ps1 -Exe target/release/app.exe -DistDir dist -FullAssetSet
```

O `beforeBuildCommand` do [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) já roda `pnpm build`; não faça um build de frontend separado. O config canônico mantém `bundle.active: false` — MSI/NSIS são gerados só no CI, por override temporário. Mais detalhes em [`README-TAURI.md`](README-TAURI.md) e [`TAURI-READINESS.md`](TAURI-READINESS.md).

## Recursos do editor

- Canvas com Fabric.js v6, renderização retina e desfazer/refazer
- Templates prontos para LinkedIn, 10 Google Fonts e fontes importadas do computador
- Brand kits com logos, cores e fontes, exportáveis/importáveis como JSON
- Campos de template preenchíveis pela API ou por um agente
- Exportação PNG 2x (página ou todas) e PDF de carrossel
- Salvamento automático em SQLite; interface opcional para agentes (`?agent=true`)

Armazenamento e esquema: [`docs/banco-local.md`](docs/banco-local.md). Integração Tauri/bridge: [`docs/tauri-bridge-ag07.md`](docs/tauri-bridge-ag07.md). Uso por agentes: [`agent.md`](agent.md).

## Origem e licença

Fork mantido por TyagoAlves a partir do projeto [clawnify/OpenDesign](https://github.com/clawnify/OpenDesign). Licença **MIT**.
