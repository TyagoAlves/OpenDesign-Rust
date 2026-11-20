# Prévia local do MCP — OpenDesign

**O que é:** um protótipo isolado em `.mcp-prototype/` que permite a um agente de IA usar o OpenDesign por uma interface local, explícita e auditável. Isto descreve apenas o protótipo, para consulta interna de referência.

**O que existe hoje:**

- **Servidor local:** escuta somente em `127.0.0.1` — HTTP na porta fixa `8788`, nunca em `0.0.0.0`, IP de rede ou porta alternativa. Há dois transportes, stdio e HTTP, com o mesmo núcleo de protocolo.
- **Opt-in por launch:** desligado por padrão. O servidor só sobe com `OPENDESIGN_MCP_ENABLE=1` na inicialização; sem isso, o processo encerra. A ativação não persiste entre execuções.
- **Token por sessão:** obrigatório no HTTP, entregue ao cliente pelo campo `env` (`OPENDESIGN_MCP_TOKEN`), comparado em tempo constante e redigido em respostas. Não é aceito na URL, não aparece em logs nem em saída padrão; sem token válido, o servidor falha fechado.
- **Sem nuvem:** nenhum egresso externo, conta, sincronização ou telemetria. O protótipo reaproveita a API local já existente do OpenDesign.
- **Sem dependências novas:** apenas módulos embutidos do Node e arquivos do próprio protótipo. Nenhuma alteração em `package.json`, CI ou no aplicativo.

**Catálogo do protótipo:** 6 caixas e 15 ferramentas (catálogo, projeto, templates/campos, brand kits, snapshot e export), com validação de esquema e redação de segredos antes de cada chamada.

**Limites:** protótipo de prova de conceito, não integrado ao aplicativo, ao build, ao CI nem a qualquer publicação. Não há aqui promessa de disponibilidade ou distribuição.

Referências internas: `docs/mcp-planejamento.md` (escopo, protocolo e decisões), `docs/mcp-qa.md` (Gate 1 do protótipo), `docs/mcp-ux.md` (proposta de interface).
