//! MCP local do OpenDesign — transporte e token (Gate 2).
//!
//! O protocolo (catálogo, versões, schemas, redação) vive no núcleo JS em
//! `src/client/mcp/mcp-core.mjs`. Aqui só existe: bind loopback, token por
//! sessão, fila de pedidos e a ponte IPC com a webview. Isso garante paridade
//! stdio ↔ HTTP e evita duplicar regras de protocolo em Rust.
//!
//! Segurança:
//!   - HTTP escuta SOMENTE em 127.0.0.1:8788, sem fallback.
//!   - stdio é in-process (mesmo webview), ZERO socket — nem cliente.
//!   - token gerado por CSPRNG do SO, entregue uma única vez ao frontend,
//!     nunca em argv/URL/log/stdout; redigido na saída por defesa em profundidade.
//!   - ao sair, listener/stdin/token/fila são descartados (RunEvent::Exit).

pub mod commands;
pub mod http;
pub mod state;
pub mod stdio;
pub mod token;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub const HOST: &str = "127.0.0.1";
pub const PORT: u16 = 8788;
pub const PATH: &str = "/mcp";
pub const MAX_BODY: usize = 40 * 1024 * 1024;
pub const RESPONSE_TIMEOUT_SECS: u64 = 8;
pub const STDIO_TIMEOUT_SECS: u64 = 30;

/// Modo stdio é decidido na linha de comando (`--transport stdio`) antes do
/// Tauri subir. Static simples: uma única decisão por processo, nunca escrita
/// depois do bootstrap.
static STDIO_MODE: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpTransport {
  Stdio,
  Http,
}

impl McpTransport {
  pub fn as_str(self) -> &'static str {
    match self {
      McpTransport::Stdio => "stdio",
      McpTransport::Http => "http",
    }
  }
}

pub fn set_stdio_mode(value: bool) {
  STDIO_MODE.store(value, Ordering::SeqCst);
}

pub fn is_stdio_mode() -> bool {
  STDIO_MODE.load(Ordering::SeqCst)
}

pub type SharedState = Arc<state::McpState>;

pub fn new_shared() -> SharedState {
  Arc::new(state::McpState::new())
}

/// Chamado no `.setup()` do Tauri quando o app nasceu com `--transport stdio`.
/// Inicializa o estado como ativo e começa a ler stdin; a webview (oculta)
/// continua carregando o mesmo núcleo/backend do modo HTTP.
pub fn bootstrap_stdio(app: tauri::AppHandle, shared: SharedState) {
  if !is_stdio_mode() {
    return;
  }
  match token::token_do_ambiente() {
    Ok(tok) => {
      let sessao = token::random_hex(16).unwrap_or_else(|_| "sess-local".to_string());
      {
        let mut g = shared.0.lock().expect("mcp state poisoned");
        g.active = true;
        g.transport = Some(McpTransport::Stdio);
        g.status = state::McpStatusValue::Waiting;
        g.session_id = Some(sessao);
        g.token = Some(tok);
        g.last_activity = None;
      }
      stdio::iniciar(app, shared);
    }
    Err(msg) => {
      // Nunca escrever token; só diagnóstico no stderr.
      eprintln!("MCP bloqueado: {}", msg);
      std::process::exit(3);
    }
  }
}

/// Revoga token, fecha listener/stdin e drena pedidos pendentes. Idempotente.
pub fn stop_all(shared: &SharedState) {
  let (stop_http, stop_stdio, pendentes) = {
    let mut g = shared.0.lock().expect("mcp state poisoned");
    let http = g.stop_http.take();
    let io = g.stop_stdio.take();
    let pend: Vec<_> = g.pending.drain().map(|(_, tx)| tx).collect();
    g.queue.clear();
    g.active = false;
    g.transport = None;
    g.status = state::McpStatusValue::Off;
    g.session_id = None;
    g.token = None;
    g.last_activity = None;
    (http, io, pend)
  };
  if let Some(flag) = stop_http {
    flag.store(true, Ordering::SeqCst);
  }
  if let Some(flag) = stop_stdio {
    flag.store(true, Ordering::SeqCst);
  }
  drop(pendentes);
}

pub use token::redigir;
