/**
 * Smoke do protótipo MCP local do OpenDesign — somente Node built-ins.
 *
 * Não sobe servidor, não grava arquivos, não fala com a API real: usa backend
 * em memória + fetch stub. Rode com:
 *   node .mcp-prototype/smoke.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createCore } from "./mcp-core.mjs";
import { createDevHttpBackend } from "./backend-dev-http.mjs";
import { TOOLS, SERVER_INFO } from "./catalog.mjs";
import { tokenValido } from "./server-http.mjs";

let passou = 0;
const falhas = [];

async function testar(nome, fn) {
  try {
    await fn();
    passou++;
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const chamadas = [];
const fakeBackend = {
  kind: "fake",
  async call(name, args) {
    chamadas.push({ name, args });
    switch (name) {
      case "projeto_listar":
        return [{ id: "d1", name: "Design 1" }];
      case "templates_preencher":
        return { design: { id: "d2", name: "Novo" }, filled: ["titulo"], unmatched: [], save: true };
      case "snapshot_ler":
        return { id: args.id, canvas_json: "x".repeat(5000) };
      case "templates_listar": // usado no teste de sanitização de erro
        throw new Error("boom TOKEN_SUPER_SECRETO");
      default:
        return { ok: true, name };
    }
  },
};

const core = createCore({
  backend: fakeBackend,
  sessionId: "sess-smoke",
  transport: "http",
  secrets: ["TOKEN_SUPER_SECRETO"],
});

const moderno = (method, params = {}) => ({
  jsonrpc: "2.0",
  id: 1,
  method,
  params: { ...params, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } },
});
const ctxHttp = (method) => ({
  transport: "http",
  headers: { "mcp-method": method, "mcp-name": "smoke-client", "mcp-protocol-version": "2026-07-28" },
});

await testar("server/discover (2026-07-28) anuncia versões e capacidades", async () => {
  const r = await core.handle(moderno("server/discover"), ctxHttp("server/discover"));
  assert.equal(r.error, undefined);
  assert.equal(r.result.resultType, "complete");
  assert.equal(r.result.protocolVersions[0], "2026-07-28");
  assert.ok(r.result.capabilities.tools);
  assert.equal(r.result.serverInfo.name, SERVER_INFO.name);
  assert.equal(r.result._meta["io.modelcontextprotocol/serverInfo"].name, SERVER_INFO.name);
});

await testar("initialize legado não usa resultType e devolve versão pedida", async () => {
  const r = await core.handle(
    { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    { transport: "stdio" },
  );
  assert.equal(r.result.protocolVersion, "2025-06-18");
  assert.equal(r.result.resultType, undefined);
});

await testar("tools/list tem 15 ferramentas, ordem estável e cache moderno", async () => {
  const a = await core.handle(moderno("tools/list"), ctxHttp("tools/list"));
  const b = await core.handle(moderno("tools/list"), ctxHttp("tools/list"));
  assert.equal(a.result.tools.length, 15);
  assert.equal(a.result.ttlMs, 300000);
  assert.equal(a.result.cacheScope, "public");
  assert.deepEqual(a.result.tools.map((t) => t.name), b.result.tools.map((t) => t.name));
  assert.deepEqual(a.result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
  assert.ok(a.result.tools.every((t) => !("handler" in t) && !("toolbox" in t)));
});

await testar("catalog_toolboxes lista 6 caixas com suas ferramentas", async () => {
  const r = await core.handle(moderno("tools/call", { name: "catalog_toolboxes", arguments: {} }), ctxHttp("tools/call"));
  const dados = r.result.structuredContent;
  assert.equal(dados.total_toolboxes, 6);
  assert.equal(dados.total_ferramentas, 15);
  assert.ok(dados.toolboxes.every((tb) => Array.isArray(tb.ferramentas) && tb.ferramentas.length));
});

await testar("catalog_status não expõe token nem caminhos", async () => {
  const r = await core.handle(moderno("tools/call", { name: "catalog_status", arguments: {} }), ctxHttp("tools/call"));
  const texto = JSON.stringify(r);
  assert.ok(!texto.includes("TOKEN_SUPER_SECRETO"));
  assert.equal(r.result.structuredContent.id_sessao, "sess-smoke");
  assert.equal(r.result.structuredContent.ativo, true);
});

await testar("tools/call de backend rusga o adaptador correto", async () => {
  const r = await core.handle(moderno("tools/call", { name: "projeto_listar", arguments: {} }), ctxHttp("tools/call"));
  assert.equal(r.result.isError, false);
  assert.equal(r.result.structuredContent[0].id, "d1");
  assert.equal(chamadas.at(-1).name, "projeto_listar");
});

await testar("templates_preencher usa save:true no adaptador", async () => {
  const be = criarBackendStub();
  await be.call("templates_preencher", { id: "d1", values: { titulo: "Oi" } });
  const corpo = JSON.parse(be.ultimo.init.body);
  assert.equal(corpo.save, true);
  assert.deepEqual(corpo.values, { titulo: "Oi" });
});

await testar("ferramenta desconhecida é erro JSON-RPC -32602", async () => {
  const r = await core.handle(moderno("tools/call", { name: "inexistente", arguments: {} }), ctxHttp("tools/call"));
  assert.equal(r.error.code, -32602);
});

await testar("argumento obrigatório ausente vira isError (não erro de protocolo)", async () => {
  const r = await core.handle(moderno("tools/call", { name: "projeto_abrir", arguments: {} }), ctxHttp("tools/call"));
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /obrigatório/);
});

await testar("erro do backend é sanitizado e marked isError", async () => {
  const r = await core.handle(moderno("tools/call", { name: "templates_listar", arguments: {} }), ctxHttp("tools/call"));
  assert.equal(r.result.isError, true);
  assert.ok(!JSON.stringify(r).includes("TOKEN_SUPER_SECRETO"));
});

await testar("HeaderMismatch e versão não suportada são rejeitados", async () => {
  const ruim = await core.handle(moderno("tools/list"), {
    transport: "http",
    headers: { "mcp-method": "tools/call", "mcp-name": "smoke" },
  });
  assert.equal(ruim.error.code, -32020);
  const versao = await core.handle(
    {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/list",
      params: { _meta: { "io.modelcontextprotocol/protocolVersion": "1999-01-01" } },
    },
    ctxHttp("tools/list"),
  );
  assert.equal(versao.error.code, -32022);
});

await testar("notificação não gera resposta", async () => {
  const r = await core.handle({ jsonrpc: "2.0", method: "notifications/initialized" }, { transport: "stdio" });
  assert.equal(r, null);
});

await testar("backend HTTP aceita apenas loopback", async () => {
  assert.throws(() => createDevHttpBackend({ baseUrl: "http://0.0.0.0:8787" }), /loopback/);
  assert.throws(() => createDevHttpBackend({ baseUrl: "https://127.0.0.1:8787" }), /loopback/);
  const be = createDevHttpBackend({ baseUrl: "http://127.0.0.1:8787" });
  assert.equal(be.kind, "dev-http");
});

await testar("backend HTTP mapeia rotas e limita amostra de snapshot", async () => {
  const be = criarBackendStub();
  await be.call("projeto_abrir", { id: "d1" });
  assert.equal(be.ultimo.url, "http://127.0.0.1:8787/api/designs/d1");
  const snap = await be.call("snapshot_ler", { id: "d1", max_amostra: 10 });
  assert.equal(snap.amostra.length, 10);
  assert.equal(snap.truncado, true);
  // O cursor devolvido precisa ser consumível na chamada seguinte.
  const pagina2 = await be.call("snapshot_ler", { id: "d1", max_amostra: 10, offset: 10 });
  assert.equal(pagina2.offset, 10);
  assert.equal(pagina2.proximo_offset, 20);
  assert.equal(pagina2.amostra.length, 10);
});

await testar("backend HTTP recusa export/nativo com __indisponivel", async () => {
  const be = criarBackendStub();
  const a = await be.call("export_salvar_png", { data_url: "data:image/png;base64,AA==", filename: "a.png" });
  const b = await be.call("projeto_salvar_nativo", { name: "x", snapshot: {} });
  assert.ok(a.__indisponivel && b.__indisponivel);
});

await testar("token HTTP é comparado em tempo constante", () => {
  assert.equal(tokenValido("segredo-longo-o-suficiente", "segredo-longo-o-suficiente"), true);
  assert.equal(tokenValido("segredo-longo-o-suficiente!", "segredo-longo-o-suficiente"), false);
  assert.equal(tokenValido(undefined, "segredo-longo-o-suficiente"), false);
});

// Fixture de canvas com conteúdo real (não "x" repetido): o mesmo objeto
// alimenta a resposta e a evidência, para que total e hash sejam conferíveis.
const CANVAS_FIXTURE = JSON.stringify(
  {
    id: "d1",
    name: "Design 1",
    width: 1080,
    height: 1080,
    pages: [{ id: "p1", objetos: 128, fundo: "#ffffff" }],
    camadas: Array.from({ length: 60 }, (_, i) => ({
      id: `camada-${String(i).padStart(2, "0")}`,
      tipo: i % 2 === 0 ? "texto" : "retangulo",
      visivel: true,
    })),
    versao: 3,
  },
  null,
  2,
);
const HASH_CANVAS = createHash("sha256").update(CANVAS_FIXTURE).digest("hex");

// Cinco saídas fixas, uma ferramenta por caixa não-catálogo (a 6ª caixa é a
// própria tabela). Envelope único: caixa, tool, entrada, resposta, evidencia.
const coreEco = createCore({ backend: criarBackendEco(), sessionId: "sess-smoke", transport: "http" });
const coreDesktop = createCore({
  backend: criarBackendDesktopStub(),
  sessionId: "sess-smoke",
  transport: "stdio",
});
const AMOSTRAS = [
  {
    caixa: "projeto",
    tool: "projeto_listar",
    args: {},
    core: coreEco,
    evidencia: { rota: "GET /api/designs", itens: 2 },
  },
  {
    caixa: "templates_fields",
    tool: "templates_preencher",
    args: { id: "d1", values: { titulo: "Oi" }, save: true },
    core: coreEco,
    evidencia: {
      rota: "POST /api/designs/d1/fill",
      save_declarado_e_forcado: true,
      semantica: "cria d3 a partir de d1; d1 nao e alterado",
      origem_inalterada: true,
      novo_id: "d3",
    },
  },
  {
    caixa: "brand_kits",
    tool: "brand_kits_criar",
    args: { name: "Kit A", colors: ["#112233"] },
    core: coreEco,
    evidencia: { rota: "POST /api/brand-kits", kit_id: "bk1" },
  },
  {
    caixa: "export",
    tool: "export_salvar_png",
    args: {
      data_url:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
      filename: "post.png",
    },
    core: coreDesktop,
    evidencia: {
      adaptador: "desktop",
      confirmacao_por_arquivo: true,
      data_url_fornecido_pelo_chamador: true,
      arquivo_gravado: "post.png",
      ordem: ["confirmacao", "gravacao"],
      bytes_conferidos: true,
    },
  },
  {
    caixa: "snapshot",
    tool: "snapshot_ler",
    // Começa do início para cobrir a faixa 0-11; o teste do smoke também
    // prova que um offset não padrão é consumível na chamada seguinte.
    args: { id: "d1", max_amostra: 12, offset: 0 },
    core: coreEco,
    evidencia: {
      rota: "GET /api/designs/d1",
      limite: 12,
      total_caracteres: CANVAS_FIXTURE.length,
      sha256_canvas: HASH_CANVAS,
      offset_entrada: 0,
      proximo_offset: 12,
      continuacao: { offset: 12 },
    },
  },
];
for (const [i, amostra] of AMOSTRAS.entries()) {
  const r = await amostra.core.handle(
    moderno("tools/call", { name: amostra.tool, arguments: amostra.args }),
    ctxHttp("tools/call"),
  );
  const corpo = r.error ?? r.result?.structuredContent ?? r.result?.content?.[0]?.text;
  process.stdout.write(
    `AMOSTRA ${i + 1}/5 ` +
      JSON.stringify({
        caixa: amostra.caixa,
        tool: amostra.tool,
        entrada: amostra.args,
        resposta: corpo,
        evidencia: amostra.evidencia,
      }) +
      "\n",
  );
}

function criarBackendEco() {
  const fetchStub = async (url, init) => {
    const caminho = new URL(url).pathname;
    let dados;
    if (init.method === "GET" && caminho === "/api/designs") {
      dados = [
        { id: "d1", name: "Design 1" },
        { id: "d2", name: "Design 2" },
      ];
    } else if (init.method === "POST" && /^\/api\/designs\/[^/]+\/fill$/.test(caminho)) {
      const origem = caminho.split("/")[3];
      // Sem flag `save` ambíguo: alvo e semântica ficam explícitos.
      dados = {
        id: "d3",
        name: `Novo a partir de ${origem}`,
        origem,
        operacao: "criar_novo_a_partir_de",
        destino: "novo_design",
        destino_id: "d3",
        criado: true,
        preenchidos: ["titulo"],
        nao_encontrados: [],
        origem_inalterada: true,
      };
    } else if (init.method === "POST" && caminho === "/api/brand-kits") {
      const corpo = JSON.parse(init.body);
      dados = {
        id: "bk1",
        name: corpo.name,
        colors: corpo.colors,
        heading_font: null,
        body_font: null,
      };
    } else if (init.method === "GET" && /^\/api\/designs\/[^/]+$/.test(caminho)) {
      dados = {
        id: "d1",
        name: "Design 1",
        width: 1080,
        height: 1080,
        pages: [{ id: "p1" }],
        canvas_json: CANVAS_FIXTURE,
      };
    } else {
      dados = { ok: true, metodo: init.method, caminho };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(dados) };
  };
  return createDevHttpBackend({ baseUrl: "http://127.0.0.1:8787", fetchImpl: fetchStub });
}

function criarBackendDesktopStub() {
  return {
    kind: "fake-desktop",
    async call(name, args = {}) {
      if (name !== "export_salvar_png" && name !== "export_salvar_pdf") {
        throw new Error(`Ferramenta desconhecida no backend desktop de teste: ${name}`);
      }
      const ehPng = name === "export_salvar_png";
      const prefixo = ehPng ? "data:image/png;base64," : "data:application/pdf;base64,";
      if (typeof args.data_url !== "string" || !args.data_url.startsWith(prefixo)) {
        throw new Error(`data_url não é um ${ehPng ? "PNG" : "PDF"} válido`);
      }
      const base64 = args.data_url.slice(prefixo.length);
      const bytes = Buffer.from(base64, "base64");
      const assinatura = ehPng ? [137, 80, 78, 71, 13, 10, 26, 10] : [37, 80, 68, 70, 45];
      if (!assinatura.every((b, i) => bytes[i] === b)) {
        throw new Error(`assinatura de ${ehPng ? "PNG" : "PDF"} inválida`);
      }
      // Conta auditável: (caracteres/4)*3 - preenchimento == bytes decodificados.
      const preenchimento = (base64.match(/=+$/) ?? [""])[0].length;
      const dimensoes = ehPng ? `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}` : "n/a";
      const validacao = {
        base64_caracteres: base64.length,
        preenchimento_base64: preenchimento,
        bytes_decodificados: bytes.length,
        assinatura: bytes.subarray(0, assinatura.length).toString("hex"),
        dimensoes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
      // Confirmação por arquivo acontece antes da gravação (ordem auditável).
      const confirmacao = {
        tipo: ehPng ? "salvar_png_ja_gerado" : "salvar_pdf_ja_gerado",
        arquivo: args.filename,
        por_arquivo: true,
        lembrar_nesta_sessao: false,
        obtida_antes_da_gravacao: true,
        sequencia: 1,
      };
      return {
        confirmacao,
        gravacao: { arquivo: args.filename, bytes: bytes.length, sequencia: 2 },
        validacao,
        // AC-21: a tool só grava o data URL recebido; não renderiza nem
        // reivindica o design 1080x1080 como origem deste blob 1x1.
        semantica: {
          renderiza_design: false,
          data_url_fornecido_pelo_chamador: true,
          design_de_origem: null,
          finalidade: "pass-through do blob gerado pelo editor",
        },
        data_url_recebido: true,
      };
    },
  };
}

function criarBackendStub() {
  const estado = { ultimo: null };
  const fetchStub = async (url, init) => {
    estado.ultimo = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "d1", name: "Design 1", canvas_json: "x".repeat(5000) }),
    };
  };
  const be = createDevHttpBackend({ baseUrl: "http://127.0.0.1:8787", fetchImpl: fetchStub });
  Object.defineProperty(be, "ultimo", { get: () => estado.ultimo });
  return be;
}

const total = passou + falhas.length;
if (falhas.length) {
  process.stderr.write(`SMOKE FALHOU — ${passou}/${total}\n` + falhas.map((f) => ` - ${f}`).join("\n") + "\n");
  process.exit(1);
}
process.stdout.write(`SMOKE OK — ${passou}/${total}\n`);
