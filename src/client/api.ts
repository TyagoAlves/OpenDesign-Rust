import { handles, installLocalAssetFetch, isTauri, localApi } from "./lib/local-db";

// Fontes e uploads são chamados por fetch() direto em vários componentes; no
// desktop esses fetchs precisam ser respondidos localmente.
if (isTauri()) installLocalAssetFetch();

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  // No desktop, todos os dados (incluindo fontes e uploads) ficam no SQLite local.
  if (isTauri() && handles(path)) return localApi<T>(method, path, body);

  const opts: RequestInit = { method, headers: {} };
  if (body) {
    (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Falha na requisição");
  return data as T;
}
