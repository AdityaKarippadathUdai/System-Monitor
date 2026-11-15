// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cpu;
mod disk;
mod gpu;
mod memory;
mod models;
mod network;
mod platform;
mod processes;
mod sys_monitor;

use models::{KillResult, PingResult, ProcessInfo, SystemOverview};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use sys_monitor::MonitorEngine;
use tauri::{Emitter, Manager, State};

struct AppState {
    engine: Arc<MonitorEngine>,
    poll_interval_ms: Arc<AtomicU64>,
    shutdown: Arc<AtomicBool>,
}

#[tauri::command]
fn ping() -> &'static str {
    "pong"
}

#[tauri::command]
async fn get_system_overview(state: State<'_, AppState>) -> Result<SystemOverview, String> {
    let engine = state.engine.clone();
    tokio::task::spawn_blocking(move || engine.get_overview())
        .await
        .map_err(|e| format!("Failed to gather overview: {}", e))
}

#[tauri::command]
async fn get_processes(state: State<'_, AppState>) -> Result<Vec<ProcessInfo>, String> {
    let engine = state.engine.clone();
    tokio::task::spawn_blocking(move || engine.get_processes())
        .await
        .map_err(|e| format!("Failed to list processes: {}", e))
}

#[tauri::command]
async fn kill_process(pid: u32, state: State<'_, AppState>) -> Result<KillResult, String> {
    let engine = state.engine.clone();
    tokio::task::spawn_blocking(move || engine.kill_process(pid))
        .await
        .map_err(|e| format!("Failed to terminate process: {}", e))
}

#[tauri::command]
fn set_polling_interval(interval_ms: u64, state: State<'_, AppState>) -> u64 {
    let clamped = interval_ms.clamp(250, 10_000);
    state.poll_interval_ms.store(clamped, Ordering::Relaxed);
    clamped
}

#[tauri::command]
async fn ping_target(target: String, port: Option<u16>) -> PingResult {
    network::ping_target(target, port).await
}

fn main() {
    let engine = Arc::new(MonitorEngine::new());
    let poll_interval_ms = Arc::new(AtomicU64::new(1000));
    let shutdown = Arc::new(AtomicBool::new(false));
    let loop_started = Arc::new(AtomicBool::new(false));

    let state_engine = engine.clone();
    let state_interval = poll_interval_ms.clone();
    let state_shutdown = shutdown.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            engine: state_engine,
            poll_interval_ms: state_interval,
            shutdown: state_shutdown,
        })
        .setup(move |app| {
            // Ensure only a single background telemetry stream ever runs
            if !loop_started.swap(true, Ordering::SeqCst) {
                let app_handle = app.handle().clone();
                let bg_engine = engine.clone();
                let bg_interval = poll_interval_ms.clone();
                let bg_shutdown = shutdown.clone();

                tauri::async_runtime::spawn(async move {
                    while !bg_shutdown.load(Ordering::Relaxed) {
                        let interval = bg_interval.load(Ordering::Relaxed).clamp(250, 10_000);
                        tokio::time::sleep(tokio::time::Duration::from_millis(interval)).await;

                        if bg_shutdown.load(Ordering::Relaxed) {
                            break;
                        }

                        let engine_ref = bg_engine.clone();
                        if let Ok(overview) =
                            tokio::task::spawn_blocking(move || engine_ref.get_overview()).await
                        {
                            let _ = app_handle.emit("system_metrics_stream", &overview);
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            get_system_overview,
            get_processes,
            kill_process,
            set_polling_interval,
            ping_target
        ])
        .build(tauri::generate_context!())
        .expect("error while building SysMon Tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<AppState>() {
                state.shutdown.store(true, Ordering::SeqCst);
            }
        }
    });
}
