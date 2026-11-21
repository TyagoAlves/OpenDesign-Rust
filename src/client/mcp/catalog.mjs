/**
 * Catálogo V1 do MCP local do OpenDesign.
 *
 * Implementação própria: somente o protocolo MCP público (2026-07-28 com
 * compatibilidade legada) e a API já existente do OpenDesign. Nenhum código,
 * texto, nome de arquivo ou string de terceiros foi copiado — ver
 * docs/mcp-planejamento.md.
 */

export const SERVER_INFO = Object.freeze({ name: "opendesign-local", version: "0.1.0-prototype" });

/** Versões que o núcleo entende. A primeira é a preferida (moderna). */
export const SUPPORTED_VERSIONS = Object.freeze([
  "2026-07-28",
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
]);
export const MODERN_VERSIONS = Object.freeze(["2026-07-28"]);

export const TOOLBOXES = Object.freeze([
  { id: "catalog", titulo: "Catálogo", descricao: "Descoberta de caixas e estado do servidor." },
  { id: "projeto", titulo: "Projeto", descricao: "Listar, abrir e salvar designs na API local." },
  { id: "templates_fields", titulo: "Templates e campos", descricao: "Listar templates/campos e preencher com save." },
  { id: "brand_kits", titulo: "Brand kits", descricao: "Listar, criar e atualizar kits de marca." },
  { id: "export", titulo: "Export", descricao: "Salvar PNG/PDF já gerados pelo editor (somente bridge Tauri)." },
  { id: "snapshot", titulo: "Snapshot", descricao: "Leitura limitada do snapshot de um design." },
]);

const ID = { type: "string", pattern: "^[A-Za-z0-9_-]{1,80}$", minLength: 1, maxLength: 80 };
const VALORES = { type: "object", additionalProperties: true, description: "Mapa campo → texto ou número." };

/** Ordem determinística: clientes e cache dependem dela. */
export const TOOLS = Object.freeze([
  {
    name: "catalog_toolboxes",
    toolbox: "catalog",
    handler: "core",
    title: "Listar caixas de ferramentas",
    description: "Lista as caixas V1 e suas ferramentas. Não expõe token nem caminhos de arquivo.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "catalog_status",
    toolbox: "catalog",
    handler: "core",
    title: "Estado do servidor",
    description: "Informa se o acesso está ativo, transporte, versão e ID público da sessão. Nunca devolve o token.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "projeto_listar",
    toolbox: "projeto",
    handler: "backend",
    title: "Listar designs",
    description: "Lista designs do banco local SQLite (GET /api/designs), ordenados por atualização.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "projeto_abrir",
    toolbox: "projeto",
    handler: "backend",
    title: "Abrir design",
    description: "Abre um design e suas páginas (GET /api/designs/{id}).",
    inputSchema: { type: "object", properties: { id: ID }, required: ["id"], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "projeto_salvar",
    toolbox: "projeto",
    handler: "backend",
    title: "Salvar design",
    description: "Com id, atualiza (PUT /api/designs/{id}); sem id, cria (POST /api/designs).",
    inputSchema: {
      type: "object",
      properties: {
        id: ID,
        name: { type: "string", minLength: 1, maxLength: 120 },
        canvas_json: { type: "string", maxLength: 40_000_000 },
        width: { type: "number", minimum: 1, maximum: 20000 },
        height: { type: "number", minimum: 1, maximum: 20000 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "projeto_salvar_nativo",
    toolbox: "projeto",
    handler: "backend",
    title: "Salvar design em arquivo nativo",
    description: "Grava via bridge Tauri (save_design). Indisponível no protótipo HTTP; exige adaptador na Fase 2.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        snapshot: { type: "object", additionalProperties: true, description: "DesignSnapshot (schema:1)." },
        id: ID,
      },
      required: ["name", "snapshot"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "templates_listar",
    toolbox: "templates_fields",
    handler: "backend",
    title: "Listar templates",
    description: "Lista os templates iniciais (GET /api/templates).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "templates_campos",
    toolbox: "templates_fields",
    handler: "backend",
    title: "Listar campos de um design",
    description: "Lê os campos nomeados de um design (GET /api/designs/{id}/fields).",
    inputSchema: { type: "object", properties: { id: ID }, required: ["id"], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "templates_preencher",
    toolbox: "templates_fields",
    handler: "backend",
    title: "Preencher campos e salvar",
    description: "POST /api/designs/{id}/fill. Exige save:true (único valor aceito): cria um novo design preenchido; nunca sobrescreve a origem.",
    inputSchema: {
      type: "object",
      properties: {
        id: ID,
        values: VALORES,
        save: { type: "boolean", enum: [true] },
        name: { type: "string", minLength: 1, maxLength: 120 },
      },
      required: ["id", "values", "save"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "brand_kits_listar",
    toolbox: "brand_kits",
    handler: "backend",
    title: "Listar brand kits",
    description: "Lista os kits de marca (GET /api/brand-kits).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "brand_kits_criar",
    toolbox: "brand_kits",
    handler: "backend",
    title: "Criar brand kit",
    description: "Cria um kit (POST /api/brand-kits) com nome, cores e fontes.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 80 },
        colors: { type: "array", items: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, maxItems: 24 },
        heading_font: { type: "string", maxLength: 60 },
        body_font: { type: "string", maxLength: 60 },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "brand_kits_atualizar",
    toolbox: "brand_kits",
    handler: "backend",
    title: "Atualizar brand kit",
    description: "Atualiza um kit existente (PUT /api/brand-kits/{id}).",
    inputSchema: {
      type: "object",
      properties: {
        id: ID,
        name: { type: "string", minLength: 1, maxLength: 80 },
        colors: { type: "array", items: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, maxItems: 24 },
        heading_font: { type: "string", maxLength: 60 },
        body_font: { type: "string", maxLength: 60 },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "snapshot_ler",
    toolbox: "snapshot",
    handler: "backend",
    title: "Ler snapshot (limitado)",
    description: "Lê metadados e uma amostra curta do canvas, sem devolver o JSON inteiro. Para continuar, envie offset com o proximo_offset devolvido. origem 'nativo' exige a bridge Tauri.",
    inputSchema: {
      type: "object",
      properties: {
        id: ID,
        origem: { type: "string", enum: ["local", "nativo"] },
        max_amostra: { type: "number", minimum: 0, maximum: 20000 },
        offset: { type: "number", minimum: 0, maximum: 1_000_000 },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "export_salvar_png",
    toolbox: "export",
    handler: "backend",
    title: "Salvar PNG gerado",
    description: "Salva um data URL PNG já produzido pelo editor via bridge Tauri. Somente no adaptador desktop, com consentimento na UI.",
    inputSchema: {
      type: "object",
      properties: {
        data_url: { type: "string", pattern: "^data:image/png;base64,[A-Za-z0-9+/=]+$", maxLength: 35_000_000 },
        filename: { type: "string", pattern: "^[A-Za-z0-9._-]{1,120}$" },
      },
      required: ["data_url", "filename"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "export_salvar_pdf",
    toolbox: "export",
    handler: "backend",
    title: "Salvar PDF gerado",
    description: "Salva um data URL PDF já produzido pelo editor via bridge Tauri. Mesmas restrições do PNG.",
    inputSchema: {
      type: "object",
      properties: {
        data_url: { type: "string", pattern: "^data:application/(pdf|octet-stream);base64,[A-Za-z0-9+/=]+$", maxLength: 35_000_000 },
        filename: { type: "string", pattern: "^[A-Za-z0-9._-]{1,120}$" },
      },
      required: ["data_url", "filename"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
]);

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
