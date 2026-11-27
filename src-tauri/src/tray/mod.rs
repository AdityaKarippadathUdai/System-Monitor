use crate::desktop::models::DesktopConfig;
use crate::desktop::windows;
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

struct TrayHandles {
    tray: TrayIcon<tauri::Wry>,
    widget_item: MenuItem<tauri::Wry>,
    overlay_item: MenuItem<tauri::Wry>,
    gaming_item: MenuItem<tauri::Wry>,
    monitoring_item: MenuItem<tauri::Wry>,
}

pub struct TrayController {
    handles: Mutex<Option<TrayHandles>>,
}

impl TrayController {
    pub fn new() -> Self {
        Self {
            handles: Mutex::new(None),
        }
    }

    pub fn init(&self, app: &AppHandle, cfg: &DesktopConfig, gaming_active: bool) -> Result<(), String> {
        if !cfg.tray.enabled {
            return Ok(());
        }

        let header_item = MenuItem::with_id(app, "tray_header", "SysMon Pro", false, None::<&str>)
            .map_err(|e| format!("Failed to build tray header: {}", e))?;
        let open_item = MenuItem::with_id(app, "open_dashboard", "Open Dashboard", true, None::<&str>)
            .map_err(|e| format!("Failed to build tray open item: {}", e))?;
        let widget_item = MenuItem::with_id(
            app,
            "toggle_widget",
            if cfg.widget.enabled && cfg.widget.visible {
                "Hide Floating Widget"
            } else {
                "Show Floating Widget"
            },
            true,
            None::<&str>,
        )
        .map_err(|e| format!("Failed to build tray widget item: {}", e))?;
        let overlay_item = MenuItem::with_id(
            app,
            "toggle_overlay",
            if cfg.overlay.enabled && cfg.overlay.visible {
                "Hide Desktop Overlay"
            } else {
                "Show Desktop Overlay"
            },
            true,
            None::<&str>,
        )
        .map_err(|e| format!("Failed to build tray overlay item: {}", e))?;
        let gaming_item = MenuItem::with_id(
            app,
            "toggle_gaming",
            if gaming_active {
                "Disable Gaming Mode"
            } else {
                "Enable Gaming Mode"
            },
            true,
            None::<&str>,
        )
        .map_err(|e| format!("Failed to build tray gaming item: {}", e))?;
        let monitoring_item = MenuItem::with_id(
            app,
            "toggle_monitoring",
            "Stop Monitoring",
            true,
            None::<&str>,
        )
        .map_err(|e| format!("Failed to build tray monitoring item: {}", e))?;
        let settings_item = MenuItem::with_id(app, "open_settings", "Settings", true, None::<&str>)
            .map_err(|e| format!("Failed to build tray settings item: {}", e))?;
        let exit_item = MenuItem::with_id(app, "exit_app", "Exit", true, None::<&str>)
            .map_err(|e| format!("Failed to build tray exit item: {}", e))?;
        let sep1 = PredefinedMenuItem::separator(app)
            .map_err(|e| format!("Failed to build tray separator: {}", e))?;
        let sep2 = PredefinedMenuItem::separator(app)
            .map_err(|e| format!("Failed to build tray separator: {}", e))?;

        let menu = Menu::with_items(
            app,
            &[
                &header_item,
                &sep1,
                &open_item,
                &widget_item,
                &overlay_item,
                &gaming_item,
                &monitoring_item,
                &settings_item,
                &sep2,
                &exit_item,
            ],
        )
        .map_err(|e| format!("Failed to build tray menu: {}", e))?;

        let mut builder = TrayIconBuilder::with_id("sysmon-tray")
            .menu(&menu)
            .tooltip("SysMon Pro")
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| {
                handle_tray_menu_action(app, event.id().as_ref());
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    windows::toggle_main_dashboard(tray.app_handle());
                }
            });

        if let Some(icon) = app.default_window_icon().cloned() {
            builder = builder.icon(icon);
        }

        let tray = builder
            .build(app)
            .map_err(|e| format!("Failed to initialize system tray icon: {}", e))?;

        let mut guard = self.handles.lock().unwrap();
        *guard = Some(TrayHandles {
            tray,
            widget_item,
            overlay_item,
            gaming_item,
            monitoring_item,
        });

        Ok(())
    }

    pub fn sync_labels(&self, cfg: &DesktopConfig, gaming_active: bool, monitoring_active: bool) {
        let guard = self.handles.lock().unwrap();
        let Some(h) = guard.as_ref() else {
            return;
        };

        let _ = h.widget_item.set_text(if cfg.widget.enabled && cfg.widget.visible {
            "Hide Floating Widget"
        } else {
            "Show Floating Widget"
        });
        let _ = h.overlay_item.set_text(if cfg.overlay.enabled && cfg.overlay.visible {
            "Hide Desktop Overlay"
        } else {
            "Show Desktop Overlay"
        });
        let _ = h.gaming_item.set_text(if gaming_active {
            "Disable Gaming Mode"
        } else {
            "Enable Gaming Mode"
        });
        let _ = h.monitoring_item.set_text(if monitoring_active {
            "Stop Monitoring"
        } else {
            "Start Monitoring"
        });
    }

    pub fn update_tooltip(&self, cfg: &DesktopConfig, cpu_pct: f32, ram_pct: f32, gpu_pct: Option<f32>) {
        if !cfg.tray.enabled || !cfg.tray.show_tooltip_metrics {
            return;
        }
        let guard = self.handles.lock().unwrap();
        let Some(h) = guard.as_ref() else {
            return;
        };

        let tooltip = if let Some(gpu) = gpu_pct {
            format!(
                "SysMon Pro • CPU {:.0}% • RAM {:.0}% • GPU {:.0}%",
                cpu_pct, ram_pct, gpu
            )
        } else {
            format!("SysMon Pro • CPU {:.0}% • RAM {:.0}%", cpu_pct, ram_pct)
        };
        let _ = h.tray.set_tooltip(Some(tooltip));
    }
}

fn handle_tray_menu_action(app: &AppHandle, id: &str) {
    match id {
        "open_dashboard" => {
            windows::show_main_dashboard(app);
        }
        "toggle_widget" => {
            if let Some(state) = app.try_state::<crate::AppState>() {
                let gaming_active = state.gaming.is_active();
                let cfg = state.desktop.toggle_floating_widget(app, None, gaming_active);
                state.desktop.tray.sync_labels(
                    &cfg,
                    gaming_active,
                    state.monitoring_enabled.load(Ordering::Relaxed),
                );
            }
        }
        "toggle_overlay" => {
            if let Some(state) = app.try_state::<crate::AppState>() {
                let gaming_active = state.gaming.is_active();
                let cfg = state.desktop.toggle_desktop_overlay(app, None, gaming_active);
                state.desktop.tray.sync_labels(
                    &cfg,
                    gaming_active,
                    state.monitoring_enabled.load(Ordering::Relaxed),
                );
            }
        }
        "toggle_gaming" => {
            if let Some(state) = app.try_state::<crate::AppState>() {
                let active = state.gaming.toggle_manual();
                let cfg = state.desktop.get_config();
                let mut next_cfg = cfg.clone();
                next_cfg.gaming.enabled = active;
                state.desktop.update_config(app, next_cfg, active);
                state.desktop.tray.sync_labels(
                    &state.desktop.get_config(),
                    active,
                    state.monitoring_enabled.load(Ordering::Relaxed),
                );
            }
        }
        "toggle_monitoring" => {
            if let Some(state) = app.try_state::<crate::AppState>() {
                let prev = state.monitoring_enabled.load(Ordering::Relaxed);
                let next = !prev;
                state.monitoring_enabled.store(next, Ordering::Relaxed);
                let cfg = state.desktop.get_config();
                state.desktop.tray.sync_labels(&cfg, state.gaming.is_active(), next);
                let _ = app.emit("monitoring_state_changed", next);
            }
        }
        "open_settings" => {
            windows::show_main_dashboard(app);
            let _ = app.emit("navigate_to_page", "desktop");
        }
        "exit_app" => {
            if let Some(state) = app.try_state::<crate::AppState>() {
                state.force_quit.store(true, Ordering::SeqCst);
                state.shutdown.store(true, Ordering::SeqCst);
                state.engine.flush_network_history();
            }
            app.exit(0);
        }
        _ => {}
    }
}
