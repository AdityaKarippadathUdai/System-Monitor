use super::models::{DesktopConfig, DesktopPlatformCapabilities};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const WIDGET_WINDOW_LABEL: &str = "floating-widget";
pub const OVERLAY_WINDOW_LABEL: &str = "desktop-overlay";
pub const GAMING_WINDOW_LABEL: &str = "gaming-overlay";

fn compute_preset_logical_pos(
    app: &AppHandle,
    preset: &str,
    width: u32,
    height: u32,
    fallback_x: i32,
    fallback_y: i32,
) -> (f64, f64) {
    let margin = 20.0_f64;
    if preset == "custom" {
        return (fallback_x as f64, fallback_y as f64);
    }

    let Some(main_win) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return (fallback_x as f64, fallback_y as f64);
    };

    let Ok(Some(monitor)) = main_win.primary_monitor() else {
        return (fallback_x as f64, fallback_y as f64);
    };

    let scale = monitor.scale_factor().max(1.0);
    let phys_size = monitor.size();
    let phys_pos = monitor.position();
    let sw = phys_size.width as f64 / scale;
    let sh = phys_size.height as f64 / scale;
    let ox = phys_pos.x as f64 / scale;
    let oy = phys_pos.y as f64 / scale;
    let w = width as f64;
    let h = height as f64;

    match preset {
        "top-left" => (ox + margin, oy + margin),
        "top-right" => (ox + (sw - w - margin).max(margin), oy + margin),
        "bottom-left" => (ox + margin, oy + (sh - h - margin - 40.0).max(margin)),
        "bottom-right" => (
            ox + (sw - w - margin).max(margin),
            oy + (sh - h - margin - 40.0).max(margin),
        ),
        _ => (fallback_x as f64, fallback_y as f64),
    }
}

fn apply_native_window_hints(
    window: &WebviewWindow,
    always_on_top: bool,
    click_through: bool,
    no_activate: bool,
    enable_blur: bool,
    caps: &DesktopPlatformCapabilities,
) {
    if caps.always_on_top_supported {
        let _ = window.set_always_on_top(always_on_top);
    }
    if caps.click_through_supported {
        let _ = window.set_ignore_cursor_events(click_through);
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = window.hwnd() {
            super::platform::apply_windows_overlay_style(hwnd.0 as isize, no_activate, enable_blur);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (no_activate, enable_blur);
    }
}

fn attach_geometry_listeners(
    window: WebviewWindow,
    label: &'static str,
    config_lock: Arc<Mutex<DesktopConfig>>,
    app_handle: AppHandle,
) {
    let win_clone = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(pos) => {
            // Ignore Windows minimized sentinel coordinates (-32000)
            if pos.x <= -10_000 || pos.y <= -10_000 {
                return;
            }
            let scale = win_clone.scale_factor().unwrap_or(1.0).max(1.0);
            let lx = (pos.x as f64 / scale).round() as i32;
            let ly = (pos.y as f64 / scale).round() as i32;
            if let Ok(mut cfg) = config_lock.lock() {
                match label {
                    WIDGET_WINDOW_LABEL => {
                        cfg.widget.x = lx;
                        cfg.widget.y = ly;
                    }
                    OVERLAY_WINDOW_LABEL => {
                        cfg.overlay.x = lx;
                        cfg.overlay.y = ly;
                        cfg.overlay.position_preset = "custom".to_string();
                    }
                    GAMING_WINDOW_LABEL => {
                        cfg.gaming.x = lx;
                        cfg.gaming.y = ly;
                        cfg.gaming.position_preset = "custom".to_string();
                    }
                    _ => {}
                }
                super::models::save_desktop_config(&cfg);
            }
        }
        WindowEvent::Resized(size) => {
            if size.width < 120 || size.height < 48 {
                return;
            }
            let scale = win_clone.scale_factor().unwrap_or(1.0).max(1.0);
            let lw = (size.width as f64 / scale).round() as u32;
            let lh = (size.height as f64 / scale).round() as u32;
            if let Ok(mut cfg) = config_lock.lock() {
                match label {
                    WIDGET_WINDOW_LABEL => {
                        cfg.widget.width = lw;
                        cfg.widget.height = lh;
                    }
                    OVERLAY_WINDOW_LABEL => {
                        cfg.overlay.width = lw;
                        cfg.overlay.height = lh;
                    }
                    GAMING_WINDOW_LABEL => {
                        cfg.gaming.width = lw;
                        cfg.gaming.height = lh;
                    }
                    _ => {}
                }
                super::models::save_desktop_config(&cfg);
            }
        }
        WindowEvent::CloseRequested { api, .. } => {
            // Secondary windows hide instead of quitting the application
            api.prevent_close();
            let _ = win_clone.hide();
            if let Ok(mut cfg) = config_lock.lock() {
                match label {
                    WIDGET_WINDOW_LABEL => {
                        cfg.widget.visible = false;
                        cfg.widget.enabled = false;
                    }
                    OVERLAY_WINDOW_LABEL => {
                        cfg.overlay.visible = false;
                        cfg.overlay.enabled = false;
                    }
                    GAMING_WINDOW_LABEL => {
                        cfg.gaming.enabled = false;
                    }
                    _ => {}
                }
                super::models::save_desktop_config(&cfg);
                let _ = app_handle.emit("desktop_config_updated", &*cfg);
            }
        }
        _ => {}
    });
}

pub fn ensure_floating_widget(
    app: &AppHandle,
    cfg: &DesktopConfig,
    caps: &DesktopPlatformCapabilities,
    config_lock: Arc<Mutex<DesktopConfig>>,
) {
    let should_show = cfg.widget.enabled && cfg.widget.visible;
    if let Some(win) = app.get_webview_window(WIDGET_WINDOW_LABEL) {
        if should_show {
            let _ = win.show();
            apply_native_window_hints(
                &win,
                cfg.widget.always_on_top,
                cfg.widget.click_through,
                false,
                cfg.widget.background_blur && cfg.appearance.background_blur,
                caps,
            );
        } else {
            let _ = win.hide();
        }
        return;
    }

    if !should_show {
        return;
    }

    let (w, h) = match cfg.widget.size_preset.as_str() {
        "small" => (256, 260),
        "medium" => (316, 360),
        "large" => (388, 460),
        _ => (cfg.widget.width.max(220), cfg.widget.height.max(180)),
    };

    let mut builder = WebviewWindowBuilder::new(
        app,
        WIDGET_WINDOW_LABEL,
        WebviewUrl::App("index.html?window=widget".into()),
    )
    .title("SysMon Pro Widget")
    .inner_size(w as f64, h as f64)
    .min_inner_size(210.0, 140.0)
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .skip_taskbar(true)
    .always_on_top(cfg.widget.always_on_top)
    .focused(false)
    .visible(true);

    if caps.positioning_supported {
        let (wx, wy) = if cfg.startup.restore_widget_position {
            (cfg.widget.x as f64, cfg.widget.y as f64)
        } else {
            (36.0, 48.0)
        };
        builder = builder.position(wx, wy);
    }

    if let Ok(win) = builder.build() {
        apply_native_window_hints(
            &win,
            cfg.widget.always_on_top,
            cfg.widget.click_through,
            false,
            cfg.widget.background_blur && cfg.appearance.background_blur,
            caps,
        );
        attach_geometry_listeners(win, WIDGET_WINDOW_LABEL, config_lock, app.clone());
    }
}

pub fn ensure_desktop_overlay(
    app: &AppHandle,
    cfg: &DesktopConfig,
    caps: &DesktopPlatformCapabilities,
    config_lock: Arc<Mutex<DesktopConfig>>,
) {
    let should_show = cfg.overlay.enabled && cfg.overlay.visible;
    if let Some(win) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        if should_show {
            if caps.positioning_supported && cfg.overlay.position_preset != "custom" {
                let (x, y) = compute_preset_logical_pos(
                    app,
                    &cfg.overlay.position_preset,
                    cfg.overlay.width,
                    cfg.overlay.height,
                    cfg.overlay.x,
                    cfg.overlay.y,
                );
                let _ = win.set_position(tauri::LogicalPosition::new(x, y));
            }
            let _ = win.show();
            apply_native_window_hints(
                &win,
                cfg.overlay.always_on_top,
                cfg.overlay.click_through,
                true,
                cfg.overlay.background_blur && cfg.appearance.background_blur,
                caps,
            );
        } else {
            let _ = win.hide();
        }
        return;
    }

    if !should_show {
        return;
    }

    let (x, y) = compute_preset_logical_pos(
        app,
        &cfg.overlay.position_preset,
        cfg.overlay.width,
        cfg.overlay.height,
        cfg.overlay.x,
        cfg.overlay.y,
    );

    let mut builder = WebviewWindowBuilder::new(
        app,
        OVERLAY_WINDOW_LABEL,
        WebviewUrl::App("index.html?window=overlay".into()),
    )
    .title("SysMon Pro Overlay")
    .inner_size(cfg.overlay.width.max(260) as f64, cfg.overlay.height.max(54) as f64)
    .min_inner_size(240.0, 48.0)
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .skip_taskbar(true)
    .always_on_top(cfg.overlay.always_on_top)
    .focused(false)
    .visible(true);

    if caps.positioning_supported {
        builder = builder.position(x, y);
    }

    if let Ok(win) = builder.build() {
        apply_native_window_hints(
            &win,
            cfg.overlay.always_on_top,
            cfg.overlay.click_through,
            true,
            cfg.overlay.background_blur && cfg.appearance.background_blur,
            caps,
        );
        attach_geometry_listeners(win, OVERLAY_WINDOW_LABEL, config_lock, app.clone());
    }
}

pub fn ensure_gaming_overlay(
    app: &AppHandle,
    cfg: &DesktopConfig,
    gaming_active: bool,
    caps: &DesktopPlatformCapabilities,
    config_lock: Arc<Mutex<DesktopConfig>>,
) {
    if let Some(win) = app.get_webview_window(GAMING_WINDOW_LABEL) {
        if gaming_active {
            if caps.positioning_supported && cfg.gaming.position_preset != "custom" {
                let (x, y) = compute_preset_logical_pos(
                    app,
                    &cfg.gaming.position_preset,
                    cfg.gaming.width,
                    cfg.gaming.height,
                    cfg.gaming.x,
                    cfg.gaming.y,
                );
                let _ = win.set_position(tauri::LogicalPosition::new(x, y));
            }
            let _ = win.show();
            apply_native_window_hints(
                &win,
                cfg.gaming.always_on_top,
                cfg.gaming.click_through,
                true,
                false,
                caps,
            );
        } else {
            let _ = win.hide();
        }
        return;
    }

    if !gaming_active {
        return;
    }

    let (x, y) = compute_preset_logical_pos(
        app,
        &cfg.gaming.position_preset,
        cfg.gaming.width,
        cfg.gaming.height,
        cfg.gaming.x,
        cfg.gaming.y,
    );

    let mut builder = WebviewWindowBuilder::new(
        app,
        GAMING_WINDOW_LABEL,
        WebviewUrl::App("index.html?window=gaming".into()),
    )
    .title("SysMon Pro Gaming HUD")
    .inner_size(cfg.gaming.width.max(220) as f64, cfg.gaming.height.max(120) as f64)
    .min_inner_size(200.0, 90.0)
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .skip_taskbar(true)
    .always_on_top(cfg.gaming.always_on_top)
    .focused(false)
    .visible(true);

    if caps.positioning_supported {
        builder = builder.position(x, y);
    }

    if let Ok(win) = builder.build() {
        apply_native_window_hints(
            &win,
            cfg.gaming.always_on_top,
            cfg.gaming.click_through,
            true,
            false,
            caps,
        );
        attach_geometry_listeners(win, GAMING_WINDOW_LABEL, config_lock, app.clone());
    }
}

pub fn show_main_dashboard(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

pub fn toggle_main_dashboard(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let visible = win.is_visible().unwrap_or(true);
        let minimized = win.is_minimized().unwrap_or(false);
        if visible && !minimized {
            let _ = win.hide();
        } else {
            let _ = win.unminimize();
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

pub fn any_window_visible(app: &AppHandle) -> bool {
    [
        MAIN_WINDOW_LABEL,
        WIDGET_WINDOW_LABEL,
        OVERLAY_WINDOW_LABEL,
        GAMING_WINDOW_LABEL,
    ]
    .iter()
    .any(|label| {
        app.get_webview_window(label)
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(false)
    })
}
