//! CSPRNG do SO (sem crates novas) + comparação em tempo constante + redação.

use std::ffi::c_void;

#[cfg(target_os = "windows")]
#[link(name = "advapi32")]
unsafe extern "system" {
  #[link_name = "SystemFunction036"]
  fn rtl_gen_random(buffer: *mut c_void, length: u32) -> u8;
}

/// Preenche `out` com bytes aleatórios do gerador criptográfico do sistema.
/// Falha do RNG = falha fechada (quem chama não sobe o serviço nem gera token).
pub fn random_bytes(out: &mut [u8]) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    let ok = unsafe { rtl_gen_random(out.as_mut_ptr() as *mut c_void, out.len() as u32) };
    if ok == 0 {
      return Err("gerador de números aleatórios indisponível".to_string());
    }
    Ok(())
  }
  #[cfg(not(target_os = "windows"))]
  {
    use std::io::Read;
    let mut f = std::fs::File::open("/dev/urandom")
      .map_err(|_| "gerador de números aleatórios indisponível".to_string())?;
    f.read_exact(out)
      .map_err(|_| "gerador de números aleatórios indisponível".to_string())
  }
}

/// Hex minúsculo de `n_bytes` aleatórios. 32 bytes → 64 chars de token.
pub fn random_hex(n_bytes: usize) -> Result<String, String> {
  let mut buf = vec![0u8; n_bytes];
  random_bytes(&mut buf)?;
  Ok(buf.iter().map(|b| format!("{:02x}", b)).collect())
}

/// Lê o token exclusivamente do ambiente do processo filho (modo stdio).
pub fn token_do_ambiente() -> Result<String, String> {
  let tok = std::env::var("OPENDESIGN_MCP_TOKEN")
    .map_err(|_| "OPENDESIGN_MCP_TOKEN ausente".to_string())?;
  if tok.len() < 16 {
    return Err("OPENDESIGN_MCP_TOKEN ausente ou muito curto".to_string());
  }
  if tok.chars().any(|c| c.is_control()) {
    return Err("OPENDESIGN_MCP_TOKEN inválido".to_string());
  }
  Ok(tok)
}

/// Comparação em tempo constante. Tamanhos diferentes falham rápido (o
/// comprimento do token é fixo e público, não é segredo).
pub fn token_valido(fornecido: &str, esperado: &str) -> bool {
  if esperado.is_empty() {
    return false;
  }
  let a = fornecido.as_bytes();
  let b = esperado.as_bytes();
  if a.len() != b.len() {
    return false;
  }
  let mut diff = 0u8;
  for i in 0..a.len() {
    diff |= a[i] ^ b[i];
  }
  diff == 0
}

/// Defesa em profundidade: mesmo com a redação do núcleo JS, nenhuma saída
/// escrita por Rust (body HTTP ou stdout stdio) contém o token em claro.
pub fn redigir(texto: &str, token: Option<&str>) -> String {
  match token {
    Some(t) if t.len() >= 6 => texto.replace(t, "***"),
    _ => texto.to_string(),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn compara_token() {
    let esperado = "abcdef0123456789";
    assert!(token_valido(esperado, esperado));
    assert!(!token_valido("abcdef0123456780", esperado));
    assert!(!token_valido("curto", esperado));
    assert!(!token_valido(esperado, ""));
  }

  #[test]
  fn redige_token() {
    let saida = format!("valor jwt={} fim", "abcdef0123456789");
    let limpa = redigir(&saida, Some("abcdef0123456789"));
    assert!(!limpa.contains("abcdef0123456789"));
    assert!(limpa.contains("***"));
  }

  #[test]
  fn token_aleatorio_e_unico() {
    let a = random_hex(32).unwrap();
    let b = random_hex(32).unwrap();
    assert_eq!(a.len(), 64);
    assert_ne!(a, b);
    assert!(a.chars().all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()));
  }
}
