// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // stdio in-process: o cliente MCP inicia o próprio executável com
  // `--transport stdio` e o token no campo `env` do snippet. Nenhum argumento
  // contém o token; a ausência dele encerra antes de abrir qualquer janela.
  let args: Vec<String> = std::env::args().collect();
  let modo_stdio = args
    .windows(2)
    .any(|par| par[0] == "--transport" && par[1] == "stdio")
    || args.iter().any(|a| a == "--stdio");

  if modo_stdio {
    if let Err(motivo) = app_lib::mcp::token::token_do_ambiente() {
      // stderr é seguro; stdout fica limpo para JSON-RPC.
      eprintln!("MCP bloqueado: {}", motivo);
      std::process::exit(3);
    }
    app_lib::mcp::set_stdio_mode(true);
  }

  app_lib::run();
}
