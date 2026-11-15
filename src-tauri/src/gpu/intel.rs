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
pub fn collect_linux_intel_gpu(card_name: &str, device_path: &Path) -> GpuStats {
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

    // Intel i915 / xe sysfs frequency paths
    let core_clock_mhz = read_u64(&device_path.join("gt_cur_freq_mhz"))
        .or_else(|| read_u64(&device_path.join("gt/gt0/rps_cur_freq_mhz")))
        .map(|v| v as u32);

    // Local VRAM exists on Intel Arc discrete GPUs (lmem)
    let vram_total_bytes = read_u64(&device_path.join("mem_info_vram_total"));
    let vram_used_bytes = read_u64(&device_path.join("mem_info_vram_used"));
    let vram_usage_percent = match (vram_used_bytes, vram_total_bytes) {
        (Some(used), Some(total)) if total > 0 => {
            Some((((used as f64 / total as f64) * 1000.0).round() / 10.0) as f32)
        }
        _ => None,
    };

    let mut temperature_c = None;
    let hwmon_dir = device_path.join("hwmon");
    if let Ok(entries) = fs::read_dir(hwmon_dir) {
        for entry in entries.flatten() {
            if let Some(mdeg) = read_u64(&entry.path().join("temp1_input")) {
                let t = mdeg as f32 / 1000.0;
                if t > 0.0 && t < 130.0 {
                    temperature_c = Some((t * 10.0).round() / 10.0);
                    break;
                }
            }
        }
    }

    let gpu_type = if vram_total_bytes.unwrap_or(0) >= 1024 * 1024 * 1024 {
        "discrete".to_string()
    } else {
        "integrated".to_string()
    };

    let name = if gpu_type == "discrete" {
        format!(
            "Intel Arc Graphics{}",
            pci_id
                .as_ref()
                .map(|p| format!(" [{}]", p))
                .unwrap_or_default()
        )
    } else {
        format!(
            "Intel Integrated Graphics{}",
            pci_id
                .as_ref()
                .map(|p| format!(" [{}]", p))
                .unwrap_or_default()
        )
    };

    GpuStats {
        id: format!("intel-{}", card_name),
        name,
        vendor: "Intel".to_string(),
        gpu_type,
        driver_version: driver,
        utilization_percent: None,
        vram_total_bytes,
        vram_used_bytes,
        vram_usage_percent,
        temperature_c,
        power_watts: None,
        power_limit_watts: None,
        core_clock_mhz,
        memory_clock_mhz: None,
        fan_speed_percent: None,
        pci_bus_id: pci_slot,
        compute_capability: Some("OpenGL / Vulkan".to_string()),
    }
}
