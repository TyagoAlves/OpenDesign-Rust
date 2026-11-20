---
id: UX-MCP-OPENDESIGN
data: 2026-11-20
responsavel: Lucas
status: FONTE ÚNICA — textos e estados do painel Settings → Agent access (beta Gate 1)
escopo: somente docs/mcp-ux.md
---

# MCP no OpenDesign — textos e estados do painel

Este arquivo é a fonte única dos textos e estados de `Settings → Agent access`
(`Configurações → Acesso do agente`). Nenhuma outra doc define strings do painel.

- Gate 1 MCP autorizado. Beta cobre D1, D3, D4 e D5; D2 (OK por arquivo e "lembrar") e D6
  (lote/undo) são Fase 2, fora da beta.
- Limites da beta: D1 usa `localApi()` no desktop (HTTP só no dev); D4 sempre grava com `save:true`.
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

Regras de estado (AC-13):

1. No launch: estado `off`; toggle desligado, sem token, snippets desabilitados, checkbox
   `Iniciar automaticamente após eu ligar o acesso` desabilitado e desmarcado, nenhum listener HTTP.
2. Clique em `Permitir acesso do agente`: com bind `127.0.0.1:8788` OK, gera token, inicia o listener
   HTTP, habilita snippets e checkbox e passa a `waiting`. Se o bind falhar, vai a `port-error`:
   toggle ligado, sem token, snippets e checkbox desabilitados; desligar volta a `off` sem toast de
   revogação.
3. O checkbox só é marcável depois do bind OK. Com ele marcado, se o listener cair sem desligamento
   explícito na mesma sessão, há recuperação automática com o mesmo token; toast
   `Serviço recuperado automaticamente.` Se a recuperação esbarra em bind ocupado, vai a
   `port-error`, token descartado, checkbox desmarcado e desabilitado. Desligar ou reiniciar o app
   desmarca; nada é persistido.
4. `Desligar e revogar token`: para o listener HTTP, revoga token, desmarca o checkbox, emite
   `Token revogado.` e volta a `off`. O cliente encerra o filho stdio.
5. Aviso fixo: `Controle local. Sem conta, sem nuvem, sem acesso remoto. O token é como senha:
   não compartilhe. O valor do token ativo aparece preenchido no campo env do snippet copiado.`
6. Toasts: `Snippet copiado.` · `Não foi possível copiar. Selecione o snippet abaixo e copie
   manualmente.` · `Agente desconectado.` · `Serviço recuperado automaticamente.` · `Token revogado.`
7. Tentativa com token ausente, curto, inválido ou de sessão anterior não cria estado novo: HTTP
   responde `401`/`403` com corpo genérico, stdio falha fechado; o painel permanece em `waiting` (ou
   `connected`, se já havia conexão válida). O token vigente permanece.
8. Conexão real: `connected`. Perda da conexão: toast `Agente desconectado.` e volta a `waiting`.

---

## 2) Snippets de conexão (stdio + HTTP)

stdio e HTTP juntos na beta Gate 1 (D3): mesmo catálogo de tools e mesmos códigos de erro das
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

> **Porta 8788 em uso.** Feche o processo que usa a porta.
> O OpenDesign não troca de porta. [Tentar novamente]

`[Tentar novamente]` repete a tentativa de ligar. Após falha de bind não há token ativo; com
`8788` livre, a tentativa gera token novo, deixa toggle, snippets e checkbox acionáveis e passa a
`waiting`; com `8788` ainda ocupada, mantém `port-error`. Não há fallback para `8787`, porta efêmera,
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
5. Comparação com `timingSafeEqual` nos dois transportes; redação profunda em `content` e
   `structuredContent`.
6. No HTTP: token em query é rejeitado mesmo com `env` correto; `cache-control: no-store`; sem CORS.
7. Desligar ou reiniciar o app invalida o token. Novo opt-in gera token novo.

---

## 5) Exportação por agente — Fase 2, fora da beta

Esta seção é especificação futura de D2. Na beta Gate 1 não há confirmação por arquivo, não há
`Lembrar nesta sessão` e não há lote/undo (D6): nada abaixo descreve comportamento entregue na beta.
`templates_preencher` sempre grava com `save:true` (D4).

Especificação futura: cada arquivo PNG/PDF será confirmado separadamente, exceto quando houver
decisão lembrada — salvar ou cancelar — para o mesmo `nome sugerido` na sessão.

| Estado | Condição |
|---|---|
| `Exportação aguardando confirmação` | Diálogo nativo aberto para um arquivo, com nome sugerido e `nonce` one-shot |
| `Arquivo salvo` | Confirmação dada ou decisão lembrada de salvar; gravação concluída no destino escolhido ou lembrado |
| `Exportação cancelada` | Cancelamento sem decisão lembrada; nenhum arquivo gravado |
| `Exportação cancelada (lembrada)` | Cancelamento com `Lembrar nesta sessão`; nenhum arquivo gravado; mesmo `nome sugerido` omite o diálogo |

> **O agente quer salvar um arquivo** — Nome sugerido: `<arquivo.png|pdf>`. Escolha onde salvar.
> [Salvar] [Cancelar] ☐ Lembrar nesta sessão

`Lembrar nesta sessão` guarda em memória a decisão tomada — salvar, com destino, ou cancelar — para
o `nome sugerido`; não guarda o `nonce`. A confirmação consome o `nonce` one-shot; a decisão lembrada
substitui o diálogo e descarta o `nonce` da chamada; o cancelamento simples também o descarta. Novo
`nome sugerido` exige novo diálogo e novo `nonce`. Não persiste em disco: desligar/revogar o token,
reiniciar o app ou falha de bind que descarta o token restaura a exigência de confirmação.

---

## 6) Porta

- Bind HTTP: `127.0.0.1:8788`.
- `8787` é exclusivo do dev server; o MCP não o usa.

---

## FAQ curto

**O que muda no download?** Nada. `.exe` portátil, NSIS e MSI continuam com o mesmo editor; este
documento não altera binário, instalador nem landing.

**Preciso de conta ou nuvem para o MCP?** Não. Sem conta, sem nuvem, sem acesso remoto.

**O agente pode editar meu projeto sem confirmação?** A beta Gate 1 não entrega o fluxo de
confirmação por arquivo nem `Lembrar nesta sessão` (D2), nem lote/undo (D6): **Fase 2 — fora da beta
Gate 1**. O que existe é o catálogo da beta, com `templates_preencher` sempre gravando com `save:true`
(D4). Não prometemos OK por arquivo nesta versão.

**O auto-start fica ligado depois do restart?** Não. O checkbox só é marcável após o bind
`127.0.0.1:8788` OK, vale somente nesta sessão e volta a desmarcado ao desligar ou reiniciar (AC-13).

**Quais estados aparecem no painel?** `off`, `waiting`, `connected`, `port-error` e as visões
`stdio`/`http` com o snippet do transporte.

---

## Decisões registradas

| Decisão | Onde reflete |
|---|---|
| D1 — `localApi()` no desktop; HTTP só no dev | topo, §2 |
| D3 — stdio + HTTP na beta Gate 1 | §2 |
| D4 — `templates_preencher` sempre com `save:true` | topo, §5, FAQ |
| D5 — painel `Settings → Agent access` na beta Gate 1 | §1 |
| D2 — OK por arquivo + "Lembrar nesta sessão": **Fase 2, fora da beta** | §5, FAQ |
| D6 — lote/undo: **Fase 2, fora da beta** | topo, §5, FAQ |
| Token por `env`, nunca em `argv`, URL ou logs; falha fechada se ausente/curto | §4 |
| Porta fixa `127.0.0.1:8788`, erro explícito se ocupada, sem fallback | §3, §6 |
| AC-13 — checkbox desabilitado no launch; marcável só após bind OK; sem persistência | §1, regras 1–3; FAQ |
