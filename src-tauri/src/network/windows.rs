use super::models::{NetworkAttributionCapabilities, PlatformSocketSnapshot, RawSocketEntry};
use std::ffi::c_void;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use windows::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, NO_ERROR};
use windows::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, GetExtendedUdpTable, MIB_TCP6ROW_OWNER_PID, MIB_TCP6TABLE_OWNER_PID,
    MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID, MIB_UDP6ROW_OWNER_PID,
    MIB_UDP6TABLE_OWNER_PID, MIB_UDPROW_OWNER_PID, MIB_UDPTABLE_OWNER_PID,
    TCP_TABLE_OWNER_PID_ALL, UDP_TABLE_OWNER_PID,
};
use windows::Win32::Networking::WinSock::{AF_INET, AF_INET6};

const TCP_CONNECTION_ESTATS_DATA: i32 = 1;
const MIB_TCP_STATE_ESTAB: u32 = 5;

#[repr(C)]
#[derive(Clone, Copy)]
struct RawMibTcpRow {
    dw_state: u32,
    dw_local_addr: u32,
    dw_local_port: u32,
    dw_remote_addr: u32,
    dw_remote_port: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct RawMibTcp6Row {
    state: u32,
    local_addr: [u8; 16],
    dw_local_scope_id: u32,
    dw_local_port: u32,
    remote_addr: [u8; 16],
    dw_remote_scope_id: u32,
    dw_remote_port: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct RawTcpEstatsDataRwV0 {
    enable_collection: u8,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct RawTcpEstatsDataRodV0 {
    data_bytes_out: u64,
    data_segs_out: u64,
    data_bytes_in: u64,
    data_segs_in: u64,
    segs_out: u64,
    segs_in: u64,
    soft_errors: u32,
    soft_error_reason: u32,
    snd_una: u32,
    snd_nxt: u32,
    snd_max: u32,
    thru_bytes_acked: u64,
    rcv_nxt: u32,
    thru_bytes_received: u64,
}

#[link(name = "iphlpapi")]
extern "system" {
    fn SetPerTcpConnectionEStats(
        row: *mut RawMibTcpRow,
        estats_type: i32,
        rw: *mut u8,
        rw_version: u32,
        rw_size: u32,
        offset: u32,
    ) -> u32;

    fn GetPerTcpConnectionEStats(
        row: *mut RawMibTcpRow,
        estats_type: i32,
        rw: *mut u8,
        rw_version: u32,
        rw_size: u32,
        ros: *mut u8,
        ros_version: u32,
        ros_size: u32,
        rod: *mut u8,
        rod_version: u32,
        rod_size: u32,
    ) -> u32;

    fn SetPerTcp6ConnectionEStats(
        row: *mut RawMibTcp6Row,
        estats_type: i32,
        rw: *mut u8,
        rw_version: u32,
        rw_size: u32,
        offset: u32,
    ) -> u32;

    fn GetPerTcp6ConnectionEStats(
        row: *mut RawMibTcp6Row,
        estats_type: i32,
        rw: *mut u8,
        rw_version: u32,
        rw_size: u32,
        ros: *mut u8,
        ros_version: u32,
        ros_size: u32,
        rod: *mut u8,
        rod_version: u32,
        rod_size: u32,
    ) -> u32;
}

pub fn collect_windows_sockets() -> PlatformSocketSnapshot {
    let mut sockets = Vec::new();
    let mut estats_enabled_any = false;
    let mut estats_denied = false;

    collect_tcp4(&mut sockets, &mut estats_enabled_any, &mut estats_denied);
    collect_tcp6(&mut sockets, &mut estats_enabled_any, &mut estats_denied);
    collect_udp4(&mut sockets);
    collect_udp6(&mut sockets);

    let is_elevated = estats_enabled_any || !estats_denied;

    let (level, platform_method, limitation_reason) = if estats_enabled_any {
        (
            "partial".to_string(),
            "Windows IP Helper + TCP EStats".to_string(),
            Some(
                "Active TCP connections measured via Windows TCP EStats (DataBytesIn/DataBytesOut). UDP and pre-closed short-lived sockets do not expose byte counters without an ETW kernel trace session."
                    .to_string(),
            ),
        )
    } else if estats_denied {
        (
            "connections_only".to_string(),
            "Windows GetExtendedTcpTable / GetExtendedUdpTable".to_string(),
            Some(
                "Windows TCP EStats / ETW per-process bandwidth counters require Administrator privileges. Run SysMon Pro as Administrator for per-application byte measurements; socket ownership and active connections remain live."
                    .to_string(),
            ),
        )
    } else {
        (
            "connections_only".to_string(),
            "Windows GetExtendedTcpTable / GetExtendedUdpTable".to_string(),
            Some(
                "No established TCP connections available for TCP EStats measurement. Socket ownership (PID, endpoints, state) is active."
                    .to_string(),
            ),
        )
    };

    PlatformSocketSnapshot {
        sockets,
        capabilities: NetworkAttributionCapabilities {
            level,
            per_process_bytes_supported: estats_enabled_any,
            is_elevated,
            platform_method,
            limitation_reason,
            unreadable_process_count: 0,
        },
    }
}

fn port_from_be_dword(dw: u32) -> u16 {
    u16::from_be((dw & 0xFFFF) as u16)
}

fn map_windows_tcp_state(state: u32) -> &'static str {
    match state {
        1 => "CLOSED",
        2 => "LISTEN",
        3 => "SYN_SENT",
        4 => "SYN_RCVD",
        5 => "ESTABLISHED",
        6 => "FIN_WAIT1",
        7 => "FIN_WAIT2",
        8 => "CLOSE_WAIT",
        9 => "CLOSING",
        10 => "LAST_ACK",
        11 => "TIME_WAIT",
        12 => "DELETE_TCB",
        _ => "UNKNOWN",
    }
}

fn is_loopback_ip(ip_str: &str) -> bool {
    if let Ok(ip) = ip_str.parse::<IpAddr>() {
        return ip.is_loopback();
    }
    ip_str == "127.0.0.1" || ip_str == "::1"
}

fn try_tcp4_estats(row: &MIB_TCPROW_OWNER_PID, denied: &mut bool) -> Option<(u64, u64)> {
    if *denied || row.dwState != MIB_TCP_STATE_ESTAB {
        return None;
    }

    let mut tcp_row = RawMibTcpRow {
        dw_state: row.dwState,
        dw_local_addr: row.dwLocalAddr,
        dw_local_port: row.dwLocalPort,
        dw_remote_addr: row.dwRemoteAddr,
        dw_remote_port: row.dwRemotePort,
    };

    let mut rw = RawTcpEstatsDataRwV0 {
        enable_collection: 1,
    };
    let mut rod = RawTcpEstatsDataRodV0::default();

    unsafe {
        let mut get_res = GetPerTcpConnectionEStats(
            &mut tcp_row,
            TCP_CONNECTION_ESTATS_DATA,
            &mut rw as *mut _ as *mut u8,
            0,
            std::mem::size_of::<RawTcpEstatsDataRwV0>() as u32,
            std::ptr::null_mut(),
            0,
            0,
            &mut rod as *mut _ as *mut u8,
            0,
            std::mem::size_of::<RawTcpEstatsDataRodV0>() as u32,
        );

        if get_res != NO_ERROR.0 || rw.enable_collection == 0 {
            rw.enable_collection = 1;
            let set_res = SetPerTcpConnectionEStats(
                &mut tcp_row,
                TCP_CONNECTION_ESTATS_DATA,
                &mut rw as *mut _ as *mut u8,
                0,
                std::mem::size_of::<RawTcpEstatsDataRwV0>() as u32,
                0,
            );
            if set_res == 5 {
                // ERROR_ACCESS_DENIED
                *denied = true;
                return None;
            }
            if set_res == NO_ERROR.0 {
                get_res = GetPerTcpConnectionEStats(
                    &mut tcp_row,
                    TCP_CONNECTION_ESTATS_DATA,
                    &mut rw as *mut _ as *mut u8,
                    0,
                    std::mem::size_of::<RawTcpEstatsDataRwV0>() as u32,
                    std::ptr::null_mut(),
                    0,
                    0,
                    &mut rod as *mut _ as *mut u8,
                    0,
                    std::mem::size_of::<RawTcpEstatsDataRodV0>() as u32,
                );
            } else {
                return None;
            }
        }

        if get_res == NO_ERROR.0 {
            let rx = rod.data_bytes_in.max(rod.thru_bytes_received);
            let tx = rod.data_bytes_out.max(rod.thru_bytes_acked);
            Some((rx, tx))
        } else {
            if get_res == 5 {
                *denied = true;
            }
            None
        }
    }
}

fn try_tcp6_estats(row: &MIB_TCP6ROW_OWNER_PID, denied: &mut bool) -> Option<(u64, u64)> {
    if *denied || row.dwState != MIB_TCP_STATE_ESTAB {
        return None;
    }

    let mut tcp_row = RawMibTcp6Row {
        state: row.dwState,
        local_addr: row.ucLocalAddr,
        dw_local_scope_id: row.dwLocalScopeId,
        dw_local_port: row.dwLocalPort,
        remote_addr: row.ucRemoteAddr,
        dw_remote_scope_id: row.dwRemoteScopeId,
        dw_remote_port: row.dwRemotePort,
    };

    let mut rw = RawTcpEstatsDataRwV0 {
        enable_collection: 1,
    };
    let mut rod = RawTcpEstatsDataRodV0::default();

    unsafe {
        let mut get_res = GetPerTcp6ConnectionEStats(
            &mut tcp_row,
            TCP_CONNECTION_ESTATS_DATA,
            &mut rw as *mut _ as *mut u8,
            0,
            std::mem::size_of::<RawTcpEstatsDataRwV0>() as u32,
            std::ptr::null_mut(),
            0,
            0,
            &mut rod as *mut _ as *mut u8,
            0,
            std::mem::size_of::<RawTcpEstatsDataRodV0>() as u32,
        );

        if get_res != NO_ERROR.0 || rw.enable_collection == 0 {
            rw.enable_collection = 1;
            let set_res = SetPerTcp6ConnectionEStats(
                &mut tcp_row,
                TCP_CONNECTION_ESTATS_DATA,
                &mut rw as *mut _ as *mut u8,
                0,
                std::mem::size_of::<RawTcpEstatsDataRwV0>() as u32,
                0,
            );
            if set_res == 5 {
                *denied = true;
                return None;
            }
            if set_res == NO_ERROR.0 {
                get_res = GetPerTcp6ConnectionEStats(
                    &mut tcp_row,
                    TCP_CONNECTION_ESTATS_DATA,
                    &mut rw as *mut _ as *mut u8,
                    0,
                    std::mem::size_of::<RawTcpEstatsDataRwV0>() as u32,
                    std::ptr::null_mut(),
                    0,
                    0,
                    &mut rod as *mut _ as *mut u8,
                    0,
                    std::mem::size_of::<RawTcpEstatsDataRodV0>() as u32,
                );
            } else {
                return None;
            }
        }

        if get_res == NO_ERROR.0 {
            let rx = rod.data_bytes_in.max(rod.thru_bytes_received);
            let tx = rod.data_bytes_out.max(rod.thru_bytes_acked);
            Some((rx, tx))
        } else {
            if get_res == 5 {
                *denied = true;
            }
            None
        }
    }
}

fn collect_tcp4(out: &mut Vec<RawSocketEntry>, estats_ok: &mut bool, estats_denied: &mut bool) {
    unsafe {
        let mut size: u32 = 0;
        let _ = GetExtendedTcpTable(None, &mut size, false, AF_INET.0 as u32, TCP_TABLE_OWNER_PID_ALL, 0);
        if size == 0 {
            return;
        }
        let mut buf = vec![0u8; size as usize];
        let res = GetExtendedTcpTable(
            Some(buf.as_mut_ptr() as *mut c_void),
            &mut size,
            false,
            AF_INET.0 as u32,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        );
        if res == ERROR_INSUFFICIENT_BUFFER.0 {
            buf.resize(size as usize, 0);
            if GetExtendedTcpTable(
                Some(buf.as_mut_ptr() as *mut c_void),
                &mut size,
                false,
                AF_INET.0 as u32,
                TCP_TABLE_OWNER_PID_ALL,
                0,
            ) != NO_ERROR.0
            {
                return;
            }
        } else if res != NO_ERROR.0 {
            return;
        }

        if buf.len() < std::mem::size_of::<MIB_TCPTABLE_OWNER_PID>() {
            return;
        }
        let table = &*(buf.as_ptr() as *const MIB_TCPTABLE_OWNER_PID);
        let count = table.dwNumEntries as usize;
        if buf.len() < 4 + count * std::mem::size_of::<MIB_TCPROW_OWNER_PID>() {
            return;
        }
        let rows = std::slice::from_raw_parts(table.table.as_ptr(), count);

        for row in rows {
            let local_ip = Ipv4Addr::from(row.dwLocalAddr.to_ne_bytes()).to_string();
            let remote_ip = Ipv4Addr::from(row.dwRemoteAddr.to_ne_bytes()).to_string();
            let local_port = port_from_be_dword(row.dwLocalPort);
            let remote_port = port_from_be_dword(row.dwRemotePort);
            let state = map_windows_tcp_state(row.dwState).to_string();

            let (rx_bytes, tx_bytes) = match try_tcp4_estats(row, estats_denied) {
                Some((rx, tx)) => {
                    *estats_ok = true;
                    (Some(rx), Some(tx))
                }
                None => (None, None),
            };

            let is_loopback = is_loopback_ip(&local_ip)
                && (is_loopback_ip(&remote_ip) || remote_port == 0 || remote_ip == "0.0.0.0");

            out.push(RawSocketEntry {
                protocol: "TCP".to_string(),
                local_address: local_ip,
                local_port,
                remote_address: remote_ip,
                remote_port: if remote_port == 0 { None } else { Some(remote_port) },
                state,
                pid: Some(row.dwOwningPid),
                uid: None,
                inode: None,
                is_loopback,
                rx_bytes,
                tx_bytes,
            });
        }
    }
}

fn collect_tcp6(out: &mut Vec<RawSocketEntry>, estats_ok: &mut bool, estats_denied: &mut bool) {
    unsafe {
        let mut size: u32 = 0;
        let _ = GetExtendedTcpTable(None, &mut size, false, AF_INET6.0 as u32, TCP_TABLE_OWNER_PID_ALL, 0);
        if size == 0 {
            return;
        }
        let mut buf = vec![0u8; size as usize];
        if GetExtendedTcpTable(
            Some(buf.as_mut_ptr() as *mut c_void),
            &mut size,
            false,
            AF_INET6.0 as u32,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        ) != NO_ERROR.0
        {
            return;
        }

        if buf.len() < std::mem::size_of::<MIB_TCP6TABLE_OWNER_PID>() {
            return;
        }
        let table = &*(buf.as_ptr() as *const MIB_TCP6TABLE_OWNER_PID);
        let count = table.dwNumEntries as usize;
        if buf.len() < 4 + count * std::mem::size_of::<MIB_TCP6ROW_OWNER_PID>() {
            return;
        }
        let rows = std::slice::from_raw_parts(table.table.as_ptr(), count);

        for row in rows {
            let local_ip = Ipv6Addr::from(row.ucLocalAddr).to_string();
            let remote_ip = Ipv6Addr::from(row.ucRemoteAddr).to_string();
            let local_port = port_from_be_dword(row.dwLocalPort);
            let remote_port = port_from_be_dword(row.dwRemotePort);
            let state = map_windows_tcp_state(row.dwState).to_string();

            let (rx_bytes, tx_bytes) = match try_tcp6_estats(row, estats_denied) {
                Some((rx, tx)) => {
                    *estats_ok = true;
                    (Some(rx), Some(tx))
                }
                None => (None, None),
            };

            let is_loopback = is_loopback_ip(&local_ip)
                && (is_loopback_ip(&remote_ip) || remote_port == 0 || remote_ip == "::");

            out.push(RawSocketEntry {
                protocol: "TCP6".to_string(),
                local_address: local_ip,
                local_port,
                remote_address: remote_ip,
                remote_port: if remote_port == 0 { None } else { Some(remote_port) },
                state,
                pid: Some(row.dwOwningPid),
                uid: None,
                inode: None,
                is_loopback,
                rx_bytes,
                tx_bytes,
            });
        }
    }
}

fn collect_udp4(out: &mut Vec<RawSocketEntry>) {
    unsafe {
        let mut size: u32 = 0;
        let _ = GetExtendedUdpTable(None, &mut size, false, AF_INET.0 as u32, UDP_TABLE_OWNER_PID, 0);
        if size == 0 {
            return;
        }
        let mut buf = vec![0u8; size as usize];
        if GetExtendedUdpTable(
            Some(buf.as_mut_ptr() as *mut c_void),
            &mut size,
            false,
            AF_INET.0 as u32,
            UDP_TABLE_OWNER_PID,
            0,
        ) != NO_ERROR.0
        {
            return;
        }

        if buf.len() < std::mem::size_of::<MIB_UDPTABLE_OWNER_PID>() {
            return;
        }
        let table = &*(buf.as_ptr() as *const MIB_UDPTABLE_OWNER_PID);
        let count = table.dwNumEntries as usize;
        if buf.len() < 4 + count * std::mem::size_of::<MIB_UDPROW_OWNER_PID>() {
            return;
        }
        let rows = std::slice::from_raw_parts(table.table.as_ptr(), count);

        for row in rows {
            let local_ip = Ipv4Addr::from(row.dwLocalAddr.to_ne_bytes()).to_string();
            let local_port = port_from_be_dword(row.dwLocalPort);
            let is_loopback = is_loopback_ip(&local_ip);

            out.push(RawSocketEntry {
                protocol: "UDP".to_string(),
                local_address: local_ip,
                local_port,
                remote_address: "*".to_string(),
                remote_port: None,
                state: "BOUND".to_string(),
                pid: Some(row.dwOwningPid),
                uid: None,
                inode: None,
                is_loopback,
                rx_bytes: None,
                tx_bytes: None,
            });
        }
    }
}

fn collect_udp6(out: &mut Vec<RawSocketEntry>) {
    unsafe {
        let mut size: u32 = 0;
        let _ = GetExtendedUdpTable(None, &mut size, false, AF_INET6.0 as u32, UDP_TABLE_OWNER_PID, 0);
        if size == 0 {
            return;
        }
        let mut buf = vec![0u8; size as usize];
        if GetExtendedUdpTable(
            Some(buf.as_mut_ptr() as *mut c_void),
            &mut size,
            false,
            AF_INET6.0 as u32,
            UDP_TABLE_OWNER_PID,
            0,
        ) != NO_ERROR.0
        {
            return;
        }

        if buf.len() < std::mem::size_of::<MIB_UDP6TABLE_OWNER_PID>() {
            return;
        }
        let table = &*(buf.as_ptr() as *const MIB_UDP6TABLE_OWNER_PID);
        let count = table.dwNumEntries as usize;
        if buf.len() < 4 + count * std::mem::size_of::<MIB_UDP6ROW_OWNER_PID>() {
            return;
        }
        let rows = std::slice::from_raw_parts(table.table.as_ptr(), count);

        for row in rows {
            let local_ip = Ipv6Addr::from(row.ucLocalAddr).to_string();
            let local_port = port_from_be_dword(row.dwLocalPort);
            let is_loopback = is_loopback_ip(&local_ip);

            out.push(RawSocketEntry {
                protocol: "UDP6".to_string(),
                local_address: local_ip,
                local_port,
                remote_address: "*".to_string(),
                remote_port: None,
                state: "BOUND".to_string(),
                pid: Some(row.dwOwningPid),
                uid: None,
                inode: None,
                is_loopback,
                rx_bytes: None,
                tx_bytes: None,
            });
        }
    }
}
