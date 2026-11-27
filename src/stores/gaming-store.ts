import { create } from 'zustand';
import { DesktopConfig, GameOverlayPreference, GamingStatus } from '../types/desktop';
import { invokeTauriCommand, isTauriEnvironment } from '../services/tauriBridge';
import { useDesktopStore } from './desktop-store';

interface GamingState {
  status: GamingStatus;
  applyGamingStatus: (status: GamingStatus) => void;
  toggleGamingMode: (enabled?: boolean) => Promise<void>;
  enableAutoDetectMode: () => Promise<void>;
  addExclusion: (name: string) => Promise<void>;
  removeExclusion: (name: string) => Promise<void>;
  addCustomGame: (name: string) => Promise<void>;
  removeCustomGame: (name: string) => Promise<void>;
  setGameOverride: (gameName: string, pref: GameOverlayPreference) => Promise<void>;
}

export const useGamingStore = create<GamingState>((set) => ({
  status: {
    active: false,
    autoActivated: false,
    detectedGames: [],
    activeGame: null,
  },

  applyGamingStatus: (status) => set({ status }),

  toggleGamingMode: async (enabled) => {
    const desktopStore = useDesktopStore.getState();
    const target = enabled ?? !desktopStore.config.gaming.enabled;

    if (isTauriEnvironment()) {
      try {
        const updated = await invokeTauriCommand<DesktopConfig>('toggle_gaming_mode', {
          enabled: target,
          useAuto: false,
        });
        desktopStore.applyConfigLocally(updated);
        set((state) => ({
          status: { ...state.status, active: target, autoActivated: false },
        }));
        return;
      } catch {
        // fallback
      }
    }

    await desktopStore.patchConfig((prev) => ({
      ...prev,
      gaming: { ...prev.gaming, enabled: target },
    }));
    set((state) => ({
      status: { ...state.status, active: target, autoActivated: false },
    }));
  },

  enableAutoDetectMode: async () => {
    const desktopStore = useDesktopStore.getState();
    if (isTauriEnvironment()) {
      try {
        const updated = await invokeTauriCommand<DesktopConfig>('toggle_gaming_mode', {
          enabled: null,
          useAuto: true,
        });
        desktopStore.applyConfigLocally(updated);
        return;
      } catch {
        // fallback
      }
    }
    await desktopStore.patchConfig((prev) => ({
      ...prev,
      gaming: { ...prev.gaming, enabled: false, autoDetect: true },
    }));
  },

  addExclusion: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const desktopStore = useDesktopStore.getState();
    if (isTauriEnvironment()) {
      try {
        const updated = await invokeTauriCommand<DesktopConfig>('add_game_exclusion', {
          name: trimmed,
        });
        desktopStore.applyConfigLocally(updated);
        return;
      } catch {
        // fallback
      }
    }
    await desktopStore.patchConfig((prev) => {
      if (prev.gaming.exclusions.some((e) => e.toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      return {
        ...prev,
        gaming: { ...prev.gaming, exclusions: [...prev.gaming.exclusions, trimmed] },
      };
    });
  },

  removeExclusion: async (name) => {
    const desktopStore = useDesktopStore.getState();
    if (isTauriEnvironment()) {
      try {
        const updated = await invokeTauriCommand<DesktopConfig>('remove_game_exclusion', { name });
        desktopStore.applyConfigLocally(updated);
        return;
      } catch {
        // fallback
      }
    }
    await desktopStore.patchConfig((prev) => ({
      ...prev,
      gaming: {
        ...prev.gaming,
        exclusions: prev.gaming.exclusions.filter((e) => e.toLowerCase() !== name.toLowerCase()),
      },
    }));
  },

  addCustomGame: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const desktopStore = useDesktopStore.getState();
    if (isTauriEnvironment()) {
      try {
        const updated = await invokeTauriCommand<DesktopConfig>('add_custom_game', {
          name: trimmed,
        });
        desktopStore.applyConfigLocally(updated);
        return;
      } catch {
        // fallback
      }
    }
    await desktopStore.patchConfig((prev) => {
      if (prev.gaming.customGames.some((g) => g.toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      return {
        ...prev,
        gaming: { ...prev.gaming, customGames: [...prev.gaming.customGames, trimmed] },
      };
    });
  },

  removeCustomGame: async (name) => {
    const desktopStore = useDesktopStore.getState();
    if (isTauriEnvironment()) {
      try {
        const updated = await invokeTauriCommand<DesktopConfig>('remove_custom_game', { name });
        desktopStore.applyConfigLocally(updated);
        return;
      } catch {
        // fallback
      }
    }
    await desktopStore.patchConfig((prev) => ({
      ...prev,
      gaming: {
        ...prev.gaming,
        customGames: prev.gaming.customGames.filter((g) => g.toLowerCase() !== name.toLowerCase()),
      },
    }));
  },

  setGameOverride: async (gameName, pref) => {
    const desktopStore = useDesktopStore.getState();
    await desktopStore.patchConfig((prev) => ({
      ...prev,
      gaming: {
        ...prev.gaming,
        perGameOverrides: {
          ...prev.gaming.perGameOverrides,
          [gameName]: pref,
        },
      },
    }));
  },
}));
