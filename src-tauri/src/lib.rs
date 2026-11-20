mod commands;

use commands::ExportTokens;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Listener, Manager, State};

struct SplashState {
  started: Instant,
  closed: bool,
}

/// Fecha o splash e exibe a janela principal, respeitando tempo mínimo de exibição
/// (~1500 ms) e garantindo execução única (chamado pelo sinal "app pronto" ou fallback).
fn close_splash_show_main(app: &AppHandle, state: &Mutex<SplashState>) {
  // Calcula espera mínima sem segurar o lock durante o sleep.
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
  if let Some(main) = app.get_webview_window("main") {
    let _ = main.show();
    let _ = main.set_focus();
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
  tauri::Builder::default()
    // Banco local do OpenDesign (preservado: foi perdido num overwrite concorrente).
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations(
          "sqlite:opendesign.db",
          vec![tauri_plugin_sql::Migration {
            version: 1,
            description: "designs, pages, templates e brand kits (locais)",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: tauri_plugin_sql::MigrationKind::Up,
          }],
        )
        .build(),
    )
    // Diálogo nativo "Salvar como": `pick_save_path` abre o diálogo no Rust e
    // devolve { path, token }; export_png/export_pdf aceitam o destino só com
    // esse token one-shot, ainda não usado (autorizado pelo Tyago).
    .plugin(tauri_plugin_dialog::init())
    .manage(ExportTokens::default())
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
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
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
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
