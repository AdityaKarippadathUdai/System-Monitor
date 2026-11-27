use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuCache {
    pub l1: Option<String>,
    pub l2: Option<String>,
    pub l3: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuStats {
    pub usage_percent: f32,
    pub frequency_ghz: Option<f32>,
    pub max_frequency_ghz: Option<f32>,
    pub temperature_c: Option<f32>,
    pub cores_count: usize,
    pub threads_count: usize,
    pub manufacturer: String,
    pub model_name: String,
    pub load_average: Option<[f32; 3]>,
    pub per_core_usage: Vec<f32>,
    pub cache: CpuCache,
    pub governor: Option<String>,
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryStats {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub cached_bytes: Option<u64>,
    pub buffers_bytes: Option<u64>,
    pub free_bytes: u64,
    pub usage_percent: f32,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
    pub swap_free_bytes: u64,
    pub swap_percent: f32,
    pub virtual_total_bytes: u64,
    pub virtual_used_bytes: u64,
    pub virtual_percent: f32,
    pub r#type: Option<String>,
    pub speed_mhz: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuStats {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub gpu_type: String,
    pub driver_version: Option<String>,
    pub utilization_percent: Option<f32>,
    pub vram_total_bytes: Option<u64>,
    pub vram_used_bytes: Option<u64>,
    pub vram_usage_percent: Option<f32>,
    pub temperature_c: Option<f32>,
    pub power_watts: Option<f32>,
    pub power_limit_watts: Option<f32>,
    pub core_clock_mhz: Option<u32>,
    pub memory_clock_mhz: Option<u32>,
    pub fan_speed_percent: Option<u32>,
    pub pci_bus_id: Option<String>,
    pub compute_capability: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskStats {
    pub id: String,
    pub name: String,
    pub mount_point: String,
    pub filesystem: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub usage_percent: f32,
    pub read_speed_bytes_sec: Option<u64>,
    pub write_speed_bytes_sec: Option<u64>,
    pub read_ops_sec: Option<u32>,
    pub write_ops_sec: Option<u32>,
    pub temperature_c: Option<f32>,
    pub is_system: bool,
    pub disk_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInterface {
    pub name: String,
    pub display_name: String,
    pub r#type: String,
    pub ip4: Option<String>,
    pub ip6: Option<String>,
    pub mac: Option<String>,
    pub is_up: bool,
    pub speed_mbps: Option<u64>,
    pub mtu: Option<u32>,
    pub rx_bytes_total: u64,
    pub tx_bytes_total: u64,
    pub rx_speed_bytes_sec: u64,
    pub tx_speed_bytes_sec: u64,
    pub rx_packets: Option<u64>,
    pub tx_packets: Option<u64>,
    pub rx_errors: Option<u64>,
    pub tx_errors: Option<u64>,
    pub packet_loss_percent: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStats {
    pub download_speed_bytes_sec: u64,
    pub upload_speed_bytes_sec: u64,
    pub total_downloaded_bytes: u64,
    pub total_uploaded_bytes: u64,
    pub active_interface: String,
    pub interfaces: Vec<NetworkInterface>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os_name: String,
    pub os_version: String,
    pub kernel_version: String,
    pub hostname: String,
    pub architecture: String,
    pub manufacturer: Option<String>,
    pub model: Option<String>,
    pub uptime_seconds: u64,
    pub boot_time: String,
    pub platform: String,
    pub cpu_model: String,
    pub total_memory_gb: u32,
    pub process_count: usize,
    pub thread_count: Option<usize>,
    pub display_server: Option<String>,
    pub desktop_environment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemOverview {
    pub cpu: CpuStats,
    pub memory: MemoryStats,
    pub gpus: Vec<GpuStats>,
    pub disks: Vec<DiskStats>,
    pub network: NetworkStats,
    pub system_info: SystemInfo,
    pub timestamp: u64,
    pub overall_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMetricPoint {
    pub timestamp: u64,
    pub cpu: f32,
    pub ram_mb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub ppid: u32,
    pub name: String,
    pub command: String,
    pub executable_path: String,
    pub user: Option<String>,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub memory_percent: f32,
    pub gpu_percent: Option<f32>,
    pub vram_bytes: Option<u64>,
    pub disk_read_bytes_sec: u64,
    pub disk_write_bytes_sec: u64,
    pub net_rx_bytes_sec: Option<u64>,
    pub net_tx_bytes_sec: Option<u64>,
    pub status: String,
    pub category: String,
    pub start_time: String,
    pub threads: Option<u32>,
    pub priority: Option<i32>,
    pub history: Vec<ProcessMetricPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    pub target: String,
    pub latency_ms: Option<f32>,
    pub reachable: bool,
    pub method: String,
    pub error: Option<String>,
    pub timestamp: u64,
}
