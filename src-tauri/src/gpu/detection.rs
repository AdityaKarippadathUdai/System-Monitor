use super::nvidia::NvidiaMonitor;
use crate::models::GpuStats;

#[cfg(target_os = "linux")]
pub fn collect_linux_gpus(nvidia: &mut NvidiaMonitor) -> Vec<GpuStats> {
    use std::fs;
    use std::path::Path;

    let mut gpus = nvidia.collect();

    let drm_dir = Path::new("/sys/class/drm");
    if let Ok(entries) = fs::read_dir(drm_dir) {
        let mut cards: Vec<_> = entries
            .flatten()
            .filter(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                name.starts_with("card") && !name.contains('-') && name[4..].chars().all(|c| c.is_ascii_digit())
            })
            .collect();
        cards.sort_by_key(|e| e.file_name());

        for entry in cards {
            let card_name = entry.file_name().to_string_lossy().to_string();
            let device_path = entry.path().join("device");
            let vendor_hex = fs::read_to_string(device_path.join("vendor"))
                .unwrap_or_default()
                .trim()
                .to_lowercase();

            match vendor_hex.as_str() {
                "0x10de" => {
                    // Already handled by NVML / nvidia-smi; only add fallback if NVML returned none
                    if !gpus.iter().any(|g| g.vendor == "NVIDIA") {
                        let pci_slot = fs::read_to_string(device_path.join("uevent"))
                            .ok()
                            .and_then(|u| {
                                u.lines()
                                    .find_map(|l| l.strip_prefix("PCI_SLOT_NAME="))
                                    .map(|s| s.trim().to_string())
                            });
                        gpus.push(GpuStats {
                            id: format!("nvidia-drm-{}", card_name),
                            name: "NVIDIA Graphics Adapter".to_string(),
                            vendor: "NVIDIA".to_string(),
                            gpu_type: "discrete".to_string(),
                            driver_version: None,
                            utilization_percent: None,
                            vram_total_bytes: None,
                            vram_used_bytes: None,
                            vram_usage_percent: None,
                            temperature_c: None,
                            power_watts: None,
                            power_limit_watts: None,
                            core_clock_mhz: None,
                            memory_clock_mhz: None,
                            fan_speed_percent: None,
                            pci_bus_id: pci_slot,
                            compute_capability: None,
                        });
                    }
                }
                "0x1002" => {
                    gpus.push(super::amd::collect_linux_amd_gpu(&card_name, &device_path));
                }
                "0x8086" => {
                    gpus.push(super::intel::collect_linux_intel_gpu(&card_name, &device_path));
                }
                _ => {}
            }
        }
    }

    gpus
}

#[cfg(target_os = "windows")]
pub struct WindowsGpuPdhMonitor {
    query: Option<windows::Win32::System::Performance::PDH_HQUERY>,
    engine_counters: Vec<(String, windows::Win32::System::Performance::PDH_HCOUNTER)>,
    mem_counters: Vec<(String, windows::Win32::System::Performance::PDH_HCOUNTER)>,
    last_refresh: std::time::Instant,
    initialized_sample: bool,
}

#[cfg(target_os = "windows")]
unsafe impl Send for WindowsGpuPdhMonitor {}
#[cfg(target_os = "windows")]
unsafe impl Sync for WindowsGpuPdhMonitor {}

#[cfg(target_os = "windows")]
impl WindowsGpuPdhMonitor {
    pub fn new() -> Self {
        let mut monitor = Self {
            query: None,
            engine_counters: Vec::new(),
            mem_counters: Vec::new(),
            last_refresh: std::time::Instant::now(),
            initialized_sample: false,
        };
        monitor.rebuild_query();
        monitor
    }

    fn rebuild_query(&mut self) {
        use windows::core::{w, PCWSTR};
        use windows::Win32::System::Performance::{PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhOpenQueryW, PDH_HCOUNTER, PDH_HQUERY};

        if let Some(q) = self.query.take() {
            unsafe {
                let _ = PdhCloseQuery(q);
            }
        }
        self.engine_counters.clear();
        self.mem_counters.clear();
        self.initialized_sample = false;

        unsafe {
            let mut query = PDH_HQUERY::default();
            if PdhOpenQueryW(PCWSTR::null(), 0, &mut query) != 0 {
                return;
            }

            let engine_paths = expand_pdh_wildcard(w!(r#"\GPU Engine(*)\Utilization Percentage"#));
            for path in engine_paths.into_iter().take(128) {
                if let Some(luid_key) = extract_luid_token(&path) {
                    let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
                    let mut counter = PDH_HCOUNTER::default();
                    if PdhAddEnglishCounterW(query, PCWSTR(wide.as_ptr()), 0, &mut counter) == 0 {
                        self.engine_counters.push((luid_key, counter));
                    }
                }
            }

            let mem_paths = expand_pdh_wildcard(w!(r#"\GPU Adapter Memory(*)\Dedicated Usage"#));
            for path in mem_paths.into_iter().take(16) {
                if let Some(luid_key) = extract_luid_token(&path) {
                    let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
                    let mut counter = PDH_HCOUNTER::default();
                    if PdhAddEnglishCounterW(query, PCWSTR(wide.as_ptr()), 0, &mut counter) == 0 {
                        self.mem_counters.push((luid_key, counter));
                    }
                }
            }

            let _ = PdhCollectQueryData(query);
            self.query = Some(query);
            self.last_refresh = std::time::Instant::now();
        }
    }

    pub fn sample_by_luid(
        &mut self,
    ) -> (
        std::collections::HashMap<String, f32>,
        std::collections::HashMap<String, u64>,
    ) {
        use std::collections::HashMap;
        use windows::Win32::System::Performance::{
            PdhCollectQueryData, PdhGetFormattedCounterValue, PDH_FMT_COUNTERVALUE, PDH_FMT_DOUBLE,
        };

        if self.last_refresh.elapsed().as_secs() >= 5 {
            self.rebuild_query();
        }

        let mut util_map: HashMap<String, f32> = HashMap::new();
        let mut mem_map: HashMap<String, u64> = HashMap::new();

        if let Some(query) = self.query {
            unsafe {
                if PdhCollectQueryData(query) == 0 {
                    if self.initialized_sample {
                        for (luid, counter) in &self.engine_counters {
                            let mut val = PDH_FMT_COUNTERVALUE::default();
                            if PdhGetFormattedCounterValue(*counter, PDH_FMT_DOUBLE, None, &mut val)
                                == 0
                            {
                                let pct = val.Anonymous.doubleValue;
                                if pct.is_finite() && pct >= 0.0 && pct <= 100.0 {
                                    let entry = util_map.entry(luid.clone()).or_insert(0.0);
                                    // Track peak/summed engine activity clamped to 100%
                                    *entry = (*entry + pct as f32).min(100.0);
                                }
                            }
                        }
                    }
                    self.initialized_sample = true;

                    for (luid, counter) in &self.mem_counters {
                        let mut val = PDH_FMT_COUNTERVALUE::default();
                        if PdhGetFormattedCounterValue(*counter, PDH_FMT_DOUBLE, None, &mut val)
                            == 0
                        {
                            let bytes = val.Anonymous.doubleValue;
                            if bytes.is_finite() && bytes >= 0.0 {
                                let entry = mem_map.entry(luid.clone()).or_insert(0);
                                *entry = (*entry).max(bytes as u64);
                            }
                        }
                    }
                }
            }
        }

        (util_map, mem_map)
    }
}

#[cfg(target_os = "windows")]
impl Drop for WindowsGpuPdhMonitor {
    fn drop(&mut self) {
        if let Some(q) = self.query.take() {
            unsafe {
                let _ = windows::Win32::System::Performance::PdhCloseQuery(q);
            }
        }
    }
}

#[cfg(target_os = "windows")]
unsafe fn expand_pdh_wildcard(pattern: windows::core::PCWSTR) -> Vec<String> {
    use windows::core::PWSTR;
    use windows::Win32::System::Performance::PdhExpandWildCardPathW;
    use windows::Win32::Foundation::ERROR_SUCCESS;

    let mut len: u32 = 0;
    let status = PdhExpandWildCardPathW(
        windows::core::PCWSTR::null(),
        pattern,
        PWSTR::null(),
        &mut len,
        0,
    );
    if len == 0 || (status != ERROR_SUCCESS.0 && status != 0x800007D2) {
        return Vec::new();
    }

    let mut buf = vec![0u16; len as usize];
    let status = PdhExpandWildCardPathW(
        windows::core::PCWSTR::null(),
        pattern,
        PWSTR(buf.as_mut_ptr()),
        &mut len,
        0,
    );
    if status != ERROR_SUCCESS.0 {
        return Vec::new();
    }

    let mut paths = Vec::new();
    let mut start = 0;
    for i in 0..buf.len() {
        if buf[i] == 0 {
            if i == start {
                break;
            }
            paths.push(String::from_utf16_lossy(&buf[start..i]));
            start = i + 1;
        }
    }
    paths
}

#[cfg(target_os = "windows")]
fn extract_luid_token(path: &str) -> Option<String> {
    let lower = path.to_lowercase();
    let idx = lower.find("luid_0x")?;
    let rest = &lower[idx + 5..];
    let parts: Vec<&str> = rest.split('_').collect();
    if parts.len() >= 2 {
        let high = parts[0].trim_start_matches("0x").trim_start_matches('0');
        let low = parts[1]
            .trim_end_matches(')')
            .trim_start_matches("0x")
            .trim_start_matches('0');
        Some(format!(
            "{}:{}",
            if high.is_empty() { "0" } else { high },
            if low.is_empty() { "0" } else { low }
        ))
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn format_luid_key(high: i32, low: u32) -> String {
    let h = format!("{:x}", high as u32);
    let l = format!("{:x}", low);
    format!(
        "{}:{}",
        h.trim_start_matches('0').is_empty().then_some("0").unwrap_or(h.trim_start_matches('0')),
        l.trim_start_matches('0').is_empty().then_some("0").unwrap_or(l.trim_start_matches('0'))
    )
}

#[cfg(target_os = "windows")]
pub fn collect_windows_gpus(
    nvidia: &mut NvidiaMonitor,
    win_pdh: &mut WindowsGpuPdhMonitor,
) -> Vec<GpuStats> {
    use windows::core::Interface;
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, IDXGIAdapter3, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE,
        DXGI_MEMORY_SEGMENT_GROUP_LOCAL, DXGI_QUERY_VIDEO_MEMORY_INFO,
    };

    let mut nv_gpus = nvidia.collect();
    let (pdh_util, pdh_mem) = win_pdh.sample_by_luid();

    let mut results = Vec::new();

    unsafe {
        if let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() {
            let mut idx = 0u32;
            while let Ok(adapter) = factory.EnumAdapters1(idx) {
                idx += 1;
                let desc = match adapter.GetDesc1() {
                    Ok(d) => d,
                    Err(_) => continue,
                };

                // Skip Microsoft Basic Render Driver / software adapters
                if (desc.Flags & (DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32)) != 0
                    || desc.VendorId == 0x1414
                {
                    continue;
                }

                let name_end = desc
                    .Description
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(desc.Description.len());
                let name = String::from_utf16_lossy(&desc.Description[..name_end])
                    .trim()
                    .to_string();

                let vendor = match desc.VendorId {
                    0x10DE => "NVIDIA",
                    0x1002 => "AMD",
                    0x8086 => "Intel",
                    _ => "Graphics Adapter",
                }
                .to_string();

                let luid_key = format_luid_key(desc.AdapterLuid.HighPart, desc.AdapterLuid.LowPart);
                let pdh_gpu_util = pdh_util
                    .get(&luid_key)
                    .copied()
                    .map(|v| (v * 10.0).round() / 10.0);

                // Query DXGI local video memory info
                let mut dxgi_used: Option<u64> = None;
                let mut dxgi_budget: Option<u64> = None;
                if let Ok(adapter3) = adapter.cast::<IDXGIAdapter3>() {
                    let mut vmi = DXGI_QUERY_VIDEO_MEMORY_INFO::default();
                    if adapter3
                        .QueryVideoMemoryInfo(0, DXGI_MEMORY_SEGMENT_GROUP_LOCAL, &mut vmi)
                        .is_ok()
                    {
                        dxgi_used = Some(vmi.CurrentUsage);
                        if vmi.Budget > 0 {
                            dxgi_budget = Some(vmi.Budget);
                        }
                    }
                }

                let dedicated_bytes = desc.DedicatedVideoMemory as u64;
                let is_discrete = dedicated_bytes >= 512 * 1024 * 1024;
                let gpu_type = if is_discrete {
                    "discrete".to_string()
                } else {
                    "integrated".to_string()
                };

                // Merge with NVML / nvidia-smi if this is an NVIDIA adapter
                if desc.VendorId == 0x10DE {
                    if let Some(pos) = nv_gpus.iter().position(|n| {
                        n.name.eq_ignore_ascii_case(&name)
                            || name.to_lowercase().contains(&n.name.to_lowercase())
                            || n.name.to_lowercase().contains(&name.to_lowercase())
                    }) {
                        let mut nv = nv_gpus.remove(pos);
                        if nv.utilization_percent.is_none() {
                            nv.utilization_percent = pdh_gpu_util;
                        }
                        if nv.vram_used_bytes.is_none() {
                            nv.vram_used_bytes = dxgi_used.or_else(|| pdh_mem.get(&luid_key).copied());
                        }
                        results.push(nv);
                        continue;
                    }
                }

                let vram_total_bytes = if dedicated_bytes > 0 {
                    Some(dedicated_bytes)
                } else {
                    dxgi_budget
                };
                let vram_used_bytes = pdh_mem.get(&luid_key).copied().or(dxgi_used);
                let vram_usage_percent = match (vram_used_bytes, vram_total_bytes) {
                    (Some(used), Some(total)) if total > 0 => {
                        Some((((used as f64 / total as f64) * 1000.0).round() / 10.0) as f32)
                    }
                    _ => None,
                };

                results.push(GpuStats {
                    id: format!("dxgi-{}", idx - 1),
                    name,
                    vendor,
                    gpu_type,
                    driver_version: None,
                    utilization_percent: pdh_gpu_util,
                    vram_total_bytes,
                    vram_used_bytes,
                    vram_usage_percent,
                    temperature_c: None,
                    power_watts: None,
                    power_limit_watts: None,
                    core_clock_mhz: None,
                    memory_clock_mhz: None,
                    fan_speed_percent: None,
                    pci_bus_id: Some(format!("LUID {:08X}:{:08X}", desc.AdapterLuid.HighPart, desc.AdapterLuid.LowPart)),
                    compute_capability: Some("DirectX 12 / DXGI".to_string()),
                });
            }
        }
    }

    // Append any remaining NVML GPUs not matched via DXGI
    for nv in nv_gpus {
        results.push(nv);
    }

    // Prioritize discrete GPUs first so primary card highlights dGPU on hybrid laptops while keeping iGPU selectable
    results.sort_by_key(|g| if g.gpu_type == "discrete" { 0 } else { 1 });
    results
}
