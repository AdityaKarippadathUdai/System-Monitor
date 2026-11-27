use crate::desktop::models::{ShortcutConfig, ShortcutStatus};
use crate::desktop::windows;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShortcutAction {
    ToggleDashboard = 1,
    ToggleWidget = 2,
    ToggleGamingMode = 3,
    ToggleOverlay = 4,
    ToggleClickThrough = 5,
}

impl ShortcutAction {
    fn from_id(id: i32) -> Option<Self> {
        match id {
            1 => Some(Self::ToggleDashboard),
            2 => Some(Self::ToggleWidget),
            3 => Some(Self::ToggleGamingMode),
            4 => Some(Self::ToggleOverlay),
            5 => Some(Self::ToggleClickThrough),
            _ => None,
        }
    }
}

pub fn validate_shortcuts(cfg: &ShortcutConfig) -> Result<(), String> {
    let entries = [
        ("Toggle Dashboard", cfg.toggle_dashboard.trim()),
        ("Toggle Floating Widget", cfg.toggle_widget.trim()),
        ("Toggle Gaming Mode", cfg.toggle_gaming_mode.trim()),
        ("Toggle Desktop Overlay", cfg.toggle_overlay.trim()),
        ("Toggle Click-Through", cfg.toggle_click_through.trim()),
    ];

    let mut seen = HashSet::new();
    for (name, combo) in entries {
        if combo.is_empty() {
            return Err(format!("Shortcut for '{}' cannot be empty.", name));
        }
        let normalized = normalize_combo(combo);
        if !seen.insert(normalized.clone()) {
            return Err(format!(
                "Duplicate shortcut conflict detected: '{}' is assigned more than once.",
                combo
            ));
        }
        if parse_combo(combo).is_none() {
            return Err(format!(
                "Invalid shortcut '{}' for '{}'. Use modifier + key such as Ctrl+Shift+M.",
                combo, name
            ));
        }
    }
    Ok(())
}

fn normalize_combo(combo: &str) -> String {
    combo
        .split('+')
        .map(|part| part.trim().to_ascii_lowercase())
        .collect::<Vec<_>>()
        .join("+")
}

#[derive(Debug, Clone, Copy)]
struct ParsedCombo {
    ctrl: bool,
    shift: bool,
    alt: bool,
    super_key: bool,
    key_char: char,
}

fn parse_combo(combo: &str) -> Option<ParsedCombo> {
    let parts: Vec<String> = combo
        .split('+')
        .map(|p| p.trim().to_ascii_uppercase())
        .filter(|p| !p.is_empty())
        .collect();
    if parts.len() < 2 {
        return None;
    }

    let mut ctrl = false;
    let mut shift = false;
    let mut alt = false;
    let mut super_key = false;
    let mut key_part: Option<String> = None;

    for part in parts {
        match part.as_str() {
            "CTRL" | "CONTROL" => ctrl = true,
            "SHIFT" => shift = true,
            "ALT" => alt = true,
            "SUPER" | "META" | "WIN" | "CMD" => super_key = true,
            _ => key_part = Some(part),
        }
    }

    if !ctrl && !shift && !alt && !super_key {
        return None;
    }

    let key = key_part?;
    let key_char = if key.len() == 1 {
        let ch = key.chars().next()?;
        if ch.is_ascii_alphanumeric() {
            ch
        } else {
            return None;
        }
    } else if let Some(rest) = key.strip_prefix('F') {
        // Support F1..F9 encoded as '1'..'9' only if needed; restrict to single A-Z/0-9 or F1..F12
        let num: u8 = rest.parse().ok()?;
        if (1..=12).contains(&num) {
            return Some(ParsedCombo {
                ctrl,
                shift,
                alt,
                super_key,
                key_char: char::from(b'\x80' + num),
            });
        }
        return None;
    } else {
        return None;
    };

    Some(ParsedCombo {
        ctrl,
        shift,
        alt,
        super_key,
        key_char,
    })
}

pub fn dispatch_shortcut_action(app: &AppHandle, action: ShortcutAction) {
    match action {
        ShortcutAction::ToggleDashboard => {
            windows::toggle_main_dashboard(app);
        }
        ShortcutAction::ToggleWidget => {
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
        ShortcutAction::ToggleOverlay => {
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
        ShortcutAction::ToggleGamingMode => {
            if let Some(state) = app.try_state::<crate::AppState>() {
                let active = state.gaming.toggle_manual();
                let mut cfg = state.desktop.get_config();
                cfg.gaming.enabled = active;
                state.desktop.update_config(app, cfg, active);
                state.desktop.tray.sync_labels(
                    &state.desktop.get_config(),
                    active,
                    state.monitoring_enabled.load(Ordering::Relaxed),
                );
            }
        }
        ShortcutAction::ToggleClickThrough => {
            if let Some(state) = app.try_state::<crate::AppState>() {
                let gaming_active = state.gaming.is_active();
                state.desktop.toggle_all_click_through(app, gaming_active);
            }
        }
    }
}

pub struct GlobalShortcutManager {
    stop_flag: Mutex<Option<Arc<AtomicBool>>>,
    last_status: Mutex<ShortcutStatus>,
}

impl GlobalShortcutManager {
    pub fn new() -> Self {
        Self {
            stop_flag: Mutex::new(None),
            last_status: Mutex::new(ShortcutStatus {
                registered: Vec::new(),
                failed: Vec::new(),
                global_supported: false,
                note: "Shortcuts not yet initialized.".to_string(),
            }),
        }
    }

    pub fn get_status(&self) -> ShortcutStatus {
        self.last_status.lock().unwrap().clone()
    }

    pub fn apply(&self, app: &AppHandle, cfg: &ShortcutConfig) -> Result<ShortcutStatus, String> {
        validate_shortcuts(cfg)?;

        // Signal previous listener thread to exit
        if let Some(prev_stop) = self.stop_flag.lock().unwrap().take() {
            prev_stop.store(true, Ordering::SeqCst);
        }

        let stop = Arc::new(AtomicBool::new(false));
        *self.stop_flag.lock().unwrap() = Some(stop.clone());

        let status = start_platform_shortcuts(app.clone(), cfg.clone(), stop);
        *self.last_status.lock().unwrap() = status.clone();
        Ok(status)
    }
}

#[cfg(target_os = "windows")]
fn start_platform_shortcuts(
    app: AppHandle,
    cfg: ShortcutConfig,
    stop: Arc<AtomicBool>,
) -> ShortcutStatus {
    use std::sync::mpsc;

    const MOD_ALT: u32 = 0x0001;
    const MOD_CONTROL: u32 = 0x0002;
    const MOD_SHIFT: u32 = 0x0004;
    const MOD_WIN: u32 = 0x0008;
    const MOD_NOREPEAT: u32 = 0x4000;
    const WM_HOTKEY: u32 = 0x0312;

    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }

    #[repr(C)]
    struct Msg {
        hwnd: isize,
        message: u32,
        w_param: usize,
        l_param: isize,
        time: u32,
        pt: Point,
    }

    #[link(name = "user32")]
    extern "system" {
        fn RegisterHotKey(hwnd: isize, id: i32, fs_modifiers: u32, vk: u32) -> i32;
        fn UnregisterHotKey(hwnd: isize, id: i32) -> i32;
        fn PeekMessageW(lp_msg: *mut Msg, hwnd: isize, min: u32, max: u32, remove: u32) -> i32;
    }

    let bindings = [
        (ShortcutAction::ToggleDashboard as i32, cfg.toggle_dashboard.clone()),
        (ShortcutAction::ToggleWidget as i32, cfg.toggle_widget.clone()),
        (ShortcutAction::ToggleGamingMode as i32, cfg.toggle_gaming_mode.clone()),
        (ShortcutAction::ToggleOverlay as i32, cfg.toggle_overlay.clone()),
        (ShortcutAction::ToggleClickThrough as i32, cfg.toggle_click_through.clone()),
    ];

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut registered = Vec::new();
        let mut failed = Vec::new();
        let mut active_ids = Vec::new();

        for (id, combo_str) in &bindings {
            if let Some(parsed) = parse_combo(combo_str) {
                let mut mods = MOD_NOREPEAT;
                if parsed.ctrl {
                    mods |= MOD_CONTROL;
                }
                if parsed.shift {
                    mods |= MOD_SHIFT;
                }
                if parsed.alt {
                    mods |= MOD_ALT;
                }
                if parsed.super_key {
                    mods |= MOD_WIN;
                }
                let vk = if parsed.key_char as u8 >= 0x81 {
                    0x70 + ((parsed.key_char as u8 - 0x81) as u32)
                } else {
                    parsed.key_char as u32
                };

                let ok = unsafe { RegisterHotKey(0, *id, mods, vk) } != 0;
                if ok {
                    registered.push(combo_str.clone());
                    active_ids.push(*id);
                } else {
                    failed.push(format!("{} (already claimed by OS/another app)", combo_str));
                }
            }
        }

        let _ = tx.send(ShortcutStatus {
            registered,
            failed: failed.clone(),
            global_supported: true,
            note: if failed.is_empty() {
                "Windows global hotkeys active via RegisterHotKey.".to_string()
            } else {
                "Some Windows hotkeys could not be registered due to external conflicts.".to_string()
            },
        });

        let mut msg = Msg {
            hwnd: 0,
            message: 0,
            w_param: 0,
            l_param: 0,
            time: 0,
            pt: Point { x: 0, y: 0 },
        };

        while !stop.load(Ordering::Relaxed) {
            unsafe {
                while PeekMessageW(&mut msg, 0, 0, 0, 1) != 0 {
                    if msg.message == WM_HOTKEY {
                        if let Some(action) = ShortcutAction::from_id(msg.w_param as i32) {
                            dispatch_shortcut_action(&app, action);
                        }
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(45));
        }

        for id in active_ids {
            unsafe {
                UnregisterHotKey(0, id);
            }
        }
    });

    rx.recv().unwrap_or(ShortcutStatus {
        registered: Vec::new(),
        failed: vec!["Timeout initializing Windows shortcut thread".to_string()],
        global_supported: true,
        note: "Failed to initialize global hotkeys.".to_string(),
    })
}

#[cfg(target_os = "linux")]
fn start_platform_shortcuts(
    app: AppHandle,
    cfg: ShortcutConfig,
    stop: Arc<AtomicBool>,
) -> ShortcutStatus {
    let wayland = std::env::var("WAYLAND_DISPLAY")
        .ok()
        .filter(|s| !s.is_empty())
        .is_some()
        || std::env::var("XDG_SESSION_TYPE")
            .unwrap_or_default()
            .eq_ignore_ascii_case("wayland");

    if wayland {
        return ShortcutStatus {
            registered: Vec::new(),
            failed: vec![
                cfg.toggle_dashboard,
                cfg.toggle_widget,
                cfg.toggle_gaming_mode,
                cfg.toggle_overlay,
                cfg.toggle_click_through,
            ],
            global_supported: false,
            note: "Wayland blocks unprivileged system-wide key grabs. In-window shortcuts work when focused; bind compositor shortcuts in GNOME/KDE/Hyprland for global triggers.".to_string(),
        };
    }

    // X11 dynamic runtime load via libc::dlopen("libX11.so.6") — zero extra Cargo or build deps
    use std::ffi::{c_char, c_int, c_uint, c_ulong, c_void, CString};
    use std::sync::mpsc;

    #[repr(C)]
    struct XKeyEvent {
        r#type: c_int,
        serial: c_ulong,
        send_event: c_int,
        display: *mut c_void,
        window: c_ulong,
        root: c_ulong,
        subwindow: c_ulong,
        time: c_ulong,
        x: c_int,
        y: c_int,
        x_root: c_int,
        y_root: c_int,
        state: c_uint,
        keycode: c_uint,
        same_screen: c_int,
    }

    #[repr(C)]
    union XEvent {
        r#type: c_int,
        xkey: std::mem::ManuallyDrop<XKeyEvent>,
        pad: [isize; 24],
    }

    type FnXOpenDisplay = unsafe extern "C" fn(*const c_char) -> *mut c_void;
    type FnXCloseDisplay = unsafe extern "C" fn(*mut c_void) -> c_int;
    type FnXDefaultRootWindow = unsafe extern "C" fn(*mut c_void) -> c_ulong;
    type FnXStringToKeysym = unsafe extern "C" fn(*const c_char) -> c_ulong;
    type FnXKeysymToKeycode = unsafe extern "C" fn(*mut c_void, c_ulong) -> c_uint;
    type FnXGrabKey = unsafe extern "C" fn(
        *mut c_void,
        c_int,
        c_uint,
        c_ulong,
        c_int,
        c_int,
        c_int,
    ) -> c_int;
    type FnXUngrabKey = unsafe extern "C" fn(*mut c_void, c_int, c_uint, c_ulong) -> c_int;
    type FnXPending = unsafe extern "C" fn(*mut c_void) -> c_int;
    type FnXNextEvent = unsafe extern "C" fn(*mut c_void, *mut XEvent) -> c_int;
    type FnXSync = unsafe extern "C" fn(*mut c_void, c_int) -> c_int;

    let bindings = [
        (ShortcutAction::ToggleDashboard, cfg.toggle_dashboard.clone()),
        (ShortcutAction::ToggleWidget, cfg.toggle_widget.clone()),
        (ShortcutAction::ToggleGamingMode, cfg.toggle_gaming_mode.clone()),
        (ShortcutAction::ToggleOverlay, cfg.toggle_overlay.clone()),
        (ShortcutAction::ToggleClickThrough, cfg.toggle_click_through.clone()),
    ];

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || unsafe {
        let lib_name = CString::new("libX11.so.6").unwrap();
        let lib = libc::dlopen(lib_name.as_ptr(), libc::RTLD_LAZY);
        if lib.is_null() {
            let _ = tx.send(ShortcutStatus {
                registered: Vec::new(),
                failed: bindings.iter().map(|(_, s)| s.clone()).collect(),
                global_supported: false,
                note: "libX11.so.6 not available; global hotkeys disabled outside active window.".to_string(),
            });
            return;
        }

        macro_rules! load_sym {
            ($name:expr, $ty:ty) => {{
                let cname = CString::new($name).unwrap();
                let ptr = libc::dlsym(lib, cname.as_ptr());
                if ptr.is_null() {
                    None
                } else {
                    Some(std::mem::transmute::<*mut c_void, $ty>(ptr))
                }
            }};
        }

        let (
            Some(x_open_display),
            Some(x_close_display),
            Some(x_default_root_window),
            Some(x_string_to_keysym),
            Some(x_keysym_to_keycode),
            Some(x_grab_key),
            Some(x_ungrab_key),
            Some(x_pending),
            Some(x_next_event),
            Some(x_sync),
        ) = (
            load_sym!("XOpenDisplay", FnXOpenDisplay),
            load_sym!("XCloseDisplay", FnXCloseDisplay),
            load_sym!("XDefaultRootWindow", FnXDefaultRootWindow),
            load_sym!("XStringToKeysym", FnXStringToKeysym),
            load_sym!("XKeysymToKeycode", FnXKeysymToKeycode),
            load_sym!("XGrabKey", FnXGrabKey),
            load_sym!("XUngrabKey", FnXUngrabKey),
            load_sym!("XPending", FnXPending),
            load_sym!("XNextEvent", FnXNextEvent),
            load_sym!("XSync", FnXSync),
        )
        else {
            libc::dlclose(lib);
            let _ = tx.send(ShortcutStatus {
                registered: Vec::new(),
                failed: bindings.iter().map(|(_, s)| s.clone()).collect(),
                global_supported: false,
                note: "Failed to resolve X11 global hotkey symbols.".to_string(),
            });
            return;
        };

        let display = x_open_display(std::ptr::null());
        if display.is_null() {
            libc::dlclose(lib);
            let _ = tx.send(ShortcutStatus {
                registered: Vec::new(),
                failed: bindings.iter().map(|(_, s)| s.clone()).collect(),
                global_supported: false,
                note: "Unable to open X11 display for global hotkeys.".to_string(),
            });
            return;
        }

        let root = x_default_root_window(display);
        const SHIFT_MASK: c_uint = 1 << 0;
        const LOCK_MASK: c_uint = 1 << 1;
        const CONTROL_MASK: c_uint = 1 << 2;
        const MOD1_MASK: c_uint = 1 << 3;
        const MOD2_MASK: c_uint = 1 << 4;
        const MOD4_MASK: c_uint = 1 << 6;
        const GRAB_MODE_ASYNC: c_int = 1;
        const KEY_PRESS: c_int = 2;

        let mut grabbed: Vec<(c_uint, c_uint, ShortcutAction)> = Vec::new();
        let mut registered = Vec::new();
        let mut failed = Vec::new();

        for (action, combo_str) in &bindings {
            if let Some(parsed) = parse_combo(combo_str) {
                let ks_name = if parsed.key_char as u8 >= 0x81 {
                    format!("F{}", (parsed.key_char as u8) - 0x80)
                } else {
                    parsed.key_char.to_ascii_lowercase().to_string()
                };
                let c_ks = CString::new(ks_name).unwrap();
                let keysym = x_string_to_keysym(c_ks.as_ptr());
                let keycode = x_keysym_to_keycode(display, keysym);
                if keycode == 0 {
                    failed.push(combo_str.clone());
                    continue;
                }

                let mut mask: c_uint = 0;
                if parsed.shift {
                    mask |= SHIFT_MASK;
                }
                if parsed.ctrl {
                    mask |= CONTROL_MASK;
                }
                if parsed.alt {
                    mask |= MOD1_MASK;
                }
                if parsed.super_key {
                    mask |= MOD4_MASK;
                }

                // Grab with NumLock/CapsLock permutations so lock keys do not break hotkeys
                for extra in [0, MOD2_MASK, LOCK_MASK, MOD2_MASK | LOCK_MASK] {
                    x_grab_key(
                        display,
                        keycode as c_int,
                        mask | extra,
                        root,
                        0,
                        GRAB_MODE_ASYNC,
                        GRAB_MODE_ASYNC,
                    );
                }
                grabbed.push((keycode, mask, *action));
                registered.push(combo_str.clone());
            } else {
                failed.push(combo_str.clone());
            }
        }
        x_sync(display, 0);

        let _ = tx.send(ShortcutStatus {
            registered,
            failed,
            global_supported: true,
            note: "X11 global hotkeys active via root XGrabKey.".to_string(),
        });

        let mut ev = XEvent { pad: [0; 24] };
        while !stop.load(Ordering::Relaxed) {
            while x_pending(display) > 0 {
                x_next_event(display, &mut ev);
                if ev.r#type == KEY_PRESS {
                    let key_ev = &*ev.xkey;
                    let clean_state = key_ev.state & (SHIFT_MASK | CONTROL_MASK | MOD1_MASK | MOD4_MASK);
                    for (kc, mask, action) in &grabbed {
                        if key_ev.keycode == *kc && clean_state == *mask {
                            dispatch_shortcut_action(&app, *action);
                            break;
                        }
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(45));
        }

        for (kc, mask, _) in grabbed {
            for extra in [0, MOD2_MASK, LOCK_MASK, MOD2_MASK | LOCK_MASK] {
                x_ungrab_key(display, kc as c_int, mask | extra, root);
            }
        }
        x_close_display(display);
        libc::dlclose(lib);
    });

    rx.recv().unwrap_or(ShortcutStatus {
        registered: Vec::new(),
        failed: vec!["Failed to start X11 global hotkey thread".to_string()],
        global_supported: false,
        note: "X11 shortcut initialization failed.".to_string(),
    })
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn start_platform_shortcuts(
    _app: AppHandle,
    _cfg: ShortcutConfig,
    _stop: Arc<AtomicBool>,
) -> ShortcutStatus {
    ShortcutStatus {
        registered: Vec::new(),
        failed: Vec::new(),
        global_supported: false,
        note: "Global shortcuts are implemented for Windows and Linux X11.".to_string(),
    }
}
