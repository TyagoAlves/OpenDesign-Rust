---
id: UX-MCP-OPENDESIGN
data: 2026-11-20
responsavel: Lucas
status: FONTE ÚNICA — textos e estados do painel Settings → Agent access (integração Gate 2; auditoria BLOQUEADA — docs/mcp-qa.md §8)
escopo: somente docs/mcp-ux.md
---

# MCP no OpenDesign — textos e estados do painel

Este arquivo é a fonte única dos textos e estados de `Settings → Agent access`
(`Configurações → Acesso do agente`). Nenhuma outra doc define strings do painel.

- Gate 1 MCP autorizado; integração atual em Gate 2 (BLOQUEADA para release, `docs/mcp-qa.md` §8).
  D1, D2, D3, D4 e D5 estão no código; D6 (lote/undo) continua Fase 2, fora da V1.
- D1 usa `localApi()` como **backend de dados** no desktop (backend HTTP só no dev); o painel expõe MCP HTTP em `127.0.0.1:8788` (D3); D4 sempre grava com `save:true`.
- Comportamento e protocolo próprios. Nenhum material do Drift (GPLv3) copiado; OpenDesign é MIT.
- Fora de escopo: build, instalador, CI, `Release/`, landing, `gh-pages`, publicação, binário publicado.

> **Crítico cego — 6 seções renderizadas, versão final:** nenhum achado acima de menor.

---

## 1) Tabela de estados

Seis IDs renderizados pelo painel: `off`, `waiting`, `connected`, `port-error` (estados de conexão)
e `stdio`, `http` (visões de `waiting` com o snippet do respectivo transporte aberto).

| ID | Condição | Texto exibido |
|---|---|---|
| `off` | Launch, ou após desligar/revogar | `Desligado` |
| `waiting` | Opt-in feito; bind `127.0.0.1:8788` OK; sem conexão | `Serviço local ativo — aguardando agente` |
| `connected` | Conexão real recebida | `Agente conectado` |
| `port-error` | Bind em `127.0.0.1:8788` falhou | `Porta 8788 em uso` |
| `stdio` | Visão de `waiting` com o snippet stdio aberto | `Serviço local ativo — aguardando agente` |
| `http` | Visão de `waiting` com o snippet HTTP aberto | `Serviço local ativo — aguardando agente` |

No cartão do painel, o checkbox `Iniciar automaticamente após eu ligar o acesso` fica imediatamente
abaixo da linha do toggle `Permitir acesso do agente` e acima do aviso `Controle local...`. Permanece
visível em todos os estados; fica `disabled` em `off`, `port-error` e nas visões de preview, e é
desmarcado pelo hook nos estados de serviço (o preview apenas desabilita).

Regras de estado (AC-13):

1. No launch: estado `off`; toggle desligado, sem token, snippets desabilitados, checkbox
   `Iniciar automaticamente após eu ligar o acesso` desabilitado e desmarcado, nenhum listener HTTP.
2. Clique em `Permitir acesso do agente`: com bind `127.0.0.1:8788` OK, gera token, inicia o listener
   HTTP, habilita snippets e o checkbox e passa a `waiting`. Se o bind falhar, vai a `port-error`:
   toggle desligado, sem token, snippets e checkbox desabilitados e aviso `Não foi possível iniciar o
   serviço local.`; desligar volta a `off` sem toast de revogação.
3. O checkbox só é marcável depois do bind OK e é **apenas visual, nesta entrega**: marcar não agenda,
   reinicia nem recupera nada. Se o listener cair sem desligamento explícito, o estado volta a `off` e
   o checkbox é desmarcado; um novo opt-in gera token novo. O polling do hook não limpa a referência
   ao token — `setToken(null)` só ocorre em `Desligar e revogar token`. Não há mensagem de recuperação
   automática; `Serviço recuperado automaticamente.` permanece como texto previsto, não emitido.
   Desligar ou reiniciar o app desmarca; nada é persistido.
4. `Desligar e revogar token`: para o listener HTTP, revoga token, desmarca o checkbox, emite
   `Token revogado.` e volta a `off`. O cliente encerra o filho stdio.
5. Aviso fixo: `Controle local. Sem conta, sem nuvem, sem acesso remoto. O token é como senha:
   não compartilhe. Ele só aparece no campo env dos snippets.`
6. Mensagens exibidas no aviso (`role="status"`, sem tipo/severidade no código): `Snippet copiado.` ·
   `Não foi possível copiar. Selecione o snippet abaixo e copie manualmente.` · `Ligue o acesso para gerar
   o snippet.` · `Agente desconectado.` · `Token revogado.` · `Não foi possível iniciar o serviço local.`
   `Serviço recuperado automaticamente.` fica registrado como contrato, mas não é emitido sem
   recuperação funcional.
7. Tentativa com token ausente, curto, inválido ou de sessão anterior não cria estado novo: HTTP
   responde `401` (ausente/curto/inválido/de outra sessão) ou `400` (token na URL/query), com corpo
   genérico, e stdio falha fechado; o painel permanece em `waiting` (ou `connected`, se já havia conexão
   válida). O token vigente permanece.
8. Conexão real: `connected`. Perda da conexão: toast `Agente desconectado.` e volta a `waiting`.

---

## 2) Snippets de conexão (stdio + HTTP)

stdio e HTTP juntos no Gate 2 integrado (D3): mesmo catálogo de tools e mesmos códigos de erro das
chamadas MCP; falha de bind é específica do HTTP, pois stdio não abre rede. O app mantém o listener
HTTP e emite os snippets; o cliente faz spawn do filho stdio ou conecta ao endpoint HTTP — o app não
inicia nem encerra o filho. A chave `env.OPENDESIGN_MCP_TOKEN` é fixa nos dois snippets; cada
placeholder `<token-gerado-localmente>` é substituído pelo valor gerado no snippet copiado.

**stdio**

```json
{
  "mcpServers": {
    "opendesign": {
      "command": "<comando-do-opendesign>",
      "args": ["--transport", "stdio"],
      "env": { "OPENDESIGN_MCP_TOKEN": "<token-gerado-localmente>" }
    }
  }
}
```

**HTTP**

```json
{
  "mcpServers": {
    "opendesign": {
      "transport": "http",
      "endpoint": "http://127.0.0.1:8788/mcp",
      "env": { "OPENDESIGN_MCP_TOKEN": "<token-gerado-localmente>" }
    }
  }
}
```

No HTTP o cliente conecta ao endpoint fixo e monta `Authorization: Bearer` em runtime com o valor
lido do `env`; não há spawn nem bind pelo cliente.

---

## 3) Erro de porta

> **Porta 8788 em uso.** Feche o processo que usa a porta e tente novamente.
> O OpenDesign não troca de porta. [Tentar novamente]

`[Tentar novamente]` repete a tentativa de ligar. Após falha de bind não há token ativo; com
`8788` livre, a tentativa gera token novo, deixa toggle e snippets acionáveis, habilita o checkbox
apenas visual e passa a `waiting`; com `8788` ainda ocupada, mantém `port-error`. Não há fallback para `8787`, porta efêmera,
`0.0.0.0` ou `::`.

---

## 4) Regras do token

1. Gerado após o opt-in com bind bem-sucedido; vive em memória e no ambiente do processo filho.
   Não vai para disco, DB, `localStorage`, `sessionStorage`, snapshot ou evidência de QA.
2. Entrega ao cliente: o valor gerado é preenchido em `env.OPENDESIGN_MCP_TOKEN` no snippet copiado.
   Nunca em `argv`, URL/query, `stdout`/`stderr`, log, tooltip, `aria-label`, título ou mensagem de erro.
3. stdio: o cliente faz spawn do filho, que lê o token do ambiente. HTTP: o cliente conecta ao
   endpoint e envia `Authorization: Bearer` com o valor lido do ambiente.
4. Ausente, curto, inválido ou de sessão anterior: falha fechada, nenhuma tool exposta.
5. Comparação em tempo constante no HTTP (`token_valido`) e validação de formato do token do ambiente
   no stdio; redação profunda em `content` e `structuredContent`.
6. No HTTP: token em query é rejeitado mesmo com `env` correto; `cache-control: no-store`; sem CORS.
7. Desligar ou reiniciar o app invalida o token. Novo opt-in gera token novo.

---

## 5) Exportação por agente — comportamento implementado no Gate 2 (D2)

Esta seção descreve D2 já implementado no caminho MCP na árvore de trabalho; nada abaixo altera a
baseline publicada. `templates_preencher` sempre grava com `save:true` (D4). A ordem de cada arquivo
PNG/PDF é **escolher destino → autorizar → salvar**.

| Estado | Condição |
|---|---|
| `Escolhendo destino` | `pick_save_path` aberto para um arquivo, com nome sugerido; nenhum `nonce` emitido antes da escolha |
| `Exportação aguardando autorização` | Destino escolhido: `{ path, nonce }` recebidos; diálogo de consentimento mostra arquivo e destino |
| `Arquivo salvo` | Autorização dada; `saveDataURLNative` grava no destino do `path` e consome o `nonce` antes da escrita |
| `Exportação cancelada` | Cancelamento no seletor de destino ou negação na autorização; nenhum arquivo gravado, `isError:true` sem caminho/nonce |

> [Seletor nativo do sistema: o app não define texto próprio para escolher destino.]
> **Permitir ação do agente?** Salvar PNG/PDF em "<caminho escolhido>". Arquivo: `<arquivo.png|pdf>`. Destino: `<caminho escolhido>`.
> [Negar] [Permitir] [Permitir e lembrar nesta sessão]

O `pick_save_path` emite o `nonce` one-shot já vinculado ao `path` escolhido. A autorização vem depois
da escolha e antes da gravação, mostrando arquivo e destino; negar cancela sem gravação e não reutiliza
o `nonce`. A gravação usa `saveDataURLNative` com `path` e `nonce`; o Rust consome o `nonce` antes de
`fs::write`, e reutilização, `nonce` inválido ou destino divergente são recusados sem gravar.
`Permitir e lembrar nesta sessão` guarda apenas a decisão de autorizar em memória, com chave
`export:<tipo>:<arquivo>:<destino>`; **não guarda o `nonce`** e não elimina o seletor de destino: a
chamada seguinte obtém `path` e `nonce` novos, e outro destino exige nova autorização. Nada persiste
em disco: desligar/revogar o token, reiniciar o app ou falha de bind restaura a exigência de
confirmação. Pedidos concorrentes são serializados para não deixar confirmação pendente ou `nonce`
órfão.

---

## 6) Porta

- Bind HTTP: `127.0.0.1:8788`.
- `8787` é exclusivo do dev server; o MCP não o usa.

---

## FAQ curto

**O que muda no download?** Nada. `.exe` portátil, NSIS e MSI continuam com o mesmo editor; este
documento não altera binário, instalador nem landing.

**Preciso de conta ou nuvem para o MCP?** Não. Sem conta, sem nuvem, sem acesso remoto.

**O agente pode editar meu projeto sem confirmação?** D2 vale para `mcp_exportar`: escolher destino
e autorizar antes de gravar; `Permitir e lembrar nesta sessão` só reaproveita a autorização em memória
e nunca guarda `nonce` ou destino em disco (§5). Nas demais tools de escrita não há consentimento por
arquivo nesta V1 — `templates_preencher` sempre grava com `save:true` (D4) e `projeto_salvar` com `id`
sobrescreve pela API local. Lote/undo (D6) continua **Fase 2 — fora da V1/Gate 2**.

**O auto-start fica ligado depois do restart?** Não. O checkbox `Iniciar automaticamente após eu ligar
o acesso` é apenas visual nesta entrega: só fica habilitado depois do bind `127.0.0.1:8788` OK, não
persiste, não recupera o listener e volta a desmarcado ao desligar, reiniciar ou o serviço cair
(AC-13).

**Quais estados aparecem no painel?** `off`, `waiting`, `connected`, `port-error` e as visões
`stdio`/`http` com o snippet do transporte.

---

## Decisões registradas

| Decisão | Onde reflete |
|---|---|
| D1 — `localApi()` é o backend de dados no desktop; backend HTTP de dados só no dev. O painel expõe MCP HTTP em `127.0.0.1:8788` (D3) | topo, §2 |
| D3 — stdio + HTTP no Gate 2 integrado | §2 |
| D4 — `templates_preencher` sempre com `save:true` | topo, §5, FAQ |
| D5 — painel `Settings → Agent access` no Gate 2 integrado | §1 |
| D2 — escolher destino (`pick_save_path` + `nonce`) → autorizar → salvar; "Permitir e lembrar nesta sessão" só em memória (implementado no Gate 2) | §5, FAQ |
| D6 — lote/undo: **Fase 2, fora da V1/Gate 2** | topo, FAQ |
| Token por `env`, nunca em `argv`, URL ou logs; falha fechada se ausente/curto | §4 |
| Porta fixa `127.0.0.1:8788`, erro explícito se ocupada, sem fallback | §3, §6 |
| AC-13 — checkbox desabilitado no launch; marcável só após bind OK; apenas visual, sem persistência nem recuperação | §1, regras 1–4; §3; FAQ |
