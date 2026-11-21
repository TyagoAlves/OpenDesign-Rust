//! Comandos Tauri expostos à webview. Nenhum deles imprime token.
//! `mcp_start` é a ÚNICA função que devolve o token, uma vez, para o campo
//! `env` do snippet; `mcp_status`/`mcp_take_request` nunca o devolvem.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tauri::{AppHandle, State};

use super::state::{McpRequestDto, McpStartResult, McpStatusResult, McpStatusValue};
use super::token;
use super::{http, McpTransport, SharedState};

#[tauri::command]
pub fn mcp_start(
  transport: String,
  _app: AppHandle,
  state: State<'_, SharedState>,
) -> Result<McpStartResult, String> {
  // stdio é in-process e nasce da linha de comando; não pode ser "ligado"
  // depois pela UI (isso exigiria reabrir stdin do processo já em execução).
  if transport != "http" {
    return Err("transporte_indisponivel".to_string());
  }

  {
    let g = state
      .0
      .lock()
      .map_err(|_| "estado_indisponivel".to_string())?;
    if g.active {
      return Err("servico_ja_ativo".to_string());
    }
  }

  // Falha fechada: sem CSPRNG não existe token, não existe serviço.
  let token_hex = token::random_hex(32).map_err(|_| "token_indisponivel".to_string())?;
  let sessao = token::random_hex(16).map_err(|_| "token_indisponivel".to_string())?;

  // Bind antes de mudar o estado: porta ocupada não pode deixar resíduo ativo.
  let listener = http::bind()?;
  let stop = Arc::new(AtomicBool::new(false));

  {
    let mut g = state
      .0
      .lock()
      .map_err(|_| "estado_indisponivel".to_string())?;
    if g.active {
      return Err("servico_ja_ativo".to_string());
    }
    g.active = true;
    g.transport = Some(McpTransport::Http);
    g.status = McpStatusValue::Waiting;
    g.session_id = Some(sessao.clone());
    g.token = Some(token_hex.clone());
    g.last_activity = None;
  }

  http::iniciar(listener, state.inner().clone(), token_hex.clone(), stop);

  let stdio_command = std::env::current_exe()
    .map(|p| p.to_string_lossy().into_owned())
    .unwrap_or_else(|_| "OpenDesign.exe".to_string());

  Ok(McpStartResult {
    token: token_hex,
    session_id: sessao,
    transport: McpTransport::Http,
    stdio_command,
    status: "waiting",
  })
}

#[tauri::command]
pub fn mcp_stop(state: State<'_, SharedState>) -> Result<(), String> {
  super::stop_all(state.inner());
  Ok(())
}

#[tauri::command]
pub fn mcp_status(state: State<'_, SharedState>) -> Result<McpStatusResult, String> {
  Ok(state.status_publico())
}

#[tauri::command]
pub fn mcp_take_request(state: State<'_, SharedState>) -> Result<Option<McpRequestDto>, String> {
  Ok(state.tirar_da_fila())
}

#[tauri::command]
pub fn mcp_respond(id: u64, response: String, state: State<'_, SharedState>) -> Result<(), String> {
  // A resposta já foi redigida pelo núcleo JS; nova redação em `http::atender`.
  let _ = state.responder(id, response);
  Ok(())
}

#[tauri::command]
pub fn mcp_is_stdio() -> Result<bool, String> {
  Ok(super::is_stdio_mode())
}
