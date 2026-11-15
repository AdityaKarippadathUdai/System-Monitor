use super::PlatformStaticInfo;
use std::collections::HashMap;
use std::fs;
use sysinfo::System;

fn parse_os_release() -> HashMap<String, String> {
    let mut map = HashMap::new();
    let content = fs::read_to_string("/etc/os-release")
        .or_else(|_| fs::read_to_string("/usr/lib/os-release"))
        .unwrap_or_default();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((key, val)) = trimmed.split_once('=') {
            let cleaned = val.trim().trim_matches('"').trim_matches('\'').to_string();
            map.insert(key.trim().to_string(), cleaned);
        }
    }
    map
}

fn read_dmi_field(field: &str) -> Option<String> {
    let path = format!("/sys/class/dmi/id/{}", field);
    fs::read_to_string(path).ok().and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty()
            || t.eq_ignore_ascii_case("To Be Filled By O.E.M.")
            || t.eq_ignore_ascii_case("Default string")
            || t.eq_ignore_ascii_case("Not Specified")
            || t.eq_ignore_ascii_case("None")
        {
            None
        } else {
            Some(t)
        }
    })
}

fn uname_release_and_arch() -> (Option<String>, Option<String>) {
    unsafe {
        let mut uts: libc::utsname = std::mem::zeroed();
        if libc::uname(&mut uts) == 0 {
            let release = std::ffi::CStr::from_ptr(uts.release.as_ptr())
                .to_string_lossy()
                .trim()
                .to_string();
            let machine = std::ffi::CStr::from_ptr(uts.machine.as_ptr())
                .to_string_lossy()
                .trim()
                .to_string();
            (
                if release.is_empty() { None } else { Some(release) },
                if machine.is_empty() { None } else { Some(machine) },
            )
        } else {
            (None, None)
        }
    }
}

pub fn collect_static_info() -> PlatformStaticInfo {
    let os_rel = parse_os_release();
    let (uname_kernel, uname_arch) = uname_release_and_arch();

    let os_name = os_rel
        .get("NAME")
        .cloned()
        .or_else(System::name)
        .unwrap_or_else(|| "Linux".to_string());

    let os_version = os_rel
        .get("VERSION_ID")
        .or_else(|| os_rel.get("VERSION"))
        .cloned()
        .or_else(System::os_version)
        .unwrap_or_else(|| "Rolling".to_string());

    let kernel_version = uname_kernel
        .or_else(System::kernel_version)
        .unwrap_or_else(|| "Unknown".to_string());

    let hostname = System::host_name().unwrap_or_else(|| "localhost".to_string());
    let architecture = uname_arch.unwrap_or_else(|| std::env::consts::ARCH.to_string());

    let manufacturer = read_dmi_field("sys_vendor").or_else(|| read_dmi_field("board_vendor"));
    let model = read_dmi_field("product_name").or_else(|| read_dmi_field("board_name"));

    let display_server = if std::env::var("WAYLAND_DISPLAY").is_ok() {
        Some("Wayland".to_string())
    } else if std::env::var("DISPLAY").is_ok() {
        Some("X11".to_string())
    } else {
        Some("Headless / TTY".to_string())
    };

    let desktop_environment = std::env::var("XDG_CURRENT_DESKTOP")
        .or_else(|_| std::env::var("DESKTOP_SESSION"))
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| Some("Linux Console".to_string()));

    PlatformStaticInfo {
        os_name,
        os_version,
        kernel_version,
        hostname,
        architecture,
        manufacturer,
        model,
        platform: "linux".to_string(),
        display_server,
        desktop_environment,
    }
}

pub fn get_thread_count(sys: &System) -> Option<usize> {
    let mut total_threads = 0usize;
    if let Ok(entries) = fs::read_dir("/proc") {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if !name_str.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            let status_path = entry.path().join("status");
            if let Ok(content) = fs::read_to_string(status_path) {
                for line in content.lines() {
                    if let Some(rest) = line.strip_prefix("Threads:") {
                        if let Ok(cnt) = rest.trim().parse::<usize>() {
                            total_threads += cnt;
                        }
                        break;
                    }
                }
            }
        }
    }

    if total_threads > 0 {
        Some(total_threads)
    } else {
        let fallback = sys.processes().len();
        if fallback > 0 {
            Some(fallback)
        } else {
            None
        }
    }
}
