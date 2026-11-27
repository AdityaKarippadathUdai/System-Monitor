import { useDesktopStore } from '../stores/desktop-store';
import { useGamingStore } from '../stores/gaming-store';

export function useGamingMode() {
  const status = useGamingStore((s) => s.status);
  const toggleGamingMode = useGamingStore((s) => s.toggleGamingMode);
  const enableAutoDetectMode = useGamingStore((s) => s.enableAutoDetectMode);
  const addExclusion = useGamingStore((s) => s.addExclusion);
  const removeExclusion = useGamingStore((s) => s.removeExclusion);
  const addCustomGame = useGamingStore((s) => s.addCustomGame);
  const removeCustomGame = useGamingStore((s) => s.removeCustomGame);
  const setGameOverride = useGamingStore((s) => s.setGameOverride);

  const gamingConfig = useDesktopStore((s) => s.config.gaming);
  const fps = useDesktopStore((s) => s.fps);
  const latencyMs = useDesktopStore((s) => s.latencyMs);

  return {
    status,
    config: gamingConfig,
    fps,
    latencyMs,
    isActive: status.active || gamingConfig.enabled,
    toggleGamingMode,
    enableAutoDetectMode,
    addExclusion,
    removeExclusion,
    addCustomGame,
    removeCustomGame,
    setGameOverride,
  };
}
