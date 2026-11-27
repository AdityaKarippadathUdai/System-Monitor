use crate::models::SystemOverview;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetConfig {
    pub enabled: bool,
    pub visible: bool,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub opacity: f32,
    pub always_on_top: bool,
    pub click_through: bool,
    pub show_border: bool,
    pub background_blur: bool,
    pub layout_mode: String, // "compact" | "detailed" | "minimal"
    pub size_preset: String, // "small" | "medium" | "large" | "custom"
    pub show_pinned_section: bool,
    pub metrics: Vec<String>,
}

impl Default for WidgetConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            visible: false,
            x: 36,
            y: 48,
            width: 310,
            height: 360,
            opacity: 0.86,
            always_on_top: true,
            click_through: false,
            show_border: true,
            background_blur: true,
            layout_mode: "detailed".to_string(),
            size_preset: "medium".to_string(),
            show_pinned_section: true,
            metrics: vec![
                "cpu_usage".to_string(),
                "cpu_temp".to_string(),
                "gpu_usage".to_string(),
                "gpu_temp".to_string(),
                "ram_usage".to_string(),
                "vram_usage".to_string(),
                "net_down".to_string(),
                "net_up".to_string(),
                "battery".to_string(),
                "fps".to_string(),
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayConfig {
    pub enabled: bool,
    pub visible: bool,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub opacity: f32,
    pub always_on_top: bool,
    pub click_through: bool,
    pub show_border: bool,
    pub background_blur: bool,
    pub position_preset: String, // "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom"
    pub metrics: Vec<String>,
}

impl Default for OverlayConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            visible: false,
            x: 24,
            y: 24,
            width: 420,
            height: 76,
            opacity: 0.80,
            always_on_top: true,
            click_through: true,
            show_border: true,
            background_blur: true,
            position_preset: "top-right".to_string(),
            metrics: vec![
                "cpu_usage".to_string(),
                "cpu_temp".to_string(),
                "gpu_usage".to_string(),
                "gpu_temp".to_string(),
                "ram_usage".to_string(),
                "net_down".to_string(),
                "net_up".to_string(),
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayConfig {
    pub enabled: bool,
    pub minimize_to_tray_on_close: bool,
    pub show_tooltip_metrics: bool,
    pub start_minimized: bool,
}

impl Default for TrayConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            minimize_to_tray_on_close: true,
            show_tooltip_metrics: true,
            start_minimized: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundMonitoringConfig {
    pub enabled: bool,
    pub interval_ms: u64, // 500 | 1000 | 2000 | 5000 | 10000
    pub pause_when_all_hidden: bool,
}

impl Default for BackgroundMonitoringConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            interval_ms: 1000,
            pause_when_all_hidden: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupConfig {
    pub launch_at_login: bool,
    pub start_minimized: bool,
    pub start_floating_widget: bool,
    pub start_background_monitoring: bool,
    pub manual_gaming_mode_only: bool,
}

impl Default for StartupConfig {
    fn default() -> Self {
        Self {
            launch_at_login: false,
            start_minimized: false,
            start_floating_widget: false,
            start_background_monitoring: true,
            manual_gaming_mode_only: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricColorsConfig {
    pub cpu: String,
    pub gpu: String,
    pub memory: String,
    pub network: String,
    pub battery: String,
    pub fps: String,
}

impl Default for MetricColorsConfig {
    fn default() -> Self {
        Self {
            cpu: "#3B82F6".to_string(),
            gpu: "#06B6D4".to_string(),
            memory: "#10B981".to_string(),
            network: "#EC4899".to_string(),
            battery: "#F59E0B".to_string(),
            fps: "#22C55E".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceConfig {
    pub theme: String, // "dark" | "light" | "system"
    pub accent_color: String,
    pub widget_opacity: f32,
    pub widget_border: bool,
    pub corner_radius: u32,
    pub font_size: String, // "sm" | "md" | "lg"
    pub density: String,   // "compact" | "comfortable"
    pub background_blur: bool,
    pub metric_colors: MetricColorsConfig,
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            accent_color: "#3B82F6".to_string(),
            widget_opacity: 0.86,
            widget_border: true,
            corner_radius: 10,
            font_size: "md".to_string(),
            density: "comfortable".to_string(),
            background_blur: true,
            metric_colors: MetricColorsConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutConfig {
    pub toggle_dashboard: String,
    pub toggle_widget: String,
    pub toggle_gaming_mode: String,
    pub toggle_overlay: String,
    pub toggle_click_through: String,
}

impl Default for ShortcutConfig {
    fn default() -> Self {
        Self {
            toggle_dashboard: "Ctrl+Shift+M".to_string(),
            toggle_widget: "Ctrl+Shift+W".to_string(),
            toggle_gaming_mode: "Ctrl+Shift+G".to_string(),
            toggle_overlay: "Ctrl+Shift+O".to_string(),
            toggle_click_through: "Ctrl+Shift+L".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameOverlayPreference {
    pub enabled: bool,
    pub compact_mode: Option<bool>,
    pub position_preset: Option<String>,
    pub metrics: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamingConfig {
    pub enabled: bool,
    pub auto_detect: bool,
    pub position_preset: String, // "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom"
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub opacity: f32,
    pub compact_mode: bool,
    pub refresh_interval_ms: u64,
    pub always_on_top: bool,
    pub click_through: bool,
    pub metrics: Vec<String>,
    pub latency_target: String,
    pub exclusions: Vec<String>,
    pub custom_games: Vec<String>,
    pub per_game_overrides: HashMap<String, GameOverlayPreference>,
}

impl Default for GamingConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            auto_detect: true,
            position_preset: "top-left".to_string(),
            x: 20,
            y: 20,
            width: 280,
            height: 220,
            opacity: 0.78,
            compact_mode: false,
            refresh_interval_ms: 1000,
            always_on_top: true,
            click_through: true,
            metrics: vec![
                "fps".to_string(),
                "cpu_usage".to_string(),
                "cpu_temp".to_string(),
                "gpu_usage".to_string(),
                "gpu_temp".to_string(),
                "ram_usage".to_string(),
                "vram_usage".to_string(),
                "gpu_power".to_string(),
                "net_latency".to_string(),
            ],
            latency_target: "1.1.1.1".to_string(),
            exclusions: vec![],
            custom_games: vec![],
            per_game_overrides: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedMetricConfig {
    pub id: String,
    pub metric: String,
    pub label: String,
    pub display_format: String, // "percent" | "absolute" | "combined"
    pub warning_threshold: Option<f32>,
    pub critical_threshold: Option<f32>,
    pub compact: bool,
}

pub fn default_pinned_metrics() -> Vec<PinnedMetricConfig> {
    vec![
        PinnedMetricConfig {
            id: "pin-cpu-temp".to_string(),
            metric: "cpu_temp".to_string(),
            label: "CPU Temp".to_string(),
            display_format: "absolute".to_string(),
            warning_threshold: Some(75.0),
            critical_threshold: Some(90.0),
            compact: true,
        },
        PinnedMetricConfig {
            id: "pin-gpu-temp".to_string(),
            metric: "gpu_temp".to_string(),
            label: "GPU Temp".to_string(),
            display_format: "absolute".to_string(),
            warning_threshold: Some(78.0),
            critical_threshold: Some(88.0),
            compact: true,
        },
        PinnedMetricConfig {
            id: "pin-ram".to_string(),
            metric: "ram_usage".to_string(),
            label: "RAM".to_string(),
            display_format: "combined".to_string(),
            warning_threshold: Some(80.0),
            critical_threshold: Some(92.0),
            compact: true,
        },
        PinnedMetricConfig {
            id: "pin-net-dl".to_string(),
            metric: "net_down".to_string(),
            label: "Net Down".to_string(),
            display_format: "absolute".to_string(),
            warning_threshold: None,
            critical_threshold: None,
            compact: true,
        },
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopConfig {
    pub widget: WidgetConfig,
    pub overlay: OverlayConfig,
    pub tray: TrayConfig,
    pub background: BackgroundMonitoringConfig,
    pub startup: StartupConfig,
    pub appearance: AppearanceConfig,
    pub shortcuts: ShortcutConfig,
    pub gaming: GamingConfig,
    pub pinned_metrics: Vec<PinnedMetricConfig>,
}

impl Default for DesktopConfig {
    fn default() -> Self {
        Self {
            widget: WidgetConfig::default(),
            overlay: OverlayConfig::default(),
            tray: TrayConfig::default(),
            background: BackgroundMonitoringConfig::default(),
            startup: StartupConfig::default(),
            appearance: AppearanceConfig::default(),
            shortcuts: ShortcutConfig::default(),
            gaming: GamingConfig::default(),
            pinned_metrics: default_pinned_metrics(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryStats {
    pub percent: f32,
    pub is_charging: bool,
    pub ac_online: bool,
    pub state: String,
    pub time_remaining_secs: Option<u64>,
    pub power_watts: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FpsTelemetry {
    pub fps: Option<f32>,
    pub frame_time_ms: Option<f32>,
    pub source: String,
    pub active_game_pid: Option<u32>,
    pub active_game_name: Option<String>,
    pub available: bool,
    pub required_integration: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedGame {
    pub pid: u32,
    pub name: String,
    pub executable_path: String,
    pub detection_source: String,
    pub is_excluded: bool,
    pub mangohud_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamingStatus {
    pub active: bool,
    pub auto_activated: bool,
    pub detected_games: Vec<DetectedGame>,
    pub active_game: Option<DetectedGame>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPlatformCapabilities {
    pub platform: String,
    pub display_server: String,
    pub desktop_environment: String,
    pub transparency_supported: bool,
    pub blur_supported: bool,
    pub click_through_supported: bool,
    pub always_on_top_supported: bool,
    pub positioning_supported: bool,
    pub global_shortcuts_supported: bool,
    pub tray_supported: bool,
    pub limitations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopTelemetryPayload {
    pub overview: SystemOverview,
    pub battery: Option<BatteryStats>,
    pub fps: FpsTelemetry,
    pub gaming: GamingStatus,
    pub latency_ms: Option<f32>,
    pub config: DesktopConfig,
    pub capabilities: DesktopPlatformCapabilities,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutStatus {
    pub registered: Vec<String>,
    pub failed: Vec<String>,
    pub global_supported: bool,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupStatus {
    pub enabled: bool,
    pub mechanism: String,
    pub entry_path: String,
    pub note: String,
}

pub fn resolve_desktop_config_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .or_else(|| std::env::var_os("LOCALAPPDATA"))
            .map(|dir| PathBuf::from(dir).join("sysmon-pro").join("desktop_config.json"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")))
            .map(|dir| dir.join("sysmon-pro").join("desktop_config.json"))
    }
}

pub fn load_desktop_config() -> DesktopConfig {
    let Some(path) = resolve_desktop_config_path() else {
        return DesktopConfig::default();
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        return DesktopConfig::default();
    };
    serde_json::from_str::<DesktopConfig>(&raw).unwrap_or_default()
}

pub fn save_desktop_config(config: &DesktopConfig) {
    let Some(path) = resolve_desktop_config_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(config) {
        let tmp = path.with_extension("json.tmp");
        if fs::write(&tmp, json).is_ok() {
            let _ = fs::rename(&tmp, &path);
        }
    }
}
