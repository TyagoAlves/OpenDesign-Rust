<img src="readme-banner.png" alt="Prévia do editor OpenDesign" width="100%" />

# OpenDesign — um editor de design que cabe num `.exe`

[Site](https://tyagoalves.github.io/OpenDesign-Rust/) · [Baixar `.exe`](#baixar-o-exe) · [Verificar o binário](#verificar-o-binário) · [Gerar o seu](#gerar-o-seu-exe)

OpenDesign é um editor de design gráfico open-source para Windows. Roda localmente, guarda os projetos em SQLite e não pede conta, nuvem ou assinatura. O aplicativo desktop é um único `.exe`: baixe, abra e crie posts, carrosséis e gráficos para redes sociais.

> **Prévia — não é release aprovada.** O binário publicado hoje é um artefato de registro e **não passou no gate de QA**. O go-live segue bloqueado até o QA final com os instaladores e o OK explícito do Tyago. Use por sua conta e risco.

## Baixar o `.exe`

[**Baixar OpenDesign.exe ↓**](https://github.com/TyagoAlves/OpenDesign-Rust/raw/refs/heads/main/Release/OpenDesign.exe)

Não precisa instalar Node, pnpm, wrangler nem dependências. Requer Windows com **WebView2** (presente no Windows 11; pode ser necessário instalar o runtime em versões antigas do Windows 10).

1. Baixe o `.exe` e dê dois cliques.
2. Crie um projeto, edite e exporte em PNG (esta página ou todas) ou PDF de carrossel.
3. Feche e reabra: projetos, páginas, brand kits e fontes importadas continuam no SQLite local.

Os dados ficam em `%APPDATA%\com.opendesign.app\opendesign.db`. Nada é enviado para servidor algum.

## Estado do binário

| Item | Publicado agora | Candidato em QA (ainda não publicado) |
|---|---|---|
| Arquivo | `Release/OpenDesign.exe` (raw da `main`) | `target/release/app.exe` do build local |
| Tamanho | 13.979.136 bytes | 13.933.056 bytes |
| SHA-256 | `7F47B6D4FDAB2478EFF5EA35971A8A1AD74143CB5562A4C815DD02B42D63F7E1` | `3D56E6F3901FABEEC3360A7A43FB442F2B88A67D922CEE8FD8ECF30C20D2FB9D` |
| Frontend embutido | `/assets/index-DbD7ieMa.js` | `/assets/index-B8HL4cME.js` |
| Gate de rastreabilidade | **Reprovado** — o embutido não corresponde ao `dist/` do mesmo build | **Aprovado** — 78/78 assets, leitura estável do PE |

O candidato em QA também passou no smoke com CSP de release, reload do editor e exportação com nonce one-shot. A troca do download público e a publicação dos instaladores MSI/NSIS só acontecem com QA final verde e OK do Tyago. Acompanhe em [`docs/qa-golive-desktop.md`](docs/qa-golive-desktop.md).

### Instaladores

O CI gera **MSI e NSIS** em separado, reaproveitando o mesmo `.exe` já gateado (`--no-binary-patching --no-sign`). O workflow está em [`.github/workflows/tauri.yml`](.github/workflows/tauri.yml); o gatilho manual (`workflow_dispatch`) apenas produz artefatos e **não cria release**. Push de tag `v*` gera no máximo um **rascunho**, revisado antes de qualquer publicação. Detalhes em [`docs/tauri-ci.md`](docs/tauri-ci.md).

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
