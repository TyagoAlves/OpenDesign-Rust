mod commands;
pub mod mcp;

use commands::ExportTokens;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Listener, Manager, RunEvent, State};

struct SplashState {
  started: Instant,
  closed: bool,
}

/// Fecha o splash e exibe a janela principal, respeitando tempo mínimo de exibição
/// (~1500 ms) e garantindo execução única (chamado pelo sinal "app pronto" ou fallback).
/// No modo stdio a janela principal fica OCULTA: o agente fala com o núcleo pela
/// ponte IPC, não pela tela.
fn close_splash_show_main(app: &AppHandle, state: &Mutex<SplashState>) {
  let remaining = {
    let s = match state.lock() {
      Ok(g) => g,
      Err(_) => return,
    };
    if s.closed {
      return;
    }
    let min = Duration::from_millis(1500);
    let elapsed = s.started.elapsed();
    if elapsed < min {
      min - elapsed
    } else {
      Duration::from_millis(0)
    }
  };

  if !remaining.is_zero() {
    std::thread::sleep(remaining);
  }

  let mut s = match state.lock() {
    Ok(g) => g,
    Err(_) => return,
  };
  if s.closed {
    return;
  }
  if let Some(splash) = app.get_webview_window("splashscreen") {
    let _ = splash.close();
  }
  if !mcp::is_stdio_mode() {
    if let Some(main) = app.get_webview_window("main") {
      let _ = main.show();
      let _ = main.set_focus();
    }
  }
  s.closed = true;
}

/// Comando invocado pelo frontend quando a UI está pronta.
#[tauri::command]
fn app_ready(app: AppHandle, state: State<'_, Mutex<SplashState>>) {
  close_splash_show_main(&app, state.inner());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Estado MCP compartilhado entre comandos, threads de transporte e limpeza.
  let mcp_state = mcp::new_shared();
  let mcp_state_setup = mcp_state.clone();

  // Cada processo stdio precisa do SEU perfil WebView2. O identificador do app
  // é o mesmo da GUI; sem isolamento, o WebView2 do helper disputa o diretório
  // e falha com HRESULT 0x800700AA quando a janela principal já está aberta.
  // Sobrescrever SOMENTE `localData` isola o WebView2 sem mudar `app_data_dir`
  // (onde fica o SQLite): o helper continua vendo o banco real da GUI.
  let mut contexto = tauri::generate_context!();
  let dir_stdio = if mcp::is_stdio_mode() {
    let dir = std::env::temp_dir()
      .join("opendesign-mcp-stdio")
      .join(std::process::id().to_string());
    if let Err(motivo) = std::fs::create_dir_all(&dir) {
      eprintln!("MCP: nao foi possivel isolar o perfil WebView2: {}", motivo);
      std::process::exit(4);
    }
    contexto.config_mut().app.app_directories_override =
      Some(tauri::utils::config::AppDirectoriesOverride::Directories(
        tauri::utils::config::AppDirectoryOverrides {
          local_data: Some(dir.clone()),
          ..Default::default()
        },
      ));
    Some(dir)
  } else {
    None
  };

  tauri::Builder::default()
    // Banco local do OpenDesign. O schema é garantido no cliente (local-db.ts)
    // com DDL idempotente (CREATE TABLE/INDEX IF NOT EXISTS), evitando falhas de
    // checksum de migração do plugin em bancos já existentes (ex.: "migration 1
    // was previously applied but has been modified").
    .plugin(tauri_plugin_sql::Builder::default().build())
    // Diálogo nativo "Salvar como": `pick_save_path` abre o diálogo no Rust e
    // devolve { path, nonce }; export_png/export_pdf aceitam o destino só com
    // esse nonce one-shot, ainda não usado (autorizado pelo Tyago).
    .plugin(tauri_plugin_dialog::init())
    .manage(ExportTokens::default())
    .manage(mcp_state.clone())
    .manage(Mutex::new(SplashState {
      started: Instant::now(),
      closed: false,
    }))
    // Decisão do Tyago: persistência local é o adaptador SQLite da
    // Daniela em api.ts. Os 4 comandos de design em JSON ficam no código (em
    // commands.rs), mas FORA do caminho ativo para não criar um 2º storage.
    .invoke_handler(tauri::generate_handler![
      app_ready,
      commands::pick_save_path,
      commands::export_png,
      commands::export_pdf,
      mcp::commands::mcp_start,
      mcp::commands::mcp_stop,
      mcp::commands::mcp_status,
      mcp::commands::mcp_take_request,
      mcp::commands::mcp_respond,
      mcp::commands::mcp_is_stdio,
    ])
    .setup(move |app| {
      // Modo stdio: sem log no stdout (o plugin só entra em debug e nunca é
      // instalado neste modo), token do env e leitura de stdin já no bootstrap.
      if mcp::is_stdio_mode() {
        if let Some(splash) = app.get_webview_window("splashscreen") {
          let _ = splash.close();
        }
        mcp::bootstrap_stdio(app.handle().clone(), mcp_state_setup.clone());
      }

      if cfg!(debug_assertions) && !mcp::is_stdio_mode() {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Sinal alternativo por evento: o frontend também pode emitir
      // "opendesign://app-ready" em vez de chamar o comando `app_ready`.
      // Ambos caem em close_splash_show_main, que é idempotente.
      let event_handle = app.handle().clone();
      let _ = app
        .handle()
        .listen("opendesign://app-ready", move |_event| {
          let state = event_handle.state::<Mutex<SplashState>>();
          close_splash_show_main(&event_handle, state.inner());
        });

      // Fallback de segurança (~8 s): nunca deixa o app preso no splash se o sinal não chegar.
      let handle = app.handle().clone();
      std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(8000));
        let state = handle.state::<Mutex<SplashState>>();
        close_splash_show_main(&handle, state.inner());
      });

      Ok(())
    })
    .build(contexto)
    .expect("error while building tauri application")
    .run(move |_app, event| {
      // Equivalente ao SIGTERM do protótipo: revoga token, fecha listener/stdin
      // e drena pedidos. Sem isso, um disable/close deixaria porta residual.
      match event {
        RunEvent::Exit | RunEvent::ExitRequested { .. } => {
          mcp::stop_all(&mcp_state);
          if let Some(dir) = &dir_stdio {
            let _ = std::fs::remove_dir_all(dir);
          }
        }
        _ => {}
      }
    });
}
