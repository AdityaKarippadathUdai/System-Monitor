use crate::desktop::models::{DetectedGame, FpsTelemetry};

pub fn collect_real_fps(active_game: Option<&DetectedGame>) -> FpsTelemetry {
    #[cfg(target_os = "windows")]
    {
        collect_windows_rtss_fps(active_game)
    }
    #[cfg(target_os = "linux")]
    {
        collect_linux_mangohud_fps(active_game)
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        FpsTelemetry {
            fps: None,
            frame_time_ms: None,
            source: "Unavailable".to_string(),
            active_game_pid: active_game.map(|g| g.pid),
            active_game_name: active_game.map(|g| g.name.clone()),
            available: false,
            required_integration: "Genuine FPS telemetry is supported via RTSS on Windows or MangoHud on Linux.".to_string(),
        }
    }
}

#[cfg(target_os = "linux")]
fn collect_linux_mangohud_fps(active_game: Option<&DetectedGame>) -> FpsTelemetry {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{Duration, SystemTime};

    let mangohud_loaded = active_game.map(|g| g.mangohud_active).unwrap_or(false);
    let mut search_dirs: Vec<PathBuf> = Vec::new();

    if let Ok(custom) = std::env::var("MANGOHUD_LOG") {
        if !custom.is_empty() {
            let p = PathBuf::from(custom);
            if p.is_dir() {
                search_dirs.push(p);
            } else if let Some(parent) = p.parent() {
                search_dirs.push(parent.to_path_buf());
            }
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        let h = PathBuf::from(home);
        search_dirs.push(h.join(".local").join("share").join("MangoHud"));
        search_dirs.push(h.join("MangoHud"));
        search_dirs.push(h.join("Documents").join("MangoHud"));
    }
    search_dirs.push(PathBuf::from("/tmp"));

    let now = SystemTime::now();
    let mut newest_csv: Option<(SystemTime, PathBuf)> = None;

    for dir in search_dirs {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("csv") {
                continue;
            }
            let fname = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            // MangoHud log filenames generally contain MangoHud or timestamped game prefix
            if !fname.contains("mangohud") && !dir.to_string_lossy().contains("MangoHud") {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                if let Ok(modified) = meta.modified() {
                    if now.duration_since(modified).unwrap_or(Duration::from_secs(999))
                        <= Duration::from_secs(6)
                    {
                        if newest_csv
                            .as_ref()
                            .map(|(t, _)| modified > *t)
                            .unwrap_or(true)
                        {
                            newest_csv = Some((modified, path));
                        }
                    }
                }
            }
        }
    }

    if let Some((_, csv_path)) = newest_csv {
        if let Ok(content) = fs::read_to_string(&csv_path) {
            let mut lines = content.lines().filter(|l| !l.trim().is_empty());
            // Find header row containing 'fps'
            let mut fps_idx: Option<usize> = None;
            let mut ft_idx: Option<usize> = None;
            let mut last_data_line: Option<&str> = None;

            for line in lines.by_ref() {
                let lower = line.to_ascii_lowercase();
                if lower.contains("fps") && lower.contains(',') {
                    for (idx, col) in lower.split(',').enumerate() {
                        let c = col.trim();
                        if c == "fps" {
                            fps_idx = Some(idx);
                        } else if c == "frametime" || c == "frame_time" {
                            ft_idx = Some(idx);
                        }
                    }
                    break;
                }
            }

            for line in lines {
                if line.contains(',') {
                    last_data_line = Some(line);
                }
            }

            if let (Some(fi), Some(row)) = (fps_idx, last_data_line) {
                let cols: Vec<&str> = row.split(',').map(|c| c.trim()).collect();
                if let Some(fps_val) = cols.get(fi).and_then(|v| v.parse::<f32>().ok()) {
                    if fps_val > 0.0 && fps_val < 2000.0 {
                        let ft_val = ft_idx
                            .and_then(|i| cols.get(i))
                            .and_then(|v| v.parse::<f32>().ok())
                            .or_else(|| Some((1000.0 / fps_val * 10.0).round() / 10.0));
                        return FpsTelemetry {
                            fps: Some((fps_val * 10.0).round() / 10.0),
                            frame_time_ms: ft_val,
                            source: "MangoHud Log".to_string(),
                            active_game_pid: active_game.map(|g| g.pid),
                            active_game_name: active_game.map(|g| g.name.clone()),
                            available: true,
                            required_integration: "MangoHud active".to_string(),
                        };
                    }
                }
            }
        }
    }

    FpsTelemetry {
        fps: None,
        frame_time_ms: None,
        source: if mangohud_loaded {
            "MangoHud (logging disabled)".to_string()
        } else {
            "Unavailable".to_string()
        },
        active_game_pid: active_game.map(|g| g.pid),
        active_game_name: active_game.map(|g| g.name.clone()),
        available: false,
        required_integration: if mangohud_loaded {
            "MangoHud is loaded in the game process, but CSV logging is inactive. Enable MangoHud output_file or toggle logging (Shift+F2) to export live FPS.".to_string()
        } else {
            "Requires MangoHud on Linux (launch game with `mangohud %command%` and logging enabled). SysMon Pro never fabricates FPS.".to_string()
        },
    }
}

#[cfg(target_os = "windows")]
fn collect_windows_rtss_fps(active_game: Option<&DetectedGame>) -> FpsTelemetry {
    use std::ffi::c_void;

    const FILE_MAP_READ: u32 = 0x0004;
    const RTSS_SIGNATURE: u32 = 0x5254_5353; // 'RTSS'

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct RtssSharedMemoryHeader {
        dw_signature: u32,
        dw_version: u32,
        dw_app_entry_size: u32,
        dw_app_arr_offset: u32,
        dw_app_arr_size: u32,
        dw_osd_entry_size: u32,
        dw_osd_arr_offset: u32,
        dw_osd_arr_size: u32,
        dw_osd_frame: u32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct RtssAppEntryPrefix {
        dw_process_id: u32,
        sz_name: [u8; 260],
        dw_flags: u32,
        dw_time0: u32,
        dw_time1: u32,
        dw_frames: u32,
        dw_frame_time: u32,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn OpenFileMappingW(dw_desired_access: u32, b_inherit_handle: i32, lp_name: *const u16) -> isize;
        fn MapViewOfFile(
            h_file_mapping_object: isize,
            dw_desired_access: u32,
            dw_file_offset_high: u32,
            dw_file_offset_low: u32,
            dw_number_of_bytes_to_map: usize,
        ) -> *const c_void;
        fn UnmapViewOfFile(lp_base_address: *const c_void) -> i32;
        fn CloseHandle(h_object: isize) -> i32;
    }

    let mapping_name: Vec<u16> = "RTSSSharedMemoryV2\0".encode_utf16().collect();
    let handle = unsafe { OpenFileMappingW(FILE_MAP_READ, 0, mapping_name.as_ptr()) };

    if handle == 0 {
        return FpsTelemetry {
            fps: None,
            frame_time_ms: None,
            source: "Unavailable".to_string(),
            active_game_pid: active_game.map(|g| g.pid),
            active_game_name: active_game.map(|g| g.name.clone()),
            available: false,
            required_integration: "Requires RivaTuner Statistics Server (RTSS) running on Windows for live FPS telemetry. SysMon Pro never fabricates FPS.".to_string(),
        };
    }

    let base_ptr = unsafe { MapViewOfFile(handle, FILE_MAP_READ, 0, 0, 0) };
    if base_ptr.is_null() {
        unsafe { CloseHandle(handle) };
        return FpsTelemetry {
            fps: None,
            frame_time_ms: None,
            source: "Unavailable".to_string(),
            active_game_pid: active_game.map(|g| g.pid),
            active_game_name: active_game.map(|g| g.name.clone()),
            available: false,
            required_integration: "Unable to map RTSS shared memory.".to_string(),
        };
    }

    let result = unsafe {
        let header = *(base_ptr as *const RtssSharedMemoryHeader);
        if header.dw_signature != RTSS_SIGNATURE || header.dw_app_entry_size < std::mem::size_of::<RtssAppEntryPrefix>() as u32 {
            None
        } else {
            let count = header.dw_app_arr_size.min(64) as usize;
            let mut matched_fps: Option<(u32, f32, f32)> = None;

            for i in 0..count {
                let offset = header.dw_app_arr_offset as usize + i * header.dw_app_entry_size as usize;
                let entry_ptr = (base_ptr as *const u8).add(offset) as *const RtssAppEntryPrefix;
                let entry = *entry_ptr;
                if entry.dw_process_id == 0 {
                    continue;
                }

                let target_match = active_game
                    .map(|g| g.pid == entry.dw_process_id)
                    .unwrap_or(true);

                let fps = if entry.dw_frame_time > 0 && entry.dw_frame_time < 5_000_000 {
                    Some(1_000_000.0_f32 / entry.dw_frame_time as f32)
                } else if entry.dw_time1 > entry.dw_time0 && entry.dw_frames > 0 {
                    let dt = (entry.dw_time1 - entry.dw_time0) as f32;
                    Some((entry.dw_frames as f32 * 1000.0) / dt)
                } else {
                    None
                };

                if let Some(fps_val) = fps {
                    if fps_val > 0.0 && fps_val < 2000.0 {
                        let ft_ms = if entry.dw_frame_time > 0 {
                            entry.dw_frame_time as f32 / 1000.0
                        } else {
                            1000.0 / fps_val
                        };
                        if target_match {
                            matched_fps = Some((entry.dw_process_id, fps_val, ft_ms));
                            break;
                        } else if matched_fps.is_none() {
                            matched_fps = Some((entry.dw_process_id, fps_val, ft_ms));
                        }
                    }
                }
            }
            matched_fps
        }
    };

    unsafe {
        UnmapViewOfFile(base_ptr);
        CloseHandle(handle);
    }

    if let Some((pid, fps_val, ft_ms)) = result {
        FpsTelemetry {
            fps: Some((fps_val * 10.0).round() / 10.0),
            frame_time_ms: Some((ft_ms * 10.0).round() / 10.0),
            source: "RTSS Shared Memory".to_string(),
            active_game_pid: Some(pid),
            active_game_name: active_game.map(|g| g.name.clone()),
            available: true,
            required_integration: "RTSS active".to_string(),
        }
    } else {
        FpsTelemetry {
            fps: None,
            frame_time_ms: None,
            source: "RTSS (No Active 3D Hook)".to_string(),
            active_game_pid: active_game.map(|g| g.pid),
            active_game_name: active_game.map(|g| g.name.clone()),
            available: false,
            required_integration: "RTSS is installed/running, waiting for an active DirectX/Vulkan/OpenGL frame hook.".to_string(),
        }
    }
}
