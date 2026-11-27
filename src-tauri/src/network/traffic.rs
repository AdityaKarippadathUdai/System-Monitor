use crate::models::NetworkInterface;
use std::collections::HashMap;

#[derive(Clone, Default)]
struct InterfaceSessionAccumulator {
    last_rx_total: Option<u64>,
    last_tx_total: Option<u64>,
    session_rx: u64,
    session_tx: u64,
    peak_rx_speed: u64,
    peak_tx_speed: u64,
}

pub struct TrafficAggregator {
    selected_interface: String,
    per_iface: HashMap<String, InterfaceSessionAccumulator>,
    all_peak_rx: u64,
    all_peak_tx: u64,
}

pub struct AggregatedTraffic {
    pub selected_interface: String,
    pub download_speed: u64,
    pub upload_speed: u64,
    pub peak_download_speed: u64,
    pub peak_upload_speed: u64,
    pub total_downloaded: u64,
    pub total_uploaded: u64,
    pub session_downloaded: u64,
    pub session_uploaded: u64,
    pub delta_rx: u64,
    pub delta_tx: u64,
}

impl TrafficAggregator {
    pub fn new() -> Self {
        Self {
            selected_interface: "all".to_string(),
            per_iface: HashMap::new(),
            all_peak_rx: 0,
            all_peak_tx: 0,
        }
    }

    pub fn set_selected_interface(&mut self, iface: String) {
        let trimmed = iface.trim();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("all") {
            self.selected_interface = "all".to_string();
        } else {
            self.selected_interface = trimmed.to_string();
        }
    }

    pub fn selected_interface(&self) -> &str {
        &self.selected_interface
    }

    pub fn update(&mut self, interfaces: &[NetworkInterface]) -> AggregatedTraffic {
        let mut all_rx_speed = 0u64;
        let mut all_tx_speed = 0u64;
        let mut all_rx_total = 0u64;
        let mut all_tx_total = 0u64;
        let mut all_session_rx = 0u64;
        let mut all_session_tx = 0u64;
        let mut all_delta_rx = 0u64;
        let mut all_delta_tx = 0u64;

        let mut iface_deltas: HashMap<String, (u64, u64)> = HashMap::new();

        for iface in interfaces {
            let acc = self.per_iface.entry(iface.name.clone()).or_default();

            let (drx, dtx) = match (acc.last_rx_total, acc.last_tx_total) {
                (Some(prev_rx), Some(prev_tx)) => (
                    if iface.rx_bytes_total >= prev_rx {
                        iface.rx_bytes_total - prev_rx
                    } else {
                        // Interface counter reset or reconnect
                        iface.rx_bytes_total
                    },
                    if iface.tx_bytes_total >= prev_tx {
                        iface.tx_bytes_total - prev_tx
                    } else {
                        iface.tx_bytes_total
                    },
                ),
                _ => (0, 0),
            };

            acc.last_rx_total = Some(iface.rx_bytes_total);
            acc.last_tx_total = Some(iface.tx_bytes_total);
            acc.session_rx = acc.session_rx.saturating_add(drx);
            acc.session_tx = acc.session_tx.saturating_add(dtx);
            acc.peak_rx_speed = acc.peak_rx_speed.max(iface.rx_speed_bytes_sec);
            acc.peak_tx_speed = acc.peak_tx_speed.max(iface.tx_speed_bytes_sec);

            iface_deltas.insert(iface.name.clone(), (drx, dtx));

            // Never double-count loopback in aggregated "all" mode
            if iface.r#type != "loopback" {
                all_rx_speed = all_rx_speed.saturating_add(iface.rx_speed_bytes_sec);
                all_tx_speed = all_tx_speed.saturating_add(iface.tx_speed_bytes_sec);
                all_rx_total = all_rx_total.saturating_add(iface.rx_bytes_total);
                all_tx_total = all_tx_total.saturating_add(iface.tx_bytes_total);
                all_session_rx = all_session_rx.saturating_add(acc.session_rx);
                all_session_tx = all_session_tx.saturating_add(acc.session_tx);
                all_delta_rx = all_delta_rx.saturating_add(drx);
                all_delta_tx = all_delta_tx.saturating_add(dtx);
            }
        }

        self.all_peak_rx = self.all_peak_rx.max(all_rx_speed);
        self.all_peak_tx = self.all_peak_tx.max(all_tx_speed);

        if self.selected_interface == "all" {
            return AggregatedTraffic {
                selected_interface: "all".to_string(),
                download_speed: all_rx_speed,
                upload_speed: all_tx_speed,
                peak_download_speed: self.all_peak_rx,
                peak_upload_speed: self.all_peak_tx,
                total_downloaded: all_rx_total,
                total_uploaded: all_tx_total,
                session_downloaded: all_session_rx,
                session_uploaded: all_session_tx,
                delta_rx: all_delta_rx,
                delta_tx: all_delta_tx,
            };
        }

        if let Some(target) = interfaces.iter().find(|i| i.name == self.selected_interface) {
            let acc = self.per_iface.get(&target.name).cloned().unwrap_or_default();
            let (drx, dtx) = iface_deltas.get(&target.name).copied().unwrap_or((0, 0));
            return AggregatedTraffic {
                selected_interface: target.name.clone(),
                download_speed: target.rx_speed_bytes_sec,
                upload_speed: target.tx_speed_bytes_sec,
                peak_download_speed: acc.peak_rx_speed,
                peak_upload_speed: acc.peak_tx_speed,
                total_downloaded: target.rx_bytes_total,
                total_uploaded: target.tx_bytes_total,
                session_downloaded: acc.session_rx,
                session_uploaded: acc.session_tx,
                delta_rx: drx,
                delta_tx: dtx,
            };
        }

        // Selected interface disconnected; revert cleanly to "all"
        self.selected_interface = "all".to_string();
        AggregatedTraffic {
            selected_interface: "all".to_string(),
            download_speed: all_rx_speed,
            upload_speed: all_tx_speed,
            peak_download_speed: self.all_peak_rx,
            peak_upload_speed: self.all_peak_tx,
            total_downloaded: all_rx_total,
            total_uploaded: all_tx_total,
            session_downloaded: all_session_rx,
            session_uploaded: all_session_tx,
            delta_rx: all_delta_rx,
            delta_tx: all_delta_tx,
        }
    }
}
