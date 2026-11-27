use crate::cpu::CpuMonitor;
use crate::disk::DiskMonitor;
use crate::gpu::GpuMonitor;
use crate::memory::collect_memory_stats;
use crate::models::{KillResult, NetworkInterface, ProcessInfo, SystemOverview};
use crate::network::models::{
    NetworkConnection, NetworkHistoryResponse, NetworkTrafficOverview, ProcessNetworkDetails,
    ProcessNetworkUsage,
};
use crate::network::{AdvancedNetworkMonitor, NetworkMonitor, NetworkStreamPayload};
use crate::platform::{build_system_info, collect_static_platform_info, PlatformStaticInfo};
use crate::processes::ProcessMonitor;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::{
    CpuRefreshKind, Disks, MemoryRefreshKind, Networks, ProcessRefreshKind, RefreshKind, System,
};

pub struct MonitorEngine {
    sys: Mutex<System>,
    disks: Mutex<Disks>,
    networks: Mutex<Networks>,
    cpu_monitor: Mutex<CpuMonitor>,
    gpu_monitor: Mutex<GpuMonitor>,
    disk_monitor: Mutex<DiskMonitor>,
    network_monitor: Mutex<NetworkMonitor>,
    advanced_network: Mutex<AdvancedNetworkMonitor>,
    process_monitor: Mutex<ProcessMonitor>,
    static_platform: PlatformStaticInfo,
    boot_time_secs: u64,
}

impl MonitorEngine {
    pub fn new() -> Self {
        let mut sys = System::new_with_specifics(
            RefreshKind::new()
                .with_cpu(CpuRefreshKind::everything())
                .with_memory(MemoryRefreshKind::everything())
                .with_processes(ProcessRefreshKind::everything()),
        );
        sys.refresh_all();

        let disks = Disks::new_with_refreshed_list();
        let networks = Networks::new_with_refreshed_list();
        let static_platform = collect_static_platform_info();
        let boot_time_secs = System::boot_time();

        Self {
            sys: Mutex::new(sys),
            disks: Mutex::new(disks),
            networks: Mutex::new(networks),
            cpu_monitor: Mutex::new(CpuMonitor::new()),
            gpu_monitor: Mutex::new(GpuMonitor::new()),
            disk_monitor: Mutex::new(DiskMonitor::new()),
            network_monitor: Mutex::new(NetworkMonitor::new()),
            advanced_network: Mutex::new(AdvancedNetworkMonitor::new()),
            process_monitor: Mutex::new(ProcessMonitor::new()),
            static_platform,
            boot_time_secs,
        }
    }

    pub fn get_overview(&self) -> SystemOverview {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let now_sec = now_ms / 1000;
        let uptime_seconds = now_sec.saturating_sub(self.boot_time_secs);

        let (cpu, memory, system_info) = {
            let mut sys = self.sys.lock().unwrap();
            sys.refresh_cpu_usage();
            sys.refresh_memory();

            let cpu_stats = {
                let mut cpu_mon = self.cpu_monitor.lock().unwrap();
                cpu_mon.collect(&sys, uptime_seconds)
            };

            let mem_stats = collect_memory_stats(&sys);

            let sys_info = build_system_info(
                &self.static_platform,
                &sys,
                self.boot_time_secs,
                uptime_seconds,
                cpu_stats.model_name.clone(),
                mem_stats.total_bytes,
            );

            (cpu_stats, mem_stats, sys_info)
        };

        let disks_stats = {
            let mut disks = self.disks.lock().unwrap();
            disks.refresh_list();
            disks.refresh();
            let mut disk_mon = self.disk_monitor.lock().unwrap();
            disk_mon.collect(&disks)
        };

        let network_stats = {
            let mut networks = self.networks.lock().unwrap();
            networks.refresh_list();
            networks.refresh();
            let mut net_mon = self.network_monitor.lock().unwrap();
            net_mon.collect(&networks)
        };

        {
            let mut adv = self.advanced_network.lock().unwrap();
            adv.record_lightweight_tick(&network_stats, now_ms);
        }

        let gpus = {
            let mut gpu_mon = self.gpu_monitor.lock().unwrap();
            gpu_mon.collect()
        };

        let highest = cpu.usage_percent.max(memory.usage_percent);
        let overall_status = if highest > 90.0 {
            "critical".to_string()
        } else if highest > 75.0 {
            "warning".to_string()
        } else if highest > 55.0 {
            "moderate".to_string()
        } else {
            "healthy".to_string()
        };

        SystemOverview {
            cpu,
            memory,
            gpus,
            disks: disks_stats,
            network: network_stats,
            system_info,
            timestamp: now_ms,
            overall_status,
        }
    }

    pub fn get_processes(&self) -> Vec<ProcessInfo> {
        let mut procs = {
            let mut sys = self.sys.lock().unwrap();
            sys.refresh_processes();
            let mut proc_mon = self.process_monitor.lock().unwrap();
            proc_mon.collect(&sys)
        };

        // Enrich processes with any measured per-process network speeds from the latest network sample
        let net_map: HashMap<u32, (Option<u64>, Option<u64>)> = {
            let adv = self.advanced_network.lock().unwrap();
            adv.get_cached_processes()
                .into_iter()
                .filter(|p| p.is_measured)
                .map(|p| (p.pid, (p.download_speed_bytes_sec, p.upload_speed_bytes_sec)))
                .collect()
        };

        if !net_map.is_empty() {
            for proc_item in &mut procs {
                if let Some(&(rx, tx)) = net_map.get(&proc_item.pid) {
                    proc_item.net_rx_bytes_sec = rx;
                    proc_item.net_tx_bytes_sec = tx;
                }
            }
        }

        procs
    }

    pub fn kill_process(&self, pid: u32) -> KillResult {
        let mut sys = self.sys.lock().unwrap();
        sys.refresh_processes();
        let proc_mon = self.process_monitor.lock().unwrap();
        proc_mon.kill_process(&sys, pid)
    }

    pub fn collect_network_stream(&self) -> NetworkStreamPayload {
        let network_stats = {
            let mut networks = self.networks.lock().unwrap();
            networks.refresh_list();
            networks.refresh();
            let mut net_mon = self.network_monitor.lock().unwrap();
            net_mon.collect(&networks)
        };

        let mut sys = self.sys.lock().unwrap();
        sys.refresh_processes();

        let mut adv = self.advanced_network.lock().unwrap();
        adv.collect_full(&network_stats, &sys)
    }

    pub fn get_network_interfaces(&self) -> Vec<NetworkInterface> {
        let network_stats = {
            let mut networks = self.networks.lock().unwrap();
            networks.refresh_list();
            networks.refresh();
            let mut net_mon = self.network_monitor.lock().unwrap();
            net_mon.collect(&networks)
        };
        network_stats.interfaces
    }

    pub fn get_network_overview(&self) -> NetworkTrafficOverview {
        self.collect_network_stream().overview
    }

    pub fn get_network_processes(&self) -> Vec<ProcessNetworkUsage> {
        self.collect_network_stream().processes
    }

    pub fn get_network_connections(&self) -> Vec<NetworkConnection> {
        self.collect_network_stream().connections
    }

    pub fn get_process_network_details(&self, pid: u32) -> Option<ProcessNetworkDetails> {
        let _ = self.collect_network_stream();
        let sys = self.sys.lock().unwrap();
        let adv = self.advanced_network.lock().unwrap();
        adv.get_process_details(pid, &sys)
    }

    pub fn set_network_interface(&self, interface_name: String) -> String {
        let mut adv = self.advanced_network.lock().unwrap();
        adv.set_interface(interface_name)
    }

    pub fn get_network_history(
        &self,
        period: String,
        interface_name: Option<String>,
    ) -> NetworkHistoryResponse {
        let adv = self.advanced_network.lock().unwrap();
        adv.get_history(&period, interface_name.as_deref())
    }

    pub fn flush_network_history(&self) {
        let mut adv = self.advanced_network.lock().unwrap();
        adv.flush_history();
    }

    pub fn evaluate_gaming(
        &self,
        gaming: &crate::gaming::GamingManager,
        cfg: &crate::desktop::models::GamingConfig,
        manual_only_startup: bool,
        refresh_procs: bool,
    ) -> (
        crate::desktop::models::GamingStatus,
        crate::desktop::models::FpsTelemetry,
        Option<f32>,
    ) {
        let mut sys = self.sys.lock().unwrap();
        if refresh_procs {
            sys.refresh_processes();
        }
        gaming.evaluate(&sys, cfg, manual_only_startup)
    }
}
