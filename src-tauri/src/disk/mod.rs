use crate::models::DiskStats;
use std::collections::HashMap;
use std::time::Instant;
use sysinfo::{DiskKind, Disks};

pub struct DiskMonitor {
    #[cfg(target_os = "linux")]
    prev_stats: HashMap<String, (u64, u64, u64, u64)>, // (reads_ops, writes_ops, sectors_read, sectors_written)
    #[cfg(target_os = "linux")]
    last_sample: Instant,
    #[cfg(target_os = "windows")]
    win_pdh: WindowsDiskPdhMonitor,
}

impl DiskMonitor {
    pub fn new() -> Self {
        Self {
            #[cfg(target_os = "linux")]
            prev_stats: read_proc_diskstats(),
            #[cfg(target_os = "linux")]
            last_sample: Instant::now(),
            #[cfg(target_os = "windows")]
            win_pdh: WindowsDiskPdhMonitor::new(),
        }
    }

    pub fn collect(&mut self, disks: &Disks) -> Vec<DiskStats> {
        #[cfg(target_os = "linux")]
        {
            self.collect_linux(disks)
        }
        #[cfg(target_os = "windows")]
        {
            self.collect_windows(disks)
        }
        #[cfg(not(any(target_os = "linux", target_os = "windows")))]
        {
            collect_generic(disks)
        }
    }

    #[cfg(target_os = "linux")]
    fn collect_linux(&mut self, disks: &Disks) -> Vec<DiskStats> {
        let elapsed = self.last_sample.elapsed().as_secs_f64().max(0.05);
        let current = read_proc_diskstats();
        let mut io_rates: HashMap<String, (u64, u64, u32, u32)> = HashMap::new();

        for (dev, &(r_ops, w_ops, r_sec, w_sec)) in &current {
            if let Some(&(pr_ops, pw_ops, pr_sec, pw_sec)) = self.prev_stats.get(dev) {
                let dr_bytes = r_sec.saturating_sub(pr_sec) * 512;
                let dw_bytes = w_sec.saturating_sub(pw_sec) * 512;
                let dr_ops = r_ops.saturating_sub(pr_ops);
                let dw_ops = w_ops.saturating_sub(pw_ops);

                io_rates.insert(
                    dev.clone(),
                    (
                        (dr_bytes as f64 / elapsed).round() as u64,
                        (dw_bytes as f64 / elapsed).round() as u64,
                        (dr_ops as f64 / elapsed).round() as u32,
                        (dw_ops as f64 / elapsed).round() as u32,
                    ),
                );
            }
        }

        self.prev_stats = current;
        self.last_sample = Instant::now();

        let mut list = Vec::new();
        for (idx, disk) in disks.iter().enumerate() {
            let mount = disk.mount_point().to_string_lossy().to_string();
            let fs = disk.file_system().to_string_lossy().to_string();
            // Skip pseudo filesystems if any slip through
            if mount.starts_with("/snap/") || fs == "squashfs" || fs == "tmpfs" || fs == "devtmpfs" {
                continue;
            }

            let raw_name = disk.name().to_string_lossy().to_string();
            let dev_key = resolve_linux_block_device(&raw_name);

            let (read_speed, write_speed, read_ops, write_ops) = dev_key
                .as_ref()
                .and_then(|k| io_rates.get(k))
                .map(|&(rs, ws, ro, wo)| (Some(rs), Some(ws), Some(ro), Some(wo)))
                .unwrap_or((None, None, None, None));

            let total = disk.total_space();
            let available = disk.available_space();
            let used = total.saturating_sub(available);
            let usage_percent = if total > 0 {
                (((used as f64 / total as f64) * 1000.0).round() / 10.0) as f32
            } else {
                0.0
            };

            let base_dev = dev_key.as_deref().map(linux_base_block_name);
            let disk_type = classify_linux_disk_type(disk, base_dev.as_deref());
            let temperature_c = base_dev.as_deref().and_then(read_linux_disk_temp);

            list.push(DiskStats {
                id: format!("disk-{}", idx),
                name: if raw_name.is_empty() {
                    mount.clone()
                } else {
                    raw_name
                },
                mount_point: mount.clone(),
                filesystem: fs,
                total_bytes: total,
                used_bytes: used,
                available_bytes: available,
                usage_percent,
                read_speed_bytes_sec: read_speed,
                write_speed_bytes_sec: write_speed,
                read_ops_sec: read_ops,
                write_ops_sec: write_ops,
                temperature_c,
                is_system: mount == "/",
                disk_type,
            });
        }

        list
    }

    #[cfg(target_os = "windows")]
    fn collect_windows(&mut self, disks: &Disks) -> Vec<DiskStats> {
        let pdh_rates = self.win_pdh.sample();
        let sys_drive = std::env::var("SystemDrive")
            .unwrap_or_else(|_| "C:".to_string())
            .to_uppercase();

        let mut list = Vec::new();
        for (idx, disk) in disks.iter().enumerate() {
            let mount = disk.mount_point().to_string_lossy().to_string();
            let drive_letter = mount.trim_end_matches('\\').to_uppercase();
            let raw_name = disk.name().to_string_lossy().trim().to_string();
            let display_name = if raw_name.is_empty() {
                format!("Local Disk ({})", drive_letter)
            } else {
                format!("{} ({})", raw_name, drive_letter)
            };

            let total = disk.total_space();
            let available = disk.available_space();
            let used = total.saturating_sub(available);
            let usage_percent = if total > 0 {
                (((used as f64 / total as f64) * 1000.0).round() / 10.0) as f32
            } else {
                0.0
            };

            let (read_speed, write_speed, read_ops, write_ops) = pdh_rates
                .get(&drive_letter)
                .map(|r| (Some(r.read_bytes), Some(r.write_bytes), Some(r.read_ops), Some(r.write_ops)))
                .unwrap_or((None, None, None, None));

            let disk_type = if disk.is_removable() {
                "Removable".to_string()
            } else {
                match disk.kind() {
                    DiskKind::SSD => "SSD / NVMe".to_string(),
                    DiskKind::HDD => "HDD".to_string(),
                    _ => "Fixed Drive".to_string(),
                }
            };

            let is_system = drive_letter == sys_drive;

            list.push(DiskStats {
                id: format!("disk-{}", idx),
                name: display_name,
                mount_point: mount,
                filesystem: disk.file_system().to_string_lossy().to_string(),
                total_bytes: total,
                used_bytes: used,
                available_bytes: available,
                usage_percent,
                read_speed_bytes_sec: read_speed,
                write_speed_bytes_sec: write_speed,
                read_ops_sec: read_ops,
                write_ops_sec: write_ops,
                temperature_c: None,
                is_system,
                disk_type,
            });
        }

        list
    }
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn collect_generic(disks: &Disks) -> Vec<DiskStats> {
    disks
        .iter()
        .enumerate()
        .map(|(idx, disk)| {
            let total = disk.total_space();
            let available = disk.available_space();
            let used = total.saturating_sub(available);
            let mount = disk.mount_point().to_string_lossy().to_string();
            DiskStats {
                id: format!("disk-{}", idx),
                name: disk.name().to_string_lossy().to_string(),
                mount_point: mount.clone(),
                filesystem: disk.file_system().to_string_lossy().to_string(),
                total_bytes: total,
                used_bytes: used,
                available_bytes: available,
                usage_percent: if total > 0 {
                    (((used as f64 / total as f64) * 1000.0).round() / 10.0) as f32
                } else {
                    0.0
                },
                read_speed_bytes_sec: None,
                write_speed_bytes_sec: None,
                read_ops_sec: None,
                write_ops_sec: None,
                temperature_c: None,
                is_system: mount == "/",
                disk_type: match disk.kind() {
                    DiskKind::SSD => "SSD".to_string(),
                    DiskKind::HDD => "HDD".to_string(),
                    _ => "Storage".to_string(),
                },
            }
        })
        .collect()
}

#[cfg(target_os = "linux")]
fn read_proc_diskstats() -> HashMap<String, (u64, u64, u64, u64)> {
    let mut map = HashMap::new();
    if let Ok(content) = std::fs::read_to_string("/proc/diskstats") {
        for line in content.lines() {
            let cols: Vec<&str> = line.split_whitespace().collect();
            if cols.len() >= 10 {
                let name = cols[2].to_string();
                let r_ops = cols[3].parse::<u64>().unwrap_or(0);
                let r_sec = cols[5].parse::<u64>().unwrap_or(0);
                let w_ops = cols[7].parse::<u64>().unwrap_or(0);
                let w_sec = cols[9].parse::<u64>().unwrap_or(0);
                map.insert(name, (r_ops, w_ops, r_sec, w_sec));
            }
        }
    }
    map
}

#[cfg(target_os = "linux")]
fn resolve_linux_block_device(raw_name: &str) -> Option<String> {
    if raw_name.starts_with("/dev/") {
        let canonical = std::fs::canonicalize(raw_name)
            .ok()
            .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()));
        if canonical.is_some() {
            return canonical;
        }
        return raw_name.strip_prefix("/dev/").map(|s| s.to_string());
    }
    None
}

#[cfg(target_os = "linux")]
fn linux_base_block_name(dev: &str) -> String {
    if dev.starts_with("nvme") {
        if let Some(p_idx) = dev.rfind('p') {
            if dev[p_idx + 1..].chars().all(|c| c.is_ascii_digit()) {
                return dev[..p_idx].to_string();
            }
        }
    } else if dev.starts_with("sd") || dev.starts_with("vd") || dev.starts_with("hd") {
        return dev.trim_end_matches(|c: char| c.is_ascii_digit()).to_string();
    }
    dev.to_string()
}

#[cfg(target_os = "linux")]
fn classify_linux_disk_type(disk: &sysinfo::Disk, base_dev: Option<&str>) -> String {
    if let Some(base) = base_dev {
        if base.starts_with("nvme") {
            return "NVMe SSD".to_string();
        }
        let rot_path = format!("/sys/block/{}/queue/rotational", base);
        if let Ok(rot) = std::fs::read_to_string(rot_path) {
            if rot.trim() == "1" {
                return "HDD".to_string();
            } else if rot.trim() == "0" {
                return "SATA SSD".to_string();
            }
        }
    }
    if disk.is_removable() {
        return "Removable".to_string();
    }
    match disk.kind() {
        DiskKind::SSD => "SSD".to_string(),
        DiskKind::HDD => "HDD".to_string(),
        _ => "Storage".to_string(),
    }
}

#[cfg(target_os = "linux")]
fn read_linux_disk_temp(base_dev: &str) -> Option<f32> {
    let hwmon_dir = format!("/sys/block/{}/device/hwmon", base_dev);
    if let Ok(entries) = std::fs::read_dir(hwmon_dir) {
        for entry in entries.flatten() {
            let temp_path = entry.path().join("temp1_input");
            if let Ok(raw) = std::fs::read_to_string(temp_path) {
                if let Ok(mdeg) = raw.trim().parse::<u64>() {
                    let c = mdeg as f32 / 1000.0;
                    if c > 5.0 && c < 110.0 {
                        return Some((c * 10.0).round() / 10.0);
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
struct DiskRate {
    read_bytes: u64,
    write_bytes: u64,
    read_ops: u32,
    write_ops: u32,
}

#[cfg(target_os = "windows")]
type PdhQuery = isize;
#[cfg(target_os = "windows")]
type PdhCounter = isize;

#[cfg(target_os = "windows")]
struct DiskCounters {
    read_bytes: PdhCounter,
    write_bytes: PdhCounter,
    read_ops: PdhCounter,
    write_ops: PdhCounter,
}

#[cfg(target_os = "windows")]
struct WindowsDiskPdhMonitor {
    query: Option<PdhQuery>,
    counters: HashMap<String, DiskCounters>,
    last_refresh: Instant,
    initialized_sample: bool,
}

#[cfg(target_os = "windows")]
unsafe impl Send for WindowsDiskPdhMonitor {}
#[cfg(target_os = "windows")]
unsafe impl Sync for WindowsDiskPdhMonitor {}

#[cfg(target_os = "windows")]
impl WindowsDiskPdhMonitor {
    fn new() -> Self {
        let mut m = Self {
            query: None,
            counters: HashMap::new(),
            last_refresh: Instant::now(),
            initialized_sample: false,
        };
        m.rebuild();
        m
    }

    fn rebuild(&mut self) {
        use windows::core::{w, PCWSTR};
        use windows::Win32::System::Performance::{
            PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhOpenQueryW,
        };

        if let Some(q) = self.query.take() {
            unsafe {
                let _ = PdhCloseQuery(q);
            }
        }
        self.counters.clear();
        self.initialized_sample = false;

        unsafe {
            let mut query: PdhQuery = 0;
            if PdhOpenQueryW(PCWSTR::null(), 0, &mut query) != 0 {
                return;
            }

            let paths = expand_disk_wildcard(w!(r#"\LogicalDisk(*)\Disk Read Bytes/sec"#));
            for path in paths {
                if let Some(drive) = extract_logical_drive(&path) {
                    if drive == "_TOTAL" || !drive.ends_with(':') {
                        continue;
                    }
                    let make_path = |metric: &str| -> Vec<u16> {
                        format!("\\LogicalDisk({})\\{}", drive, metric)
                            .encode_utf16()
                            .chain(std::iter::once(0))
                            .collect()
                    };

                    let mut rb: PdhCounter = 0;
                    let mut wb: PdhCounter = 0;
                    let mut ro: PdhCounter = 0;
                    let mut wo: PdhCounter = 0;

                    let p1 = make_path("Disk Read Bytes/sec");
                    let p2 = make_path("Disk Write Bytes/sec");
                    let p3 = make_path("Disk Reads/sec");
                    let p4 = make_path("Disk Writes/sec");

                    if PdhAddEnglishCounterW(query, PCWSTR(p1.as_ptr()), 0, &mut rb) == 0
                        && PdhAddEnglishCounterW(query, PCWSTR(p2.as_ptr()), 0, &mut wb) == 0
                        && PdhAddEnglishCounterW(query, PCWSTR(p3.as_ptr()), 0, &mut ro) == 0
                        && PdhAddEnglishCounterW(query, PCWSTR(p4.as_ptr()), 0, &mut wo) == 0
                    {
                        self.counters.insert(
                            drive.to_uppercase(),
                            DiskCounters {
                                read_bytes: rb,
                                write_bytes: wb,
                                read_ops: ro,
                                write_ops: wo,
                            },
                        );
                    }
                }
            }

            let _ = PdhCollectQueryData(query);
            self.query = Some(query);
            self.last_refresh = Instant::now();
        }
    }

    fn sample(&mut self) -> HashMap<String, DiskRate> {
        use windows::Win32::System::Performance::{
            PdhCollectQueryData, PdhGetFormattedCounterValue, PDH_FMT_COUNTERVALUE, PDH_FMT_DOUBLE,
        };

        if self.last_refresh.elapsed().as_secs() >= 10 {
            self.rebuild();
        }

        let mut out = HashMap::new();
        if let Some(query) = self.query {
            unsafe {
                if PdhCollectQueryData(query) == 0 {
                    if self.initialized_sample {
                        let read_val = |c: PdhCounter| -> f64 {
                            let mut v = PDH_FMT_COUNTERVALUE::default();
                            if PdhGetFormattedCounterValue(c, PDH_FMT_DOUBLE, None, &mut v) == 0 {
                                let d = v.Anonymous.doubleValue;
                                if d.is_finite() && d >= 0.0 {
                                    return d;
                                }
                            }
                            0.0
                        };

                        for (drive, c) in &self.counters {
                            out.insert(
                                drive.clone(),
                                DiskRate {
                                    read_bytes: read_val(c.read_bytes).round() as u64,
                                    write_bytes: read_val(c.write_bytes).round() as u64,
                                    read_ops: read_val(c.read_ops).round() as u32,
                                    write_ops: read_val(c.write_ops).round() as u32,
                                },
                            );
                        }
                    }
                    self.initialized_sample = true;
                }
            }
        }
        out
    }
}

#[cfg(target_os = "windows")]
impl Drop for WindowsDiskPdhMonitor {
    fn drop(&mut self) {
        if let Some(q) = self.query.take() {
            unsafe {
                let _ = windows::Win32::System::Performance::PdhCloseQuery(q);
            }
        }
    }
}

#[cfg(target_os = "windows")]
unsafe fn expand_disk_wildcard(pattern: windows::core::PCWSTR) -> Vec<String> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Performance::PdhExpandWildCardPathW;

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
    if PdhExpandWildCardPathW(
        windows::core::PCWSTR::null(),
        pattern,
        PWSTR(buf.as_mut_ptr()),
        &mut len,
        0,
    ) != ERROR_SUCCESS.0
    {
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
fn extract_logical_drive(path: &str) -> Option<String> {
    let start = path.find('(')?;
    let end = path[start + 1..].find(')')? + start + 1;
    Some(path[start + 1..end].to_string())
}
