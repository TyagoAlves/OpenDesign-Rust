# CI de empacotamento desktop — OpenDesign (Tauri 2)

**Status: rascunho no caminho final, NÃO commitado e NÃO publicado.** O workflow
já está em `.github/workflows/tauri.yml`; o OK explícito do Tyago é necessário
para commitar/pushar (e, depois, criar tag/publicar release). Escopo limitado a
`OpenDesign/`; nada foi alterado no resto de `bloaudhab`.

Arquivo entregue: `.github/workflows/tauri.yml` (em rascunho no caminho final,
dentro de `OpenDesign/`).

**Cartão/escopo:** frente **OpenDesign/Tauri**. Não existe texto ou ID de cartão
adicional: o briefing é o escopo. Decisões registradas aqui vieram do canal do
Tyago: "grill-me" (2026-11-20) e dúvida 7/8 do Douglas (Manuela/AG-08).

**Coordenação (aviso do Tyago):** HUGO, GAEL e PAULA **não existem como agentes,
responsáveis ou canais** e não devem ser endereçados, aguardados nem incluídos
em decisões ou encaminhamentos. Coordenação técnica: **Renata** (líder do
projeto) e este canal do Tyago; **decisões finais somente com o Tyago**. Donos
destes dois arquivos: Manuela/AG-08, com liderança da Renata e validação final
do Douglas; ninguém mais sobrepõe esse trabalho.

## Decisões do Tyago (2026-11-20)

| # | Tema | Decisão | Estado |
|---|---|---|---|
| 1 | Gatilho de release | `push` em tag `v*` automático; `workflow_dispatch` só dry-run, sem release | Aplicado no workflow |
| 2 | Code signing | **Nenhuma assinatura nesta rodada.** Nenhuma conta/certificado criado; nenhuma config de signing alterada no config local | Workflow só usa `WINDOWS_*` se os secrets já existirem; nada é exportado vazio |
| 3 | Publicação | `releaseDraft: true`: tag cria rascunho; Douglas valida no QA; Tyago dá OK explícito; Publish manual | Aplicado via `tauri-action` |
| 4 | Plataformas do CI | **Windows primeiro** nesta rodada: matrix reduzida a um job `windows-latest`; macOS (arm64/x64) e Linux removidos e só voltam com OK do Tyago, se houver Mac e autorização de conta Apple Developer | Aplicado; sem entries Mac/Linux, sem deps Linux, sem segredos da Apple nem notarização |
| 5 | Config duplicada / build | `tauri.conf.json` da raiz movido para `docs/tauri.conf.raiz-legado.json.bak`; `beforeBuildCommand: pnpm build` no config canônico | Já resolvido: Emanuel aplicou o `pnpm build`; Douglas moveu o config da raiz. Não refazer |
| 6 | CSP de produção | Endurecer (`script-src 'self'`, sem `unsafe-inline`/`unsafe-eval`), com `font-src 'self' data:` para as fontes DataURL | Já presente em `src-tauri/tauri.conf.json` |
| 7 | Uploads/fontes locais | **Manter blobs SQLite em base64 + `data:` URLs**; não converter para Tauri FS + `asset://` | Decisão registrada; adaptador local permanece como está |
| 8 | Instaladores | **Instalador gerado somente no CI** (MSI + NSIS). O `tauri.conf.json` canônico de `src-tauri/` NÃO muda: continua `bundle.active:false` para o `.exe` cru local | Aplicado com override `src-tauri/ci-build.json` gerado no job e um único `--config` |

**Atenção:** configurar o gatilho **não autoriza** criar/pushar tag nem
publicar release. Nada disso sem OK explícito do Tyago no momento certo.

## Matriz de plataformas do workflow

| Etapa | Windows (`windows-latest`) | macOS | Linux |
|---|---|---|---|
| Checkout, pnpm 10.34.9, Node 22, `pnpm install --frozen-lockfile` | ✓ | — (rodada futura) | — (rodada futura) |
| Rust stable + cache Cargo | ✓ | — | — |
| Dependências do sistema | — | — | — |
| `pnpm tauri build --config src-tauri/ci-build.json` | **MSI + NSIS** | — | — |
| Instaladores como *workflow artifacts* | ✓ | — | — |
| Release rascunho na tag `v*` | ✓ | — | — |

Não há mais entries `macos-arm64`, `macos-x64` nem `linux` no `matrix.include`
(o job é único), nem step de dependências do sistema, nem segredos/notarização
da Apple. Motivo: não há Mac no time e não há autorização para conta Apple
Developer, assinatura ou notarização. Não há o que decidir entre arm64 e x64
nesta rodada; a questão fica registrada para uma rodada futura.

## Instaladores só no CI (decisão 8)

O config local `src-tauri/tauri.conf.json` permanece com `bundle.active:false`
— o build local/Rafael continua produzindo o `.exe` cru em `OpenDesign/Release`.
O job do CI cria, em tempo de execução, `src-tauri/ci-build.json` a partir do
config canônico, sobrescrevendo **somente** `bundle`:

```json
{ "active": true, "targets": ["msi", "nsis"] }
```

Resto do config (`app.windows`, `beforeBuildCommand`, CSP e ícones) é herdado.
O config canônico **não** tem bloco `bundle.windows`: ele só nasce no override
quando os três secrets `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` e
`WINDOWS_CERTIFICATE_THUMBPRINT` existem. Nesse caso o `.pfx` é importado no
store do runner e o `certificateThumbprint` entra **no mesmo** JSON. Nenhuma
variável de assinatura é exportada com string vazia: o bundler da Tauri usa
`var_os()` e trataria `""` como "presente", quebrando o build. O build recebe
**um único** `--config src-tauri/ci-build.json` (nunca dois `--config` na mesma
chamada).

**Assinatura (decisão 2):** nenhuma conta, certificado ou custo foi criado
nesta rodada. Os secrets `WINDOWS_*` **não estão configurados**, então o build
roda hoje **sem assinatura**. A lógica não foi removida, apenas está inativa
por ausência de secrets: se eles existirem, o passo importa o `.pfx` e injeta o
thumbprint no override de CI. Todo o bloco da Apple (certificado `.p12`, Apple
ID e notarização) foi removido junto com a matrix macOS. Instaladores Windows
sem assinatura mostrarão aviso do SmartScreen; isso é **aceitável** enquanto a
release for rascunho e o QA for interno. Não criar conta nem comprar
certificado sem nova decisão explícita do Tyago.

## CSP e fontes (decisões 6 e 7)

O CSP de produção atual em `src-tauri/tauri.conf.json` é:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ipc: ipc.localhost
```

- `font-src 'self' data:` atende às fontes DataURL usadas pelo adaptador local;
  não libera `unsafe-inline`/`unsafe-eval` em `script-src`.
- `connect-src` mantém `ipc: ipc.localhost`; conferir no smoke do Windows se
  é preciso `http://ipc.localhost` (ajuste do responsável, se aplicável).
- A divergência anterior entre "Tauri FS + `asset://`" e a implementação com
  blobs SQLite foi resolvida: **blobs permanecem**. Não migrar para
  `tauri-plugin-fs` sem nova decisão do Tyago.

## Validação feita

- YAML do workflow parseado com `js-yaml` (exit 0).
- SHAs das actions obtidos de `git ls-remote` nos tags/branch correspondentes.
- Config canônico lido somente leitura: `beforeBuildCommand: pnpm build`,
  `bundle.active:false` e `font-src 'self' data:` presentes — nenhum foi alterado.
- `[profile.release] lto = true` está no **`Cargo.toml` da raiz** (workspace que
  inclui `src-tauri`); isso é distinto do `tauri.conf.json` da raiz, que foi
  movido para `docs/tauri.conf.raiz-legado.json.bak`. O `src-tauri/Cargo.toml`
  só declara `edition = "2024"` e `rust-version = "1.90"`. O
  `timeout-minutes: 120` do job continua justificado pelo LTO do workspace.
- Nenhum `git add`, `commit`, `push`, tag, release ou artefato remoto criado.

## Pendências que não dependem deste workflow

- Smoke test do `.exe` cru em `OpenDesign/Release` (Douglas/Tyago). O
  `tauri dev` não exercita o CSP de produção; validar com o binário.
- QA dos instaladores MSI/NSIS gerados no CI antes de qualquer publicação.
- Nenhuma publicação de release sem OK explícito do Tyago após o QA.
