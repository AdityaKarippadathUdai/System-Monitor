use super::connections::{is_active_connection_state, make_socket_key};
use super::models::{PlatformSocketSnapshot, ProcessNetworkUsage};
use std::collections::{BTreeSet, HashMap};
use std::time::Instant;
use sysinfo::{Pid, System, Users};

#[derive(Clone)]
struct ProcessAccumulator {
    start_time: u64,
    total_rx: u64,
    total_tx: u64,
    has_measured_socket: bool,
    socket_prev: HashMap<String, (u64, u64)>,
}

pub struct ProcessNetworkTracker {
    users: Users,
    accumulators: HashMap<u32, ProcessAccumulator>,
    last_sample: Instant,
}

impl ProcessNetworkTracker {
    pub fn new() -> Self {
        Self {
            users: Users::new_with_refreshed_list(),
            accumulators: HashMap::new(),
            last_sample: Instant::now(),
        }
    }

    pub fn collect(
        &mut self,
        snapshot: &PlatformSocketSnapshot,
        sys: &System,
        system_total_speed_bytes_sec: u64,
    ) -> Vec<ProcessNetworkUsage> {
        let elapsed_secs = self.last_sample.elapsed().as_secs_f64().max(0.05);
        self.last_sample = Instant::now();

        // Remove exited PIDs and detect PID reuse via start_time
        self.accumulators.retain(|&pid, acc| {
            if let Some(proc_ref) = sys.process(Pid::from_u32(pid)) {
                proc_ref.start_time() == acc.start_time
            } else {
                false
            }
        });

        struct ProcSocketGroup<'a> {
            active_connections: usize,
            total_sockets: usize,
            protocols: BTreeSet<String>,
            sockets: Vec<&'a super::models::RawSocketEntry>,
        }

        let mut grouped: HashMap<u32, ProcSocketGroup> = HashMap::new();
        for sock in &snapshot.sockets {
            let Some(pid) = sock.pid else {
                continue;
            };
            if pid == 0 {
                continue;
            }
            let entry = grouped.entry(pid).or_insert_with(|| ProcSocketGroup {
                active_connections: 0,
                total_sockets: 0,
                protocols: BTreeSet::new(),
                sockets: Vec::new(),
            });
            entry.total_sockets += 1;
            if is_active_connection_state(&sock.state) {
                entry.active_connections += 1;
            }
            let base_proto = sock
                .protocol
                .trim_end_matches('6')
                .to_string();
            entry.protocols.insert(base_proto);
            entry.sockets.push(sock);
        }

        // Also keep previously measured running processes visible even if sockets momentarily closed
        for (&pid, acc) in &self.accumulators {
            if acc.has_measured_socket && !grouped.contains_key(&pid) {
                if sys.process(Pid::from_u32(pid)).is_some() {
                    grouped.insert(
                        pid,
                        ProcSocketGroup {
                            active_connections: 0,
                            total_sockets: 0,
                            protocols: BTreeSet::new(),
                            sockets: Vec::new(),
                        },
                    );
                }
            }
        }

        let measurement_source = if snapshot.capabilities.per_process_bytes_supported {
            if cfg!(target_os = "windows") {
                "windows_tcp_estats"
            } else {
                "kernel_tcp_sock_diag"
            }
        } else {
            "socket_ownership_only"
        }
        .to_string();

        let mut result = Vec::with_capacity(grouped.len());

        for (pid, group) in grouped {
            let Some(proc_ref) = sys.process(Pid::from_u32(pid)) else {
                continue;
            };

            let start_time = proc_ref.start_time();
            let acc = self.accumulators.entry(pid).or_insert_with(|| ProcessAccumulator {
                start_time,
                total_rx: 0,
                total_tx: 0,
                has_measured_socket: false,
                socket_prev: HashMap::new(),
            });

            if acc.start_time != start_time {
                acc.start_time = start_time;
                acc.total_rx = 0;
                acc.total_tx = 0;
                acc.has_measured_socket = false;
                acc.socket_prev.clear();
            }

            let mut delta_rx_sum: u64 = 0;
            let mut delta_tx_sum: u64 = 0;
            let mut next_sock_prev = HashMap::new();
            let mut measured_in_tick = false;

            for sock in &group.sockets {
                if let (Some(rx), Some(tx)) = (sock.rx_bytes, sock.tx_bytes) {
                    measured_in_tick = true;
                    acc.has_measured_socket = true;
                    let key = make_socket_key(sock);
                    next_sock_prev.insert(key.clone(), (rx, tx));

                    if let Some(&(prev_rx, prev_tx)) = acc.socket_prev.get(&key) {
                        let drx = if rx >= prev_rx { rx - prev_rx } else { rx };
                        let dtx = if tx >= prev_tx { tx - prev_tx } else { tx };
                        delta_rx_sum = delta_rx_sum.saturating_add(drx);
                        delta_tx_sum = delta_tx_sum.saturating_add(dtx);
                    } else {
                        // First time seeing this socket: attribute its initial bytes to total without inventing a spike
                        acc.total_rx = acc.total_rx.saturating_add(rx);
                        acc.total_tx = acc.total_tx.saturating_add(tx);
                    }
                }
            }

            acc.total_rx = acc.total_rx.saturating_add(delta_rx_sum);
            acc.total_tx = acc.total_tx.saturating_add(delta_tx_sum);
            acc.socket_prev = next_sock_prev;

            let is_measured = snapshot.capabilities.per_process_bytes_supported
                && (acc.has_measured_socket || measured_in_tick);

            let (
                download_speed_bytes_sec,
                upload_speed_bytes_sec,
                total_downloaded_bytes,
                total_uploaded_bytes,
                combined_speed_bytes_sec,
                combined_total_bytes,
                traffic_share_percent,
                status,
            ) = if is_measured {
                let dl_speed = ((delta_rx_sum as f64) / elapsed_secs).round() as u64;
                let ul_speed = ((delta_tx_sum as f64) / elapsed_secs).round() as u64;
                let combined_speed = dl_speed.saturating_add(ul_speed);
                let combined_total = acc.total_rx.saturating_add(acc.total_tx);
                let share = if system_total_speed_bytes_sec > 0 {
                    let raw = (combined_speed as f64 / system_total_speed_bytes_sec as f64) * 100.0;
                    Some(((raw.min(100.0) * 10.0).round() / 10.0) as f32)
                } else {
                    Some(0.0)
                };
                let st = if combined_speed > 0 {
                    "active"
                } else if group.active_connections > 0 {
                    "connected"
                } else {
                    "idle"
                };
                (
                    Some(dl_speed),
                    Some(ul_speed),
                    Some(acc.total_rx),
                    Some(acc.total_tx),
                    Some(combined_speed),
                    Some(combined_total),
                    share,
                    st.to_string(),
                )
            } else {
                let st = if group.active_connections > 0 {
                    "connected"
                } else {
                    "unmeasured"
                };
                (None, None, None, None, None, None, None, st.to_string())
            };

            let name = proc_ref.name().to_string();
            let user = proc_ref.user_id().and_then(|uid| {
                self.users
                    .get_user_by_id(uid)
                    .map(|u| u.name().to_string())
                    .or_else(|| Some(uid.to_string()))
            });
            let executable_path = proc_ref
                .exe()
                .map(|p| p.to_string_lossy().to_string())
                .filter(|s| !s.is_empty());
            let category = classify_category(pid, &name, user.as_deref());

            result.push(ProcessNetworkUsage {
                pid,
                name,
                executable_path,
                user,
                category,
                download_speed_bytes_sec,
                upload_speed_bytes_sec,
                total_downloaded_bytes,
                total_uploaded_bytes,
                combined_speed_bytes_sec,
                combined_total_bytes,
                traffic_share_percent,
                is_measured,
                measurement_source: measurement_source.clone(),
                active_connections: group.active_connections,
                total_sockets: group.total_sockets,
                protocols: group.protocols.into_iter().collect(),
                status,
            });
        }

        result.sort_by(|a, b| {
            b.combined_speed_bytes_sec
                .unwrap_or(0)
                .cmp(&a.combined_speed_bytes_sec.unwrap_or(0))
                .then_with(|| {
                    b.combined_total_bytes
                        .unwrap_or(0)
                        .cmp(&a.combined_total_bytes.unwrap_or(0))
                })
                .then_with(|| b.active_connections.cmp(&a.active_connections))
                .then_with(|| a.name.cmp(&b.name))
        });

        result
    }
}

fn classify_category(pid: u32, name: &str, user: Option<&str>) -> String {
    let lower = name.to_lowercase();
    if cfg!(target_os = "windows") {
        if pid <= 4
            || lower.contains("system")
            || lower == "lsass.exe"
            || lower == "services.exe"
        {
            "system".to_string()
        } else if lower.contains("svchost") || lower.contains("service") || lower.contains("host") {
            "background".to_string()
        } else {
            "app".to_string()
        }
    } else if pid <= 2
        || user == Some("root")
        || lower.contains("systemd")
        || lower.contains("kworker")
    {
        "system".to_string()
    } else if lower.ends_with('d') || lower.contains("daemon") || lower.contains("server") {
        "background".to_string()
    } else {
        "app".to_string()
    }
}
