/**
 * Núcleo de protocolo do protótipo MCP local do OpenDesign.
 *
 * Implementação própria e sem dependências: apenas JSON-RPC 2.0 sobre o
 * protocolo MCP público. Aceita duas famílias de versão:
 *
 *   - 2026-07-28 (preferida): stateless, `server/discover`, sem `initialize`,
 *     versão/capas em `_meta`, `resultType` nas respostas e `ttlMs`/`cacheScope`
 *     em `tools/list`. Aceita (mas não exige) os headers Mcp-Method/Mcp-Name.
 *   - 2025-11-25 / 2025-06-18 / 2025-03-26 / 2024-11-05 (legadas): handshake
 *     `initialize` + `notifications/initialized`, sem `resultType`. São as
 *     versões usadas por clientes MCP padrão (Antigravity/Claude/Cursor), que
 *     não enviam headers customizados.
 *
 * O token NUNCA entra aqui: o transporte o mantém e injeta `secrets` para uma
 * passagem final de redação antes de qualquer texto sair do servidor.
 */
import {
  SERVER_INFO,
  SUPPORTED_VERSIONS,
  MODERN_VERSIONS,
  TOOLS,
  TOOLBOXES,
  TOOLS_BY_NAME,
} from "./catalog.mjs";

const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

const ERRO = Object.freeze({
  PARSE: -32700,
  METHOD: -32601,
  PARAMS: -32602,
  INTERNAL: -32603,
  HEADER: -32020,
  VERSION: -32022,
});

/** Projeta a ferramenta para o formato público: sem campos internos do catálogo. */
function definicaoPublica(tool) {
  return {
    name: tool.name,
    ...(tool.title ? { title: tool.title } : {}),
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
  };
}

/** Validador mínimo de JSON Schema cobrindo exatamente o que o catálogo usa. */
function validar(schema, valor, caminho = "arguments", erros = []) {
  if (!schema || typeof schema !== "object") return erros;

  if (Array.isArray(schema.enum) && !schema.enum.includes(valor)) {
    erros.push(`${caminho}: valor fora do enumerado`);
    return erros;
  }

  switch (schema.type) {
    case "object": {
      if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
        erros.push(`${caminho}: esperado objeto`);
        return erros;
      }
      const props = schema.properties ?? {};
      for (const req of schema.required ?? []) {
        if (!(req in valor)) erros.push(`${caminho}.${req}: obrigatório`);
      }
      if (schema.additionalProperties === false) {
        for (const chave of Object.keys(valor)) {
          if (!(chave in props)) erros.push(`${caminho}.${chave}: propriedade não permitida`);
        }
      }
      for (const [chave, sub] of Object.entries(props)) {
        if (chave in valor) validar(sub, valor[chave], `${caminho}.${chave}`, erros);
      }
      break;
    }
    case "array": {
      if (!Array.isArray(valor)) {
        erros.push(`${caminho}: esperado array`);
        return erros;
      }
      if (schema.maxItems != null && valor.length > schema.maxItems) {
        erros.push(`${caminho}: excede ${schema.maxItems} itens`);
      }
      if (schema.items) {
        valor.forEach((item, i) => validar(schema.items, item, `${caminho}[${i}]`, erros));
      }
      break;
    }
    case "string": {
      if (typeof valor !== "string") {
        erros.push(`${caminho}: esperado texto`);
        return erros;
      }
      if (schema.minLength != null && valor.length < schema.minLength) erros.push(`${caminho}: muito curto`);
      if (schema.maxLength != null && valor.length > schema.maxLength) erros.push(`${caminho}: muito longo`);
      if (schema.pattern && !new RegExp(schema.pattern).test(valor)) erros.push(`${caminho}: formato inválido`);
      break;
    }
    case "number": {
      if (typeof valor !== "number" || !Number.isFinite(valor)) {
        erros.push(`${caminho}: esperado número`);
        return erros;
      }
      if (schema.minimum != null && valor < schema.minimum) erros.push(`${caminho}: abaixo do mínimo`);
      if (schema.maximum != null && valor > schema.maximum) erros.push(`${caminho}: acima do máximo`);
      break;
    }
    case "integer": {
      if (!Number.isInteger(valor)) erros.push(`${caminho}: esperado inteiro`);
      break;
    }
    case "boolean": {
      if (typeof valor !== "boolean") erros.push(`${caminho}: esperado booleano`);
      break;
    }
    default:
      break;
  }
  return erros;
}

function textoSeguro(texto, secrets) {
  let out = String(texto);
  for (const s of secrets) {
    if (typeof s === "string" && s.length >= 6) out = out.split(s).join("***");
  }
  return out;
}

/** Redação profunda: cobre tanto `content` quanto `structuredContent`. */
function sanitizar(valor, secrets) {
  if (typeof valor === "string") return textoSeguro(valor, secrets);
  if (Array.isArray(valor)) return valor.map((v) => sanitizar(v, secrets));
  if (valor && typeof valor === "object") {
    const out = {};
    for (const [chave, v] of Object.entries(valor)) out[chave] = sanitizar(v, secrets);
    return out;
  }
  return valor;
}

/**
 * Cria o núcleo.
 * @param {object} opts
 * @param {object} opts.backend  Adaptador com `call(nome, argumentos): Promise<any>`.
 * @param {string} [opts.sessionId] ID público da sessão (não é segredo).
 * @param {string} [opts.transport] "stdio" | "http".
 * @param {string[]} [opts.secrets] Valores a redigir em qualquer texto de saída.
 */
export function createCore({ backend, sessionId = "sess-local", transport = "stdio", secrets = [] }) {
  if (!backend || typeof backend.call !== "function") {
    throw new TypeError("createCore exige backend.call(nome, argumentos)");
  }

  function versionDaMensagem(msg, ctx) {
    const meta = msg.params && typeof msg.params === "object" ? msg.params._meta : null;
    if (meta && typeof meta[META_VERSION] === "string") return meta[META_VERSION];
    if (msg.method === "initialize" && msg.params && typeof msg.params.protocolVersion === "string") {
      return msg.params.protocolVersion;
    }
    const h = ctx.headers ?? {};
    const doHeader = h["mcp-protocol-version"] ?? h["MCP-Protocol-Version"];
    return typeof doHeader === "string" && doHeader ? doHeader : SUPPORTED_VERSIONS[0];
  }

  function checarHeaders(msg, ctx, tr) {
    // Mcp-Method/Mcp-Name são extensões do protótipo 2026-07-28. Clientes MCP
    // padrão NÃO as enviam, então a ausência é permitida: validamos apenas
    // quando o cliente opta por enviá-las. Bearer e loopback continuam no Rust.
    if (tr !== "http" || !ctx.headers) return null;
    const h = ctx.headers;
    const method = h["mcp-method"] ?? h["Mcp-Method"];
    const name = h["mcp-name"] ?? h["Mcp-Name"];
    if (typeof method === "string" && method !== msg.method) {
      return { code: ERRO.HEADER, message: "HeaderMismatch: Mcp-Method não confere com o método" };
    }
    if (typeof name === "string" && !name.trim()) {
      return { code: ERRO.HEADER, message: "HeaderMismatch: Mcp-Name vazio" };
    }
    return null;
  }

  function respostaOk(id, version, conteudo) {
    const moderno = MODERN_VERSIONS.includes(version);
    const result = {
      ...(moderno ? { resultType: "complete" } : {}),
      ...conteudo,
      ...(moderno ? { _meta: { [META_SERVER_INFO]: SERVER_INFO } } : {}),
    };
    return { jsonrpc: "2.0", id, result };
  }

  function respostaErro(id, code, message) {
    return { jsonrpc: "2.0", id, error: { code, message: textoSeguro(message, secrets) } };
  }

  function resultadoFerramenta(id, version, dados, isError = false) {
    const limpo = sanitizar(dados, secrets);
    const texto = typeof limpo === "string" ? limpo : JSON.stringify(limpo, null, 2);
    return respostaOk(id, version, {
      content: [{ type: "text", text: texto }],
      ...(limpo !== undefined ? { structuredContent: limpo } : {}),
      isError,
    });
  }

  async function executarFerramenta(name, args, version, ctx) {
    const tool = TOOLS_BY_NAME.get(name);
    if (!tool) return respostaErro(ctx.id, ERRO.PARAMS, `Unknown tool: ${name}`);

    const erros = validar(tool.inputSchema, args);
    if (erros.length) {
      return resultadoFerramenta(ctx.id, version, { erro: "Validação falhou", detalhes: erros }, true);
    }

    try {
      if (tool.handler === "core") {
        if (name === "catalog_toolboxes") {
          return resultadoFerramenta(ctx.id, version, {
            toolboxes: TOOLBOXES.map((tb) => ({
              ...tb,
              ferramentas: TOOLS.filter((t) => t.toolbox === tb.id).map((t) => t.name),
            })),
            total_toolboxes: TOOLBOXES.length,
            total_ferramentas: TOOLS.length,
          });
        }
        // catalog_status: apenas metadados. Nunca token, caminhos ou segredos.
        return resultadoFerramenta(ctx.id, version, {
          ativo: true,
          transporte: ctx.transport,
          versao_negociada: version,
          versoes_suportadas: [...SUPPORTED_VERSIONS],
          id_sessao: sessionId,
          servidor: SERVER_INFO,
          total_ferramentas: TOOLS.length,
        });
      }

      const dados = await backend.call(name, args);
      if (dados && typeof dados === "object" && "__indisponivel" in dados) {
        return resultadoFerramenta(
          ctx.id,
          version,
          { erro: "Ferramenta indisponível neste backend", detalhes: dados.__indisponivel },
          true,
        );
      }
      return resultadoFerramenta(ctx.id, version, dados);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return resultadoFerramenta(ctx.id, version, { erro: "Falha ao executar ferramenta", detalhes: msg }, true);
    }
  }

  /** Trata uma mensagem JSON-RPC. Notificações (sem id) retornam `null`. */
  async function handle(msg, ctx = {}) {
    if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      return respostaErro(msg?.id ?? null, ERRO.PARAMS, "Mensagem JSON-RPC inválida");
    }

    // Notificações não têm versão negociada própria: são aceitas silenciosamente.
    // Alguns clientes MCP enviam `notifications/initialized` COM `id` (fora do
    // spec); antes isso caía no `default` e virava -32601 Method not found.
    // O reconhecimento pelo prefixo vem ANTES da validação de versão/headers.
    if (msg.method.startsWith("notifications/")) return null;

    const ehNotificacao = !("id" in msg);
    const tr = ctx.transport ?? transport;
    const id = msg.id ?? null;
    const ctxInterno = { ...ctx, id, transport: tr };

    if (ehNotificacao) return null;

    const version = versionDaMensagem(msg, ctxInterno);
    if (!SUPPORTED_VERSIONS.includes(version)) {
      return respostaErro(id, ERRO.VERSION, `UnsupportedProtocolVersion: ${version}`);
    }

    const problemaHeader = checarHeaders(msg, ctxInterno, tr);
    if (problemaHeader) return respostaErro(id, problemaHeader.code, problemaHeader.message);

    switch (msg.method) {
      case "server/discover":
        return respostaOk(id, version, {
          ...(MODERN_VERSIONS.includes(version) ? { resultType: "complete" } : {}),
          protocolVersions: [...SUPPORTED_VERSIONS],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        });

      case "initialize": {
        // Somente versões legadas usam este método.
        return respostaOk(id, version, {
          protocolVersion: version,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        });
      }

      case "tools/list":
        return respostaOk(id, version, {
          tools: TOOLS.map(definicaoPublica),
          nextCursor: null,
          ttlMs: 300000,
          cacheScope: "public",
        });

      case "tools/call": {
        const params = msg.params ?? {};
        if (typeof params.name !== "string") {
          return respostaErro(id, ERRO.PARAMS, "tools/call exige params.name");
        }
        const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
        return executarFerramenta(params.name, args, version, ctxInterno);
      }

      case "ping":
        // Removido em 2026-07-28; mantido só para clientes legados.
        if (MODERN_VERSIONS.includes(version)) {
          return respostaErro(id, ERRO.METHOD, `Method not found: ${msg.method}`);
        }
        return respostaOk(id, version, {});

      default:
        return respostaErro(id, ERRO.METHOD, `Method not found: ${msg.method}`);
    }
  }

  return {
    handle,
    listToolDefinitions: () => TOOLS.map(definicaoPublica),
    versoes: () => [...SUPPORTED_VERSIONS],
    codigosErro: { ...ERRO },
  };
}
