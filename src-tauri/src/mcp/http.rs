//! Transporte Streamable HTTP — bind exclusivo em 127.0.0.1:8788, sem fallback.
//! O Rust só faz framing/autorização; o JSON-RPC é tratado pelo núcleo JS.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::Duration;

use super::token::{redigir, token_valido};
use super::SharedState;
use super::{McpTransport, HOST, MAX_BODY, PATH, PORT, RESPONSE_TIMEOUT_SECS};

struct RespostaHttp {
  status: u16,
  razao: &'static str,
  corpo: String,
  extra: String,
}

fn json_resposta(status: u16, razao: &'static str, valor: serde_json::Value) -> RespostaHttp {
  RespostaHttp {
    status,
    razao,
    corpo: valor.to_string(),
    extra: String::new(),
  }
}

fn erro(status: u16, razao: &'static str, mensagem: &str) -> RespostaHttp {
  json_resposta(
    status,
    razao,
    serde_json::json!({ "erro": mensagem }),
  )
}

/// Abre a porta fixa. `port_in_use` é um código estável traduzido no frontend;
/// nenhum detalhe do SO (que poderia conter caminhos) sai daqui.
pub fn bind() -> Result<TcpListener, String> {
  TcpListener::bind((HOST, PORT)).map_err(|e| {
    if e.kind() == std::io::ErrorKind::AddrInUse {
      "port_in_use".to_string()
    } else {
      "bind_failed".to_string()
    }
  })
}

pub fn iniciar(listener: TcpListener, shared: SharedState, token: String, stop: Arc<AtomicBool>) {
  shared.registrar_stop_http(stop.clone());
  let _ = listener.set_nonblocking(true);
  let estado = shared.clone();
  std::thread::spawn(move || {
    while !stop.load(Ordering::SeqCst) {
      match listener.accept() {
        Ok((stream, _)) => {
          let s = estado.clone();
          let t = token.clone();
          std::thread::spawn(move || atender(stream, s, t));
        }
        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
          std::thread::sleep(Duration::from_millis(20));
        }
        Err(_) => break,
      }
    }
  });
}

fn atender(mut stream: TcpStream, shared: SharedState, token: String) {
  let resposta = match processar(&mut stream, &shared, &token) {
    Ok(r) => r,
    Err(r) => r,
  };
  // Redação por defesa em profundidade (o núcleo JS já redige com secrets).
  let corpo = redigir(&resposta.corpo, Some(&token));
  let cabecalho = format!(
    "HTTP/1.1 {} {}\r\ncontent-type: application/json; charset=utf-8\r\ncontent-length: {}\r\ncache-control: no-store\r\nx-content-type-options: nosniff\r\n{}connection: close\r\n\r\n",
    resposta.status,
    resposta.razao,
    corpo.as_bytes().len(),
    resposta.extra,
  );
  let mut saida = cabecalho.into_bytes();
  saida.extend_from_slice(corpo.as_bytes());
  let _ = stream.write_all(&saida);
  let _ = stream.flush();
}

fn encontrar_fim_cabecalho(buf: &[u8]) -> Option<usize> {
  buf.windows(4).position(|w| w == b"\r\n\r\n").map(|p| p + 4)
}

fn processar(
  stream: &mut TcpStream,
  shared: &SharedState,
  token: &str,
) -> Result<RespostaHttp, RespostaHttp> {
  let _ = stream.set_nonblocking(false);
  let mut buf: Vec<u8> = Vec::new();
  let mut temporario = [0u8; 4096];
  let fim_cabecalho = loop {
    if let Some(pos) = encontrar_fim_cabecalho(&buf) {
      break pos;
    }
    if buf.len() > 64 * 1024 {
      return Err(erro(413, "Payload Too Large", "cabeçalho muito grande"));
    }
    let n = stream
      .read(&mut temporario)
      .map_err(|_| erro(400, "Bad Request", "leitura falhou"))?;
    if n == 0 {
      return Err(erro(400, "Bad Request", "requisição vazia"));
    }
    buf.extend_from_slice(&temporario[..n]);
  };

  let texto = std::str::from_utf8(&buf[..fim_cabecalho])
    .map_err(|_| erro(400, "Bad Request", "cabeçalho inválido"))?;
  let mut linhas = texto.split("\r\n");
  let linha_inicial = linhas.next().unwrap_or("");
  let mut partes = linha_inicial.split_whitespace();
  let metodo = partes.next().unwrap_or("");
  let alvo = partes.next().unwrap_or("");

  let mut cabecalhos: HashMap<String, String> = HashMap::new();
  for linha in linhas {
    if let Some((chave, valor)) = linha.split_once(':') {
      let chave = chave.trim().to_ascii_lowercase();
      // Nunca repassa authorization/cookie à webview: o token fica no Rust.
      if chave == "authorization" || chave == "cookie" || chave == "proxy-authorization" {
        continue;
      }
      cabecalhos.insert(chave, valor.trim().to_string());
    }
  }

  let (caminho, tem_query) = match alvo.split_once('?') {
    Some((p, _)) => (p, true),
    None => (alvo, false),
  };
  if alvo.contains('#') || tem_query {
    return Err(erro(400, "Bad Request", "token na URL não é aceito"));
  }
  if caminho != PATH {
    return Err(erro(404, "Not Found", "não encontrado"));
  }
  if metodo != "POST" {
    let mut r = erro(405, "Method Not Allowed", "use POST");
    r.extra = "allow: POST\r\n".to_string();
    return Err(r);
  }
  if cabecalhos
    .get("transfer-encoding")
    .map(|v| v.to_ascii_lowercase().contains("chunked"))
    .unwrap_or(false)
  {
    return Err(erro(400, "Bad Request", "chunked não suportado"));
  }

  let tamanho: usize = cabecalhos
    .get("content-length")
    .and_then(|v| v.parse::<usize>().ok())
    .unwrap_or(0);
  if tamanho == 0 {
    return Err(erro(400, "Bad Request", "content-length obrigatório"));
  }
  if tamanho > MAX_BODY {
    return Err(erro(413, "Payload Too Large", "corpo muito grande"));
  }

  let mut corpo = buf[fim_cabecalho..].to_vec();
  while corpo.len() < tamanho {
    if corpo.len() > MAX_BODY {
      return Err(erro(413, "Payload Too Large", "corpo muito grande"));
    }
    let n = stream
      .read(&mut temporario)
      .map_err(|_| erro(400, "Bad Request", "leitura falhou"))?;
    if n == 0 {
      break;
    }
    corpo.extend_from_slice(&temporario[..n]);
  }
  if corpo.len() != tamanho {
    return Err(erro(400, "Bad Request", "corpo incompleto"));
  }

  // Bearer rígido: só "Bearer <token>", comparação em tempo constante.
  // O valor é lido do texto cru e NÃO entra em `cabecalhos`, para que nunca
  // cruze a ponte IPC para a webview.
  let auth = texto
    .lines()
    .find_map(|linha| {
      let (k, v) = linha.split_once(':')?;
      if k.trim().eq_ignore_ascii_case("authorization") {
        Some(v.trim().to_string())
      } else {
        None
      }
    })
    .unwrap_or_default();
  let fornecido = auth
    .strip_prefix("Bearer ")
    .or_else(|| auth.strip_prefix("bearer "))
    .unwrap_or("");
  if !token_valido(fornecido, token) {
    return Err(erro(401, "Unauthorized", "não autorizado"));
  }

  let mensagem: serde_json::Value = match serde_json::from_slice(&corpo) {
    Ok(v) => v,
    Err(_) => {
      return Ok(json_resposta(
        200,
        "OK",
        serde_json::json!({
          "jsonrpc": "2.0",
          "id": null,
          "error": { "code": -32700, "message": "Parse error" }
        }),
      ))
    }
  };

  // Só os headers relevantes ao protocolo cruzam a ponte IPC.
  let headers_uteis: HashMap<String, String> = cabecalhos
    .into_iter()
    .filter(|(k, _)| k.starts_with("mcp-") || k == "content-type" || k == "accept")
    .collect();

  let (tx, rx) = mpsc::channel();
  let id = shared.enfileirar(
    McpTransport::Http,
    headers_uteis,
    mensagem.to_string(),
    tx,
  ).map_err(|_| erro(503, "Service Unavailable", "serviço desligado"))?;

  let resposta = match rx.recv_timeout(Duration::from_secs(RESPONSE_TIMEOUT_SECS)) {
    Ok(r) => r,
    Err(_) => {
      shared.descartar(id);
      serde_json::json!({
        "jsonrpc": "2.0",
        "id": mensagem.get("id").cloned().unwrap_or(serde_json::Value::Null),
        "error": { "code": -32603, "message": "Internal error" }
      })
      .to_string()
    }
  };

  if resposta.trim() == "null" {
    return Ok(RespostaHttp {
      status: 202,
      razao: "Accepted",
      corpo: String::new(),
      extra: String::new(),
    });
  }
  Ok(RespostaHttp {
    status: 200,
    razao: "OK",
    corpo: resposta,
    extra: String::new(),
  })
}
