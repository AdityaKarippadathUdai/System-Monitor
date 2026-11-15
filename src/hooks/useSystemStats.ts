import { useEffect, useRef } from 'react';
import { useSystemStore } from '../store/systemStore';
import { systemMonitorService } from '../services/systemMonitor';

export function useSystemStats() {
  const {
    overview,
    metricHistory,
    isLoading,
    isPaused,
    lastUpdated,
    settings,
    applyOverview,
    fetchTick,
    fetchProcessesOnly,
    togglePause,
    setRefreshInterval,
  } = useSystemStore();

  const intervalRef = useRef<number | null>(null);

  // Initial fetch & Tauri stream subscription
  useEffect(() => {
    void systemMonitorService.setPollingInterval(settings.refreshInterval);
    void fetchTick();

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    if (systemMonitorService.isTauriAvailable()) {
      systemMonitorService
        .subscribeToOverviewStream((streamOverview) => {
          if (!cancelled) {
            applyOverview(streamOverview);
          }
        })
        .then((fn) => {
          if (cancelled) {
            fn();
          } else {
            unlisten = fn;
          }
        })
        .catch(() => {
          // fallback to interval polling
        });
    }

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [fetchTick, applyOverview]);

  // Periodic timer: in Tauri mode, stream handles overview while timer refreshes process list; in Web mode, polls both.
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isPaused) {
      const isTauri = systemMonitorService.isTauriAvailable();
      // In Tauri mode, keep process polling at >= 1000ms to keep CPU overhead minimal even in 250ms Turbo mode
      const procInterval = isTauri ? Math.max(1000, settings.refreshInterval) : settings.refreshInterval;

      intervalRef.current = window.setInterval(() => {
        if (isTauri) {
          void fetchProcessesOnly();
        } else {
          void fetchTick();
        }
      }, procInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPaused, settings.refreshInterval, fetchTick, fetchProcessesOnly]);

  return {
    overview,
    metricHistory,
    isLoading,
    isPaused,
    lastUpdated,
    settings,
    togglePause,
    setRefreshInterval,
  };
}
