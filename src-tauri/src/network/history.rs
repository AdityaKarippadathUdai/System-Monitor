use super::models::{
    NetworkHistoryPoint, NetworkHistoryResponse, ProcessHistorySummary, ProcessNetworkUsage,
};
use chrono::{DateTime, Local, TimeZone};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant};

const MAX_RAW_SAMPLES: usize = 3600; // 1 hour @ 1 Hz
const MAX_1M_BUCKETS: usize = 1440; // 24 hours @ 1 min
const MAX_15M_BUCKETS: usize = 672; // 7 days @ 15 min
const MAX_PROC_SAMPLES: usize = 300;
const DISK_FLUSH_INTERVAL_SECS: u64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedBucket {
    bucket_ts_ms: u64,
    interface_name: String,
    sample_count: u64,
    sum_dl_speed: u64,
    sum_ul_speed: u64,
    peak_dl_speed: u64,
    peak_ul_speed: u64,
    total_dl_bytes: u64,
    total_ul_bytes: u64,
    last_connections: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedAppTotal {
    pid: u32,
    name: String,
    total_downloaded_bytes: u64,
    total_uploaded_bytes: u64,
    peak_download_bytes_sec: u64,
    peak_upload_bytes_sec: u64,
    is_measured: bool,
    last_seen_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedStore {
    buckets_1m: Vec<PersistedBucket>,
    buckets_15m: Vec<PersistedBucket>,
    app_totals: Vec<PersistedAppTotal>,
}

pub struct NetworkHistoryStore {
    storage_path: Option<PathBuf>,
    raw_by_iface: HashMap<String, VecDeque<NetworkHistoryPoint>>,
    proc_history: HashMap<u32, VecDeque<NetworkHistoryPoint>>,
    buckets_1m: Vec<PersistedBucket>,
    buckets_15m: Vec<PersistedBucket>,
    app_totals: HashMap<String, PersistedAppTotal>,
    last_flush: Instant,
    dirty: bool,
}

impl NetworkHistoryStore {
    pub fn new() -> Self {
        let storage_path = resolve_history_path();
        let loaded = storage_path
            .as_ref()
            .and_then(|p| fs::read_to_string(p).ok())
            .and_then(|raw| serde_json::from_str::<PersistedStore>(&raw).ok())
            .unwrap_or_default();

        let mut app_totals = HashMap::new();
        for item in loaded.app_totals {
            app_totals.insert(format!("{}:{}", item.pid, item.name), item);
        }

        Self {
            storage_path,
            raw_by_iface: HashMap::new(),
            proc_history: HashMap::new(),
            buckets_1m: loaded.buckets_1m,
            buckets_15m: loaded.buckets_15m,
            app_totals,
            last_flush: Instant::now(),
            dirty: false,
        }
    }

    pub fn record_sample(
        &mut self,
        interface_name: &str,
        timestamp_ms: u64,
        download_speed: u64,
        upload_speed: u64,
        delta_rx: u64,
        delta_tx: u64,
        active_connections: usize,
        processes: &[ProcessNetworkUsage],
    ) {
        let point = NetworkHistoryPoint {
            timestamp: timestamp_ms,
            time_label: format_ts_label(timestamp_ms, false),
            download_bytes_sec: download_speed,
            upload_bytes_sec: upload_speed,
            peak_download_bytes_sec: download_speed,
            peak_upload_bytes_sec: upload_speed,
            downloaded_delta_bytes: delta_rx,
            uploaded_delta_bytes: delta_tx,
            active_connections,
        };

        let ring = self
            .raw_by_iface
            .entry(interface_name.to_string())
            .or_default();
        ring.push_back(point);
        while ring.len() > MAX_RAW_SAMPLES {
            ring.pop_front();
        }

        // 1-minute bucket rollup
        let bucket_1m_ts = (timestamp_ms / 60_000) * 60_000;
        Self::upsert_bucket(
            &mut self.buckets_1m,
            bucket_1m_ts,
            interface_name,
            download_speed,
            upload_speed,
            delta_rx,
            delta_tx,
            active_connections,
            MAX_1M_BUCKETS,
            timestamp_ms.saturating_sub(24 * 3600 * 1000),
        );

        // 15-minute bucket rollup (7 days retention)
        let bucket_15m_ts = (timestamp_ms / 900_000) * 900_000;
        Self::upsert_bucket(
            &mut self.buckets_15m,
            bucket_15m_ts,
            interface_name,
            download_speed,
            upload_speed,
            delta_rx,
            delta_tx,
            active_connections,
            MAX_15M_BUCKETS,
            timestamp_ms.saturating_sub(7 * 24 * 3600 * 1000),
        );

        // Per-process rolling history & cumulative totals
        for proc_usage in processes {
            let dl = proc_usage.download_speed_bytes_sec.unwrap_or(0);
            let ul = proc_usage.upload_speed_bytes_sec.unwrap_or(0);
            let p_ring = self.proc_history.entry(proc_usage.pid).or_default();
            p_ring.push_back(NetworkHistoryPoint {
                timestamp: timestamp_ms,
                time_label: format_ts_label(timestamp_ms, false),
                download_bytes_sec: dl,
                upload_bytes_sec: ul,
                peak_download_bytes_sec: dl,
                peak_upload_bytes_sec: ul,
                downloaded_delta_bytes: 0,
                uploaded_delta_bytes: 0,
                active_connections: proc_usage.active_connections,
            });
            while p_ring.len() > MAX_PROC_SAMPLES {
                p_ring.pop_front();
            }

            if proc_usage.is_measured {
                let key = format!("{}:{}", proc_usage.pid, proc_usage.name);
                let entry = self.app_totals.entry(key).or_insert_with(|| PersistedAppTotal {
                    pid: proc_usage.pid,
                    name: proc_usage.name.clone(),
                    total_downloaded_bytes: 0,
                    total_uploaded_bytes: 0,
                    peak_download_bytes_sec: 0,
                    peak_upload_bytes_sec: 0,
                    is_measured: true,
                    last_seen_ms: timestamp_ms,
                });
                entry.total_downloaded_bytes = entry
                    .total_downloaded_bytes
                    .max(proc_usage.total_downloaded_bytes.unwrap_or(0));
                entry.total_uploaded_bytes = entry
                    .total_uploaded_bytes
                    .max(proc_usage.total_uploaded_bytes.unwrap_or(0));
                entry.peak_download_bytes_sec = entry.peak_download_bytes_sec.max(dl);
                entry.peak_upload_bytes_sec = entry.peak_upload_bytes_sec.max(ul);
                entry.last_seen_ms = timestamp_ms;
            }
        }

        // Bound memory for exited processes
        if self.proc_history.len() > 256 {
            let cutoff = timestamp_ms.saturating_sub(15 * 60_000);
            self.proc_history.retain(|_, deque| {
                deque
                    .back()
                    .map(|pt| pt.timestamp >= cutoff)
                    .unwrap_or(false)
            });
        }
        if self.app_totals.len() > 300 {
            let cutoff = timestamp_ms.saturating_sub(7 * 24 * 3600 * 1000);
            self.app_totals.retain(|_, v| v.last_seen_ms >= cutoff);
        }

        self.dirty = true;
        if self.last_flush.elapsed() >= Duration::from_secs(DISK_FLUSH_INTERVAL_SECS) {
            self.flush_to_disk();
        }
    }

    pub fn flush_to_disk(&mut self) {
        if !self.dirty {
            return;
        }
        let Some(path) = &self.storage_path else {
            return;
        };
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let mut app_list: Vec<PersistedAppTotal> = self.app_totals.values().cloned().collect();
        app_list.sort_by(|a, b| {
            (b.total_downloaded_bytes + b.total_uploaded_bytes)
                .cmp(&(a.total_downloaded_bytes + a.total_uploaded_bytes))
        });
        app_list.truncate(150);

        let payload = PersistedStore {
            buckets_1m: self.buckets_1m.clone(),
            buckets_15m: self.buckets_15m.clone(),
            app_totals: app_list,
        };

        if let Ok(json) = serde_json::to_string(&payload) {
            let tmp = path.with_extension("json.tmp");
            if fs::write(&tmp, json).is_ok() {
                let _ = fs::rename(&tmp, path);
            }
        }
        self.last_flush = Instant::now();
        self.dirty = false;
    }

    pub fn get_process_history(&self, pid: u32) -> Vec<NetworkHistoryPoint> {
        self.proc_history
            .get(&pid)
            .map(|d| d.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn query_history(
        &self,
        period: &str,
        interface_name: &str,
        now_ms: u64,
        live_processes: &[ProcessNetworkUsage],
    ) -> NetworkHistoryResponse {
        let cutoff = match period {
            "1m" => now_ms.saturating_sub(60_000),
            "5m" => now_ms.saturating_sub(5 * 60_000),
            "15m" => now_ms.saturating_sub(15 * 60_000),
            "30m" => now_ms.saturating_sub(30 * 60_000),
            "1h" => now_ms.saturating_sub(60 * 60_000),
            "24h" => now_ms.saturating_sub(24 * 3600 * 1000),
            "7d" => now_ms.saturating_sub(7 * 24 * 3600 * 1000),
            _ => now_ms.saturating_sub(5 * 60_000),
        };

        let mut points: Vec<NetworkHistoryPoint> = match period {
            "24h" => self
                .buckets_1m
                .iter()
                .filter(|b| b.interface_name == interface_name && b.bucket_ts_ms >= cutoff)
                .map(|b| NetworkHistoryPoint {
                    timestamp: b.bucket_ts_ms,
                    time_label: format_ts_label(b.bucket_ts_ms, false),
                    download_bytes_sec: b.sum_dl_speed / b.sample_count.max(1),
                    upload_bytes_sec: b.sum_ul_speed / b.sample_count.max(1),
                    peak_download_bytes_sec: b.peak_dl_speed,
                    peak_upload_bytes_sec: b.peak_ul_speed,
                    downloaded_delta_bytes: b.total_dl_bytes,
                    uploaded_delta_bytes: b.total_ul_bytes,
                    active_connections: b.last_connections,
                })
                .collect(),
            "7d" => self
                .buckets_15m
                .iter()
                .filter(|b| b.interface_name == interface_name && b.bucket_ts_ms >= cutoff)
                .map(|b| NetworkHistoryPoint {
                    timestamp: b.bucket_ts_ms,
                    time_label: format_ts_label(b.bucket_ts_ms, true),
                    download_bytes_sec: b.sum_dl_speed / b.sample_count.max(1),
                    upload_bytes_sec: b.sum_ul_speed / b.sample_count.max(1),
                    peak_download_bytes_sec: b.peak_dl_speed,
                    peak_upload_bytes_sec: b.peak_ul_speed,
                    downloaded_delta_bytes: b.total_dl_bytes,
                    uploaded_delta_bytes: b.total_ul_bytes,
                    active_connections: b.last_connections,
                })
                .collect(),
            _ => {
                let raw: Vec<NetworkHistoryPoint> = self
                    .raw_by_iface
                    .get(interface_name)
                    .map(|ring| {
                        ring.iter()
                            .filter(|p| p.timestamp >= cutoff)
                            .cloned()
                            .collect()
                    })
                    .unwrap_or_default();

                if raw.len() > 240 {
                    downsample_points(&raw, 180)
                } else {
                    raw
                }
            }
        };

        // If 24h/7d buckets are still empty at startup, fallback to live raw samples so user sees current telemetry
        if points.is_empty() && matches!(period, "24h" | "7d") {
            if let Some(ring) = self.raw_by_iface.get(interface_name) {
                points = ring.iter().cloned().collect();
            }
        }

        let mut peak_dl = 0u64;
        let mut peak_ul = 0u64;
        let mut total_dl = 0u64;
        let mut total_ul = 0u64;

        for p in &points {
            peak_dl = peak_dl.max(p.peak_download_bytes_sec.max(p.download_bytes_sec));
            peak_ul = peak_ul.max(p.peak_upload_bytes_sec.max(p.upload_bytes_sec));
            total_dl = total_dl.saturating_add(p.downloaded_delta_bytes);
            total_ul = total_ul.saturating_add(p.uploaded_delta_bytes);
        }

        let mut app_map: HashMap<String, ProcessHistorySummary> = HashMap::new();
        for a in self.app_totals.values() {
            if a.last_seen_ms >= cutoff {
                app_map.insert(
                    format!("{}:{}", a.pid, a.name),
                    ProcessHistorySummary {
                        pid: a.pid,
                        name: a.name.clone(),
                        total_downloaded_bytes: a.total_downloaded_bytes,
                        total_uploaded_bytes: a.total_uploaded_bytes,
                        peak_download_bytes_sec: a.peak_download_bytes_sec,
                        peak_upload_bytes_sec: a.peak_upload_bytes_sec,
                        is_measured: a.is_measured,
                    },
                );
            }
        }
        for p in live_processes {
            if p.is_measured {
                let key = format!("{}:{}", p.pid, p.name);
                let entry = app_map.entry(key).or_insert(ProcessHistorySummary {
                    pid: p.pid,
                    name: p.name.clone(),
                    total_downloaded_bytes: p.total_downloaded_bytes.unwrap_or(0),
                    total_uploaded_bytes: p.total_uploaded_bytes.unwrap_or(0),
                    peak_download_bytes_sec: p.download_speed_bytes_sec.unwrap_or(0),
                    peak_upload_bytes_sec: p.upload_speed_bytes_sec.unwrap_or(0),
                    is_measured: true,
                });
                entry.total_downloaded_bytes = entry
                    .total_downloaded_bytes
                    .max(p.total_downloaded_bytes.unwrap_or(0));
                entry.total_uploaded_bytes = entry
                    .total_uploaded_bytes
                    .max(p.total_uploaded_bytes.unwrap_or(0));
            }
        }

        let mut top_applications: Vec<ProcessHistorySummary> = app_map.into_values().collect();
        top_applications.sort_by(|a, b| {
            (b.total_downloaded_bytes + b.total_uploaded_bytes)
                .cmp(&(a.total_downloaded_bytes + a.total_uploaded_bytes))
        });
        top_applications.truncate(15);

        NetworkHistoryResponse {
            period: period.to_string(),
            interface_name: interface_name.to_string(),
            points,
            peak_download_bytes_sec: peak_dl,
            peak_upload_bytes_sec: peak_ul,
            total_downloaded_bytes: total_dl,
            total_uploaded_bytes: total_ul,
            top_applications,
        }
    }

    fn upsert_bucket(
        buckets: &mut Vec<PersistedBucket>,
        bucket_ts_ms: u64,
        interface_name: &str,
        dl_speed: u64,
        ul_speed: u64,
        delta_rx: u64,
        delta_tx: u64,
        active_connections: usize,
        max_len: usize,
        cutoff_ms: u64,
    ) {
        if let Some(existing) = buckets
            .iter_mut()
            .rev()
            .take(16)
            .find(|b| b.bucket_ts_ms == bucket_ts_ms && b.interface_name == interface_name)
        {
            existing.sample_count += 1;
            existing.sum_dl_speed = existing.sum_dl_speed.saturating_add(dl_speed);
            existing.sum_ul_speed = existing.sum_ul_speed.saturating_add(ul_speed);
            existing.peak_dl_speed = existing.peak_dl_speed.max(dl_speed);
            existing.peak_ul_speed = existing.peak_ul_speed.max(ul_speed);
            existing.total_dl_bytes = existing.total_dl_bytes.saturating_add(delta_rx);
            existing.total_ul_bytes = existing.total_ul_bytes.saturating_add(delta_tx);
            existing.last_connections = active_connections;
        } else {
            buckets.push(PersistedBucket {
                bucket_ts_ms,
                interface_name: interface_name.to_string(),
                sample_count: 1,
                sum_dl_speed: dl_speed,
                sum_ul_speed: ul_speed,
                peak_dl_speed: dl_speed,
                peak_ul_speed: ul_speed,
                total_dl_bytes: delta_rx,
                total_ul_bytes: delta_tx,
                last_connections: active_connections,
            });
            buckets.retain(|b| b.bucket_ts_ms >= cutoff_ms);
            if buckets.len() > max_len * 4 {
                let drain = buckets.len() - max_len * 4;
                buckets.drain(0..drain);
            }
        }
    }
}

fn downsample_points(points: &[NetworkHistoryPoint], target: usize) -> Vec<NetworkHistoryPoint> {
    if points.len() <= target || target == 0 {
        return points.to_vec();
    }
    let chunk_size = (points.len() as f64 / target as f64).ceil() as usize;
    points
        .chunks(chunk_size.max(1))
        .map(|chunk| {
            let count = chunk.len() as u64;
            let last = chunk.last().unwrap();
            let sum_dl: u64 = chunk.iter().map(|p| p.download_bytes_sec).sum();
            let sum_ul: u64 = chunk.iter().map(|p| p.upload_bytes_sec).sum();
            let peak_dl = chunk.iter().map(|p| p.peak_download_bytes_sec).max().unwrap_or(0);
            let peak_ul = chunk.iter().map(|p| p.peak_upload_bytes_sec).max().unwrap_or(0);
            let delta_dl: u64 = chunk.iter().map(|p| p.downloaded_delta_bytes).sum();
            let delta_ul: u64 = chunk.iter().map(|p| p.uploaded_delta_bytes).sum();

            NetworkHistoryPoint {
                timestamp: last.timestamp,
                time_label: last.time_label.clone(),
                download_bytes_sec: sum_dl / count.max(1),
                upload_bytes_sec: sum_ul / count.max(1),
                peak_download_bytes_sec: peak_dl,
                peak_upload_bytes_sec: peak_ul,
                downloaded_delta_bytes: delta_dl,
                uploaded_delta_bytes: delta_ul,
                active_connections: last.active_connections,
            }
        })
        .collect()
}

fn format_ts_label(ts_ms: u64, include_day: bool) -> String {
    let secs = (ts_ms / 1000) as i64;
    if let Some(dt) = Local.timestamp_opt(secs, 0).single() {
        let dt: DateTime<Local> = dt;
        if include_day {
            dt.format("%m/%d %H:%M").to_string()
        } else {
            dt.format("%H:%M:%S").to_string()
        }
    } else {
        "00:00:00".to_string()
    }
}

fn resolve_history_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .or_else(|| std::env::var_os("LOCALAPPDATA"))
            .map(|dir| PathBuf::from(dir).join("sysmon-pro").join("network_history.json"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")))
            .map(|dir| dir.join("sysmon-pro").join("network_history.json"))
    }
}
