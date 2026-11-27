pub mod models;
pub mod platform;
pub mod windows;

use crate::desktop::models::{
    load_desktop_config, save_desktop_config, DesktopConfig, DesktopPlatformCapabilities,
};
use crate::tray::TrayController;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

pub struct DesktopManager {
    pub config: Arc<Mutex<DesktopConfig>>,
    pub capabilities: DesktopPlatformCapabilities,
    pub tray: TrayController,
}

impl DesktopManager {
    pub fn new(start_widget_flag: bool, start_minimized_flag: bool, no_background_flag: bool) -> Self {
        let mut cfg = load_desktop_config();
        if start_widget_flag {
            cfg.widget.enabled = true;
            cfg.widget.visible = true;
        }
        if start_minimized_flag {
            cfg.tray.start_minimized = true;
        }
        if no_background_flag {
            cfg.background.enabled = false;
        }
        Self {
            config: Arc::new(Mutex::new(cfg)),
            capabilities: platform::detect_desktop_capabilities(),
            tray: TrayController::new(),
        }
    }

    pub fn get_config(&self) -> DesktopConfig {
        self.config.lock().unwrap().clone()
    }

    pub fn update_config(&self, app: &AppHandle, next: DesktopConfig, gaming_active: bool) -> DesktopConfig {
        {
            let mut guard = self.config.lock().unwrap();
            *guard = next.clone();
            save_desktop_config(&guard);
        }
        self.sync_windows(app, gaming_active);
        let _ = app.emit("desktop_config_updated", &next);
        next
    }

    pub fn sync_windows(&self, app: &AppHandle, gaming_active: bool) {
        let cfg = self.get_config();
        windows::ensure_floating_widget(app, &cfg, &self.capabilities, self.config.clone());
        windows::ensure_desktop_overlay(app, &cfg, &self.capabilities, self.config.clone());
        windows::ensure_gaming_overlay(
            app,
            &cfg,
            gaming_active,
            &self.capabilities,
            self.config.clone(),
        );
        self.tray.sync_labels(&cfg, gaming_active, true);
    }

    pub fn toggle_floating_widget(&self, app: &AppHandle, visible: Option<bool>, gaming_active: bool) -> DesktopConfig {
        let next = {
            let mut cfg = self.config.lock().unwrap();
            let target = visible.unwrap_or(!(cfg.widget.enabled && cfg.widget.visible));
            cfg.widget.enabled = target;
            cfg.widget.visible = target;
            save_desktop_config(&cfg);
            cfg.clone()
        };
        self.sync_windows(app, gaming_active);
        let _ = app.emit("desktop_config_updated", &next);
        next
    }

    pub fn toggle_desktop_overlay(&self, app: &AppHandle, visible: Option<bool>, gaming_active: bool) -> DesktopConfig {
        let next = {
            let mut cfg = self.config.lock().unwrap();
            let target = visible.unwrap_or(!(cfg.overlay.enabled && cfg.overlay.visible));
            cfg.overlay.enabled = target;
            cfg.overlay.visible = target;
            save_desktop_config(&cfg);
            cfg.clone()
        };
        self.sync_windows(app, gaming_active);
        let _ = app.emit("desktop_config_updated", &next);
        next
    }

    pub fn set_click_through(
        &self,
        app: &AppHandle,
        target: &str,
        enabled: Option<bool>,
        gaming_active: bool,
    ) -> DesktopConfig {
        let next = {
            let mut cfg = self.config.lock().unwrap();
            match target {
                "widget" => {
                    cfg.widget.click_through = enabled.unwrap_or(!cfg.widget.click_through);
                }
                "overlay" => {
                    cfg.overlay.click_through = enabled.unwrap_or(!cfg.overlay.click_through);
                }
                "gaming" => {
                    cfg.gaming.click_through = enabled.unwrap_or(!cfg.gaming.click_through);
                }
                "all" => {
                    let any_locked = cfg.widget.click_through || cfg.overlay.click_through || cfg.gaming.click_through;
                    let val = enabled.unwrap_or(!any_locked);
                    cfg.widget.click_through = val;
                    cfg.overlay.click_through = val;
                    cfg.gaming.click_through = val;
                }
                _ => {}
            }
            save_desktop_config(&cfg);
            cfg.clone()
        };
        self.sync_windows(app, gaming_active);
        let _ = app.emit("desktop_config_updated", &next);
        next
    }

    pub fn toggle_all_click_through(&self, app: &AppHandle, gaming_active: bool) -> DesktopConfig {
        self.set_click_through(app, "all", None, gaming_active)
    }

    pub fn should_minimize_to_tray_on_close(&self) -> bool {
        let cfg = self.config.lock().unwrap();
        cfg.tray.enabled && cfg.tray.minimize_to_tray_on_close
    }

    pub fn hide_main_window(&self, app: &AppHandle) {
        if let Some(win) = app.get_webview_window(windows::MAIN_WINDOW_LABEL) {
            let _ = win.hide();
        }
    }
}
