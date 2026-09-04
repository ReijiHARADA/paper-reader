mod ocr;
mod source_pdf;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

/// 翻訳サーバーのプロセスハンドルを保持する共有状態
pub struct ServerState(pub Arc<Mutex<Option<CommandChild>>>);

/// translation-server ディレクトリのパスを解決する
/// 開発時: CARGO_MANIFEST_DIR/../translation-server
/// 本番時: Resources/translation-server
fn resolve_server_dir(app: &tauri::AppHandle) -> PathBuf {
    // 開発ビルド時は src-tauri/ の親 = プロジェクトルートを使う
    #[cfg(debug_assertions)]
    {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let server_dir = manifest_dir.parent()
            .unwrap_or(&manifest_dir)
            .join("translation-server");
        if server_dir.exists() {
            log::info!("[dev] Using server dir: {}", server_dir.display());
            return server_dir;
        }
    }

    // 本番ビルド: .app/Contents/Resources/translation-server
    match app.path().resource_dir() {
        Ok(p) => {
            let server_dir = p.join("translation-server");
            log::info!("[prod] Using server dir: {}", server_dir.display());
            server_dir
        }
        Err(e) => {
            log::error!("Failed to resolve resource dir: {e}");
            PathBuf::from("translation-server")
        }
    }
}

/// Python 実行ファイルのパスを解決する
fn find_python(server_dir: &std::path::Path) -> String {
    // 1. バンドル venv（bundle-python.sh でコピーしたもの: 本番用）
    let bundled = server_dir.join("venv/bin/python3");
    if bundled.exists() {
        log::info!("Using bundled venv: {}", bundled.display());
        return bundled.to_string_lossy().to_string();
    }
    // 2. 開発時は .venv を直接参照
    let dev_venv = server_dir.join(".venv/bin/python3");
    if dev_venv.exists() {
        log::info!("Using dev .venv: {}", dev_venv.display());
        return dev_venv.to_string_lossy().to_string();
    }
    // 3. システム Python3（フォールバック）
    log::warn!("No venv found, falling back to system python3");
    "python3".to_string()
}

fn spawn_server(app: &tauri::AppHandle, state_arc: &Arc<Mutex<Option<CommandChild>>>) {
    let server_dir = resolve_server_dir(app);
    let python = find_python(&server_dir);
    let server_script = server_dir.join("server.py");

    if !server_script.exists() {
        log::error!("server.py not found at: {}", server_script.display());
        return;
    }

    log::info!("Spawning: {} {}", python, server_script.display());

    let result = app
        .shell()
        .command(&python)
        .args([server_script.to_str().unwrap_or("server.py")])
        .current_dir(&server_dir)
        .env("PYTHONPATH", server_dir.to_str().unwrap_or(""))
        .env("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        .env("MADLAD_SERVER_HOST", "127.0.0.1")
        .env("MADLAD_SERVER_PORT", "8765")
        .spawn();

    match result {
        Ok((_rx, child)) => {
            let mut guard = state_arc.lock().unwrap();
            *guard = Some(child);
            log::info!("Translation server spawned successfully.");
        }
        Err(e) => {
            log::error!("Failed to spawn translation server: {e}");
        }
    }
}

/// Tauri コマンド: 翻訳サーバーを手動再起動
#[tauri::command]
fn restart_translation_server(app: tauri::AppHandle, state: State<'_, ServerState>) {
    {
        let mut guard = state.0.lock().unwrap();
        if let Some(child) = guard.take() {
            let _ = child.kill();
            log::info!("Stopped previous translation server.");
        }
    }
    spawn_server(&app, &state.0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let server_state = ServerState(Arc::new(Mutex::new(None)));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(server_state)
        .setup(|app| {
            // ログプラグイン（デバッグビルドのみ）
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // 翻訳サーバーを起動
            let handle = app.handle().clone();
            let state: State<ServerState> = app.state();
            let state_arc = Arc::clone(&state.0);
            tauri::async_runtime::spawn(async move {
                spawn_server(&handle, &state_arc);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state: State<ServerState> = window.state();
                let mut guard = state.0.lock().unwrap();
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                    log::info!("Translation server stopped on window close.");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            restart_translation_server,
            ocr::ocr_image,
            source_pdf::save_source_pdf,
            source_pdf::copy_source_pdf,
            source_pdf::open_source_pdf,
            source_pdf::delete_source_pdf,
            source_pdf::source_pdf_exists,
            source_pdf::read_dropped_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
