import { useEffect } from 'react';
import { isTauriEnvironment, listenToTauriStream } from '../services/tauriBridge';
import { systemMonitorService } from '../services/systemMonitor';
import { useSystemStore } from '../store/systemStore';
import { useDesktopStore } from '../stores/desktop-store';
import { useGamingStore } from '../stores/gaming-store';
import { DesktopConfig, DesktopTelemetryPayload } from '../types/desktop';
import { applyThemeAndAppearance } from '../utils/theme';

export function useDesktopExperienceSync(isSecondaryWindow: boolean = false) {
  const fetchDesktopState = useDesktopStore((s) => s.fetchDesktopState);
  const applyTelemetryPayload = useDesktopStore((s) => s.applyTelemetryPayload);
  const applyConfigLocally = useDesktopStore((s) => s.applyConfigLocally);
  const applyGamingStatus = useGamingStore((s) => s.applyGamingStatus);
  const applyOverview = useSystemStore((s) => s.applyOverview);
  const setPage = useSystemStore((s) => s.setPage);
  const themeMode = useDesktopStore((s) => s.config.appearance.theme);
  const appearance = useDesktopStore((s) => s.config.appearance);

  useEffect(() => {
    void fetchDesktopState();
    if (isSecondaryWindow && !isTauriEnvironment()) {
      void useSystemStore.getState().fetchTick();
    }
  }, [fetchDesktopState, isSecondaryWindow]);

  useEffect(() => {
    applyThemeAndAppearance(appearance);
  }, [appearance]);

  // Follow OS dark/light preference dynamically when theme === 'system'
  useEffect(() => {
    if (themeMode !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeAndAppearance(useDesktopStore.getState().config.appearance);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themeMode]);

  useEffect(() => {
    let mounted = true;
    const unlisteners: Array<() => void> = [];

    if (isTauriEnvironment()) {
      void (async () => {
        const u1 = await listenToTauriStream<DesktopTelemetryPayload>(
          'desktop_telemetry_stream',
          (payload) => {
            if (!mounted) return;
            applyTelemetryPayload(payload);
            applyGamingStatus(payload.gaming);
            if (isSecondaryWindow) {
              applyOverview(payload.overview);
            }
          }
        );
        const u2 = await listenToTauriStream<DesktopConfig>('desktop_config_updated', (cfg) => {
          if (!mounted) return;
          applyConfigLocally(cfg);
        });
        const u3 = await listenToTauriStream<boolean>('monitoring_state_changed', (enabled) => {
          if (!mounted) return;
          useDesktopStore.setState({ monitoringActive: enabled });
        });
        const u4 = await listenToTauriStream<string>('navigate_to_page', (page) => {
          if (!mounted) return;
          if (page === 'desktop' || page === 'settings' || page === 'overview') {
            setPage(page);
          }
        });
        unlisteners.push(u1, u2, u3, u4);
      })();
    } else {
      // Browser / Express preview sync loop
      const pollDesktop = async () => {
        if (!mounted) return;
        await fetchDesktopState();
        if (isSecondaryWindow) {
          try {
            const ov = await systemMonitorService.getSystemOverview();
            if (mounted) applyOverview(ov);
          } catch {
            // ignore
          }
        }
      };
      const timer = window.setInterval(pollDesktop, 2000);
      unlisteners.push(() => window.clearInterval(timer));
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'sysmon_desktop_config_v1' && e.newValue) {
        try {
          applyConfigLocally(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      mounted = false;
      window.removeEventListener('storage', onStorage);
      for (const fn of unlisteners) {
        fn();
      }
    };
  }, [
    applyConfigLocally,
    applyGamingStatus,
    applyOverview,
    applyTelemetryPayload,
    fetchDesktopState,
    isSecondaryWindow,
    setPage,
  ]);
}
