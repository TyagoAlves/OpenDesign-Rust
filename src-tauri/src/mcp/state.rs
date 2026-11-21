//! Estado compartilhado do MCP. A webview faz polling de `mcp_take_request` e
//! devolve com `mcp_respond`; as threads de transporte bloqueiam no Sender.
//! Toda leitura/escrita passa pelo Mutex curto deste arquivo.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::Sender;
use std::sync::Mutex;
use std::time::Instant;

use super::McpTransport;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum McpStatusValue {
  Off,
  Waiting,
  Connected,
  PortError,
}

impl McpStatusValue {
  pub fn as_str(self) -> &'static str {
    match self {
      McpStatusValue::Off => "off",
      McpStatusValue::Waiting => "waiting",
      McpStatusValue::Connected => "connected",
      McpStatusValue::PortError => "port-error",
    }
  }
}

#[derive(Clone, Debug)]
pub struct PedidoPendente {
  pub id: u64,
  pub transport: McpTransport,
  pub headers: HashMap<String, String>,
  pub mensagem: String,
  pub criado_em: Instant,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct McpStartResult {
  pub token: String,
  #[serde(rename = "sessionId")]
  pub session_id: String,
  pub transport: McpTransport,
  #[serde(rename = "stdioCommand")]
  pub stdio_command: String,
  pub status: &'static str,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct McpStatusResult {
  pub active: bool,
  pub transport: Option<McpTransport>,
  pub status: &'static str,
  #[serde(rename = "sessionId")]
  pub session_id: Option<String>,
  #[serde(rename = "lastActivityMs")]
  pub last_activity_ms: Option<u64>,
}

/// DTO entregue à webview. `message` já é JSON parseado porque o núcleo JS
/// espera um objeto, não uma string.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpRequestDto {
  pub id: u64,
  pub transport: McpTransport,
  pub headers: HashMap<String, String>,
  pub message: serde_json::Value,
}

pub struct McpInner {
  pub active: bool,
  pub transport: Option<McpTransport>,
  pub status: McpStatusValue,
  pub session_id: Option<String>,
  pub token: Option<String>,
  pub last_activity: Option<Instant>,
  pub queue: VecDeque<PedidoPendente>,
  pub pending: HashMap<u64, Sender<String>>,
  pub next_id: u64,
  pub stop_http: Option<std::sync::Arc<AtomicBool>>,
  pub stop_stdio: Option<std::sync::Arc<AtomicBool>>,
}

pub struct McpState(pub Mutex<McpInner>);

impl Default for McpInner {
  fn default() -> Self {
    Self {
      active: false,
      transport: None,
      status: McpStatusValue::Off,
      session_id: None,
      token: None,
      last_activity: None,
      queue: VecDeque::new(),
      pending: HashMap::new(),
      next_id: 1,
      stop_http: None,
      stop_stdio: None,
    }
  }
}

impl McpState {
  pub fn new() -> Self {
    Self(Mutex::new(McpInner::default()))
  }

  /// ID monotonicamente crescente usado para correlacionar a resposta do JS.
  pub fn enfileirar(
    &self,
    transport: McpTransport,
    headers: HashMap<String, String>,
    mensagem: String,
    tx: Sender<String>,
  ) -> Result<u64, String> {
    let mut g = self.0.lock().map_err(|_| "estado indisponível".to_string())?;
    if !g.active {
      return Err("serviço desligado".to_string());
    }
    if g.queue.len() >= 256 {
      return Err("fila cheia".to_string());
    }
    let id = g.next_id;
    g.next_id = g.next_id.wrapping_add(1).max(1);
    g.queue.push_back(PedidoPendente {
      id,
      transport,
      headers,
      criado_em: Instant::now(),
      mensagem,
    });
    g.pending.insert(id, tx);
    g.last_activity = Some(Instant::now());
    if g.status != McpStatusValue::PortError {
      g.status = McpStatusValue::Connected;
    }
    Ok(id)
  }

  pub fn tirar_da_fila(&self) -> Option<McpRequestDto> {
    // Loop em vez de recursão: nunca reentrar no Mutex (evita deadlock na ponte).
    loop {
      let pedido = {
        let mut g = self.0.lock().ok()?;
        let p = g.queue.pop_front()?;
        // Expirados: o transporte já devolveu timeout ao cliente; só descarta.
        if p.criado_em.elapsed().as_secs() > super::STDIO_TIMEOUT_SECS {
          g.pending.remove(&p.id);
          continue;
        }
        p
      };
      let message: serde_json::Value = match serde_json::from_str(&pedido.mensagem) {
        Ok(v) => v,
        Err(_) => {
          self.descartar(pedido.id);
          continue;
        }
      };
      return Some(McpRequestDto {
        id: pedido.id,
        transport: pedido.transport,
        headers: pedido.headers,
        message,
      });
    }
  }

  pub fn responder(&self, id: u64, resposta: String) -> bool {
    let tx = self.0.lock().ok().and_then(|mut g| g.pending.remove(&id));
    match tx {
      Some(sender) => sender.send(resposta).is_ok(),
      None => false,
    }
  }

  pub fn descartar(&self, id: u64) {
    if let Ok(mut g) = self.0.lock() {
      g.pending.remove(&id);
    }
  }

  pub fn status_publico(&self) -> McpStatusResult {
    let mut g = self.0.lock().expect("mcp state poisoned");
    // "conectado" significa atividade com token válido nos últimos 60 s;
    // sem isso o painel volta a "aguardando" (o protocolo não tem sessão).
    if g.status == McpStatusValue::Connected {
      if let Some(last) = g.last_activity {
        if last.elapsed().as_secs() > 60 {
          g.status = McpStatusValue::Waiting;
        }
      }
    }
    let last_ms = g.last_activity.map(|t| t.elapsed().as_millis() as u64);
    McpStatusResult {
      active: g.active,
      transport: g.transport,
      status: g.status.as_str(),
      session_id: g.session_id.clone(),
      last_activity_ms: last_ms,
    }
  }

  pub fn registrar_stop_http(&self, flag: std::sync::Arc<AtomicBool>) {
    if let Ok(mut g) = self.0.lock() {
      g.stop_http = Some(flag);
    }
  }

  pub fn registrar_stop_stdio(&self, flag: std::sync::Arc<AtomicBool>) {
    if let Ok(mut g) = self.0.lock() {
      g.stop_stdio = Some(flag);
    }
  }

  pub fn sinalizar_parada(&self) {
    if let Ok(mut g) = self.0.lock() {
      g.active = false;
      g.status = McpStatusValue::Off;
      g.transport = None;
      g.session_id = None;
      g.token = None;
      g.queue.clear();
      let pend: Vec<_> = g.pending.drain().map(|(_, tx)| tx).collect();
      drop(pend);
    }
  }

  pub fn token_atual(&self) -> Option<String> {
    self.0.lock().ok().and_then(|g| g.token.clone())
  }

  /// Cópia do token para as threads de transporte fazerem redação na saída.
  pub fn copiar_token(&self) -> Option<String> {
    self.token_atual()
  }
}

impl Default for McpState {
  fn default() -> Self {
    Self::new()
  }
}
