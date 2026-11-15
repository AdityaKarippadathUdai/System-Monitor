use crate::models::GpuStats;
use nvml_wrapper::enum_wrappers::device::{Clock, TemperatureSensor};
use nvml_wrapper::Nvml;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub struct NvidiaMonitor {
    nvml: Option<Nvml>,
    attempted_init: bool,
}

impl NvidiaMonitor {
    pub fn new() -> Self {
        let nvml = Nvml::init().ok();
        Self {
            nvml,
            attempted_init: true,
        }
    }

    pub fn collect(&mut self) -> Vec<GpuStats> {
        if !self.attempted_init {
            self.nvml = Nvml::init().ok();
            self.attempted_init = true;
        }

        if let Some(ref nvml) = self.nvml {
            let gpus = collect_via_nvml(nvml);
            if !gpus.is_empty() {
                return gpus;
            }
        }

        collect_via_nvidia_smi()
    }
}

fn collect_via_nvml(nvml: &Nvml) -> Vec<GpuStats> {
    let mut results = Vec::new();
    let count = match nvml.device_count() {
        Ok(c) => c,
        Err(_) => return results,
    };

    let driver_version = nvml.sys_driver_version().ok();

    for idx in 0..count {
        let device = match nvml.device_by_index(idx) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let name = device
            .name()
            .unwrap_or_else(|_| format!("NVIDIA GPU {}", idx));

        let util = device.utilization_rates().ok();
        let utilization_percent = util.as_ref().map(|u| u.gpu as f32);

        let mem_info = device.memory_info().ok();
        let vram_total_bytes = mem_info.as_ref().map(|m| m.total);
        let vram_used_bytes = mem_info.as_ref().map(|m| m.used);
        let vram_usage_percent = match (vram_used_bytes, vram_total_bytes) {
            (Some(used), Some(total)) if total > 0 => {
                Some((((used as f64 / total as f64) * 1000.0).round() / 10.0) as f32)
            }
            _ => None,
        };

        let temperature_c = device
            .temperature(TemperatureSensor::Gpu)
            .ok()
            .map(|t| t as f32);

        let power_watts = device
            .power_usage()
            .ok()
            .map(|mw| ((mw as f32 / 1000.0) * 10.0).round() / 10.0);

        let power_limit_watts = device
            .enforced_power_limit()
            .or_else(|_| device.power_management_limit())
            .ok()
            .map(|mw| ((mw as f32 / 1000.0) * 10.0).round() / 10.0);

        let core_clock_mhz = device.clock_info(Clock::Graphics).ok();
        let memory_clock_mhz = device.clock_info(Clock::Memory).ok();
        let fan_speed_percent = device.fan_speed(0).ok();

        let pci_bus_id = device.pci_info().ok().map(|p| p.bus_id);
        let compute_capability = device
            .cuda_compute_capability()
            .ok()
            .map(|cc| format!("CUDA {}.{}", cc.major, cc.minor));

        results.push(GpuStats {
            id: format!("nvidia-{}", idx),
            name,
            vendor: "NVIDIA".to_string(),
            gpu_type: "discrete".to_string(),
            driver_version: driver_version.clone(),
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
            pci_bus_id,
            compute_capability,
        });
    }

    results
}

fn parse_optional_f32(s: &str) -> Option<f32> {
    let t = s.trim();
    if t.is_empty() || t.eq_ignore_ascii_case("N/A") || t.contains("Not Supported") {
        None
    } else {
        t.parse::<f32>().ok().filter(|v| v.is_finite())
    }
}

fn parse_optional_u32(s: &str) -> Option<u32> {
    parse_optional_f32(s).map(|v| v.round().max(0.0) as u32)
}

fn parse_optional_u64_mib(s: &str) -> Option<u64> {
    parse_optional_f32(s).map(|mib| (mib.max(0.0) as u64) * 1024 * 1024)
}

fn collect_via_nvidia_smi() -> Vec<GpuStats> {
    let mut cmd = Command::new("nvidia-smi");
    cmd.args([
        "--query-gpu=index,name,driver_version,utilization.gpu,memory.total,memory.used,temperature.gpu,power.draw,power.limit,clocks.gr,clocks.mem,fan.speed,pci.bus_id",
        "--format=csv,noheader,nounits",
    ]);

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = match cmd.output() {
        Ok(out) if out.status.success() => out,
        _ => return Vec::new(),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut gpus = Vec::new();

    for (line_idx, line) in stdout.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let cols: Vec<&str> = trimmed.split(',').collect();
        if cols.len() < 13 {
            continue;
        }

        let idx_str = cols[0].trim();
        let name = cols[1].trim().to_string();
        let driver_version = {
            let d = cols[2].trim();
            if d.is_empty() || d.eq_ignore_ascii_case("N/A") {
                None
            } else {
                Some(d.to_string())
            }
        };
        let utilization_percent = parse_optional_f32(cols[3]);
        let vram_total_bytes = parse_optional_u64_mib(cols[4]);
        let vram_used_bytes = parse_optional_u64_mib(cols[5]);
        let vram_usage_percent = match (vram_used_bytes, vram_total_bytes) {
            (Some(used), Some(total)) if total > 0 => {
                Some((((used as f64 / total as f64) * 1000.0).round() / 10.0) as f32)
            }
            _ => None,
        };
        let temperature_c = parse_optional_f32(cols[6]);
        let power_watts = parse_optional_f32(cols[7]);
        let power_limit_watts = parse_optional_f32(cols[8]);
        let core_clock_mhz = parse_optional_u32(cols[9]);
        let memory_clock_mhz = parse_optional_u32(cols[10]);
        let fan_speed_percent = parse_optional_u32(cols[11]);
        let pci_bus_id = {
            let p = cols[12].trim();
            if p.is_empty() || p.eq_ignore_ascii_case("N/A") {
                None
            } else {
                Some(p.to_string())
            }
        };

        gpus.push(GpuStats {
            id: format!("nvidia-{}", if idx_str.is_empty() { line_idx.to_string() } else { idx_str.to_string() }),
            name,
            vendor: "NVIDIA".to_string(),
            gpu_type: "discrete".to_string(),
            driver_version,
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
            pci_bus_id,
            compute_capability: Some("CUDA".to_string()),
        });
    }

    gpus
}
