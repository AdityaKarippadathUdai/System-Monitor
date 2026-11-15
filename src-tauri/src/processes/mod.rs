use crate::models::{KillResult, ProcessInfo};
use chrono::{DateTime, Local, TimeZone};
use std::collections::HashMap;
use std::time::Instant;
use sysinfo::{Pid, ProcessStatus, System, Users};

pub struct ProcessMonitor {
    users: Users,
    prev_disk_io: HashMap<u32, (u64, u64)>,
    last_sample: Instant,
}

impl ProcessMonitor {
    pub fn new() -> Self {
        Self {
            users: Users::new_with_refreshed_list(),
            prev_disk_io: HashMap::new(),
            last_sample: Instant::now(),
        }
    }

    pub fn collect(&mut self, sys: &System) -> Vec<ProcessInfo> {
        let elapsed = self.last_sample.elapsed().as_secs_f64().max(0.05);
        self.last_sample = Instant::now();

        let total_mem = sys.total_memory() as f64;
        let cpu_count = sys.cpus().len().max(1) as f32;
        let mut procs = Vec::with_capacity(sys.processes().len());
        let mut next_disk_io = HashMap::with_capacity(sys.processes().len());

        for (pid, p) in sys.processes() {
            let pid_u32 = pid.as_u32();
            let mem_bytes = p.memory();
            // Normalize CPU usage against total host capacity on Linux/Windows consistently (0..100%)
            let raw_cpu = p.cpu_usage();
            let normalized_cpu = if raw_cpu > 100.0 {
                raw_cpu / cpu_count
            } else {
                raw_cpu
            };
            let cpu_pct = ((normalized_cpu.min(100.0)) * 10.0).round() / 10.0;

            let mem_pct = if total_mem > 0.0 {
                ((((mem_bytes as f64 / total_mem) * 100.0) * 10.0).round() / 10.0) as f32
            } else {
                0.0
            };

            let disk_usage = p.disk_usage();
            next_disk_io.insert(
                pid_u32,
                (disk_usage.total_read_bytes, disk_usage.total_written_bytes),
            );

            let (read_rate, write_rate) =
                if let Some(&(prev_r, prev_w)) = self.prev_disk_io.get(&pid_u32) {
                    (
                        ((disk_usage.total_read_bytes.saturating_sub(prev_r) as f64) / elapsed)
                            .round() as u64,
                        ((disk_usage.total_written_bytes.saturating_sub(prev_w) as f64) / elapsed)
                            .round() as u64,
                    )
                } else {
                    (
                        ((disk_usage.read_bytes as f64) / elapsed).round() as u64,
                        ((disk_usage.written_bytes as f64) / elapsed).round() as u64,
                    )
                };

            let name = p.name().to_string();
            let user = p.user_id().and_then(|uid| {
                self.users
                    .get_user_by_id(uid)
                    .map(|u| u.name().to_string())
                    .or_else(|| Some(uid.to_string()))
            });

            let category = classify_process_category(pid_u32, &name, user.as_deref());
            let status = map_process_status(p.status());

            let start_time = {
                let st = p.start_time();
                if st > 0 {
                    Local
                        .timestamp_opt(st as i64, 0)
                        .single()
                        .map(|dt: DateTime<Local>| dt.format("%H:%M:%S").to_string())
                        .unwrap_or_else(|| "Active".to_string())
                } else {
                    "System".to_string()
                }
            };

            let threads = read_process_threads(pid_u32);

            let cmd_joined = p.cmd().join(" ");
            let exe_path = p
                .exe()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_default();

            procs.push(ProcessInfo {
                pid: pid_u32,
                ppid: p.parent().map(|pp| pp.as_u32()).unwrap_or(0),
                name: name.clone(),
                command: if cmd_joined.is_empty() {
                    name
                } else {
                    cmd_joined
                },
                executable_path: exe_path,
                user,
                cpu_percent: cpu_pct,
                memory_bytes: mem_bytes,
                memory_percent: mem_pct,
                gpu_percent: None,
                vram_bytes: None,
                disk_read_bytes_sec: read_rate,
                disk_write_bytes_sec: write_rate,
                net_rx_bytes_sec: None,
                net_tx_bytes_sec: None,
                status,
                category,
                start_time,
                threads,
                priority: None,
                history: vec![],
            });
        }

        self.prev_disk_io = next_disk_io;

        procs.sort_by(|a, b| {
            b.cpu_percent
                .partial_cmp(&a.cpu_percent)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.memory_bytes.cmp(&a.memory_bytes))
        });

        procs
    }

    pub fn kill_process(&self, sys: &System, pid: u32) -> KillResult {
        // 1. Hard-block PID 0, PID 1, and Windows kernel System PID 4
        if pid == 0 || pid == 1 || (cfg!(target_os = "windows") && pid == 4) {
            return KillResult {
                success: false,
                message: format!(
                    "Refused to terminate protected OS kernel/init process (PID {}).",
                    pid
                ),
            };
        }

        // 2. Protect the monitoring application itself
        let self_pid = std::process::id();
        if pid == self_pid {
            return KillResult {
                success: false,
                message: format!(
                    "Refused to terminate SysMon Pro monitoring process (PID {}).",
                    pid
                ),
            };
        }

        let target_pid = Pid::from_u32(pid);
        let proc_name = sys
            .process(target_pid)
            .map(|p| p.name().to_string())
            .unwrap_or_default();

        if proc_name.is_empty() && sys.process(target_pid).is_none() {
            return KillResult {
                success: false,
                message: format!("Process PID {} was not found in the active process table.", pid),
            };
        }

        // 3. Protect critical OS processes by name
        if is_protected_system_process(&proc_name) {
            return KillResult {
                success: false,
                message: format!(
                    "Refused to terminate critical operating system process \"{}\" (PID {}).",
                    proc_name, pid
                ),
            };
        }

        // 4. Platform-native termination (without silent privilege elevation)
        #[cfg(target_os = "linux")]
        {
            kill_linux_process(pid, &proc_name)
        }
        #[cfg(target_os = "windows")]
        {
            kill_windows_process(pid, &proc_name)
        }
        #[cfg(not(any(target_os = "linux", target_os = "windows")))]
        {
            if let Some(p) = sys.process(target_pid) {
                let ok = p.kill();
                KillResult {
                    success: ok,
                    message: if ok {
                        format!("Process {} (PID {}) terminated.", proc_name, pid)
                    } else {
                        format!("Failed to terminate process {} (PID {}).", proc_name, pid)
                    },
                }
            } else {
                KillResult {
                    success: false,
                    message: format!("Process PID {} not found.", pid),
                }
            }
        }
    }
}

fn map_process_status(status: ProcessStatus) -> String {
    match status {
        ProcessStatus::Run => "running".to_string(),
        ProcessStatus::Sleep | ProcessStatus::Idle | ProcessStatus::Wake => "sleeping".to_string(),
        ProcessStatus::Stop | ProcessStatus::Tracing => "stopped".to_string(),
        ProcessStatus::Zombie | ProcessStatus::Dead => "zombie".to_string(),
        _ => "running".to_string(),
    }
}

fn classify_process_category(pid: u32, name: &str, user: Option<&str>) -> String {
    let lower = name.to_lowercase();

    #[cfg(target_os = "windows")]
    {
        if pid <= 4
            || matches!(
                lower.as_str(),
                "system"
                    | "system idle process"
                    | "registry"
                    | "smss.exe"
                    | "csrss.exe"
                    | "wininit.exe"
                    | "services.exe"
                    | "lsass.exe"
                    | "winlogon.exe"
                    | "dwm.exe"
                    | "fontdrvhost.exe"
                    | "memory compression"
            )
            || user
                .map(|u| {
                    let ul = u.to_lowercase();
                    ul.contains("system") || ul.contains("local service") || ul.contains("network service")
                })
                .unwrap_or(false)
        {
            return "system".to_string();
        }
        if lower.contains("svchost")
            || lower.contains("service")
            || lower.contains("host")
            || lower.contains("updater")
            || lower.contains("helper")
            || lower.contains("agent")
            || lower.contains("runtimebroker")
        {
            return "background".to_string();
        }
        return "app".to_string();
    }

    #[cfg(not(target_os = "windows"))]
    {
        if pid <= 2
            || user == Some("root")
            || lower.contains("systemd")
            || lower.contains("kworker")
            || lower.contains("kthreadd")
            || lower.contains("ksoftirqd")
            || lower.contains("udevd")
            || lower.contains("dbus")
            || lower.contains("xorg")
            || lower.contains("xwayland")
            || lower.contains("gnome-shell")
        {
            return "system".to_string();
        }
        if lower.ends_with('d')
            || lower.contains("daemon")
            || lower.contains("server")
            || lower.contains("node")
            || lower.contains("postgres")
            || lower.contains("redis")
            || lower.contains("docker")
            || lower.contains("containerd")
            || lower.contains("pipewire")
            || lower.contains("pulseaudio")
        {
            return "background".to_string();
        }
        "app".to_string()
    }
}

fn is_protected_system_process(name: &str) -> bool {
    let lower = name.to_lowercase();
    matches!(
        lower.as_str(),
        "init"
            | "systemd"
            | "kthreadd"
            | "system"
            | "system idle process"
            | "registry"
            | "smss.exe"
            | "csrss.exe"
            | "wininit.exe"
            | "services.exe"
            | "lsass.exe"
            | "winlogon.exe"
            | "memory compression"
    )
}

fn read_process_threads(pid: u32) -> Option<u32> {
    #[cfg(target_os = "linux")]
    {
        let status_path = format!("/proc/{}/status", pid);
        if let Ok(content) = std::fs::read_to_string(status_path) {
            for line in content.lines() {
                if let Some(rest) = line.strip_prefix("Threads:") {
                    if let Ok(t) = rest.trim().parse::<u32>() {
                        return Some(t);
                    }
                }
            }
        }
        None
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = pid;
        None
    }
}

#[cfg(target_os = "linux")]
fn kill_linux_process(pid: u32, proc_name: &str) -> KillResult {
    let res = unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM) };
    if res == 0 {
        KillResult {
            success: true,
            message: format!(
                "Sent graceful termination signal (SIGTERM) to {} (PID {}).",
                proc_name, pid
            ),
        }
    } else {
        let err = std::io::Error::last_os_error();
        let reason = match err.raw_os_error() {
            Some(libc::EPERM) | Some(libc::EACCES) => {
                "Permission denied: insufficient privileges to terminate this process.".to_string()
            }
            Some(libc::ESRCH) => "Process no longer exists.".to_string(),
            _ => err.to_string(),
        };
        KillResult {
            success: false,
            message: format!("Failed to terminate {} (PID {}): {}", proc_name, pid, reason),
        }
    }
}

#[cfg(target_os = "windows")]
fn kill_windows_process(pid: u32, proc_name: &str) -> KillResult {
    use windows::Win32::Foundation::{CloseHandle, ERROR_ACCESS_DENIED, HWND, LPARAM, WPARAM};
    use windows::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, TerminateProcess, PROCESS_QUERY_LIMITED_INFORMATION,
        PROCESS_TERMINATE,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE,
    };

    unsafe extern "system" fn close_matching_windows(
        hwnd: HWND,
        lparam: LPARAM,
    ) -> windows::Win32::Foundation::BOOL {
        let mut win_pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut win_pid));
        if win_pid == lparam.0 as u32 {
            let _ = PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0));
        }
        windows::Win32::Foundation::BOOL(1)
    }

    unsafe {
        // 1. Attempt graceful close via WM_CLOSE for GUI applications
        let _ = EnumWindows(Some(close_matching_windows), LPARAM(pid as isize));
        std::thread::sleep(std::time::Duration::from_millis(120));

        // Check if process already exited gracefully
        if let Ok(q_handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut exit_code: u32 = 0;
            let exited = GetExitCodeProcess(q_handle, &mut exit_code).is_ok() && exit_code != 259; // STILL_ACTIVE == 259
            let _ = CloseHandle(q_handle);
            if exited {
                return KillResult {
                    success: true,
                    message: format!(
                        "Process {} (PID {}) closed gracefully via WM_CLOSE.",
                        proc_name, pid
                    ),
                };
            }
        }

        // 2. Fallback to TerminateProcess
        match OpenProcess(PROCESS_TERMINATE, false, pid) {
            Ok(handle) => {
                let term_res = TerminateProcess(handle, 1);
                let _ = CloseHandle(handle);
                match term_res {
                    Ok(()) => KillResult {
                        success: true,
                        message: format!(
                            "Process {} (PID {}) terminated via Windows TerminateProcess.",
                            proc_name, pid
                        ),
                    },
                    Err(e) => {
                        let msg = if e.code() == ERROR_ACCESS_DENIED.to_hresult() {
                            "Permission denied: run as appropriate user/privileges to terminate this process.".to_string()
                        } else {
                            e.message().to_string()
                        };
                        KillResult {
                            success: false,
                            message: format!(
                                "Failed to terminate {} (PID {}): {}",
                                proc_name, pid, msg
                            ),
                        }
                    }
                }
            }
            Err(e) => {
                let msg = if e.code() == ERROR_ACCESS_DENIED.to_hresult() {
                    "Permission denied: insufficient privileges to open this process.".to_string()
                } else {
                    e.message().to_string()
                };
                KillResult {
                    success: false,
                    message: format!(
                        "Cannot terminate {} (PID {}): {}",
                        proc_name, pid, msg
                    ),
                }
            }
        }
    }
}
