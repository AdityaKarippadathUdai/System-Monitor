pub mod connections;
pub mod history;
pub mod interfaces;
#[cfg(target_os = "linux")]
pub mod linux;
pub mod models;
pub mod processes;
pub mod traffic;
#[cfg(target_os = "windows")]
pub mod windows;

use crate::models::{NetworkInterface, NetworkStats, PingResult};
use connections::{is_active_connection_state, ConnectionTracker};
use history::NetworkHistoryStore;
use interfaces::{collect_interfaces, pick_default_active_interface};
use models::{
    NetworkAttributionCapabilities, NetworkConnection, NetworkHistoryResponse,
    NetworkTrafficOverview, PlatformSocketSnapshot, ProcessNetworkDetails, ProcessNetworkUsage,
};
use processes::ProcessNetworkTracker;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use sysinfo::{Networks, Pid, System};
use traffic::TrafficAggregator;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStreamPayload {
    pub overview: NetworkTrafficOverview,
    pub processes: Vec<ProcessNetworkUsage>,
    pub connections: Vec<NetworkConnection>,
}

pub struct NetworkMonitor {
    last_sample: Instant,
}

impl NetworkMonitor {
    pub fn new() -> Self {
        Self {
            last_sample: Instant::now(),
        }
    }

    pub fn collect(&mut self, networks: &Networks) -> NetworkStats {
        let elapsed_secs = self.last_sample.elapsed().as_secs_f64().max(0.05);
        self.last_sample = Instant::now();

        let interfaces = collect_interfaces(networks, elapsed_secs);

        let mut total_rx_sec = 0u64;
        let mut total_tx_sec = 0u64;
        let mut total_rx_bytes = 0u64;
        let mut total_tx_bytes = 0u64;

        for iface in &interfaces {
            if iface.r#type != "loopback" {
                total_rx_sec = total_rx_sec.saturating_add(iface.rx_speed_bytes_sec);
                total_tx_sec = total_tx_sec.saturating_add(iface.tx_speed_bytes_sec);
                total_rx_bytes = total_rx_bytes.saturating_add(iface.rx_bytes_total);
                total_tx_bytes = total_tx_bytes.saturating_add(iface.tx_bytes_total);
            }
        }

        let active_interface = pick_default_active_interface(&interfaces);

        NetworkStats {
            download_speed_bytes_sec: total_rx_sec,
            upload_speed_bytes_sec: total_tx_sec,
            total_downloaded_bytes: total_rx_bytes,
            total_uploaded_bytes: total_tx_bytes,
            active_interface,
            interfaces,
        }
    }
}

pub struct AdvancedNetworkMonitor {
    traffic: TrafficAggregator,
    conn_tracker: ConnectionTracker,
    proc_tracker: ProcessNetworkTracker,
    history: NetworkHistoryStore,
    last_interfaces: Vec<NetworkInterface>,
    last_connections: Vec<NetworkConnection>,
    last_processes: Vec<ProcessNetworkUsage>,
    last_capabilities: NetworkAttributionCapabilities,
    last_overview: Option<NetworkTrafficOverview>,
}

impl AdvancedNetworkMonitor {
    pub fn new() -> Self {
        Self {
            traffic: TrafficAggregator::new(),
            conn_tracker: ConnectionTracker::new(),
            proc_tracker: ProcessNetworkTracker::new(),
            history: NetworkHistoryStore::new(),
            last_interfaces: Vec::new(),
            last_connections: Vec::new(),
            last_processes: Vec::new(),
            last_capabilities: default_capabilities(),
            last_overview: None,
        }
    }

    pub fn set_interface(&mut self, iface: String) -> String {
        self.traffic.set_selected_interface(iface);
        self.traffic.selected_interface().to_string()
    }

    /// Lightweight update from SystemOverview loop so 24h/7d traffic history stays populated
    /// without running expensive socket/fd scans when Network page is inactive.
    pub fn record_lightweight_tick(&mut self, net_stats: &NetworkStats, timestamp_ms: u64) {
        self.last_interfaces = net_stats.interfaces.clone();
        let agg = self.traffic.update(&net_stats.interfaces);
        let active_conns = self
            .last_connections
            .iter()
            .filter(|c| is_active_connection_state(&c.state))
            .count();

        self.history.record_sample(
            &agg.selected_interface,
            timestamp_ms,
            agg.download_speed,
            agg.upload_speed,
            agg.delta_rx,
            agg.delta_tx,
            active_conns,
            &[],
        );

        self.last_overview = Some(NetworkTrafficOverview {
            selected_interface: agg.selected_interface,
            active_interface: net_stats.active_interface.clone(),
            download_speed_bytes_sec: agg.download_speed,
            upload_speed_bytes_sec: agg.upload_speed,
            peak_download_bytes_sec: agg.peak_download_speed,
            peak_upload_bytes_sec: agg.peak_upload_speed,
            total_downloaded_bytes: agg.total_downloaded,
            total_uploaded_bytes: agg.total_uploaded,
            session_downloaded_bytes: agg.session_downloaded,
            session_uploaded_bytes: agg.session_uploaded,
            active_connections_count: active_conns,
            total_connections_count: self.last_connections.len(),
            interfaces: net_stats.interfaces.clone(),
            capabilities: self.last_capabilities.clone(),
            timestamp: timestamp_ms,
        });
    }

    /// Full native socket, connection, and per-process network telemetry collection.
    pub fn collect_full(&mut self, net_stats: &NetworkStats, sys: &System) -> NetworkStreamPayload {
        let now_ms = current_timestamp_ms();
        self.last_interfaces = net_stats.interfaces.clone();
        let agg = self.traffic.update(&net_stats.interfaces);

        let snapshot = collect_platform_sockets();
        self.last_capabilities = snapshot.capabilities.clone();

        let connections = self.conn_tracker.build_connections(&snapshot, sys);
        let active_conns = connections
            .iter()
            .filter(|c| is_active_connection_state(&c.state))
            .count();

        let system_total_speed = agg.download_speed.saturating_add(agg.upload_speed);
        let processes = self
            .proc_tracker
            .collect(&snapshot, sys, system_total_speed);

        self.history.record_sample(
            &agg.selected_interface,
            now_ms,
            agg.download_speed,
            agg.upload_speed,
            agg.delta_rx,
            agg.delta_tx,
            active_conns,
            &processes,
        );

        let overview = NetworkTrafficOverview {
            selected_interface: agg.selected_interface,
            active_interface: net_stats.active_interface.clone(),
            download_speed_bytes_sec: agg.download_speed,
            upload_speed_bytes_sec: agg.upload_speed,
            peak_download_bytes_sec: agg.peak_download_speed,
            peak_upload_bytes_sec: agg.peak_upload_speed,
            total_downloaded_bytes: agg.total_downloaded,
            total_uploaded_bytes: agg.total_uploaded,
            session_downloaded_bytes: agg.session_downloaded,
            session_uploaded_bytes: agg.session_uploaded,
            active_connections_count: active_conns,
            total_connections_count: connections.len(),
            interfaces: net_stats.interfaces.clone(),
            capabilities: snapshot.capabilities,
            timestamp: now_ms,
        };

        self.last_overview = Some(overview.clone());
        self.last_connections = connections.clone();
        self.last_processes = processes.clone();

        NetworkStreamPayload {
            overview,
            processes,
            connections,
        }
    }

    pub fn get_cached_interfaces(&self) -> Vec<NetworkInterface> {
        self.last_interfaces.clone()
    }

    pub fn get_cached_connections(&self) -> Vec<NetworkConnection> {
        self.last_connections.clone()
    }

    pub fn get_cached_processes(&self) -> Vec<ProcessNetworkUsage> {
        self.last_processes.clone()
    }

    pub fn get_process_details(&self, pid: u32, sys: &System) -> Option<ProcessNetworkDetails> {
        let usage = self
            .last_processes
            .iter()
            .find(|p| p.pid == pid)
            .cloned()
            .or_else(|| {
                sys.process(Pid::from_u32(pid)).map(|p| ProcessNetworkUsage {
                    pid,
                    name: p.name().to_string(),
                    executable_path: p
                        .exe()
                        .map(|e| e.to_string_lossy().to_string())
                        .filter(|s| !s.is_empty()),
                    user: None,
                    category: "app".to_string(),
                    download_speed_bytes_sec: if self.last_capabilities.per_process_bytes_supported {
                        Some(0)
                    } else {
                        None
                    },
                    upload_speed_bytes_sec: if self.last_capabilities.per_process_bytes_supported {
                        Some(0)
                    } else {
                        None
                    },
                    total_downloaded_bytes: if self.last_capabilities.per_process_bytes_supported {
                        Some(0)
                    } else {
                        None
                    },
                    total_uploaded_bytes: if self.last_capabilities.per_process_bytes_supported {
                        Some(0)
                    } else {
                        None
                    },
                    combined_speed_bytes_sec: if self.last_capabilities.per_process_bytes_supported {
                        Some(0)
                    } else {
                        None
                    },
                    combined_total_bytes: if self.last_capabilities.per_process_bytes_supported {
                        Some(0)
                    } else {
                        None
                    },
                    traffic_share_percent: if self.last_capabilities.per_process_bytes_supported {
                        Some(0.0)
                    } else {
                        None
                    },
                    is_measured: self.last_capabilities.per_process_bytes_supported,
                    measurement_source: if self.last_capabilities.per_process_bytes_supported {
                        "kernel".to_string()
                    } else {
                        "socket_ownership_only".to_string()
                    },
                    active_connections: 0,
                    total_sockets: 0,
                    protocols: vec![],
                    status: "idle".to_string(),
                })
            })?;

        let connections: Vec<NetworkConnection> = self
            .last_connections
            .iter()
            .filter(|c| c.pid == Some(pid))
            .cloned()
            .collect();

        let history = self.history.get_process_history(pid);

        Some(ProcessNetworkDetails {
            usage,
            connections,
            history,
            capabilities: self.last_capabilities.clone(),
        })
    }

    pub fn get_history(&self, period: &str, interface_name: Option<&str>) -> NetworkHistoryResponse {
        let iface = interface_name
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| self.traffic.selected_interface());
        self.history
            .query_history(period, iface, current_timestamp_ms(), &self.last_processes)
    }

    pub fn flush_history(&mut self) {
        self.history.flush_to_disk();
    }
}

fn collect_platform_sockets() -> PlatformSocketSnapshot {
    #[cfg(target_os = "linux")]
    {
        linux::collect_linux_sockets()
    }
    #[cfg(target_os = "windows")]
    {
        windows::collect_windows_sockets()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        PlatformSocketSnapshot {
            sockets: Vec::new(),
            capabilities: default_capabilities(),
        }
    }
}

fn default_capabilities() -> NetworkAttributionCapabilities {
    NetworkAttributionCapabilities {
        level: "unavailable".to_string(),
        per_process_bytes_supported: false,
        is_elevated: false,
        platform_method: "Unsupported Platform".to_string(),
        limitation_reason: Some(
            "Per-process network attribution is currently implemented for Linux and Windows."
                .to_string(),
        ),
        unreadable_process_count: 0,
    }
}

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn is_valid_ping_target(target: &str) -> bool {
    !target.is_empty()
        && target.len() <= 253
        && target
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':'))
}

pub async fn ping_target(target: String, port: Option<u16>) -> PingResult {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        * 1000;

    let clean_target = target.trim().to_string();
    if !is_valid_ping_target(&clean_target) {
        return PingResult {
            target: clean_target,
            latency_ms: None,
            reachable: false,
            method: "validation".to_string(),
            error: Some("Invalid ping target hostname or IP address.".to_string()),
            timestamp,
        };
    }

    let icmp_res = tokio::task::spawn_blocking({
        let t = clean_target.clone();
        move || run_native_icmp_ping(&t)
    })
    .await
    .ok()
    .flatten();

    if let Some(rtt) = icmp_res {
        return PingResult {
            target: clean_target,
            latency_ms: Some(rtt),
            reachable: true,
            method: "ICMP".to_string(),
            error: None,
            timestamp,
        };
    }

    let probe_port = port.unwrap_or(443);
    let addr = if clean_target.contains(':') && !clean_target.starts_with('[') {
        format!("[{}]:{}", clean_target, probe_port)
    } else {
        format!("{}:{}", clean_target, probe_port)
    };

    let start = Instant::now();
    match tokio::time::timeout(
        std::time::Duration::from_millis(2000),
        tokio::net::TcpStream::connect(&addr),
    )
    .await
    {
        Ok(Ok(_stream)) => {
            let rtt = ((start.elapsed().as_secs_f64() * 1000.0) * 100.0).round() / 100.0;
            PingResult {
                target: clean_target,
                latency_ms: Some(rtt as f32),
                reachable: true,
                method: format!("TCP:{}", probe_port),
                error: None,
                timestamp,
            }
        }
        Ok(Err(e)) => PingResult {
            target: clean_target,
            latency_ms: None,
            reachable: false,
            method: format!("TCP:{}", probe_port),
            error: Some(e.to_string()),
            timestamp,
        },
        Err(_) => PingResult {
            target: clean_target,
            latency_ms: None,
            reachable: false,
            method: format!("TCP:{}", probe_port),
            error: Some("Connection timed out (2000ms)".to_string()),
            timestamp,
        },
    }
}

fn run_native_icmp_ping(target: &str) -> Option<f32> {
    let mut cmd = std::process::Command::new("ping");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.args(["-n", "1", "-w", "2000", target]);
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd.args(["-c", "1", "-W", "2", target]);
    }

    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for token in stdout.split_whitespace() {
        let lower = token.to_lowercase();
        if let Some(val) = lower.strip_prefix("time=") {
            let num_str = val.trim_end_matches("ms");
            if let Ok(ms) = num_str.parse::<f32>() {
                return Some((ms * 100.0).round() / 100.0);
            }
        } else if lower.starts_with("time<1ms") {
            return Some(0.5);
        }
    }
    None
}
