use crate::models::{CpuCache, CpuStats};
use sysinfo::{Components, System};

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "windows")]
mod windows;

pub struct CpuPlatformDetails {
    pub frequency_ghz: Option<f32>,
    pub max_frequency_ghz: Option<f32>,
    pub temperature_c: Option<f32>,
    pub manufacturer: String,
    pub cache: CpuCache,
    pub governor: Option<String>,
    pub load_average: Option<[f32; 3]>,
}

pub struct CpuMonitor {
    components: Components,
    #[cfg(target_os = "windows")]
    win_monitor: windows::WindowsCpuMonitor,
}

impl CpuMonitor {
    pub fn new() -> Self {
        Self {
            components: Components::new_with_refreshed_list(),
            #[cfg(target_os = "windows")]
            win_monitor: windows::WindowsCpuMonitor::new(),
        }
    }

    pub fn collect(&mut self, sys: &System, uptime_seconds: u64) -> CpuStats {
        let cpus = sys.cpus();
        let threads_count = cpus.len().max(1);
        let cores_count = sys.physical_core_count().unwrap_or(threads_count);

        let global_cpu = sys.global_cpu_info().cpu_usage();
        let per_core_usage: Vec<f32> = cpus
            .iter()
            .map(|c| (c.cpu_usage() * 10.0).round() / 10.0)
            .collect();

        let raw_model = cpus
            .first()
            .map(|c| c.brand().trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Host Processor".to_string());

        let raw_vendor = cpus
            .first()
            .map(|c| c.vendor_id().trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| infer_manufacturer(&raw_model));

        let sysinfo_freq_ghz = cpus
            .first()
            .map(|c| c.frequency())
            .filter(|&f| f > 0)
            .map(|f| ((f as f32) / 1000.0 * 100.0).round() / 100.0);

        self.components.refresh();

        #[cfg(target_os = "linux")]
        let details = linux::collect_details(&self.components, sysinfo_freq_ghz, raw_vendor);

        #[cfg(target_os = "windows")]
        let details =
            self.win_monitor
                .collect_details(&self.components, sysinfo_freq_ghz, raw_vendor);

        #[cfg(not(any(target_os = "linux", target_os = "windows")))]
        let details = CpuPlatformDetails {
            frequency_ghz: sysinfo_freq_ghz,
            max_frequency_ghz: None,
            temperature_c: extract_component_cpu_temp(&self.components),
            manufacturer: normalize_manufacturer(&raw_vendor, &raw_model),
            cache: CpuCache {
                l1: None,
                l2: None,
                l3: None,
            },
            governor: None,
            load_average: {
                let la = System::load_average();
                Some([
                    (la.one as f32 * 100.0).round() / 100.0,
                    (la.five as f32 * 100.0).round() / 100.0,
                    (la.fifteen as f32 * 100.0).round() / 100.0,
                ])
            },
        };

        CpuStats {
            usage_percent: (global_cpu * 10.0).round() / 10.0,
            frequency_ghz: details.frequency_ghz,
            max_frequency_ghz: details.max_frequency_ghz,
            temperature_c: details.temperature_c,
            cores_count,
            threads_count,
            manufacturer: details.manufacturer,
            model_name: raw_model,
            load_average: details.load_average,
            per_core_usage,
            cache: details.cache,
            governor: details.governor,
            uptime_seconds,
        }
    }
}

pub fn infer_manufacturer(model: &str) -> String {
    let lower = model.to_lowercase();
    if lower.contains("intel") {
        "Intel".to_string()
    } else if lower.contains("amd") || lower.contains("ryzen") || lower.contains("epyc") {
        "AMD".to_string()
    } else if lower.contains("apple") {
        "Apple".to_string()
    } else if lower.contains("arm") || lower.contains("qualcomm") || lower.contains("snapdragon") {
        "ARM / Qualcomm".to_string()
    } else {
        "Unknown".to_string()
    }
}

pub fn normalize_manufacturer(vendor_id: &str, model: &str) -> String {
    match vendor_id {
        "GenuineIntel" => "Intel".to_string(),
        "AuthenticAMD" => "AMD".to_string(),
        other if !other.is_empty() && other != "Unknown" => other.to_string(),
        _ => infer_manufacturer(model),
    }
}

pub fn extract_component_cpu_temp(components: &Components) -> Option<f32> {
    let mut fallback: Option<f32> = None;
    for comp in components.iter() {
        let label = comp.label().to_lowercase();
        let temp = comp.temperature();
        if !temp.is_finite() || temp <= 1.0 || temp >= 130.0 {
            continue;
        }
        if label.contains("package")
            || label.contains("tctl")
            || label.contains("tdie")
            || label.contains("coretemp")
            || label.contains("cpu")
            || label.contains("k10temp")
        {
            return Some((temp * 10.0).round() / 10.0);
        }
        if fallback.is_none() && (label.contains("core 0") || label.contains("acpitz")) {
            fallback = Some((temp * 10.0).round() / 10.0);
        }
    }
    fallback
}
