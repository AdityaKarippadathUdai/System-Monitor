// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cpu;
mod desktop;
mod disk;
mod gaming;
mod gpu;
mod memory;
mod models;
mod network;
mod platform;
mod processes;
mod shortcuts;
mod startup;
mod sys_monitor;
mod tray;

use desktop::models::{
    DesktopConfig, DesktopTelemetryPayload, ShortcutConfig, ShortcutStatus, StartupConfig,
    StartupStatus,
};
use desktop::DesktopManager;
use gaming::GamingManager;
use models::{KillResult, NetworkInterface, PingResult, ProcessInfo, SystemOverview};
use network::models::{
    NetworkConnection, NetworkHistoryResponse, NetworkTrafficOverview, ProcessNetworkDetails,
    ProcessNetworkUsage,
};
use shortcuts::GlobalShortcutManager;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use sys_monitor::MonitorEngine;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

pub struct AppState {
    pub engine: Arc<MonitorEngine>,
    pub desktop: Arc<DesktopManager>,
    pub gaming: Arc<GamingManager>,
    pub shortcuts: Arc<GlobalShortcutManager>,
    pub poll_interval_ms: Arc<AtomicU64>,
    pub network_active: Arc<AtomicBool>,
    pub network_interval_ms: Arc<AtomicU64>,
    pub monitoring_enabled: Arc<AtomicBool>,
    pub manual_gaming_only_startup: Arc<AtomicBool>,
    pub force_quit: Arc<AtomicBool>,
    pub shutdown: Arc<AtomicBool>,
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
fn set_network_monitoring_active(
    active: bool,
    interval_ms: Option<u64>,
    state: State<'_, AppState>,
) -> bool {
    state.network_active.store(active, Ordering::Relaxed);
    if let Some(ms) = interval_ms {
        state
            .network_interval_ms
            .store(ms.clamp(500, 10_000), Ordering::Relaxed);
    }
    active
}

#[tauri::command]
async fn get_network_interfaces(
    state: State<'_, AppState>,
) -> Result<Vec<NetworkInterface>, String> {
    let engine = state.engine.clone();
    tokio::task::spawn_blocking(move || engine.get_network_interfaces())
        .await
        .map_err(|e| format!("Failed to list network interfaces: {}", e))
}

#[tauri::command]
async fn get_network_overview(
    state: State<'_, AppState>,
) -> Result<NetworkTrafficOverview, String> {
    let engine = state.engine.clone();
    tokio::task::spawn_blocking(move || engine.get_network_overview())
        .await
        .map_err(|e| format!("Failed to gather network overview: {}", e))
}

#[tauri::command]
async fn get_network_processes(
    state: State<'_, AppState>,
) -> Result<Vec<ProcessNetworkUsage>, String> {
    let engine = state.engine.clone();
    tokio::task::spawn_blocking(move || engine.get_network_processes())
        .await
        .map_err(|e| format!("Failed to gather process network usage: {}", e))
}

#[tauri::command]
async fn get_network_connections(
    state: State<'_, AppState>,
) -> Result<Vec<NetworkConnection>, String> {
    let engine = state.engine.clone();
    tokio::task::spawn_blocking(move || engine.get_network_connections())
        .await
        .map_err(|e| format!("Failed to gather network connections: {}", e))
}

#[tauri::command]
async fn get_process_network_details(
    pid: u32,
    state: State<'_, AppState>,
) -> Result<Option<ProcessNetworkDetails>, String> {
    let engine = state.engine.clone();
    tokio::task::spawn_blocking(move || engine.get_process_network_details(pid))
        .await
        .map_err(|e| format!("Failed to inspect process network details: {}", e))
}

#[tauri::command]
fn set_network_interface(interface_name: String, state: State<'_, AppState>) -> String {
    state.engine.set_network_interface(interface_name)
}

#[tauri::command]
async fn get_network_history(
    period: String,
    interface_name: Option<String>,
    state: State<'_, AppState>,
) -> Result<NetworkHistoryResponse, String> {
    let engine = state.engine.clone();
    tokio::task::spawn_blocking(move || engine.get_network_history(period, interface_name))
        .await
        .map_err(|e| format!("Failed to read network history: {}", e))
}

#[tauri::command]
async fn ping_target(target: String, port: Option<u16>) -> PingResult {
    network::ping_target(target, port).await
}

#[tauri::command]
async fn get_desktop_state(state: State<'_, AppState>) -> Result<DesktopTelemetryPayload, String> {
    let engine = state.engine.clone();
    let desktop = state.desktop.clone();
    let gaming = state.gaming.clone();
    let manual_only = state.manual_gaming_only_startup.load(Ordering::Relaxed);

    tokio::task::spawn_blocking(move || {
        let cfg = desktop.get_config();
        let overview = engine.get_overview();
        let battery = desktop::platform::collect_battery_stats();
        let (gaming_status, fps, latency_ms) =
            engine.evaluate_gaming(&gaming, &cfg.gaming, manual_only, true);
        DesktopTelemetryPayload {
            overview,
            battery,
            fps,
            gaming: gaming_status,
            latency_ms,
            config: cfg,
            capabilities: desktop.capabilities.clone(),
        }
    })
    .await
    .map_err(|e| format!("Failed to gather desktop telemetry: {}", e))
}

#[tauri::command]
fn get_desktop_config(state: State<'_, AppState>) -> DesktopConfig {
    state.desktop.get_config()
}

#[tauri::command]
fn update_desktop_config(
    app: AppHandle,
    config: DesktopConfig,
    state: State<'_, AppState>,
) -> DesktopConfig {
    if config.gaming.enabled != state.gaming.is_active() {
        state.gaming.set_manual(config.gaming.enabled);
    }
    let gaming_active = state.gaming.is_active();
    let updated = state.desktop.update_config(&app, config, gaming_active);
    state.desktop.tray.sync_labels(
        &updated,
        gaming_active,
        state.monitoring_enabled.load(Ordering::Relaxed),
    );
    updated
}

#[tauri::command]
fn toggle_floating_widget(
    app: AppHandle,
    visible: Option<bool>,
    state: State<'_, AppState>,
) -> DesktopConfig {
    let gaming_active = state.gaming.is_active();
    let cfg = state
        .desktop
        .toggle_floating_widget(&app, visible, gaming_active);
    state.desktop.tray.sync_labels(
        &cfg,
        gaming_active,
        state.monitoring_enabled.load(Ordering::Relaxed),
    );
    cfg
}

#[tauri::command]
fn toggle_desktop_overlay(
    app: AppHandle,
    visible: Option<bool>,
    state: State<'_, AppState>,
) -> DesktopConfig {
    let gaming_active = state.gaming.is_active();
    let cfg = state
        .desktop
        .toggle_desktop_overlay(&app, visible, gaming_active);
    state.desktop.tray.sync_labels(
        &cfg,
        gaming_active,
        state.monitoring_enabled.load(Ordering::Relaxed),
    );
    cfg
}

#[tauri::command]
fn toggle_gaming_mode(
    app: AppHandle,
    enabled: Option<bool>,
    use_auto: Option<bool>,
    state: State<'_, AppState>,
) -> DesktopConfig {
    let active = if use_auto.unwrap_or(false) {
        state.gaming.clear_manual_to_auto();
        let mut cfg = state.desktop.get_config();
        cfg.gaming.enabled = false;
        state.desktop.update_config(&app, cfg, false);
        return state.desktop.get_config();
    } else if let Some(val) = enabled {
        state.gaming.set_manual(val)
    } else {
        state.gaming.toggle_manual()
    };

    let mut cfg = state.desktop.get_config();
    cfg.gaming.enabled = active;
    let updated = state.desktop.update_config(&app, cfg, active);
    state.desktop.tray.sync_labels(
        &updated,
        active,
        state.monitoring_enabled.load(Ordering::Relaxed),
    );
    updated
}

#[tauri::command]
fn set_window_click_through(
    app: AppHandle,
    target: String,
    enabled: Option<bool>,
    state: State<'_, AppState>,
) -> DesktopConfig {
    let gaming_active = state.gaming.is_active();
    state
        .desktop
        .set_click_through(&app, &target, enabled, gaming_active)
}

#[tauri::command]
fn update_shortcuts(
    app: AppHandle,
    shortcuts: ShortcutConfig,
    state: State<'_, AppState>,
) -> Result<ShortcutStatus, String> {
    let status = state.shortcuts.apply(&app, &shortcuts)?;
    let mut cfg = state.desktop.get_config();
    cfg.shortcuts = shortcuts;
    state
        .desktop
        .update_config(&app, cfg, state.gaming.is_active());
    Ok(status)
}

#[tauri::command]
fn get_shortcut_status(state: State<'_, AppState>) -> ShortcutStatus {
    state.shortcuts.get_status()
}

#[tauri::command]
fn apply_startup_settings(
    app: AppHandle,
    startup_cfg: StartupConfig,
    state: State<'_, AppState>,
) -> Result<StartupStatus, String> {
    let status = startup::apply_startup_config(&startup_cfg)?;
    let mut cfg = state.desktop.get_config();
    cfg.startup = startup_cfg;
    state
        .desktop
        .update_config(&app, cfg, state.gaming.is_active());
    Ok(status)
}

#[tauri::command]
fn get_startup_status() -> StartupStatus {
    startup::get_startup_status()
}

#[tauri::command]
fn start_window_drag(window: tauri::WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn show_main_window(app: AppHandle) {
    desktop::windows::show_main_dashboard(&app);
}

#[tauri::command]
fn set_background_monitoring(
    app: AppHandle,
    enabled: bool,
    interval_ms: Option<u64>,
    state: State<'_, AppState>,
) -> DesktopConfig {
    let mut cfg = state.desktop.get_config();
    cfg.background.enabled = enabled;
    if let Some(ms) = interval_ms {
        cfg.background.interval_ms = ms.clamp(250, 10_000);
    }
    state
        .desktop
        .update_config(&app, cfg, state.gaming.is_active())
}

#[tauri::command]
fn set_monitoring_enabled(
    app: AppHandle,
    enabled: bool,
    state: State<'_, AppState>,
) -> bool {
    state.monitoring_enabled.store(enabled, Ordering::Relaxed);
    let cfg = state.desktop.get_config();
    state
        .desktop
        .tray
        .sync_labels(&cfg, state.gaming.is_active(), enabled);
    let _ = app.emit("monitoring_state_changed", enabled);
    enabled
}

#[tauri::command]
fn add_game_exclusion(app: AppHandle, name: String, state: State<'_, AppState>) -> DesktopConfig {
    let trimmed = name.trim().to_string();
    let mut cfg = state.desktop.get_config();
    if !trimmed.is_empty()
        && !cfg
            .gaming
            .exclusions
            .iter()
            .any(|e| e.eq_ignore_ascii_case(&trimmed))
    {
        cfg.gaming.exclusions.push(trimmed);
    }
    state
        .desktop
        .update_config(&app, cfg, state.gaming.is_active())
}

#[tauri::command]
fn remove_game_exclusion(app: AppHandle, name: String, state: State<'_, AppState>) -> DesktopConfig {
    let mut cfg = state.desktop.get_config();
    cfg.gaming
        .exclusions
        .retain(|e| !e.eq_ignore_ascii_case(name.trim()));
    state
        .desktop
        .update_config(&app, cfg, state.gaming.is_active())
}

#[tauri::command]
fn add_custom_game(app: AppHandle, name: String, state: State<'_, AppState>) -> DesktopConfig {
    let trimmed = name.trim().to_string();
    let mut cfg = state.desktop.get_config();
    if !trimmed.is_empty()
        && !cfg
            .gaming
            .custom_games
            .iter()
            .any(|g| g.eq_ignore_ascii_case(&trimmed))
    {
        cfg.gaming.custom_games.push(trimmed);
    }
    state
        .desktop
        .update_config(&app, cfg, state.gaming.is_active())
}

#[tauri::command]
fn remove_custom_game(app: AppHandle, name: String, state: State<'_, AppState>) -> DesktopConfig {
    let mut cfg = state.desktop.get_config();
    cfg.gaming
        .custom_games
        .retain(|g| !g.eq_ignore_ascii_case(name.trim()));
    state
        .desktop
        .update_config(&app, cfg, state.gaming.is_active())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let start_minimized_flag = args.iter().any(|a| a == "--minimized");
    let start_widget_flag = args.iter().any(|a| a == "--widget");
    let no_background_flag = args.iter().any(|a| a == "--no-background");

    let engine = Arc::new(MonitorEngine::new());
    let desktop = Arc::new(DesktopManager::new(
        start_widget_flag,
        start_minimized_flag,
        no_background_flag,
    ));
    let initial_cfg = desktop.get_config();
    let gaming = Arc::new(GamingManager::new(initial_cfg.gaming.enabled));
    let shortcuts = Arc::new(GlobalShortcutManager::new());

    let poll_interval_ms = Arc::new(AtomicU64::new(
        initial_cfg.background.interval_ms.clamp(250, 10_000),
    ));
    let network_active = Arc::new(AtomicBool::new(false));
    let network_interval_ms = Arc::new(AtomicU64::new(1000));
    let monitoring_enabled = Arc::new(AtomicBool::new(true));
    let manual_gaming_only_startup = Arc::new(AtomicBool::new(
        initial_cfg.startup.manual_gaming_mode_only,
    ));
    let force_quit = Arc::new(AtomicBool::new(false));
    let shutdown = Arc::new(AtomicBool::new(false));
    let loop_started = Arc::new(AtomicBool::new(false));

    let state_engine = engine.clone();
    let state_desktop = desktop.clone();
    let state_gaming = gaming.clone();
    let state_shortcuts = shortcuts.clone();
    let state_interval = poll_interval_ms.clone();
    let state_net_active = network_active.clone();
    let state_net_interval = network_interval_ms.clone();
    let state_monitoring = monitoring_enabled.clone();
    let state_manual_gaming = manual_gaming_only_startup.clone();
    let state_force_quit = force_quit.clone();
    let state_shutdown = shutdown.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            engine: state_engine,
            desktop: state_desktop,
            gaming: state_gaming,
            shortcuts: state_shortcuts,
            poll_interval_ms: state_interval,
            network_active: state_net_active,
            network_interval_ms: state_net_interval,
            monitoring_enabled: state_monitoring,
            manual_gaming_only_startup: state_manual_gaming,
            force_quit: state_force_quit,
            shutdown: state_shutdown,
        })
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let cfg = desktop.get_config();

            // Initialize persistent System Tray
            if let Err(err) = desktop.tray.init(&app_handle, &cfg, gaming.is_active()) {
                eprintln!("[SysMon Tray] {}", err);
            }

            // Initialize global shortcuts
            let _ = shortcuts.apply(&app_handle, &cfg.shortcuts);

            // Handle start-minimized & floating windows
            if let Some(main_win) = app_handle.get_webview_window(desktop::windows::MAIN_WINDOW_LABEL) {
                if start_minimized_flag || (cfg.tray.enabled && cfg.tray.start_minimized) {
                    let _ = main_win.hide();
                }

                let app_close = app_handle.clone();
                let desktop_close = desktop.clone();
                let fq_close = force_quit.clone();
                let shutdown_close = shutdown.clone();
                let shortcuts_close = shortcuts.clone();
                let engine_close = engine.clone();
                main_win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        if !fq_close.load(Ordering::SeqCst)
                            && desktop_close.should_minimize_to_tray_on_close()
                        {
                            api.prevent_close();
                            desktop_close.hide_main_window(&app_close);
                        } else if !fq_close.swap(true, Ordering::SeqCst) {
                            shutdown_close.store(true, Ordering::SeqCst);
                            shortcuts_close.shutdown();
                            engine_close.flush_network_history();
                            desktop::windows::close_all_auxiliary_windows(&app_close);
                            app_close.exit(0);
                        }
                    }
                });
            }

            desktop.sync_windows(&app_handle, gaming.is_active());

            if !loop_started.swap(true, Ordering::SeqCst) {
                // Single shared telemetry loop powering main dashboard, tray tooltip, floating widget, desktop overlay, and gaming HUD
                let bg_app = app_handle.clone();
                let bg_engine = engine.clone();
                let bg_desktop = desktop.clone();
                let bg_gaming = gaming.clone();
                let bg_interval = poll_interval_ms.clone();
                let bg_monitoring = monitoring_enabled.clone();
                let bg_manual_gaming = manual_gaming_only_startup.clone();
                let bg_shutdown = shutdown.clone();

                tauri::async_runtime::spawn(async move {
                    let mut tick_count: u64 = 0;
                    let mut prev_gaming_active = bg_gaming.is_active();

                    while !bg_shutdown.load(Ordering::Relaxed) {
                        let cfg_now = bg_desktop.get_config();
                        let any_visible = desktop::windows::any_window_visible(&bg_app);
                        let is_gaming = bg_gaming.is_active();

                        let base_ms = if any_visible {
                            bg_interval.load(Ordering::Relaxed).clamp(250, 10_000)
                        } else {
                            cfg_now.background.interval_ms.clamp(500, 10_000)
                        };
                        let interval = if is_gaming {
                            cfg_now.gaming.refresh_interval_ms.clamp(250, 5_000).min(base_ms)
                        } else {
                            base_ms
                        };

                        tokio::time::sleep(tokio::time::Duration::from_millis(interval)).await;

                        if bg_shutdown.load(Ordering::Relaxed) {
                            break;
                        }

                        if !bg_monitoring.load(Ordering::Relaxed) {
                            continue;
                        }

                        let cfg_tick = bg_desktop.get_config();
                        let visible_now = desktop::windows::any_window_visible(&bg_app);
                        if !visible_now
                            && (!cfg_tick.background.enabled || cfg_tick.background.pause_when_all_hidden)
                        {
                            continue;
                        }

                        tick_count = tick_count.wrapping_add(1);
                        let should_scan_games = cfg_tick.gaming.auto_detect
                            || is_gaming
                            || tick_count % 3 == 0;

                        let engine_ref = bg_engine.clone();
                        let desktop_ref = bg_desktop.clone();
                        let gaming_ref = bg_gaming.clone();
                        let manual_only = bg_manual_gaming.load(Ordering::Relaxed);

                        if let Ok(payload) = tokio::task::spawn_blocking(move || {
                            let overview = engine_ref.get_overview();
                            let battery = desktop::platform::collect_battery_stats();
                            let (gaming_status, fps, latency_ms) = if should_scan_games {
                                engine_ref.evaluate_gaming(
                                    &gaming_ref,
                                    &cfg_tick.gaming,
                                    manual_only,
                                    true,
                                )
                            } else {
                                (
                                    desktop::models::GamingStatus {
                                        active: gaming_ref.is_active(),
                                        auto_activated: false,
                                        detected_games: Vec::new(),
                                        active_game: None,
                                    },
                                    gaming::fps::collect_real_fps(None),
                                    None,
                                )
                            };

                            DesktopTelemetryPayload {
                                overview,
                                battery,
                                fps,
                                gaming: gaming_status,
                                latency_ms,
                                config: cfg_tick,
                                capabilities: desktop_ref.capabilities.clone(),
                            }
                        })
                        .await
                        {
                            // Sync Gaming HUD window when auto-detection transitions state
                            if payload.gaming.active != prev_gaming_active {
                                prev_gaming_active = payload.gaming.active;
                                bg_desktop.sync_windows(&bg_app, payload.gaming.active);
                            }

                            let primary_gpu_pct = payload
                                .overview
                                .gpus
                                .first()
                                .and_then(|g| g.utilization_percent);
                            bg_desktop.tray.update_tooltip(
                                &payload.config,
                                payload.overview.cpu.usage_percent,
                                payload.overview.memory.usage_percent,
                                primary_gpu_pct,
                            );

                            let _ = bg_app.emit("system_metrics_stream", &payload.overview);
                            let _ = bg_app.emit("desktop_telemetry_stream", &payload);
                        }
                    }
                });

                // Dedicated deep network telemetry loop (runs full socket/process attribution only while Network page is active)
                let net_app_handle = app.handle().clone();
                let net_engine = engine.clone();
                let net_active = network_active.clone();
                let net_interval = network_interval_ms.clone();
                let net_shutdown = shutdown.clone();

                tauri::async_runtime::spawn(async move {
                    while !net_shutdown.load(Ordering::Relaxed) {
                        if !net_active.load(Ordering::Relaxed) {
                            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                            continue;
                        }

                        let interval = net_interval.load(Ordering::Relaxed).clamp(500, 10_000);
                        tokio::time::sleep(tokio::time::Duration::from_millis(interval)).await;

                        if net_shutdown.load(Ordering::Relaxed) || !net_active.load(Ordering::Relaxed) {
                            continue;
                        }

                        let engine_ref = net_engine.clone();
                        if let Ok(payload) =
                            tokio::task::spawn_blocking(move || engine_ref.collect_network_stream())
                                .await
                        {
                            let _ = net_app_handle.emit("network_metrics_stream", &payload);
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
            set_network_monitoring_active,
            get_network_interfaces,
            get_network_overview,
            get_network_processes,
            get_network_connections,
            get_process_network_details,
            set_network_interface,
            get_network_history,
            ping_target,
            get_desktop_state,
            get_desktop_config,
            update_desktop_config,
            toggle_floating_widget,
            toggle_desktop_overlay,
            toggle_gaming_mode,
            set_window_click_through,
            update_shortcuts,
            get_shortcut_status,
            apply_startup_settings,
            get_startup_status,
            start_window_drag,
            show_main_window,
            set_background_monitoring,
            set_monitoring_enabled,
            add_game_exclusion,
            remove_game_exclusion,
            add_custom_game,
            remove_custom_game
        ])
        .build(tauri::generate_context!())
        .expect("error while building SysMon Tauri application");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::ExitRequested { code, api, .. } => {
            if let Some(state) = app_handle.try_state::<AppState>() {
                let is_explicit_exit = state.force_quit.load(Ordering::SeqCst) || code.is_some();
                if !is_explicit_exit && state.desktop.should_minimize_to_tray_on_close() {
                    api.prevent_exit();
                    return;
                }
                state.force_quit.store(true, Ordering::SeqCst);
                state.shutdown.store(true, Ordering::SeqCst);
                state.shortcuts.shutdown();
                state.engine.flush_network_history();
            }
        }
        tauri::RunEvent::Exit => {
            if let Some(state) = app_handle.try_state::<AppState>() {
                state.force_quit.store(true, Ordering::SeqCst);
                state.shutdown.store(true, Ordering::SeqCst);
                state.shortcuts.shutdown();
                state.engine.flush_network_history();
                desktop::windows::close_all_auxiliary_windows(app_handle);
                state.desktop.tray.shutdown();
            }
        }
        _ => {}
    });
}
