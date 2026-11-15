use super::{extract_component_cpu_temp, normalize_manufacturer, CpuPlatformDetails};
use crate::models::CpuCache;
use std::fs;
use std::path::Path;
use sysinfo::{Components, System};

fn read_u64_file(path: &Path) -> Option<u64> {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| s.trim().parse::<u64>().ok())
}

fn read_cpufreq_khz() -> (Option<f32>, Option<f32>) {
    let mut cur_sum_khz = 0u64;
    let mut cur_count = 0u64;
    let mut max_khz = 0u64;

    if let Ok(entries) = fs::read_dir("/sys/devices/system/cpu") {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if !name_str.starts_with("cpu") || !name_str[3..].chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            let cpufreq = entry.path().join("cpufreq");
            if let Some(cur) = read_u64_file(&cpufreq.join("scaling_cur_freq")) {
                if cur > 0 {
                    cur_sum_khz += cur;
                    cur_count += 1;
                }
            }
            if let Some(max) = read_u64_file(&cpufreq.join("cpuinfo_max_freq"))
                .or_else(|| read_u64_file(&cpufreq.join("scaling_max_freq")))
            {
                if max > max_khz {
                    max_khz = max;
                }
            }
        }
    }

    let cur_ghz = if cur_count > 0 {
        let avg_khz = cur_sum_khz as f32 / cur_count as f32;
        Some(((avg_khz / 1_000_000.0) * 100.0).round() / 100.0)
    } else {
        None
    };

    let max_ghz = if max_khz > 0 {
        Some((((max_khz as f32) / 1_000_000.0) * 100.0).round() / 100.0)
    } else {
        None
    };

    (cur_ghz, max_ghz)
}

fn read_linux_cpu_temp(components: &Components) -> Option<f32> {
    // 1. Try hwmon interfaces for real CPU package sensors
    let preferred_names = ["coretemp", "k10temp", "zenpower", "fam15h_power", "cpu_thermal"];
    if let Ok(entries) = fs::read_dir("/sys/class/hwmon") {
        let mut best_temp: Option<(u8, f32)> = None;
        for entry in entries.flatten() {
            let path = entry.path();
            let hw_name = fs::read_to_string(path.join("name"))
                .unwrap_or_default()
                .trim()
                .to_lowercase();

            let priority = if preferred_names.iter().any(|p| hw_name.contains(p)) {
                2
            } else if hw_name.contains("acpitz") || hw_name.contains("thinkpad") {
                1
            } else {
                0
            };

            if priority == 0 {
                continue;
            }

            for idx in 1..=8 {
                let input_path = path.join(format!("temp{}_input", idx));
                if let Some(millideg) = read_u64_file(&input_path) {
                    let temp_c = millideg as f32 / 1000.0;
                    if temp_c > 5.0 && temp_c < 130.0 {
                        let label = fs::read_to_string(path.join(format!("temp{}_label", idx)))
                            .unwrap_or_default()
                            .to_lowercase();
                        let bonus = if label.contains("package")
                            || label.contains("tctl")
                            || label.contains("tdie")
                        {
                            2
                        } else {
                            0
                        };
                        let score = priority + bonus;
                        if best_temp.map(|(s, _)| score > s).unwrap_or(true) {
                            best_temp = Some((score, (temp_c * 10.0).round() / 10.0));
                        }
                    }
                }
            }
        }
        if let Some((_, t)) = best_temp {
            return Some(t);
        }
    }

    // 2. Try /sys/class/thermal/thermal_zone*
    if let Ok(entries) = fs::read_dir("/sys/class/thermal") {
        let mut fallback: Option<f32> = None;
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with("thermal_zone") {
                continue;
            }
            let path = entry.path();
            let zone_type = fs::read_to_string(path.join("type"))
                .unwrap_or_default()
                .trim()
                .to_lowercase();

            if let Some(millideg) = read_u64_file(&path.join("temp")) {
                let temp_c = millideg as f32 / 1000.0;
                if temp_c > 5.0 && temp_c < 130.0 {
                    let rounded = (temp_c * 10.0).round() / 10.0;
                    if zone_type.contains("x86_pkg_temp") || zone_type.contains("cpu") {
                        return Some(rounded);
                    }
                    if fallback.is_none() && zone_type.contains("acpitz") {
                        fallback = Some(rounded);
                    }
                }
            }
        }
        if fallback.is_some() {
            return fallback;
        }
    }

    // 3. Fallback to sysinfo::Components
    extract_component_cpu_temp(components)
}

fn read_linux_cache() -> CpuCache {
    let mut l1_kb: u64 = 0;
    let mut l2_kb: u64 = 0;
    let mut l3_kb: u64 = 0;

    let cache_dir = Path::new("/sys/devices/system/cpu/cpu0/cache");
    if let Ok(entries) = fs::read_dir(cache_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let level = read_u64_file(&path.join("level")).unwrap_or(0);
            let cache_type = fs::read_to_string(path.join("type"))
                .unwrap_or_default()
                .trim()
                .to_lowercase();
            let size_str = fs::read_to_string(path.join("size")).unwrap_or_default();
            let size_kb = parse_cache_size_kb(&size_str);

            match level {
                1 => {
                    // Sum L1d + L1i or take available
                    if cache_type == "data" || cache_type == "instruction" || cache_type == "unified" {
                        l1_kb += size_kb;
                    }
                }
                2 => {
                    l2_kb = l2_kb.max(size_kb);
                }
                3 => {
                    l3_kb = l3_kb.max(size_kb);
                }
                _ => {}
            }
        }
    }

    let format_kb = |kb: u64| -> Option<String> {
        if kb == 0 {
            None
        } else if kb >= 1024 {
            Some(format!("{} MB", kb / 1024))
        } else {
            Some(format!("{} KB", kb))
        }
    };

    CpuCache {
        l1: format_kb(l1_kb),
        l2: format_kb(l2_kb),
        l3: format_kb(l3_kb),
    }
}

fn parse_cache_size_kb(raw: &str) -> u64 {
    let s = raw.trim();
    if let Some(num) = s.strip_suffix('K') {
        num.trim().parse::<u64>().unwrap_or(0)
    } else if let Some(num) = s.strip_suffix('M') {
        num.trim().parse::<u64>().unwrap_or(0) * 1024
    } else {
        s.parse::<u64>().unwrap_or(0)
    }
}

pub fn collect_details(
    components: &Components,
    sysinfo_freq_ghz: Option<f32>,
    raw_vendor: String,
) -> CpuPlatformDetails {
    let (cpufreq_cur, cpufreq_max) = read_cpufreq_khz();
    let frequency_ghz = cpufreq_cur.or(sysinfo_freq_ghz);
    let governor = fs::read_to_string("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let la = System::load_average();
    let load_average = Some([
        (la.one as f32 * 100.0).round() / 100.0,
        (la.five as f32 * 100.0).round() / 100.0,
        (la.fifteen as f32 * 100.0).round() / 100.0,
    ]);

    let model_hint = fs::read_to_string("/proc/cpuinfo")
        .ok()
        .and_then(|c| {
            c.lines()
                .find(|l| l.starts_with("model name"))
                .and_then(|l| l.split_once(':'))
                .map(|(_, v)| v.trim().to_string())
        })
        .unwrap_or_default();

    CpuPlatformDetails {
        frequency_ghz,
        max_frequency_ghz: cpufreq_max,
        temperature_c: read_linux_cpu_temp(components),
        manufacturer: normalize_manufacturer(&raw_vendor, &model_hint),
        cache: read_linux_cache(),
        governor,
        load_average,
    }
}
