/**
 * Adaptador de backend para desenvolvimento: fala com a API local do
 * OpenDesign via fetch em http://127.0.0.1:8787.
 *
 * D1 (decidida): este adaptador é SOMENTE para dev. No desktop o MCP usa
 * localApi() direto (ver backend-tauri.ts) — nunca este caminho HTTP.
 *
 * Segurança:
 *   - só aceita base URL http:// loopback (127.0.0.1 / localhost / ::1);
 *   - nunca reenvia o token MCP para a API — ele é segredo do transporte MCP;
 *   - timeout por chamada e respostas de erro com texto limitado;
 *   - exportações e operações nativas são recusadas aqui: elas dependem da
 *     bridge Tauri e só existem no adaptador desktop (Fase 2).
 */
import { createHash } from "node:crypto";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const TIMEOUT_MS = 8000;

function validarBase(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("OPENDESIGN_MCP_BASE_URL inválida");
  }
  if (parsed.protocol !== "http:" || !LOOPBACK.has(parsed.hostname)) {
    throw new Error("Backend permitido somente em http://127.0.0.1 (loopback)");
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error("Backend não aceita credenciais/fragmento na URL");
  }
  return parsed;
}

/** Mapa tool -> rota da API já existente em src/server/index.ts. */
function rota(name, args) {
  const id = args.id ? `/${encodeURIComponent(args.id)}` : "";
  switch (name) {
    case "projeto_listar":
      return { method: "GET", path: "/api/designs" };
    case "projeto_abrir":
      return { method: "GET", path: `/api/designs${id}` };
    case "projeto_salvar":
      return args.id
        ? { method: "PUT", path: `/api/designs${id}`, body: args }
        : { method: "POST", path: "/api/designs", body: args };
    case "templates_listar":
      return { method: "GET", path: "/api/templates" };
    case "templates_campos":
      return { method: "GET", path: `/api/designs${id}/fields` };
    case "templates_preencher":
      return {
        method: "POST",
        path: `/api/designs${id}/fill`,
        // save:true cria um design novo e nunca sobrescreve o template de origem.
        body: { values: args.values, save: true, ...(args.name ? { name: args.name } : {}) },
      };
    case "brand_kits_listar":
      return { method: "GET", path: "/api/brand-kits" };
    case "brand_kits_criar":
      return { method: "POST", path: "/api/brand-kits", body: args };
    case "brand_kits_atualizar":
      return { method: "PUT", path: `/api/brand-kits${id}`, body: args };
    case "snapshot_ler":
      return { method: "GET", path: `/api/designs${id}` };
    default:
      return null;
  }
}

function indisponivel(motivo) {
  return { __indisponivel: motivo };
}

/**
 * @param {object} [opts]
 * @param {string} [opts.baseUrl]
 * @param {typeof fetch} [opts.fetchImpl] Permite injetar stub no smoke.
 */
export function createDevHttpBackend({ baseUrl = "http://127.0.0.1:8787", fetchImpl } = {}) {
  const base = validarBase(baseUrl);
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") throw new TypeError("fetch indisponível neste runtime");

  async function request(method, path, body) {
    const url = new URL(path, base);
    const init = {
      method,
      headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      init.signal = AbortSignal.timeout(TIMEOUT_MS);
    }

    const res = await doFetch(url.toString(), init);
    const raw = await res.text();
    if (!res.ok) {
      // Corta mensagens longas para não devolver conteúdo arbitrário ao modelo.
      const detalhe = raw.replace(/\s+/g, " ").slice(0, 300);
      throw new Error(`API local respondeu ${res.status}: ${detalhe}`);
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("API local devolveu JSON inválido");
    }
  }

  async function call(name, args = {}) {
    if (name === "export_salvar_png" || name === "export_salvar_pdf") {
      return indisponivel("export_* exige a bridge Tauri: use o adaptador desktop (Fase 2)");
    }
    if (name === "projeto_salvar_nativo") {
      return indisponivel("projeto_salvar_nativo exige a bridge Tauri (Fase 2)");
    }
    if (name === "snapshot_ler" && args.origem === "nativo") {
      return indisponivel("snapshot origem='nativo' exige a bridge Tauri (Fase 2)");
    }

    const r = rota(name, args);
    if (!r) throw new Error(`Ferramenta desconhecida no backend HTTP: ${name}`);
    const dados = await request(r.method, r.path, r.body);

    // snapshot_ler devolve só metadados + amostra curta, nunca o canvas inteiro.
    if (name === "snapshot_ler") {
      const limite = Math.max(0, Math.min(20000, Number(args.max_amostra ?? 2000)));
      const canvas = typeof dados?.canvas_json === "string" ? dados.canvas_json : "";
      // offset é consumível: o chamador repete o proximo_offset devolvido.
      const offset = Number.isFinite(args.offset) ? Math.max(0, Math.floor(args.offset)) : 0;
      const fim = offset + limite;
      return {
        id: dados?.id,
        name: dados?.name,
        width: dados?.width,
        height: dados?.height,
        pages: Array.isArray(dados?.pages) ? dados.pages.length : 0,
        origem: "local",
        amostra: canvas.slice(offset, fim),
        total_caracteres: canvas.length,
        sha256_canvas: createHash("sha256").update(canvas).digest("hex"),
        limite,
        offset,
        proximo_offset: fim < canvas.length ? fim : null,
        truncado: fim < canvas.length,
      };
    }
    return dados;
  }

  return { call, baseUrl: base.toString(), kind: "dev-http" };
}
