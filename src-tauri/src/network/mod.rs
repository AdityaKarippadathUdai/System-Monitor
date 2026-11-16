use crate::models::{NetworkInterface, NetworkStats, PingResult};
use std::collections::HashMap;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use sysinfo::Networks;

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

        #[cfg(target_os = "linux")]
        let os_ifaces = collect_linux_ifaces();
        #[cfg(target_os = "windows")]
        let os_ifaces = collect_windows_ifaces();
        #[cfg(not(any(target_os = "linux", target_os = "windows")))]
        let os_ifaces: HashMap<String, OsInterfaceMeta> = HashMap::new();

        let mut interfaces = Vec::new();
        let mut total_rx_sec = 0u64;
        let mut total_tx_sec = 0u64;
        let mut total_rx_bytes = 0u64;
        let mut total_tx_bytes = 0u64;

        for (name, data) in networks.iter() {
            let rx_speed = ((data.received() as f64) / elapsed_secs).round() as u64;
            let tx_speed = ((data.transmitted() as f64) / elapsed_secs).round() as u64;
            let rx_total = data.total_received();
            let tx_total = data.total_transmitted();

            let meta = os_ifaces.get(name).or_else(|| {
                let lower = name.to_lowercase();
                os_ifaces
                    .iter()
                    .find(|(k, v)| {
                        k.to_lowercase() == lower
                            || v.display_name.to_lowercase() == lower
                    })
                    .map(|(_, v)| v)
            });

            let iface_type = meta
                .map(|m| m.iface_type.clone())
                .unwrap_or_else(|| classify_interface_name(name));

            let is_up = meta.map(|m| m.is_up).unwrap_or(true);
            let mac = meta.and_then(|m| m.mac.clone()).or_else(|| {
                let m_str = data.mac_address().to_string();
                if m_str.is_empty() || m_str == "00:00:00:00:00:00" {
                    None
                } else {
                    Some(m_str)
                }
            });

            if iface_type != "loopback" {
                total_rx_sec = total_rx_sec.saturating_add(rx_speed);
                total_tx_sec = total_tx_sec.saturating_add(tx_speed);
                total_rx_bytes = total_rx_bytes.saturating_add(rx_total);
                total_tx_bytes = total_tx_bytes.saturating_add(tx_total);
            }

            interfaces.push(NetworkInterface {
                name: name.clone(),
                display_name: meta
                    .map(|m| m.display_name.clone())
                    .unwrap_or_else(|| name.clone()),
                r#type: iface_type,
                ip4: meta.and_then(|m| m.ip4.clone()),
                ip6: meta.and_then(|m| m.ip6.clone()),
                mac,
                is_up,
                rx_bytes_total: rx_total,
                tx_bytes_total: tx_total,
                rx_speed_bytes_sec: rx_speed,
                tx_speed_bytes_sec: tx_speed,
                packet_loss_percent: None,
            });
        }

        // Sort active non-loopback interfaces first
        interfaces.sort_by(|a, b| {
            let score = |i: &NetworkInterface| -> (u8, u64) {
                let up_score = if i.is_up && i.r#type != "loopback" {
                    0
                } else if i.is_up {
                    1
                } else {
                    2
                };
                (up_score, std::cmp::Reverse(i.rx_bytes_total + i.tx_bytes_total).0)
            };
            score(a).cmp(&score(b))
        });

        let active_interface = interfaces
            .iter()
            .find(|i| i.is_up && i.r#type != "loopback" && i.ip4.is_some())
            .or_else(|| interfaces.iter().find(|i| i.is_up && i.r#type != "loopback"))
            .or_else(|| interfaces.first())
            .map(|i| i.name.clone())
            .unwrap_or_else(|| "N/A".to_string());

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

struct OsInterfaceMeta {
    display_name: String,
    iface_type: String,
    is_up: bool,
    ip4: Option<String>,
    ip6: Option<String>,
    mac: Option<String>,
}

fn classify_interface_name(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower == "lo" || lower.contains("loopback") {
        "loopback".to_string()
    } else if lower.starts_with("wl")
        || lower.contains("wi-fi")
        || lower.contains("wifi")
        || lower.contains("wlan")
        || lower.contains("wireless")
    {
        "wifi".to_string()
    } else if lower.starts_with("wg")
        || lower.starts_with("tun")
        || lower.starts_with("tap")
        || lower.starts_with("ppp")
        || lower.contains("vpn")
        || lower.contains("tailscale")
        || lower.contains("wireguard")
        || lower.contains("zerotier")
        || lower.contains("openvpn")
    {
        "vpn".to_string()
    } else if lower.starts_with("docker")
        || lower.starts_with("br-")
        || lower.starts_with("veth")
        || lower.starts_with("virbr")
        || lower.starts_with("vmnet")
        || lower.starts_with("vboxnet")
        || lower.contains("vethernet")
        || lower.contains("hyper-v")
        || lower.contains("virtual")
        || lower.contains("wsl")
    {
        "virtual".to_string()
    } else {
        "ethernet".to_string()
    }
}

#[cfg(target_os = "linux")]
fn collect_linux_ifaces() -> HashMap<String, OsInterfaceMeta> {
    use std::ffi::CStr;
    use std::fs;
    use std::path::Path;

    let mut map: HashMap<String, OsInterfaceMeta> = HashMap::new();

    if let Ok(entries) = fs::read_dir("/sys/class/net") {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path();

            let operstate = fs::read_to_string(path.join("operstate"))
                .unwrap_or_default()
                .trim()
                .to_lowercase();
            let is_up = operstate == "up" || (name == "lo" && operstate == "unknown");

            let mac = fs::read_to_string(path.join("address"))
                .ok()
                .map(|s| s.trim().to_uppercase())
                .filter(|s| !s.is_empty() && s != "00:00:00:00:00:00");

            let iface_type = if name == "lo" {
                "loopback".to_string()
            } else if Path::new(&format!("/sys/class/net/{}/wireless", name)).exists() {
                "wifi".to_string()
            } else if Path::new(&format!("/sys/class/net/{}/tun_flags", name)).exists() {
                "vpn".to_string()
            } else {
                classify_interface_name(&name)
            };

            map.insert(
                name.clone(),
                OsInterfaceMeta {
                    display_name: name,
                    iface_type,
                    is_up,
                    ip4: None,
                    ip6: None,
                    mac,
                },
            );
        }
    }

    unsafe {
        let mut ifap: *mut libc::ifaddrs = std::ptr::null_mut();
        if libc::getifaddrs(&mut ifap) == 0 && !ifap.is_null() {
            let mut cur = ifap;
            while !cur.is_null() {
                let ifa = &*cur;
                if !ifa.ifa_name.is_null() && !ifa.ifa_addr.is_null() {
                    let name = CStr::from_ptr(ifa.ifa_name).to_string_lossy().to_string();
                    let family = (*ifa.ifa_addr).sa_family as i32;
                    let entry = map.entry(name.clone()).or_insert_with(|| OsInterfaceMeta {
                        display_name: name.clone(),
                        iface_type: classify_interface_name(&name),
                        is_up: (ifa.ifa_flags as i32 & libc::IFF_UP) != 0,
                        ip4: None,
                        ip6: None,
                        mac: None,
                    });

                    if family == libc::AF_INET {
                        let sa = &*(ifa.ifa_addr as *const libc::sockaddr_in);
                        let bytes = sa.sin_addr.s_addr.to_ne_bytes();
                        if entry.ip4.is_none() {
                            entry.ip4 = Some(format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3]));
                        }
                    } else if family == libc::AF_INET6 {
                        let sa6 = &*(ifa.ifa_addr as *const libc::sockaddr_in6);
                        let ip6 = std::net::Ipv6Addr::from(sa6.sin6_addr.s6_addr);
                        // Prefer non-link-local if available, otherwise keep first IPv6
                        if entry.ip6.is_none() || entry.ip6.as_deref().map(|s| s.starts_with("fe80:")).unwrap_or(false) {
                            entry.ip6 = Some(ip6.to_string());
                        }
                    }
                }
                cur = ifa.ifa_next;
            }
            libc::freeifaddrs(ifap);
        }
    }

    map
}

#[cfg(target_os = "windows")]
fn collect_windows_ifaces() -> HashMap<String, OsInterfaceMeta> {
    use windows::Win32::Foundation::{ERROR_BUFFER_OVERFLOW, NO_ERROR};
    use windows::Win32::NetworkManagement::IpHelper::{
        GetAdaptersAddresses, GAA_FLAG_INCLUDE_PREFIX, IP_ADAPTER_ADDRESSES_LH,
    };
    use windows::Win32::Networking::WinSock::{
        AF_INET, AF_INET6, AF_UNSPEC, SOCKADDR_IN, SOCKADDR_IN6,
    };

    let mut map = HashMap::new();

    unsafe {
        let mut buf_len: u32 = 32_768;
        let mut buffer = vec![0u8; buf_len as usize];

        let mut res = GetAdaptersAddresses(
            AF_UNSPEC.0 as u32,
            GAA_FLAG_INCLUDE_PREFIX,
            None,
            Some(buffer.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH),
            &mut buf_len,
        );
        if res == ERROR_BUFFER_OVERFLOW.0 {
            buffer.resize(buf_len as usize, 0);
            res = GetAdaptersAddresses(
                AF_UNSPEC.0 as u32,
                GAA_FLAG_INCLUDE_PREFIX,
                None,
                Some(buffer.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH),
                &mut buf_len,
            );
        }

        if res != NO_ERROR.0 {
            return map;
        }

        let mut curr = buffer.as_ptr() as *const IP_ADAPTER_ADDRESSES_LH;
        while !curr.is_null() {
            let adapter = &*curr;
            let friendly = if !adapter.FriendlyName.is_null() {
                adapter.FriendlyName.to_string().unwrap_or_default()
            } else {
                String::new()
            };
            let desc = if !adapter.Description.is_null() {
                adapter.Description.to_string().unwrap_or_default()
            } else {
                friendly.clone()
            };

            let key = if !friendly.is_empty() {
                friendly.clone()
            } else {
                desc.clone()
            };

            // IfType constants: 71 = IEEE80211, 24 = SOFTWARE_LOOPBACK, 131 = TUNNEL, 6 = ETHERNET_CSMACD
            let iface_type = match adapter.IfType {
                24 => "loopback".to_string(),
                71 => "wifi".to_string(),
                131 => "vpn".to_string(),
                _ => {
                    let hint = format!("{} {}", friendly, desc);
                    classify_interface_name(&hint)
                }
            };

            // IfOperStatusUp == 1
            let is_up = adapter.OperStatus.0 == 1;

            let mac = if adapter.PhysicalAddressLength == 6 {
                let b = &adapter.PhysicalAddress[..6];
                if b.iter().all(|&x| x == 0) {
                    None
                } else {
                    Some(format!(
                        "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
                        b[0], b[1], b[2], b[3], b[4], b[5]
                    ))
                }
            } else {
                None
            };

            let mut ip4: Option<String> = None;
            let mut ip6: Option<String> = None;

            let mut unicast = adapter.FirstUnicastAddress;
            while !unicast.is_null() {
                let u = &*unicast;
                let sa = u.Address.lpSockaddr;
                if !sa.is_null() {
                    let family = (*sa).sa_family;
                    if family == AF_INET && ip4.is_none() {
                        let sa_in = &*(sa as *const SOCKADDR_IN);
                        let addr4 = std::net::Ipv4Addr::from(u32::from_be(sa_in.sin_addr.S_un.S_addr));
                        ip4 = Some(addr4.to_string());
                    } else if family == AF_INET6 {
                        let sa_in6 = &*(sa as *const SOCKADDR_IN6);
                        let addr6 = std::net::Ipv6Addr::from(sa_in6.sin6_addr.u.Byte);
                        if ip6.is_none() || ip6.as_deref().map(|s| s.starts_with("fe80:")).unwrap_or(false) {
                            ip6 = Some(addr6.to_string());
                        }
                    }
                }
                unicast = u.Next;
            }

            if !key.is_empty() {
                map.insert(
                    key.clone(),
                    OsInterfaceMeta {
                        display_name: if !desc.is_empty() { desc } else { key },
                        iface_type,
                        is_up,
                        ip4,
                        ip6,
                        mac,
                    },
                );
            }

            curr = adapter.Next;
        }
    }

    map
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

    // 1. Try native OS ICMP ping first
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

    // 2. Fallback to TCP connect probe (works in restricted containers/firewalls)
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
