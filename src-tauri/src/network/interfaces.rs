use crate::models::NetworkInterface;
use std::collections::HashMap;
use sysinfo::Networks;

pub struct OsInterfaceMeta {
    pub display_name: String,
    pub iface_type: String,
    pub is_up: bool,
    pub ip4: Option<String>,
    pub ip6: Option<String>,
    pub mac: Option<String>,
    pub speed_mbps: Option<u64>,
    pub mtu: Option<u32>,
    pub rx_packets: Option<u64>,
    pub tx_packets: Option<u64>,
    pub rx_errors: Option<u64>,
    pub tx_errors: Option<u64>,
}

pub fn collect_interfaces(networks: &Networks, elapsed_secs: f64) -> Vec<NetworkInterface> {
    #[cfg(target_os = "linux")]
    let os_ifaces = collect_linux_ifaces();
    #[cfg(target_os = "windows")]
    let os_ifaces = collect_windows_ifaces();
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    let os_ifaces: HashMap<String, OsInterfaceMeta> = HashMap::new();

    let mut interfaces = Vec::new();

    for (name, data) in networks.iter() {
        let rx_speed = ((data.received() as f64) / elapsed_secs).round() as u64;
        let tx_speed = ((data.transmitted() as f64) / elapsed_secs).round() as u64;
        let rx_total = data.total_received();
        let tx_total = data.total_transmitted();

        let meta = os_ifaces.get(name).or_else(|| {
            let lower = name.to_lowercase();
            os_ifaces
                .iter()
                .find(|(k, v)| k.to_lowercase() == lower || v.display_name.to_lowercase() == lower)
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
                Some(m_str.to_uppercase())
            }
        });

        let rx_packets = meta.and_then(|m| m.rx_packets).or_else(|| Some(data.total_packets_received()));
        let tx_packets = meta.and_then(|m| m.tx_packets).or_else(|| Some(data.total_packets_transmitted()));
        let rx_errors = meta.and_then(|m| m.rx_errors).or_else(|| Some(data.total_errors_on_received()));
        let tx_errors = meta.and_then(|m| m.tx_errors).or_else(|| Some(data.total_errors_on_transmitted()));

        let packet_loss_percent = match (rx_packets, tx_packets, rx_errors, tx_errors) {
            (Some(rp), Some(tp), Some(re), Some(te)) => {
                let total_pkts = rp.saturating_add(tp);
                let total_errs = re.saturating_add(te);
                if total_pkts > 0 && total_errs > 0 {
                    Some((((total_errs as f64 / total_pkts as f64) * 100.0) * 100.0).round() as f32 / 100.0)
                } else if total_pkts > 0 {
                    Some(0.0)
                } else {
                    None
                }
            }
            _ => None,
        };

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
            speed_mbps: meta.and_then(|m| m.speed_mbps),
            mtu: meta.and_then(|m| m.mtu),
            rx_bytes_total: rx_total,
            tx_bytes_total: tx_total,
            rx_speed_bytes_sec: rx_speed,
            tx_speed_bytes_sec: tx_speed,
            rx_packets,
            tx_packets,
            rx_errors,
            tx_errors,
            packet_loss_percent,
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
            (up_score, std::cmp::Reverse(i.rx_bytes_total.saturating_add(i.tx_bytes_total)).0)
        };
        score(a).cmp(&score(b))
    });

    interfaces
}

pub fn pick_default_active_interface(interfaces: &[NetworkInterface]) -> String {
    interfaces
        .iter()
        .find(|i| i.is_up && i.r#type != "loopback" && i.ip4.is_some())
        .or_else(|| interfaces.iter().find(|i| i.is_up && i.r#type != "loopback"))
        .or_else(|| interfaces.first())
        .map(|i| i.name.clone())
        .unwrap_or_else(|| "N/A".to_string())
}

pub fn classify_interface_name(name: &str) -> String {
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
fn read_sysfs_u64(path: &std::path::Path) -> Option<u64> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| s.trim().parse::<i64>().ok())
        .and_then(|v| if v >= 0 { Some(v as u64) } else { None })
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

            let speed_mbps = read_sysfs_u64(&path.join("speed")).filter(|&s| s > 0 && s < 1_000_000);
            let mtu = read_sysfs_u64(&path.join("mtu")).map(|m| m as u32);
            let stats_dir = path.join("statistics");
            let rx_packets = read_sysfs_u64(&stats_dir.join("rx_packets"));
            let tx_packets = read_sysfs_u64(&stats_dir.join("tx_packets"));
            let rx_errors = read_sysfs_u64(&stats_dir.join("rx_errors"));
            let tx_errors = read_sysfs_u64(&stats_dir.join("tx_errors"));

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
                    speed_mbps,
                    mtu,
                    rx_packets,
                    tx_packets,
                    rx_errors,
                    tx_errors,
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
                        speed_mbps: None,
                        mtu: None,
                        rx_packets: None,
                        tx_packets: None,
                        rx_errors: None,
                        tx_errors: None,
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
                        if entry.ip6.is_none()
                            || entry.ip6.as_deref().map(|s| s.starts_with("fe80:")).unwrap_or(false)
                        {
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

            let iface_type = match adapter.IfType {
                24 => "loopback".to_string(),
                71 => "wifi".to_string(),
                131 => "vpn".to_string(),
                _ => {
                    let hint = format!("{} {}", friendly, desc);
                    classify_interface_name(&hint)
                }
            };

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

            let link_bps = if adapter.ReceiveLinkSpeed > 0 && adapter.ReceiveLinkSpeed != u64::MAX {
                Some(adapter.ReceiveLinkSpeed)
            } else if adapter.TransmitLinkSpeed > 0 && adapter.TransmitLinkSpeed != u64::MAX {
                Some(adapter.TransmitLinkSpeed)
            } else {
                None
            };
            let speed_mbps = link_bps.map(|bps| bps / 1_000_000).filter(|&m| m > 0);
            let mtu = if adapter.Mtu > 0 && adapter.Mtu < u32::MAX {
                Some(adapter.Mtu)
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
                        if ip6.is_none()
                            || ip6.as_deref().map(|s| s.starts_with("fe80:")).unwrap_or(false)
                        {
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
                        speed_mbps,
                        mtu,
                        rx_packets: None,
                        tx_packets: None,
                        rx_errors: None,
                        tx_errors: None,
                    },
                );
            }

            curr = adapter.Next;
        }
    }

    map
}
