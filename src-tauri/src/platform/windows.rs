use super::PlatformStaticInfo;
use std::ffi::c_void;
use sysinfo::System;
use windows::{
    core::{w, PCWSTR},
    Win32::System::{
        Performance::{
            PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData,
            PdhGetFormattedCounterValue, PdhOpenQueryW, PDH_FMT_COUNTERVALUE, PDH_FMT_DOUBLE,
        },
        Registry::{HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ, RegGetValueW},
    },
};

fn read_hklm_string(sub_key: PCWSTR, value_name: PCWSTR) -> Option<String> {
    unsafe {
        let mut cb_data: u32 = 0;
        if RegGetValueW(
            HKEY_LOCAL_MACHINE,
            sub_key,
            value_name,
            RRF_RT_REG_SZ,
            None,
            None,
            Some(&mut cb_data),
        )
        .is_err()
            || cb_data == 0
        {
            return None;
        }

        let buf_len = (cb_data as usize) / std::mem::size_of::<u16>() + 1;
        let mut buffer = vec![0u16; buf_len];
        if RegGetValueW(
            HKEY_LOCAL_MACHINE,
            sub_key,
            value_name,
            RRF_RT_REG_SZ,
            None,
            Some(buffer.as_mut_ptr() as *mut c_void),
            Some(&mut cb_data),
        )
        .is_err()
        {
            return None;
        }

        let actual_len = (cb_data as usize) / std::mem::size_of::<u16>();
        buffer.truncate(actual_len);
        while let Some(&0) = buffer.last() {
            buffer.pop();
        }

        let s = String::from_utf16_lossy(&buffer).trim().to_string();
        if s.is_empty()
            || s.eq_ignore_ascii_case("To Be Filled By O.E.M.")
            || s.eq_ignore_ascii_case("System Product Name")
            || s.eq_ignore_ascii_case("System Manufacturer")
            || s.eq_ignore_ascii_case("Default string")
        {
            None
        } else {
            Some(s)
        }
    }
}

pub fn collect_static_info() -> PlatformStaticInfo {
    let nt_key = w!(r#"SOFTWARE\Microsoft\Windows NT\CurrentVersion"#);
    let bios_key = w!(r#"HARDWARE\DESCRIPTION\System\BIOS"#);

    let build_str = read_hklm_string(nt_key, w!("CurrentBuildNumber"))
        .or_else(|| read_hklm_string(nt_key, w!("CurrentBuild")));
    let build_num: u32 = build_str
        .as_deref()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);

    let product_name = read_hklm_string(nt_key, w!("ProductName")).map(|name| {
        if build_num >= 22000 && name.contains("Windows 10") {
            name.replace("Windows 10", "Windows 11")
        } else {
            name
        }
    });

    let os_name = product_name
        .or_else(System::name)
        .unwrap_or_else(|| "Windows".to_string());

    let display_version = read_hklm_string(nt_key, w!("DisplayVersion"))
        .or_else(|| read_hklm_string(nt_key, w!("ReleaseId")));

    let os_version = match (display_version, build_str.as_deref()) {
        (Some(dv), Some(b)) => format!("{} (Build {})", dv, b),
        (Some(dv), None) => dv,
        (None, Some(b)) => format!("Build {}", b),
        (None, None) => System::os_version().unwrap_or_else(|| "10/11".to_string()),
    };

    let kernel_version = System::kernel_version()
        .or_else(|| build_str.map(|b| format!("10.0.{}", b)))
        .unwrap_or_else(|| "Windows NT".to_string());

    let hostname = System::host_name().unwrap_or_else(|| "WINDOWS-PC".to_string());
    let architecture = std::env::consts::ARCH.to_string();

    let manufacturer = read_hklm_string(bios_key, w!("SystemManufacturer"))
        .or_else(|| read_hklm_string(bios_key, w!("BaseBoardManufacturer")));
    let model = read_hklm_string(bios_key, w!("SystemProductName"))
        .or_else(|| read_hklm_string(bios_key, w!("BaseBoardProduct")));

    PlatformStaticInfo {
        os_name,
        os_version,
        kernel_version,
        hostname,
        architecture,
        manufacturer,
        model,
        platform: "windows".to_string(),
        display_server: Some("Desktop Window Manager (DWM)".to_string()),
        desktop_environment: Some("Windows Shell".to_string()),
    }
}

pub fn get_thread_count(_sys: &System) -> Option<usize> {
    unsafe {
        let mut query: isize = 0;
        if PdhOpenQueryW(PCWSTR::null(), 0, &mut query) != 0 {
            return None;
        }
        let mut counter: isize = 0;
        let status = PdhAddEnglishCounterW(query, w!(r#"\System\Threads"#), 0, &mut counter);
        if status != 0 {
            let _ = PdhCloseQuery(query);
            return None;
        }
        if PdhCollectQueryData(query) != 0 {
            let _ = PdhCloseQuery(query);
            return None;
        }
        let mut val = PDH_FMT_COUNTERVALUE::default();
        let fmt_status = PdhGetFormattedCounterValue(counter, PDH_FMT_DOUBLE, None, &mut val);
        let _ = PdhCloseQuery(query);

        if fmt_status == 0 {
            let count = val.Anonymous.doubleValue;
            if count > 0.0 && count.is_finite() {
                return Some(count.round() as usize);
            }
        }
        None
    }
}
