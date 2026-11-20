export function isTauri(): boolean {
  return typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined";
}

export async function invokeTauri<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<T> } }).__TAURI_INTERNALS__;
  if (internals && typeof internals.invoke === "function") {
    return internals.invoke(cmd, args);
  }
  return undefined;
}

let readySent = false;

/** Sinaliza ao shell Tauri que a UI está pronta (fecha splash respeitando tempo mínimo). No-op fora do Tauri. */
export async function signalAppReady(): Promise<void> {
  if (readySent || !isTauri()) return;
  readySent = true;
  try {
    await invokeTauri("app_ready");
  } catch {
    // Falha silenciosa: o fallback de timeout no Rust garante fechamento do splash.
  }
}
