#[cfg(target_os = "linux")]
use crate::models::GpuStats;
#[cfg(target_os = "linux")]
use std::fs;
#[cfg(target_os = "linux")]
use std::path::Path;

#[cfg(target_os = "linux")]
fn read_trimmed(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(target_os = "linux")]
fn read_u64(path: &Path) -> Option<u64> {
    read_trimmed(path).and_then(|s| s.parse::<u64>().ok())
}

#[cfg(target_os = "linux")]
fn parse_dpm_active_mhz(path: &Path) -> Option<u32> {
    let content = fs::read_to_string(path).ok()?;
    for line in content.lines() {
        if line.contains('*') {
            for token in line.split_whitespace() {
                if let Some(mhz_str) = token.strip_suffix("Mhz").or_else(|| token.strip_suffix("MHz")) {
                    if let Ok(mhz) = mhz_str.trim().parse::<u32>() {
                        return Some(mhz);
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn read_amd_hwmon(device_path: &Path) -> (Option<f32>, Option<f32>, Option<f32>, Option<u32>) {
    let mut temp_c = None;
    let mut power_w = None;
    let mut power_cap_w = None;
    let mut fan_pct = None;

    let hwmon_dir = device_path.join("hwmon");
    if let Ok(entries) = fs::read_dir(hwmon_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if temp_c.is_none() {
                if let Some(mdeg) = read_u64(&p.join("temp1_input")) {
                    let t = mdeg as f32 / 1000.0;
                    if t > 0.0 && t < 130.0 {
                        temp_c = Some((t * 10.0).round() / 10.0);
                    }
                }
            }
            if power_w.is_none() {
                if let Some(uw) = read_u64(&p.join("power1_average")).or_else(|| read_u64(&p.join("power1_input"))) {
                    power_w = Some(((uw as f32 / 1_000_000.0) * 10.0).round() / 10.0);
                }
            }
            if power_cap_w.is_none() {
                if let Some(uw) = read_u64(&p.join("power1_cap")) {
                    power_cap_w = Some(((uw as f32 / 1_000_000.0) * 10.0).round() / 10.0);
                }
            }
            if fan_pct.is_none() {
                if let (Some(pwm), Some(pwm_max)) = (
                    read_u64(&p.join("pwm1")),
                    read_u64(&p.join("pwm1_max")).or(Some(255)),
                ) {
                    if pwm_max > 0 {
                        fan_pct = Some(((pwm * 100) / pwm_max).min(100) as u32);
                    }
                }
            }
        }
    }

    (temp_c, power_w, power_cap_w, fan_pct)
}

#[cfg(target_os = "linux")]
pub fn collect_linux_amd_gpu(card_name: &str, device_path: &Path) -> GpuStats {
    let uevent = fs::read_to_string(device_path.join("uevent")).unwrap_or_default();
    let mut pci_slot = None;
    let mut driver = None;
    let mut pci_id = None;

    for line in uevent.lines() {
        if let Some(v) = line.strip_prefix("PCI_SLOT_NAME=") {
            pci_slot = Some(v.trim().to_string());
        } else if let Some(v) = line.strip_prefix("DRIVER=") {
            driver = Some(v.trim().to_string());
        } else if let Some(v) = line.strip_prefix("PCI_ID=") {
            pci_id = Some(v.trim().to_string());
        }
    }

    let utilization_percent = read_u64(&device_path.join("gpu_busy_percent")).map(|v| v as f32);
    let vram_total_bytes = read_u64(&device_path.join("mem_info_vram_total"));
    let vram_used_bytes = read_u64(&device_path.join("mem_info_vram_used"));
    let vram_usage_percent = match (vram_used_bytes, vram_total_bytes) {
        (Some(used), Some(total)) if total > 0 => {
            Some((((used as f64 / total as f64) * 1000.0).round() / 10.0) as f32)
        }
        _ => None,
    };

    let core_clock_mhz = parse_dpm_active_mhz(&device_path.join("pp_dpm_sclk"));
    let memory_clock_mhz = parse_dpm_active_mhz(&device_path.join("pp_dpm_mclk"));
    let (temperature_c, power_watts, power_limit_watts, fan_speed_percent) =
        read_amd_hwmon(device_path);

    let product_name = read_trimmed(&device_path.join("product_name"))
        .or_else(|| read_trimmed(&device_path.join("vbios_version")).map(|v| format!("AMD Radeon ({})", v)))
        .unwrap_or_else(|| {
            if let Some(ref pid) = pci_id {
                format!("AMD Radeon Graphics [{}]", pid)
            } else {
                "AMD Radeon Graphics".to_string()
            }
        });

    let gpu_type = match vram_total_bytes {
        Some(v) if v >= 1024 * 1024 * 1024 => "discrete".to_string(),
        _ => "integrated".to_string(),
    };

    GpuStats {
        id: format!("amd-{}", card_name),
        name: product_name,
        vendor: "AMD".to_string(),
        gpu_type,
        driver_version: driver,
        utilization_percent,
        vram_total_bytes,
        vram_used_bytes,
        vram_usage_percent,
        temperature_c,
        power_watts,
        power_limit_watts,
        core_clock_mhz,
        memory_clock_mhz,
        fan_speed_percent,
        pci_bus_id: pci_slot,
        compute_capability: Some("ROCm / Vulkan".to_string()),
    }
}
