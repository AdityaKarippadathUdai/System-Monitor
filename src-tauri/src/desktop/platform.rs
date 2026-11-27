use super::models::{BatteryStats, DesktopPlatformCapabilities};
use std::fs;
use std::path::Path;

pub fn detect_desktop_capabilities() -> DesktopPlatformCapabilities {
    #[cfg(target_os = "windows")]
    {
        DesktopPlatformCapabilities {
            platform: "windows".to_string(),
            display_server: "Desktop Window Manager (DWM)".to_string(),
            desktop_environment: "Windows Shell".to_string(),
            transparency_supported: true,
            blur_supported: true,
            click_through_supported: true,
            always_on_top_supported: true,
            positioning_supported: true,
            global_shortcuts_supported: true,
            tray_supported: true,
            limitations: vec![
                "Exclusive fullscreen DirectX/Vulkan games may bypass desktop topmost overlays; use Borderless Windowed mode for reliable overlay visibility.".to_string(),
                "Global hotkeys use Win32 RegisterHotKey and will fail for combinations already claimed by Windows or another application.".to_string(),
            ],
        }
    }

    #[cfg(target_os = "linux")]
    {
        let wayland_display = std::env::var("WAYLAND_DISPLAY").ok().filter(|s| !s.is_empty());
        let session_type = std::env::var("XDG_SESSION_TYPE")
            .unwrap_or_default()
            .to_lowercase();
        let x11_display = std::env::var("DISPLAY").ok().filter(|s| !s.is_empty());
        let desktop_env = std::env::var("XDG_CURRENT_DESKTOP")
            .or_else(|_| std::env::var("DESKTOP_SESSION"))
            .unwrap_or_else(|_| "Unknown".to_string());
        let de_lower = desktop_env.to_lowercase();

        let is_wayland = wayland_display.is_some() || session_type == "wayland";
        let is_x11 = !is_wayland && (x11_display.is_some() || session_type == "x11");

        if is_wayland {
            let mut limitations = vec![
                "Wayland compositors restrict clients from positioning their own windows at arbitrary screen (x, y) coordinates.".to_string(),
                "Unprivileged global keyboard shortcuts cannot intercept keys system-wide on Wayland; configure compositor shortcuts or run under X11.".to_string(),
            ];

            if de_lower.contains("gnome") {
                limitations.push(
                    "GNOME Wayland (Mutter) restricts universal always-on-top and click-through for ordinary windows unless promoted via compositor window rules.".to_string(),
                );
            } else if de_lower.contains("kde") || de_lower.contains("plasma") {
                limitations.push(
                    "KDE Plasma Wayland supports transparency and click-through input masks, while absolute window placement is controlled by KWin Window Rules.".to_string(),
                );
            } else {
                limitations.push(
                    "Floating widget positioning, click-through, and topmost layering on Wayland depend on your compositor (e.g., Hyprland/Sway window rules).".to_string(),
                );
            }

            DesktopPlatformCapabilities {
                platform: "linux".to_string(),
                display_server: "Wayland".to_string(),
                desktop_environment: desktop_env,
                transparency_supported: true,
                blur_supported: de_lower.contains("kde") || de_lower.contains("hyprland"),
                click_through_supported: !de_lower.contains("gnome"),
                always_on_top_supported: false,
                positioning_supported: false,
                global_shortcuts_supported: false,
                tray_supported: true,
                limitations,
            }
        } else if is_x11 {
            DesktopPlatformCapabilities {
                platform: "linux".to_string(),
                display_server: "X11".to_string(),
                desktop_environment: desktop_env,
                transparency_supported: true,
                blur_supported: false,
                click_through_supported: true,
                always_on_top_supported: true,
                positioning_supported: true,
                global_shortcuts_supported: true,
                tray_supported: true,
                limitations: vec![
                    "Window transparency requires a running X11 compositor (e.g., Picom, KWin, Mutter, XFWM4).".to_string(),
                    "Native frosted blur behind transparent windows is compositor-dependent on X11; CSS glass surface fallback is active.".to_string(),
                ],
            }
        } else {
            DesktopPlatformCapabilities {
                platform: "linux".to_string(),
                display_server: "Headless / TTY".to_string(),
                desktop_environment: desktop_env,
                transparency_supported: false,
                blur_supported: false,
                click_through_supported: false,
                always_on_top_supported: false,
                positioning_supported: false,
                global_shortcuts_supported: false,
                tray_supported: false,
                limitations: vec![
                    "No X11 or Wayland graphical session detected.".to_string(),
                ],
            }
        }
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        DesktopPlatformCapabilities {
            platform: std::env::consts::OS.to_string(),
            display_server: "Unknown".to_string(),
            desktop_environment: "Unknown".to_string(),
            transparency_supported: true,
            blur_supported: false,
            click_through_supported: true,
            always_on_top_supported: true,
            positioning_supported: true,
            global_shortcuts_supported: false,
            tray_supported: true,
            limitations: vec![],
        }
    }
}

pub fn collect_battery_stats() -> Option<BatteryStats> {
    #[cfg(target_os = "linux")]
    {
        collect_linux_battery()
    }
    #[cfg(target_os = "windows")]
    {
        collect_windows_battery()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        None
    }
}

#[cfg(target_os = "linux")]
fn collect_linux_battery() -> Option<BatteryStats> {
    let base = Path::new("/sys/class/power_supply");
    let entries = fs::read_dir(base).ok()?;

    let mut bat_path: Option<std::path::PathBuf> = None;
    let mut ac_online = false;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        if name.starts_with("BAT") && bat_path.is_none() {
            bat_path = Some(path);
        } else if name.starts_with("AC") || name.starts_with("ADP") {
            if let Ok(online) = fs::read_to_string(path.join("online")) {
                if online.trim() == "1" {
                    ac_online = true;
                }
            }
        }
    }

    let bat = bat_path?;
    let capacity = fs::read_to_string(bat.join("capacity"))
        .ok()
        .and_then(|s| s.trim().parse::<f32>().ok())?;
    let status = fs::read_to_string(bat.join("status"))
        .unwrap_or_else(|_| "Unknown".to_string())
        .trim()
        .to_string();

    let is_charging = status.eq_ignore_ascii_case("Charging");
    let power_uw = fs::read_to_string(bat.join("power_now"))
        .ok()
        .and_then(|s| s.trim().parse::<f64>().ok())
        .or_else(|| {
            let cur = fs::read_to_string(bat.join("current_now"))
                .ok()
                .and_then(|s| s.trim().parse::<f64>().ok())?;
            let volt = fs::read_to_string(bat.join("voltage_now"))
                .ok()
                .and_then(|s| s.trim().parse::<f64>().ok())?;
            Some((cur * volt) / 1_000_000.0)
        });

    let power_watts = power_uw
        .filter(|&uw| uw > 0.0)
        .map(|uw| ((uw / 1_000_000.0) * 10.0).round() as f32 / 10.0);

    let energy_now = fs::read_to_string(bat.join("energy_now"))
        .ok()
        .and_then(|s| s.trim().parse::<f64>().ok());
    let energy_full = fs::read_to_string(bat.join("energy_full"))
        .ok()
        .and_then(|s| s.trim().parse::<f64>().ok());

    let time_remaining_secs = match (power_uw, energy_now, energy_full) {
        (Some(p), Some(en), Some(ef)) if p > 10_000.0 => {
            if is_charging && ef > en {
                Some((((ef - en) / p) * 3600.0).round() as u64)
            } else if status.eq_ignore_ascii_case("Discharging") && en > 0.0 {
                Some(((en / p) * 3600.0).round() as u64)
            } else {
                None
            }
        }
        _ => None,
    };

    Some(BatteryStats {
        percent: capacity.clamp(0.0, 100.0),
        is_charging,
        ac_online: ac_online || is_charging || status.eq_ignore_ascii_case("Full"),
        state: status,
        time_remaining_secs,
        power_watts,
    })
}

#[cfg(target_os = "windows")]
fn collect_windows_battery() -> Option<BatteryStats> {
    #[repr(C)]
    struct SystemPowerStatus {
        ac_line_status: u8,
        battery_flag: u8,
        battery_life_percent: u8,
        system_status_flag: u8,
        battery_life_time: u32,
        battery_full_life_time: u32,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetSystemPowerStatus(lp_system_power_status: *mut SystemPowerStatus) -> i32;
    }

    unsafe {
        let mut s = SystemPowerStatus {
            ac_line_status: 255,
            battery_flag: 255,
            battery_life_percent: 255,
            system_status_flag: 0,
            battery_life_time: u32::MAX,
            battery_full_life_time: u32::MAX,
        };
        if GetSystemPowerStatus(&mut s) == 0 {
            return None;
        }
        // 128 = No system battery, 255 = Unknown
        if s.battery_flag == 128 || s.battery_flag == 255 || s.battery_life_percent > 100 {
            return None;
        }

        let ac_online = s.ac_line_status == 1;
        let is_charging = (s.battery_flag & 8) != 0;
        let state = if is_charging {
            "Charging".to_string()
        } else if ac_online && s.battery_life_percent >= 99 {
            "Full".to_string()
        } else if ac_online {
            "AC Power".to_string()
        } else {
            "Discharging".to_string()
        };

        let time_remaining_secs = if s.battery_life_time != u32::MAX {
            Some(s.battery_life_time as u64)
        } else {
            None
        };

        Some(BatteryStats {
            percent: s.battery_life_percent as f32,
            is_charging,
            ac_online,
            state,
            time_remaining_secs,
            power_watts: None,
        })
    }
}

#[cfg(target_os = "windows")]
pub fn apply_windows_overlay_style(raw_hwnd: isize, no_activate: bool, enable_blur: bool) {
    const GWL_EXSTYLE: i32 = -20;
    const WS_EX_NOACTIVATE: isize = 0x0800_0000;
    const WS_EX_TOOLWINDOW: isize = 0x0000_0080;

    #[repr(C)]
    struct DwmBlurBehind {
        dw_flags: u32,
        f_enable: i32,
        h_rgn_blur: isize,
        f_transition_on_maximized: i32,
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetWindowLongPtrW(hwnd: isize, n_index: i32) -> isize;
        fn SetWindowLongPtrW(hwnd: isize, n_index: i32, dw_new_long: isize) -> isize;
    }

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmEnableBlurBehindWindow(hwnd: isize, p_blur_behind: *const DwmBlurBehind) -> i32;
    }

    if raw_hwnd == 0 {
        return;
    }

    unsafe {
        let mut ex_style = GetWindowLongPtrW(raw_hwnd, GWL_EXSTYLE);
        ex_style |= WS_EX_TOOLWINDOW;
        if no_activate {
            ex_style |= WS_EX_NOACTIVATE;
        } else {
            ex_style &= !WS_EX_NOACTIVATE;
        }
        SetWindowLongPtrW(raw_hwnd, GWL_EXSTYLE, ex_style);

        let bb = DwmBlurBehind {
            dw_flags: 0x0000_0001, // DWM_BB_ENABLE
            f_enable: if enable_blur { 1 } else { 0 },
            h_rgn_blur: 0,
            f_transition_on_maximized: 0,
        };
        let _ = DwmEnableBlurBehindWindow(raw_hwnd, &bb);
    }
}
