use crate::desktop::models::{DetectedGame, GamingConfig};
use sysinfo::{Pid, Process, System};

const EXCLUDED_NON_GAMES: &[&str] = &[
    "chrome",
    "chromium",
    "firefox",
    "brave",
    "edge",
    "msedge",
    "opera",
    "vivaldi",
    "code",
    "code-insiders",
    "cursor",
    "windsurf",
    "idea",
    "clion",
    "rustrover",
    "webstorm",
    "pycharm",
    "bash",
    "zsh",
    "fish",
    "sh",
    "dash",
    "pwsh",
    "powershell",
    "cmd.exe",
    "conhost.exe",
    "windowsterminal",
    "alacritty",
    "kitty",
    "wezterm",
    "gnome-terminal",
    "konsole",
    "xterm",
    "discord",
    "slack",
    "teams",
    "zoom",
    "spotify",
    "vlc",
    "obs",
    "obs64",
    "steamwebhelper",
    "steamservice",
    "epicwebhelper",
    "eadesktop",
    "battle.net",
    "sysmon",
    "sysmon-pro",
    "sysmon-desktop",
    "explorer.exe",
    "dwm.exe",
    "svchost.exe",
    "systemd",
    "gnome-shell",
    "plasmashell",
    "kwin",
    "xorg",
    "xwayland",
    "node",
    "vite",
    "rustc",
    "cargo",
];

const KNOWN_GAME_EXECUTABLES: &[&str] = &[
    "cs2",
    "dota2",
    "hl2",
    "tf_linux64",
    "portal2_linux",
    "factorio",
    "stardewvalley",
    "terraria",
    "minecraft",
    "javaw",
    "blender-launcher",
    "cyberpunk2077.exe",
    "eldenring.exe",
    "valorant-win64-shipping.exe",
    "fortniteclient-win64-shipping.exe",
    "overwatch.exe",
    "apex_dx12.exe",
    "r5apex.exe",
    "witcher3.exe",
    "bg3.exe",
    "bg3_dx11.exe",
    "helldivers2.exe",
    "gta5.exe",
    "rdr2.exe",
    "starfield.exe",
    "doom",
    "doometernalx64vk.exe",
    "hl.exe",
    "rocketleague.exe",
    "leagueoflegends.exe",
    "genshinimpact.exe",
    "warframe.x64.exe",
    "destiny2.exe",
    "poe.exe",
    "pathofexile.exe",
    "wow.exe",
    "ffxiv_dx11.exe",
    "supertuxkart",
    "xonotic",
    "0ad",
    "wesnoth",
];

fn normalize_name(s: &str) -> String {
    s.trim()
        .to_ascii_lowercase()
        .trim_end_matches(".exe")
        .to_string()
}

fn is_non_game_process(name_lower: &str, exe_lower: &str) -> bool {
    let bare = normalize_name(name_lower);
    if EXCLUDED_NON_GAMES
        .iter()
        .any(|ex| bare == *ex || name_lower == *ex)
    {
        return true;
    }
    if exe_lower.contains("/usr/lib/systemd")
        || exe_lower.contains("/usr/libexec/")
        || exe_lower.contains("\\windows\\system32\\")
        || exe_lower.contains("crashhandler")
        || exe_lower.contains("updater")
        || exe_lower.contains("webhelper")
        || exe_lower.contains("launcher") && !exe_lower.contains("minecraft")
    {
        return true;
    }
    false
}

#[cfg(target_os = "linux")]
fn inspect_linux_game_signals(pid: u32) -> (bool, bool) {
    let mut has_steam_env = false;
    let mut has_mangohud = false;

    if let Ok(env_bytes) = std::fs::read(format!("/proc/{}/environ", pid)) {
        for chunk in env_bytes.split(|&b| b == 0) {
            if let Ok(s) = std::str::from_utf8(chunk) {
                if s.starts_with("SteamGameId=")
                    || s.starts_with("SteamAppId=")
                    || s.starts_with("STEAM_COMPAT_APP_ID=")
                    || s.starts_with("LUTRIS_GAME_UUID=")
                {
                    if let Some((_, val)) = s.split_once('=') {
                        if !val.is_empty() && val != "0" {
                            has_steam_env = true;
                            break;
                        }
                    }
                }
            }
        }
    }

    if let Ok(maps) = std::fs::read_to_string(format!("/proc/{}/maps", pid)) {
        if maps.contains("libMangoHud") || maps.contains("mangohud") {
            has_mangohud = true;
        }
    }

    (has_steam_env, has_mangohud)
}

#[cfg(not(target_os = "linux"))]
fn inspect_linux_game_signals(_pid: u32) -> (bool, bool) {
    (false, false)
}

fn evaluate_process(pid: Pid, proc_item: &Process, cfg: &GamingConfig) -> Option<DetectedGame> {
    let name = proc_item.name().to_string();
    let name_lower = name.to_ascii_lowercase();
    let exe_path = proc_item
        .exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| name.clone());
    let exe_lower = exe_path.to_ascii_lowercase().replace('\\', "/");
    let cmd_joined = proc_item.cmd().join(" ").to_ascii_lowercase().replace('\\', "/");

    if is_non_game_process(&name_lower, &exe_lower) {
        return None;
    }

    let bare = normalize_name(&name_lower);
    let is_excluded = cfg.exclusions.iter().any(|ex| {
        let ex_l = normalize_name(ex);
        !ex_l.is_empty() && (bare == ex_l || name_lower.contains(&ex_l) || exe_lower.contains(&ex_l))
    });

    // Check custom user games first
    let is_custom = cfg.custom_games.iter().any(|custom| {
        let c = normalize_name(custom);
        !c.is_empty() && (bare == c || name_lower.contains(&c) || exe_lower.contains(&c))
    });
    if is_custom {
        return Some(DetectedGame {
            pid: pid.as_u32(),
            name,
            executable_path: exe_path,
            detection_source: "Custom Game List".to_string(),
            is_excluded,
            mangohud_active: false,
        });
    }

    // Ignore main Proton/Steam runtime wrapper binaries if child game binary is already tracked,
    // except wine64-preloader when wrapping a .exe game
    if name_lower == "steam" || name_lower == "steam.exe" || name_lower == "pressure-vessel-wrap" {
        return None;
    }

    let mut source: Option<String> = None;

    if exe_lower.contains("steamapps/common/") || cmd_joined.contains("steamapps/common/") {
        source = Some("Steam Library".to_string());
    } else if exe_lower.contains("/epic games/") || exe_lower.contains("/heroic/") {
        source = Some("Epic / Heroic".to_string());
    } else if exe_lower.contains("/gog games/") || exe_lower.contains("/lutris/") {
        source = Some("GOG / Lutris".to_string());
    } else if exe_lower.contains("/riot games/") || exe_lower.contains("/xboxgames/") {
        source = Some("PC Game Launcher".to_string());
    } else if cmd_joined.contains("proton") && (cmd_joined.contains(".exe") || exe_lower.contains("wine")) {
        source = Some("Proton / Wine".to_string());
    } else if KNOWN_GAME_EXECUTABLES.iter().any(|g| bare == normalize_name(g) || name_lower == *g) {
        source = Some("Known Game Signature".to_string());
    }

    let (has_steam_env, mangohud_active) = if source.is_some() || cfg!(target_os = "linux") {
        // Only inspect /proc/<pid> on Linux for candidate processes with non-trivial CPU or GPU usage or matched path
        if source.is_some() || proc_item.cpu_usage() > 4.0 || proc_item.memory() > 250 * 1024 * 1024 {
            inspect_linux_game_signals(pid.as_u32())
        } else {
            (false, false)
        }
    } else {
        (false, false)
    };

    if source.is_none() {
        if mangohud_active {
            source = Some("MangoHud Hook".to_string());
        } else if has_steam_env {
            source = Some("Steam App Environment".to_string());
        }
    }

    source.map(|detection_source| DetectedGame {
        pid: pid.as_u32(),
        name,
        executable_path: exe_path,
        detection_source,
        is_excluded,
        mangohud_active,
    })
}

pub fn detect_running_games(sys: &System, cfg: &GamingConfig) -> Vec<DetectedGame> {
    let mut games: Vec<DetectedGame> = sys
        .processes()
        .iter()
        .filter_map(|(pid, proc_item)| evaluate_process(*pid, proc_item, cfg))
        .collect();

    games.sort_by(|a, b| {
        a.is_excluded
            .cmp(&b.is_excluded)
            .then_with(|| b.mangohud_active.cmp(&a.mangohud_active))
            .then_with(|| a.name.cmp(&b.name))
    });
    games.truncate(12);
    games
}
