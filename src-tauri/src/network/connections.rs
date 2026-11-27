use super::models::{NetworkConnection, PlatformSocketSnapshot, RawSocketEntry};
use std::collections::HashMap;
use std::time::Instant;
use sysinfo::{Pid, System};

#[derive(Clone, Copy)]
struct PrevSocketCounters {
    rx_bytes: u64,
    tx_bytes: u64,
}

pub struct ConnectionTracker {
    prev_counters: HashMap<String, PrevSocketCounters>,
    last_sample: Instant,
}

impl ConnectionTracker {
    pub fn new() -> Self {
        Self {
            prev_counters: HashMap::new(),
            last_sample: Instant::now(),
        }
    }

    pub fn build_connections(
        &mut self,
        snapshot: &PlatformSocketSnapshot,
        sys: &System,
    ) -> Vec<NetworkConnection> {
        let elapsed_secs = self.last_sample.elapsed().as_secs_f64().max(0.05);
        self.last_sample = Instant::now();

        let mut next_counters = HashMap::with_capacity(snapshot.sockets.len());
        let mut connections = Vec::with_capacity(snapshot.sockets.len());

        for sock in &snapshot.sockets {
            let conn_id = make_socket_key(sock);
            let (process_name, executable_path) = resolve_process_meta(sock, sys);

            let (rx_speed, tx_speed) = match (sock.rx_bytes, sock.tx_bytes) {
                (Some(rx), Some(tx)) => {
                    next_counters.insert(
                        conn_id.clone(),
                        PrevSocketCounters {
                            rx_bytes: rx,
                            tx_bytes: tx,
                        },
                    );
                    if let Some(prev) = self.prev_counters.get(&conn_id) {
                        let drx = if rx >= prev.rx_bytes { rx - prev.rx_bytes } else { 0 };
                        let dtx = if tx >= prev.tx_bytes { tx - prev.tx_bytes } else { 0 };
                        (
                            Some(((drx as f64) / elapsed_secs).round() as u64),
                            Some(((dtx as f64) / elapsed_secs).round() as u64),
                        )
                    } else {
                        (Some(0), Some(0))
                    }
                }
                _ => (None, None),
            };

            connections.push(NetworkConnection {
                id: conn_id,
                pid: sock.pid,
                process_name,
                executable_path,
                protocol: sock.protocol.clone(),
                local_address: sock.local_address.clone(),
                local_port: sock.local_port,
                remote_address: sock.remote_address.clone(),
                remote_port: sock.remote_port,
                state: sock.state.clone(),
                is_loopback: sock.is_loopback,
                rx_bytes_total: sock.rx_bytes,
                tx_bytes_total: sock.tx_bytes,
                rx_speed_bytes_sec: rx_speed,
                tx_speed_bytes_sec: tx_speed,
            });
        }

        self.prev_counters = next_counters;

        connections.sort_by(|a, b| {
            let a_active = is_active_connection_state(&a.state);
            let b_active = is_active_connection_state(&b.state);
            b_active
                .cmp(&a_active)
                .then_with(|| {
                    let a_rate = a.rx_speed_bytes_sec.unwrap_or(0) + a.tx_speed_bytes_sec.unwrap_or(0);
                    let b_rate = b.rx_speed_bytes_sec.unwrap_or(0) + b.tx_speed_bytes_sec.unwrap_or(0);
                    b_rate.cmp(&a_rate)
                })
                .then_with(|| a.process_name.cmp(&b.process_name))
        });

        connections
    }
}

pub fn make_socket_key(sock: &RawSocketEntry) -> String {
    if let Some(inode) = sock.inode {
        format!("{}:{}:{}", sock.protocol, sock.pid.unwrap_or(0), inode)
    } else {
        format!(
            "{}:{}:{}:{}:{}:{}",
            sock.protocol,
            sock.pid.unwrap_or(0),
            sock.local_address,
            sock.local_port,
            sock.remote_address,
            sock.remote_port.unwrap_or(0)
        )
    }
}

pub fn is_active_connection_state(state: &str) -> bool {
    matches!(
        state,
        "ESTABLISHED" | "SYN_SENT" | "SYN_RECV" | "FIN_WAIT1" | "FIN_WAIT2" | "CLOSE_WAIT" | "ACTIVE"
    )
}

fn resolve_process_meta(sock: &RawSocketEntry, sys: &System) -> (String, Option<String>) {
    if let Some(pid) = sock.pid {
        if let Some(proc_info) = sys.process(Pid::from_u32(pid)) {
            let exe = proc_info
                .exe()
                .map(|p| p.to_string_lossy().to_string())
                .filter(|s| !s.is_empty());
            return (proc_info.name().to_string(), exe);
        }
        return (format!("PID {}", pid), None);
    }

    if let Some(uid) = sock.uid {
        return (format!("System / UID {}", uid), None);
    }

    ("System Kernel".to_string(), None)
}
