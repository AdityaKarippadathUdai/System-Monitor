use crate::models::SystemInfo;
use chrono::{DateTime, Local, TimeZone};
use sysinfo::System;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "windows")]
mod windows;

pub struct PlatformStaticInfo {
    pub os_name: String,
    pub os_version: String,
    pub kernel_version: String,
    pub hostname: String,
    pub architecture: String,
    pub manufacturer: Option<String>,
    pub model: Option<String>,
    pub platform: String,
    pub display_server: Option<String>,
    pub desktop_environment: Option<String>,
}

pub fn collect_static_platform_info() -> PlatformStaticInfo {
    #[cfg(target_os = "linux")]
    {
        linux::collect_static_info()
    }
    #[cfg(target_os = "windows")]
    {
        windows::collect_static_info()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        PlatformStaticInfo {
            os_name: System::name().unwrap_or_else(|| std::env::consts::OS.to_string()),
            os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
            kernel_version: System::kernel_version().unwrap_or_else(|| "Unknown".to_string()),
            hostname: System::host_name().unwrap_or_else(|| "localhost".to_string()),
            architecture: std::env::consts::ARCH.to_string(),
            manufacturer: None,
            model: None,
            platform: if cfg!(target_os = "macos") {
                "macos".to_string()
            } else {
                std::env::consts::OS.to_string()
            },
            display_server: None,
            desktop_environment: None,
        }
    }
}

pub fn get_total_thread_count(sys: &System) -> Option<usize> {
    #[cfg(target_os = "linux")]
    {
        linux::get_thread_count(sys)
    }
    #[cfg(target_os = "windows")]
    {
        windows::get_thread_count(sys)
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = sys;
        None
    }
}

pub fn build_system_info(
    static_info: &PlatformStaticInfo,
    sys: &System,
    boot_time_secs: u64,
    uptime_seconds: u64,
    cpu_model: String,
    total_mem_bytes: u64,
) -> SystemInfo {
    let boot_time = Local
        .timestamp_opt(boot_time_secs as i64, 0)
        .single()
        .map(|dt: DateTime<Local>| dt.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    SystemInfo {
        os_name: static_info.os_name.clone(),
        os_version: static_info.os_version.clone(),
        kernel_version: static_info.kernel_version.clone(),
        hostname: static_info.hostname.clone(),
        architecture: static_info.architecture.clone(),
        manufacturer: static_info.manufacturer.clone(),
        model: static_info.model.clone(),
        uptime_seconds,
        boot_time,
        platform: static_info.platform.clone(),
        cpu_model,
        total_memory_gb: ((total_mem_bytes as f64) / (1024.0 * 1024.0 * 1024.0)).round() as u32,
        process_count: sys.processes().len(),
        thread_count: get_total_thread_count(sys),
        display_server: static_info.display_server.clone(),
        desktop_environment: static_info.desktop_environment.clone(),
    }
}
