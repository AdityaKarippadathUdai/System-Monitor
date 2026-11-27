use super::models::{NetworkAttributionCapabilities, PlatformSocketSnapshot, RawSocketEntry};
use std::collections::HashMap;
use std::fs;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

const NETLINK_SOCK_DIAG: i32 = 4;
const SOCK_DIAG_BY_FAMILY: u16 = 20;
const INET_DIAG_INFO: u16 = 2;
const NLM_F_REQUEST: u16 = 0x01;
const NLM_F_DUMP: u16 = 0x300;
const NLMSG_ERROR: u16 = 2;
const NLMSG_DONE: u16 = 3;

#[repr(C)]
#[derive(Clone, Copy)]
struct NlMsgHdr {
    nlmsg_len: u32,
    nlmsg_type: u16,
    nlmsg_flags: u16,
    nlmsg_seq: u32,
    nlmsg_pid: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct InetDiagSockId {
    idiag_sport: [u8; 2],
    idiag_dport: [u8; 2],
    idiag_src: [u32; 4],
    idiag_dst: [u32; 4],
    idiag_if: u32,
    idiag_cookie: [u32; 2],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct InetDiagReqV2 {
    sdiag_family: u8,
    sdiag_protocol: u8,
    idiag_ext: u8,
    pad: u8,
    idiag_states: u32,
    id: InetDiagSockId,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct InetDiagMsg {
    idiag_family: u8,
    idiag_state: u8,
    idiag_timer: u8,
    idiag_retrans: u8,
    id: InetDiagSockId,
    idiag_expires: u32,
    idiag_rqueue: u32,
    idiag_wqueue: u32,
    idiag_uid: u32,
    idiag_inode: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct NlAttr {
    nla_len: u16,
    nla_type: u16,
}

#[derive(Debug, Clone, Copy)]
struct TcpByteCounters {
    rx_bytes: u64,
    tx_bytes: u64,
}

pub fn collect_linux_sockets() -> PlatformSocketSnapshot {
    let is_elevated = unsafe { libc::geteuid() == 0 };
    let (inode_to_pid, unreadable_process_count) = map_socket_inodes_to_pids();
    let (sock_diag_counters, sock_diag_ok) = query_netlink_tcp_counters();

    let mut sockets = Vec::new();

    parse_proc_net_file(
        "/proc/net/tcp",
        "TCP",
        false,
        &inode_to_pid,
        &sock_diag_counters,
        &mut sockets,
    );
    parse_proc_net_file(
        "/proc/net/tcp6",
        "TCP6",
        true,
        &inode_to_pid,
        &sock_diag_counters,
        &mut sockets,
    );
    parse_proc_net_file(
        "/proc/net/udp",
        "UDP",
        false,
        &inode_to_pid,
        &sock_diag_counters,
        &mut sockets,
    );
    parse_proc_net_file(
        "/proc/net/udp6",
        "UDP6",
        true,
        &inode_to_pid,
        &sock_diag_counters,
        &mut sockets,
    );

    let has_measured_tcp = sock_diag_ok && !sock_diag_counters.is_empty();
    let (level, platform_method, limitation_reason) = if has_measured_tcp {
        let mut notes = vec![
            "TCP per-socket bytes measured via Linux Netlink SOCK_DIAG (tcp_info)".to_string(),
            "UDP lacks per-socket byte counters without eBPF".to_string(),
        ];
        if !is_elevated && unreadable_process_count > 0 {
            notes.push(format!(
                "{} processes owned by other users require CAP_DAC_READ_SEARCH/CAP_SYS_PTRACE or root for socket-to-PID mapping",
                unreadable_process_count
            ));
        }
        (
            "partial".to_string(),
            "Linux Netlink SOCK_DIAG + /proc".to_string(),
            Some(notes.join(". ") + "."),
        )
    } else if sock_diag_ok {
        (
            "partial".to_string(),
            "Linux Netlink SOCK_DIAG + /proc".to_string(),
            Some(
                "Kernel Netlink SOCK_DIAG available for TCP; no active TCP counters observed in current snapshot. UDP per-process bytes require eBPF."
                    .to_string(),
            ),
        )
    } else {
        (
            "connections_only".to_string(),
            "Linux /proc/net + /proc/<pid>/fd".to_string(),
            Some(
                "Netlink SOCK_DIAG tcp_info is unavailable in this environment; displaying socket ownership and connection states without fabricated per-process bandwidth."
                    .to_string(),
            ),
        )
    };

    PlatformSocketSnapshot {
        sockets,
        capabilities: NetworkAttributionCapabilities {
            level,
            per_process_bytes_supported: sock_diag_ok,
            is_elevated,
            platform_method,
            limitation_reason,
            unreadable_process_count,
        },
    }
}

fn map_socket_inodes_to_pids() -> (HashMap<u64, u32>, usize) {
    let mut map = HashMap::new();
    let mut unreadable_count = 0usize;

    let Ok(entries) = fs::read_dir("/proc") else {
        return (map, unreadable_count);
    };

    for entry in entries.flatten() {
        let fname = entry.file_name();
        let pid_str = fname.to_string_lossy();
        let Ok(pid) = pid_str.parse::<u32>() else {
            continue;
        };

        let fd_dir = entry.path().join("fd");
        match fs::read_dir(&fd_dir) {
            Ok(fds) => {
                for fd in fds.flatten() {
                    if let Ok(target) = fs::read_link(fd.path()) {
                        let target_str = target.to_string_lossy();
                        if let Some(rest) = target_str.strip_prefix("socket:[") {
                            if let Some(inode_str) = rest.strip_suffix(']') {
                                if let Ok(inode) = inode_str.parse::<u64>() {
                                    map.entry(inode).or_insert(pid);
                                }
                            }
                        }
                    }
                }
            }
            Err(err) => {
                if err.kind() == std::io::ErrorKind::PermissionDenied {
                    unreadable_count += 1;
                }
            }
        }
    }

    (map, unreadable_count)
}

fn query_netlink_tcp_counters() -> (HashMap<u64, TcpByteCounters>, bool) {
    let mut counters = HashMap::new();
    let mut any_ok = false;

    for family in [libc::AF_INET as u8, libc::AF_INET6 as u8] {
        if let Some(batch) = query_netlink_family(family) {
            any_ok = true;
            counters.extend(batch);
        }
    }

    (counters, any_ok)
}

fn query_netlink_family(family: u8) -> Option<HashMap<u64, TcpByteCounters>> {
    unsafe {
        let fd = libc::socket(
            libc::AF_NETLINK,
            libc::SOCK_DGRAM | libc::SOCK_CLOEXEC,
            NETLINK_SOCK_DIAG,
        );
        if fd < 0 {
            return None;
        }

        // Prevent blocking forever on restricted kernels
        let tv = libc::timeval {
            tv_sec: 0,
            tv_usec: 250_000,
        };
        let _ = libc::setsockopt(
            fd,
            libc::SOL_SOCKET,
            libc::SO_RCVTIMEO,
            &tv as *const libc::timeval as *const libc::c_void,
            std::mem::size_of::<libc::timeval>() as libc::socklen_t,
        );

        let mut sa: libc::sockaddr_nl = std::mem::zeroed();
        sa.nl_family = libc::AF_NETLINK as libc::sa_family_t;

        #[repr(C)]
        struct ReqPacket {
            hdr: NlMsgHdr,
            req: InetDiagReqV2,
        }

        let packet = ReqPacket {
            hdr: NlMsgHdr {
                nlmsg_len: std::mem::size_of::<ReqPacket>() as u32,
                nlmsg_type: SOCK_DIAG_BY_FAMILY,
                nlmsg_flags: NLM_F_REQUEST | NLM_F_DUMP,
                nlmsg_seq: 1,
                nlmsg_pid: 0,
            },
            req: InetDiagReqV2 {
                sdiag_family: family,
                sdiag_protocol: libc::IPPROTO_TCP as u8,
                idiag_ext: 1 << (INET_DIAG_INFO - 1),
                pad: 0,
                idiag_states: 0x0FFF_FFFF,
                id: InetDiagSockId {
                    idiag_sport: [0, 0],
                    idiag_dport: [0, 0],
                    idiag_src: [0; 4],
                    idiag_dst: [0; 4],
                    idiag_if: 0,
                    idiag_cookie: [u32::MAX, u32::MAX],
                },
            },
        };

        let sent = libc::sendto(
            fd,
            &packet as *const ReqPacket as *const libc::c_void,
            std::mem::size_of::<ReqPacket>(),
            0,
            &sa as *const libc::sockaddr_nl as *const libc::sockaddr,
            std::mem::size_of::<libc::sockaddr_nl>() as libc::socklen_t,
        );

        if sent < 0 {
            libc::close(fd);
            return None;
        }

        let mut result = HashMap::new();
        let mut buf = vec![0u8; 32_768];

        loop {
            let n = libc::recv(fd, buf.as_mut_ptr() as *mut libc::c_void, buf.len(), 0);
            if n <= 0 {
                break;
            }
            let data = &buf[..n as usize];
            let mut offset = 0usize;
            let mut done = false;

            while offset + std::mem::size_of::<NlMsgHdr>() <= data.len() {
                let hdr = std::ptr::read_unaligned(data[offset..].as_ptr() as *const NlMsgHdr);
                let msg_len = hdr.nlmsg_len as usize;
                if msg_len < std::mem::size_of::<NlMsgHdr>() || offset + msg_len > data.len() {
                    break;
                }

                if hdr.nlmsg_type == NLMSG_DONE {
                    done = true;
                    break;
                }
                if hdr.nlmsg_type == NLMSG_ERROR {
                    libc::close(fd);
                    return None;
                }

                let diag_offset = offset + std::mem::size_of::<NlMsgHdr>();
                let diag_size = std::mem::size_of::<InetDiagMsg>();
                if diag_offset + diag_size <= offset + msg_len {
                    let diag =
                        std::ptr::read_unaligned(data[diag_offset..].as_ptr() as *const InetDiagMsg);
                    let inode = diag.idiag_inode as u64;

                    let mut attr_off = diag_offset + diag_size;
                    let msg_end = offset + msg_len;
                    while attr_off + std::mem::size_of::<NlAttr>() <= msg_end {
                        let attr =
                            std::ptr::read_unaligned(data[attr_off..].as_ptr() as *const NlAttr);
                        let nla_len = attr.nla_len as usize;
                        if nla_len < std::mem::size_of::<NlAttr>() || attr_off + nla_len > msg_end {
                            break;
                        }
                        let payload_start = attr_off + std::mem::size_of::<NlAttr>();
                        let payload_end = attr_off + nla_len;
                        let attr_type = attr.nla_type & 0x3FFF;

                        // struct tcp_info: tcpi_bytes_acked @ 120, tcpi_bytes_received @ 128
                        if attr_type == INET_DIAG_INFO && payload_end - payload_start >= 136 {
                            let payload = &data[payload_start..payload_end];
                            let tx_bytes = u64::from_ne_bytes(payload[120..128].try_into().unwrap());
                            let rx_bytes = u64::from_ne_bytes(payload[128..136].try_into().unwrap());
                            if inode > 0 {
                                result.insert(inode, TcpByteCounters { rx_bytes, tx_bytes });
                            }
                        }

                        // Netlink attributes are aligned to 4 bytes
                        let aligned = (nla_len + 3) & !3;
                        attr_off = attr_off.saturating_add(aligned);
                    }
                }

                let aligned_msg = (msg_len + 3) & !3;
                offset = offset.saturating_add(aligned_msg);
            }

            if done {
                break;
            }
        }

        libc::close(fd);
        Some(result)
    }
}

fn parse_proc_net_file(
    path: &str,
    protocol: &str,
    is_v6: bool,
    inode_to_pid: &HashMap<u64, u32>,
    sock_diag: &HashMap<u64, TcpByteCounters>,
    out: &mut Vec<RawSocketEntry>,
) {
    let Ok(content) = fs::read_to_string(path) else {
        return;
    };

    for line in content.lines().skip(1) {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 10 {
            continue;
        }

        let Some((local_ip, local_port)) = parse_hex_endpoint(cols[1], is_v6) else {
            continue;
        };
        let Some((remote_ip, remote_port)) = parse_hex_endpoint(cols[2], is_v6) else {
            continue;
        };

        let state_hex = u8::from_str_radix(cols[3], 16).unwrap_or(0);
        let state = if protocol.starts_with("UDP") {
            match state_hex {
                0x01 => "ESTABLISHED",
                0x07 => "UNCONN",
                _ => "ACTIVE",
            }
            .to_string()
        } else {
            map_linux_tcp_state(state_hex).to_string()
        };

        let uid = cols[7].parse::<u32>().ok();
        let inode = cols[9].parse::<u64>().ok().filter(|&i| i > 0);
        let pid = inode.and_then(|ino| inode_to_pid.get(&ino).copied());

        let (rx_bytes, tx_bytes) = if protocol.starts_with("TCP") {
            inode
                .and_then(|ino| sock_diag.get(&ino))
                .map(|c| (Some(c.rx_bytes), Some(c.tx_bytes)))
                .unwrap_or((None, None))
        } else {
            (None, None)
        };

        let is_loopback = is_loopback_ip(&local_ip)
            && (is_loopback_ip(&remote_ip) || remote_port == 0 || remote_ip == "0.0.0.0" || remote_ip == "::");

        out.push(RawSocketEntry {
            protocol: protocol.to_string(),
            local_address: local_ip,
            local_port,
            remote_address: remote_ip,
            remote_port: if remote_port == 0 { None } else { Some(remote_port) },
            state,
            pid,
            uid,
            inode,
            is_loopback,
            rx_bytes,
            tx_bytes,
        });
    }
}

fn parse_hex_endpoint(raw: &str, is_v6: bool) -> Option<(String, u16)> {
    let (addr_hex, port_hex) = raw.split_once(':')?;
    let port = u16::from_str_radix(port_hex, 16).ok()?;

    if !is_v6 {
        if addr_hex.len() != 8 {
            return None;
        }
        let word = u32::from_str_radix(addr_hex, 16).ok()?;
        let ip = Ipv4Addr::from(word.to_ne_bytes());
        Some((ip.to_string(), port))
    } else {
        if addr_hex.len() != 32 {
            return None;
        }
        let mut bytes = [0u8; 16];
        for i in 0..4 {
            let chunk = &addr_hex[i * 8..(i + 1) * 8];
            let word = u32::from_str_radix(chunk, 16).ok()?;
            bytes[i * 4..(i + 1) * 4].copy_from_slice(&word.to_ne_bytes());
        }
        let ip = Ipv6Addr::from(bytes);
        Some((ip.to_string(), port))
    }
}

fn is_loopback_ip(ip_str: &str) -> bool {
    if let Ok(ip) = ip_str.parse::<IpAddr>() {
        return ip.is_loopback();
    }
    ip_str == "127.0.0.1" || ip_str == "::1"
}

fn map_linux_tcp_state(state: u8) -> &'static str {
    match state {
        0x01 => "ESTABLISHED",
        0x02 => "SYN_SENT",
        0x03 => "SYN_RECV",
        0x04 => "FIN_WAIT1",
        0x05 => "FIN_WAIT2",
        0x06 => "TIME_WAIT",
        0x07 => "CLOSE",
        0x08 => "CLOSE_WAIT",
        0x09 => "LAST_ACK",
        0x0A => "LISTEN",
        0x0B => "CLOSING",
        _ => "UNKNOWN",
    }
}
