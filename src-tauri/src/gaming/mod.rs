pub mod detector;
pub mod fps;

use crate::desktop::models::{DetectedGame, FpsTelemetry, GamingConfig, GamingStatus};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use sysinfo::System;

struct GamingInner {
    manual_override: Option<bool>,
    detected_games: Vec<DetectedGame>,
    active_game: Option<DetectedGame>,
    last_active: bool,
    last_auto_activated: bool,
    last_latency_ms: Option<f32>,
    last_latency_check: Option<Instant>,
}

pub struct GamingManager {
    inner: Mutex<GamingInner>,
}

impl GamingManager {
    pub fn new(initial_enabled: bool) -> Self {
        Self {
            inner: Mutex::new(GamingInner {
                manual_override: if initial_enabled { Some(true) } else { None },
                detected_games: Vec::new(),
                active_game: None,
                last_active: initial_enabled,
                last_auto_activated: false,
                last_latency_ms: None,
                last_latency_check: None,
            }),
        }
    }

    pub fn is_active(&self) -> bool {
        self.inner.lock().unwrap().last_active
    }

    pub fn set_manual(&self, enabled: bool) -> bool {
        let mut inner = self.inner.lock().unwrap();
        inner.manual_override = Some(enabled);
        inner.last_active = enabled;
        inner.last_auto_activated = false;
        enabled
    }

    pub fn clear_manual_to_auto(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.manual_override = None;
    }

    pub fn toggle_manual(&self) -> bool {
        let mut inner = self.inner.lock().unwrap();
        let next = !inner.last_active;
        inner.manual_override = Some(next);
        inner.last_active = next;
        inner.last_auto_activated = false;
        next
    }

    pub fn evaluate(
        &self,
        sys: &System,
        cfg: &GamingConfig,
        manual_only_startup: bool,
    ) -> (GamingStatus, FpsTelemetry, Option<f32>) {
        let detected = detector::detect_running_games(sys, cfg);
        let active_candidate = detected.iter().find(|g| !g.is_excluded).cloned();

        let (active, auto_activated) = {
            let mut inner = self.inner.lock().unwrap();
            inner.detected_games = detected.clone();
            inner.active_game = active_candidate.clone();

            let auto_allowed = cfg.auto_detect && !manual_only_startup;
            let (is_active, is_auto) = match inner.manual_override {
                Some(true) => (true, false),
                Some(false) => {
                    // Respect manual turn-off until all games exit so user isn't forced back in
                    if active_candidate.is_none() {
                        inner.manual_override = None;
                    }
                    (false, false)
                }
                None => {
                    if auto_allowed && active_candidate.is_some() {
                        (true, true)
                    } else {
                        (cfg.enabled, false)
                    }
                }
            };

            inner.last_active = is_active;
            inner.last_auto_activated = is_auto;
            (is_active, is_auto)
        };

        let fps = fps::collect_real_fps(active_candidate.as_ref());

        // Throttled latency check only while Gaming Mode is active and net_latency metric is requested
        let should_probe_latency =
            active && cfg.metrics.iter().any(|m| m == "net_latency") && !cfg.latency_target.trim().is_empty();

        let latency_ms = if should_probe_latency {
            let needs_refresh = {
                let inner = self.inner.lock().unwrap();
                inner
                    .last_latency_check
                    .map(|t| t.elapsed() >= Duration::from_secs(3))
                    .unwrap_or(true)
            };
            if needs_refresh {
                let measured = probe_tcp_latency(cfg.latency_target.trim());
                let mut inner = self.inner.lock().unwrap();
                inner.last_latency_check = Some(Instant::now());
                inner.last_latency_ms = measured;
                measured
            } else {
                self.inner.lock().unwrap().last_latency_ms
            }
        } else {
            None
        };

        (
            GamingStatus {
                active,
                auto_activated,
                detected_games: detected,
                active_game: active_candidate,
            },
            fps,
            latency_ms,
        )
    }
}

fn probe_tcp_latency(target: &str) -> Option<f32> {
    use std::net::{TcpStream, ToSocketAddrs};
    let addr_str = if target.contains(':') {
        target.to_string()
    } else {
        format!("{}:443", target)
    };
    let addr = addr_str.to_socket_addrs().ok()?.next()?;
    let start = Instant::now();
    if TcpStream::connect_timeout(&addr, Duration::from_millis(900)).is_ok() {
        let ms = start.elapsed().as_secs_f32() * 1000.0;
        Some((ms * 10.0).round() / 10.0)
    } else {
        None
    }
}
