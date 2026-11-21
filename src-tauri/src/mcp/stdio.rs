//! stdio in-process: o próprio app Tauri lê stdin e usa o mesmo núcleo/backend
//! do HTTP via IPC com a webview (janela oculta). NENHUM socket é aberto —
//! nem de escuta, nem cliente. stdout contém somente JSON-RPC por linha.

use std::collections::HashMap;
use std::io::{self, BufRead, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::Duration;

use super::token::redigir;
use super::{McpTransport, SharedState, STDIO_TIMEOUT_SECS};

/// Chamado uma vez no bootstrap quando o processo nasceu com `--transport stdio`.
pub fn iniciar(app: tauri::AppHandle, shared: SharedState) {
  let stop = Arc::new(AtomicBool::new(false));
  shared.registrar_stop_stdio(stop.clone());
  let estado = shared.clone();

  std::thread::spawn(move || {
    let stdin = io::stdin();
    let mut entrada = stdin.lock();
    loop {
      if stop.load(Ordering::SeqCst) {
        break;
      }
      let mut linha = String::new();
      match entrada.read_line(&mut linha) {
        Ok(0) => break, // EOF do cliente: encerra limpo, sem órfão.
        Ok(_) => {}
        Err(_) => break,
      }
      if linha.trim().is_empty() {
        continue;
      }

      let mensagem: serde_json::Value = match serde_json::from_str(linha.trim()) {
        Ok(v) => v,
        Err(_) => {
          escrever(
            &serde_json::json!({
              "jsonrpc": "2.0",
              "id": null,
              "error": { "code": -32700, "message": "Parse error" }
            })
            .to_string(),
            estado.token_atual().as_deref(),
          );
          continue;
        }
      };

      let (tx, rx) = mpsc::channel();
      let token = estado.token_atual().unwrap_or_default();
      let id = match estado.enfileirar(
        McpTransport::Stdio,
        HashMap::new(),
        mensagem.to_string(),
        tx,
      ) {
        Ok(id) => id,
        Err(_) => break,
      };

      match rx.recv_timeout(Duration::from_secs(STDIO_TIMEOUT_SECS)) {
        Ok(resposta) => {
          if resposta.trim() != "null" {
            escrever(&resposta, Some(&token));
          }
        }
        Err(_) => estado.descartar(id),
      }
    }
    estado.sinalizar_parada();
    let _ = app.exit(0);
  });
}

fn escrever(texto: &str, token: Option<&str>) {
  let limpo = redigir(texto, token);
  let mut stdout = io::stdout().lock();
  let _ = writeln!(stdout, "{}", limpo);
  let _ = stdout.flush();
}
