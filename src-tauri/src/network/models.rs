use crate::models::NetworkInterface;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkAttributionCapabilities {
    /// "full" | "partial" | "connections_only" | "unavailable"
    pub level: String,
    pub per_process_bytes_supported: bool,
    pub is_elevated: bool,
    pub platform_method: String,
    pub limitation_reason: Option<String>,
    pub unreadable_process_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkTrafficOverview {
    pub selected_interface: String,
    pub active_interface: String,
    pub download_speed_bytes_sec: u64,
    pub upload_speed_bytes_sec: u64,
    pub peak_download_bytes_sec: u64,
    pub peak_upload_bytes_sec: u64,
    pub total_downloaded_bytes: u64,
    pub total_uploaded_bytes: u64,
    pub session_downloaded_bytes: u64,
    pub session_uploaded_bytes: u64,
    pub active_connections_count: usize,
    pub total_connections_count: usize,
    pub interfaces: Vec<NetworkInterface>,
    pub capabilities: NetworkAttributionCapabilities,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkConnection {
    pub id: String,
    pub pid: Option<u32>,
    pub process_name: String,
    pub executable_path: Option<String>,
    pub protocol: String,
    pub local_address: String,
    pub local_port: u16,
    pub remote_address: String,
    pub remote_port: Option<u16>,
    pub state: String,
    pub is_loopback: bool,
    pub rx_bytes_total: Option<u64>,
    pub tx_bytes_total: Option<u64>,
    pub rx_speed_bytes_sec: Option<u64>,
    pub tx_speed_bytes_sec: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessNetworkUsage {
    pub pid: u32,
    pub name: String,
    pub executable_path: Option<String>,
    pub user: Option<String>,
    pub category: String,
    pub download_speed_bytes_sec: Option<u64>,
    pub upload_speed_bytes_sec: Option<u64>,
    pub total_downloaded_bytes: Option<u64>,
    pub total_uploaded_bytes: Option<u64>,
    pub combined_speed_bytes_sec: Option<u64>,
    pub combined_total_bytes: Option<u64>,
    pub traffic_share_percent: Option<f32>,
    pub is_measured: bool,
    pub measurement_source: String,
    pub active_connections: usize,
    pub total_sockets: usize,
    pub protocols: Vec<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkHistoryPoint {
    pub timestamp: u64,
    pub time_label: String,
    pub download_bytes_sec: u64,
    pub upload_bytes_sec: u64,
    pub peak_download_bytes_sec: u64,
    pub peak_upload_bytes_sec: u64,
    pub downloaded_delta_bytes: u64,
    pub uploaded_delta_bytes: u64,
    pub active_connections: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessHistorySummary {
    pub pid: u32,
    pub name: String,
    pub total_downloaded_bytes: u64,
    pub total_uploaded_bytes: u64,
    pub peak_download_bytes_sec: u64,
    pub peak_upload_bytes_sec: u64,
    pub is_measured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkHistoryResponse {
    pub period: String,
    pub interface_name: String,
    pub points: Vec<NetworkHistoryPoint>,
    pub peak_download_bytes_sec: u64,
    pub peak_upload_bytes_sec: u64,
    pub total_downloaded_bytes: u64,
    pub total_uploaded_bytes: u64,
    pub top_applications: Vec<ProcessHistorySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessNetworkDetails {
    pub usage: ProcessNetworkUsage,
    pub connections: Vec<NetworkConnection>,
    pub history: Vec<NetworkHistoryPoint>,
    pub capabilities: NetworkAttributionCapabilities,
}

/// Internal raw socket entry collected by platform backends before attribution/rate calculation.
#[derive(Debug, Clone)]
pub struct RawSocketEntry {
    pub protocol: String,
    pub local_address: String,
    pub local_port: u16,
    pub remote_address: String,
    pub remote_port: Option<u16>,
    pub state: String,
    pub pid: Option<u32>,
    pub uid: Option<u32>,
    pub inode: Option<u64>,
    pub is_loopback: bool,
    /// Measured cumulative bytes received on this socket (if provided by kernel)
    pub rx_bytes: Option<u64>,
    /// Measured cumulative bytes sent/acked on this socket (if provided by kernel)
    pub tx_bytes: Option<u64>,
}

/// Internal platform snapshot of socket ownership + optional kernel byte counters.
#[derive(Debug, Clone)]
pub struct PlatformSocketSnapshot {
    pub sockets: Vec<RawSocketEntry>,
    pub capabilities: NetworkAttributionCapabilities,
}
