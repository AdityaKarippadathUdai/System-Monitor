use crate::models::MemoryStats;
use sysinfo::System;

pub fn collect_memory_stats(sys: &System) -> MemoryStats {
    #[cfg(target_os = "linux")]
    {
        collect_linux_memory(sys)
    }
    #[cfg(target_os = "windows")]
    {
        collect_windows_memory(sys)
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        collect_generic_memory(sys)
    }
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn collect_generic_memory(sys: &System) -> MemoryStats {
    let total = sys.total_memory();
    let used = sys.used_memory();
    let free = sys.free_memory();
    let available = sys.available_memory();
    let swap_total = sys.total_swap();
    let swap_used = sys.used_swap();
    let swap_free = sys.free_swap();
    let virtual_total = total.saturating_add(swap_total);
    let virtual_used = used.saturating_add(swap_used);

    MemoryStats {
        total_bytes: total,
        used_bytes: used,
        available_bytes: available,
        cached_bytes: None,
        buffers_bytes: None,
        free_bytes: free,
        usage_percent: calc_pct(used, total),
        swap_total_bytes: swap_total,
        swap_used_bytes: swap_used,
        swap_free_bytes: swap_free,
        swap_percent: calc_pct(swap_used, swap_total),
        virtual_total_bytes: virtual_total,
        virtual_used_bytes: virtual_used,
        virtual_percent: calc_pct(virtual_used, virtual_total),
        r#type: None,
        speed_mhz: None,
    }
}

#[cfg(target_os = "linux")]
fn collect_linux_memory(sys: &System) -> MemoryStats {
    let mut mem_total_kb: Option<u64> = None;
    let mut mem_free_kb: Option<u64> = None;
    let mut mem_available_kb: Option<u64> = None;
    let mut buffers_kb: Option<u64> = None;
    let mut cached_kb: Option<u64> = None;
    let mut sreclaimable_kb: Option<u64> = None;
    let mut swap_total_kb: Option<u64> = None;
    let mut swap_free_kb: Option<u64> = None;

    if let Ok(content) = std::fs::read_to_string("/proc/meminfo") {
        for line in content.lines() {
            if let Some((key, rest)) = line.split_once(':') {
                let val = rest
                    .split_whitespace()
                    .next()
                    .and_then(|v| v.parse::<u64>().ok());
                match key.trim() {
                    "MemTotal" => mem_total_kb = val,
                    "MemFree" => mem_free_kb = val,
                    "MemAvailable" => mem_available_kb = val,
                    "Buffers" => buffers_kb = val,
                    "Cached" => cached_kb = val,
                    "SReclaimable" => sreclaimable_kb = val,
                    "SwapTotal" => swap_total_kb = val,
                    "SwapFree" => swap_free_kb = val,
                    _ => {}
                }
            }
        }
    }

    let total_bytes = mem_total_kb
        .map(|k| k * 1024)
        .unwrap_or_else(|| sys.total_memory());
    let free_bytes = mem_free_kb
        .map(|k| k * 1024)
        .unwrap_or_else(|| sys.free_memory());
    let buffers_bytes = buffers_kb.map(|k| k * 1024);
    let cached_bytes = match (cached_kb, sreclaimable_kb) {
        (Some(c), Some(s)) => Some((c + s) * 1024),
        (Some(c), None) => Some(c * 1024),
        _ => None,
    };

    let available_bytes = mem_available_kb
        .map(|k| k * 1024)
        .unwrap_or_else(|| {
            free_bytes
                .saturating_add(buffers_bytes.unwrap_or(0))
                .saturating_add(cached_bytes.unwrap_or(0))
        })
        .min(total_bytes);

    let used_bytes = total_bytes.saturating_sub(available_bytes);

    let swap_total_bytes = swap_total_kb
        .map(|k| k * 1024)
        .unwrap_or_else(|| sys.total_swap());
    let swap_free_bytes = swap_free_kb
        .map(|k| k * 1024)
        .unwrap_or_else(|| sys.free_swap())
        .min(swap_total_bytes);
    let swap_used_bytes = swap_total_bytes.saturating_sub(swap_free_bytes);

    let virtual_total_bytes = total_bytes.saturating_add(swap_total_bytes);
    let virtual_used_bytes = used_bytes.saturating_add(swap_used_bytes);

    MemoryStats {
        total_bytes,
        used_bytes,
        available_bytes,
        cached_bytes,
        buffers_bytes,
        free_bytes,
        usage_percent: calc_pct(used_bytes, total_bytes),
        swap_total_bytes,
        swap_used_bytes,
        swap_free_bytes,
        swap_percent: calc_pct(swap_used_bytes, swap_total_bytes),
        virtual_total_bytes,
        virtual_used_bytes,
        virtual_percent: calc_pct(virtual_used_bytes, virtual_total_bytes),
        r#type: None,
        speed_mhz: None,
    }
}

#[cfg(target_os = "windows")]
fn collect_windows_memory(sys: &System) -> MemoryStats {
    use windows::core::{w, PCWSTR};
    use windows::Win32::System::Performance::{
        PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterValue,
        PdhOpenQueryW, PDH_FMT_COUNTERVALUE, PDH_FMT_DOUBLE,
    };
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

    let mut mem_status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };

    let (total_bytes, available_bytes, virtual_total_bytes, virtual_avail_bytes) =
        if unsafe { GlobalMemoryStatusEx(&mut mem_status) }.is_ok() {
            (
                mem_status.ullTotalPhys,
                mem_status.ullAvailPhys,
                mem_status.ullTotalPageFile,
                mem_status.ullAvailPageFile,
            )
        } else {
            let total = sys.total_memory();
            let avail = sys.available_memory();
            let swap_total = sys.total_swap();
            let swap_free = sys.free_swap();
            (
                total,
                avail,
                total.saturating_add(swap_total),
                avail.saturating_add(swap_free),
            )
        };

    let used_bytes = total_bytes.saturating_sub(available_bytes);
    let virtual_used_bytes = virtual_total_bytes.saturating_sub(virtual_avail_bytes);

    // Query PDH for Windows System Cache Bytes and Paging File % Usage
    let mut cached_bytes: Option<u64> = None;
    let mut pagefile_usage_pct: Option<f64> = None;

    unsafe {
        let mut query: isize = 0;
        if PdhOpenQueryW(PCWSTR::null(), 0, &mut query) == 0 {
            let mut cache_counter: isize = 0;
            let mut page_counter: isize = 0;
            let has_cache = PdhAddEnglishCounterW(
                query,
                w!(r#"\Memory\Cache Bytes"#),
                0,
                &mut cache_counter,
            ) == 0;
            let has_page = PdhAddEnglishCounterW(
                query,
                w!(r#"\Paging File(_Total)\% Usage"#),
                0,
                &mut page_counter,
            ) == 0;

            if PdhCollectQueryData(query) == 0 {
                if has_cache {
                    let mut val = PDH_FMT_COUNTERVALUE::default();
                    if PdhGetFormattedCounterValue(cache_counter, PDH_FMT_DOUBLE, None, &mut val)
                        == 0
                    {
                        let b = val.Anonymous.doubleValue;
                        if b >= 0.0 && b.is_finite() {
                            cached_bytes = Some(b as u64);
                        }
                    }
                }
                if has_page {
                    let mut val = PDH_FMT_COUNTERVALUE::default();
                    if PdhGetFormattedCounterValue(page_counter, PDH_FMT_DOUBLE, None, &mut val)
                        == 0
                    {
                        let p = val.Anonymous.doubleValue;
                        if p >= 0.0 && p <= 100.0 && p.is_finite() {
                            pagefile_usage_pct = Some(p);
                        }
                    }
                }
            }
            let _ = PdhCloseQuery(query);
        }
    }

    // In Windows, ullTotalPageFile = Physical RAM + Page File size
    let swap_total_bytes = if virtual_total_bytes > total_bytes {
        virtual_total_bytes.saturating_sub(total_bytes)
    } else {
        sys.total_swap()
    };

    let swap_used_bytes = if let Some(pct) = pagefile_usage_pct {
        ((swap_total_bytes as f64) * (pct / 100.0)).round() as u64
    } else {
        virtual_used_bytes.saturating_sub(used_bytes).min(swap_total_bytes)
    };
    let swap_free_bytes = swap_total_bytes.saturating_sub(swap_used_bytes);

    MemoryStats {
        total_bytes,
        used_bytes,
        available_bytes,
        cached_bytes,
        buffers_bytes: None,
        free_bytes: available_bytes,
        usage_percent: calc_pct(used_bytes, total_bytes),
        swap_total_bytes,
        swap_used_bytes,
        swap_free_bytes,
        swap_percent: calc_pct(swap_used_bytes, swap_total_bytes),
        virtual_total_bytes,
        virtual_used_bytes,
        virtual_percent: calc_pct(virtual_used_bytes, virtual_total_bytes),
        r#type: None,
        speed_mhz: None,
    }
}

fn calc_pct(part: u64, total: u64) -> f32 {
    if total == 0 {
        0.0
    } else {
        (((part as f64 / total as f64) * 1000.0).round() / 10.0) as f32
    }
}
