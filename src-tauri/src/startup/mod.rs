use crate::desktop::models::{StartupConfig, StartupStatus};

pub fn apply_startup_config(config: &StartupConfig) -> Result<StartupStatus, String> {
    #[cfg(target_os = "linux")]
    {
        apply_linux_startup(config)
    }
    #[cfg(target_os = "windows")]
    {
        apply_windows_startup(config)
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = config;
        Ok(StartupStatus {
            enabled: false,
            mechanism: "Unsupported".to_string(),
            entry_path: String::new(),
            note: "Startup registration is implemented for Linux (XDG Autostart) and Windows (HKCU Run).".to_string(),
        })
    }
}

pub fn get_startup_status() -> StartupStatus {
    #[cfg(target_os = "linux")]
    {
        get_linux_startup_status()
    }
    #[cfg(target_os = "windows")]
    {
        get_windows_startup_status()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        StartupStatus {
            enabled: false,
            mechanism: "Unsupported".to_string(),
            entry_path: String::new(),
            note: "Startup registration is implemented for Linux and Windows.".to_string(),
        }
    }
}

fn build_launch_args(config: &StartupConfig) -> Vec<String> {
    let mut args = Vec::new();
    if config.start_minimized {
        args.push("--minimized".to_string());
    }
    if config.start_floating_widget {
        args.push("--widget".to_string());
    }
    if !config.start_background_monitoring {
        args.push("--no-background".to_string());
    }
    args
}

#[cfg(target_os = "linux")]
fn linux_autostart_path() -> Option<std::path::PathBuf> {
    std::env::var_os("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".config"))
        })
        .map(|dir| dir.join("autostart").join("sysmon-pro.desktop"))
}

#[cfg(target_os = "linux")]
fn apply_linux_startup(config: &StartupConfig) -> Result<StartupStatus, String> {
    let path = linux_autostart_path()
        .ok_or_else(|| "Unable to determine XDG autostart directory ($XDG_CONFIG_HOME or $HOME).".to_string())?;

    if !config.launch_at_login {
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("Failed to remove autostart entry: {}", e))?;
        }
        return Ok(StartupStatus {
            enabled: false,
            mechanism: "XDG Autostart (~/.config/autostart)".to_string(),
            entry_path: path.to_string_lossy().to_string(),
            note: "Autostart desktop entry removed cleanly.".to_string(),
        });
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create autostart directory: {}", e))?;
    }

    let exe = std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "sysmon-pro".to_string());
    let args = build_launch_args(config);
    let exec_line = if args.is_empty() {
        format!("\"{}\"", exe)
    } else {
        format!("\"{}\" {}", exe, args.join(" "))
    };

    let desktop_content = format!(
        "[Desktop Entry]\nType=Application\nVersion=1.0\nName=SysMon Pro\nComment=Cross-platform real-time hardware telemetry and desktop monitor\nExec={}\nIcon=sysmon-pro\nTerminal=false\nCategories=System;Monitor;\nStartupNotify=false\nX-GNOME-Autostart-enabled=true\n",
        exec_line
    );

    std::fs::write(&path, desktop_content)
        .map_err(|e| format!("Failed to write XDG autostart file: {}", e))?;

    Ok(StartupStatus {
        enabled: true,
        mechanism: "XDG Autostart (~/.config/autostart)".to_string(),
        entry_path: path.to_string_lossy().to_string(),
        note: "Launch-at-login configured via XDG autostart without root privileges.".to_string(),
    })
}

#[cfg(target_os = "linux")]
fn get_linux_startup_status() -> StartupStatus {
    let path = linux_autostart_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "~/.config/autostart/sysmon-pro.desktop".to_string());
    let enabled = linux_autostart_path().map(|p| p.exists()).unwrap_or(false);
    StartupStatus {
        enabled,
        mechanism: "XDG Autostart (~/.config/autostart)".to_string(),
        entry_path: path,
        note: if enabled {
            "XDG autostart entry is installed.".to_string()
        } else {
            "XDG autostart entry is not present.".to_string()
        },
    }
}

#[cfg(target_os = "windows")]
const RUN_SUBKEY: windows::core::PCWSTR =
    windows::core::w!(r#"Software\Microsoft\Windows\CurrentVersion\Run"#);
#[cfg(target_os = "windows")]
const RUN_VALUE_NAME: windows::core::PCWSTR = windows::core::w!("SysMonPro");

#[cfg(target_os = "windows")]
fn apply_windows_startup(config: &StartupConfig) -> Result<StartupStatus, String> {
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
        KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    unsafe {
        let mut hkey = HKEY::default();
        let open_res = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            RUN_SUBKEY,
            0,
            None,
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut hkey,
            None,
        );
        if open_res.is_err() {
            return Err(format!("Failed to open HKCU Run key: {:?}", open_res));
        }

        if !config.launch_at_login {
            let _ = RegDeleteValueW(hkey, RUN_VALUE_NAME);
            let _ = RegCloseKey(hkey);
            return Ok(StartupStatus {
                enabled: false,
                mechanism: "Windows Registry (HKCU\\...\\Run)".to_string(),
                entry_path: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\SysMonPro"
                    .to_string(),
                note: "Windows startup registry entry removed.".to_string(),
            });
        }

        let exe = std::env::current_exe()
            .map(|p| p.to_string_lossy().to_string())
            .map_err(|e| format!("Failed to resolve executable path: {}", e))?;
        let args = build_launch_args(config);
        let cmd = if args.is_empty() {
            format!("\"{}\"", exe)
        } else {
            format!("\"{}\" {}", exe, args.join(" "))
        };

        let mut wide: Vec<u16> = cmd.encode_utf16().collect();
        wide.push(0);
        let byte_slice = std::slice::from_raw_parts(
            wide.as_ptr() as *const u8,
            wide.len() * std::mem::size_of::<u16>(),
        );

        let set_res = RegSetValueExW(hkey, RUN_VALUE_NAME, 0, REG_SZ, Some(byte_slice));
        let _ = RegCloseKey(hkey);

        if set_res.is_err() {
            return Err(format!("Failed to write startup value: {:?}", set_res));
        }

        Ok(StartupStatus {
            enabled: true,
            mechanism: "Windows Registry (HKCU\\...\\Run)".to_string(),
            entry_path: format!(
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\SysMonPro = {}",
                cmd
            ),
            note: "Windows launch-at-login configured under current user without Administrator rights."
                .to_string(),
        })
    }
}

#[cfg(target_os = "windows")]
fn get_windows_startup_status() -> StartupStatus {
    use std::ffi::c_void;
    use windows::Win32::System::Registry::{
        RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ,
    };

    unsafe {
        let mut cb_data: u32 = 0;
        let exists = RegGetValueW(
            HKEY_CURRENT_USER,
            RUN_SUBKEY,
            RUN_VALUE_NAME,
            RRF_RT_REG_SZ,
            None,
            None,
            Some(&mut cb_data),
        )
        .is_ok()
            && cb_data > 0;

        let mut value = String::new();
        if exists {
            let mut buf = vec![0u16; (cb_data as usize) / 2 + 1];
            if RegGetValueW(
                HKEY_CURRENT_USER,
                RUN_SUBKEY,
                RUN_VALUE_NAME,
                RRF_RT_REG_SZ,
                None,
                Some(buf.as_mut_ptr() as *mut c_void),
                Some(&mut cb_data),
            )
            .is_ok()
            {
                while let Some(&0) = buf.last() {
                    buf.pop();
                }
                value = String::from_utf16_lossy(&buf);
            }
        }

        StartupStatus {
            enabled: exists,
            mechanism: "Windows Registry (HKCU\\...\\Run)".to_string(),
            entry_path: if value.is_empty() {
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\SysMonPro".to_string()
            } else {
                value
            },
            note: if exists {
                "Windows user startup entry is active.".to_string()
            } else {
                "Windows user startup entry is not configured.".to_string()
            },
        }
    }
}
