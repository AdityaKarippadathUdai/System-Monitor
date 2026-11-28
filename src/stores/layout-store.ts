import { create } from 'zustand';
import {
  DashboardCardKind,
  DashboardCardLayoutItem,
  DashboardLayoutPreset,
} from '../types/desktop';

const LAYOUT_STORAGE_KEY = 'sysmon_dashboard_layouts_v1';

export const DEFAULT_DASHBOARD_CARDS: DashboardCardLayoutItem[] = [
  { id: 'card-cpu', kind: 'cpu', title: 'CPU', colSpan: 1, heightPreset: 'standard', visible: true },
  { id: 'card-memory', kind: 'memory', title: 'Memory', colSpan: 1, heightPreset: 'standard', visible: true },
  { id: 'card-gpu', kind: 'gpu', title: 'GPU', colSpan: 1, heightPreset: 'standard', visible: true },
  { id: 'card-disk', kind: 'disk', title: 'Disk Storage', colSpan: 1, heightPreset: 'standard', visible: true },
  {
    id: 'card-activity-chart',
    kind: 'activity_chart',
    title: 'System Activity',
    colSpan: 4,
    heightPreset: 'standard',
    visible: true,
  },
  {
    id: 'card-cpu-cores',
    kind: 'cpu_cores',
    title: 'CPU Core Utilization',
    colSpan: 4,
    heightPreset: 'standard',
    visible: true,
  },
  {
    id: 'card-processes',
    kind: 'processes',
    title: 'Active Processes',
    colSpan: 4,
    heightPreset: 'standard',
    visible: true,
  },
  {
    id: 'card-system-details',
    kind: 'system_details',
    title: 'System Details',
    colSpan: 4,
    heightPreset: 'standard',
    visible: true,
  },
];

export const OPTIONAL_CARD_CATALOG: {
  kind: DashboardCardKind;
  title: string;
  defaultColSpan: 1 | 2 | 3 | 4;
}[] = [
  { kind: 'cpu', title: 'CPU', defaultColSpan: 1 },
  { kind: 'memory', title: 'Memory', defaultColSpan: 1 },
  { kind: 'gpu', title: 'GPU', defaultColSpan: 1 },
  { kind: 'vram', title: 'VRAM', defaultColSpan: 1 },
  { kind: 'disk', title: 'Disk Storage', defaultColSpan: 1 },
  { kind: 'network', title: 'Network', defaultColSpan: 1 },
  { kind: 'temperature', title: 'Thermals', defaultColSpan: 1 },
  { kind: 'battery', title: 'Battery', defaultColSpan: 1 },
  { kind: 'processes', title: 'Active Processes', defaultColSpan: 4 },
  { kind: 'activity_chart', title: 'System Activity', defaultColSpan: 4 },
  { kind: 'cpu_cores', title: 'CPU Core Utilization', defaultColSpan: 4 },
  { kind: 'system_details', title: 'System Details', defaultColSpan: 4 },
];

const DEFAULT_PRESET: DashboardLayoutPreset = {
  id: 'default',
  name: 'Default Overview',
  cards: DEFAULT_DASHBOARD_CARDS,
  updatedAt: 0,
};

interface PersistedLayoutState {
  presets: DashboardLayoutPreset[];
  activeLayoutId: string;
  isCustomized: boolean;
}

function loadPersistedLayouts(): PersistedLayoutState {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedLayoutState>;
      const presets =
        Array.isArray(parsed.presets) && parsed.presets.length > 0
          ? parsed.presets
          : [structuredClone(DEFAULT_PRESET)];
      return {
        presets,
        activeLayoutId: parsed.activeLayoutId || presets[0].id,
        isCustomized: Boolean(parsed.isCustomized),
      };
    }
  } catch {
    // ignore
  }
  return {
    presets: [structuredClone(DEFAULT_PRESET)],
    activeLayoutId: 'default',
    isCustomized: false,
  };
}

function persistLayouts(state: PersistedLayoutState) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

interface LayoutState {
  presets: DashboardLayoutPreset[];
  activeLayoutId: string;
  isCustomized: boolean;
  editMode: boolean;

  setEditMode: (editing: boolean) => void;
  getActiveCards: () => DashboardCardLayoutItem[];
  reorderCard: (sourceId: string, targetId: string) => void;
  resizeCard: (id: string, colSpan: 1 | 2 | 3 | 4, heightPreset?: 'compact' | 'standard' | 'tall') => void;
  addCard: (kind: DashboardCardKind) => void;
  removeCard: (id: string) => void;
  toggleCardVisibility: (id: string) => void;
  saveLayoutAs: (name: string) => void;
  switchLayout: (id: string) => void;
  deleteLayout: (id: string) => void;
  restoreDefaultLayout: () => void;
}

const initial = loadPersistedLayouts();

function updateActiveCards(
  presets: DashboardLayoutPreset[],
  activeLayoutId: string,
  updater: (cards: DashboardCardLayoutItem[]) => DashboardCardLayoutItem[]
): DashboardLayoutPreset[] {
  return presets.map((preset) =>
    preset.id === activeLayoutId
      ? { ...preset, cards: updater(preset.cards), updatedAt: Date.now() }
      : preset
  );
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  presets: initial.presets,
  activeLayoutId: initial.activeLayoutId,
  isCustomized: initial.isCustomized,
  editMode: false,

  setEditMode: (editing) => set({ editMode: editing }),

  getActiveCards: () => {
    const { presets, activeLayoutId } = get();
    const active = presets.find((p) => p.id === activeLayoutId) || presets[0];
    return active?.cards || DEFAULT_DASHBOARD_CARDS;
  },

  reorderCard: (sourceId, targetId) => {
    if (sourceId === targetId) return;
    const { presets, activeLayoutId } = get();
    const nextPresets = updateActiveCards(presets, activeLayoutId, (cards) => {
      const next = [...cards];
      const fromIdx = next.findIndex((c) => c.id === sourceId);
      const toIdx = next.findIndex((c) => c.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return cards;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    persistLayouts({ presets: nextPresets, activeLayoutId, isCustomized: true });
    set({ presets: nextPresets, isCustomized: true });
  },

  resizeCard: (id, colSpan, heightPreset) => {
    const { presets, activeLayoutId } = get();
    const nextPresets = updateActiveCards(presets, activeLayoutId, (cards) =>
      cards.map((c) =>
        c.id === id
          ? { ...c, colSpan, heightPreset: heightPreset ?? c.heightPreset }
          : c
      )
    );
    persistLayouts({ presets: nextPresets, activeLayoutId, isCustomized: true });
    set({ presets: nextPresets, isCustomized: true });
  },

  addCard: (kind) => {
    const { presets, activeLayoutId } = get();
    const meta = OPTIONAL_CARD_CATALOG.find((c) => c.kind === kind);
    if (!meta) return;

    const nextPresets = updateActiveCards(presets, activeLayoutId, (cards) => {
      const hiddenExisting = cards.find((c) => c.kind === kind && !c.visible);
      if (hiddenExisting) {
        return cards.map((c) => (c.id === hiddenExisting.id ? { ...c, visible: true } : c));
      }
      if (cards.some((c) => c.kind === kind && c.visible)) {
        return cards;
      }
      const newCard: DashboardCardLayoutItem = {
        id: `card-${kind}-${Date.now()}`,
        kind,
        title: meta.title,
        colSpan: meta.defaultColSpan,
        heightPreset: 'standard',
        visible: true,
      };
      // Insert compact 1-col metric cards near the top before full-width sections
      if (meta.defaultColSpan === 1) {
        const firstFullIdx = cards.findIndex((c) => c.colSpan >= 3);
        if (firstFullIdx >= 0) {
          const copy = [...cards];
          copy.splice(firstFullIdx, 0, newCard);
          return copy;
        }
      }
      return [...cards, newCard];
    });
    persistLayouts({ presets: nextPresets, activeLayoutId, isCustomized: true });
    set({ presets: nextPresets, isCustomized: true });
  },

  removeCard: (id) => {
    const { presets, activeLayoutId } = get();
    const nextPresets = updateActiveCards(presets, activeLayoutId, (cards) =>
      cards.map((c) => (c.id === id ? { ...c, visible: false } : c))
    );
    persistLayouts({ presets: nextPresets, activeLayoutId, isCustomized: true });
    set({ presets: nextPresets, isCustomized: true });
  },

  toggleCardVisibility: (id) => {
    const { presets, activeLayoutId } = get();
    const nextPresets = updateActiveCards(presets, activeLayoutId, (cards) =>
      cards.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c))
    );
    persistLayouts({ presets: nextPresets, activeLayoutId, isCustomized: true });
    set({ presets: nextPresets, isCustomized: true });
  },

  saveLayoutAs: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { presets } = get();
    const currentCards = get().getActiveCards();
    const newId = `layout-${Date.now()}`;
    const newPreset: DashboardLayoutPreset = {
      id: newId,
      name: trimmed,
      cards: structuredClone(currentCards),
      updatedAt: Date.now(),
    };
    const nextPresets = [...presets, newPreset];
    persistLayouts({ presets: nextPresets, activeLayoutId: newId, isCustomized: true });
    set({ presets: nextPresets, activeLayoutId: newId, isCustomized: true });
  },

  switchLayout: (id) => {
    const { presets } = get();
    if (!presets.some((p) => p.id === id)) return;
    const customized = id !== 'default' || JSON.stringify(presets.find((p) => p.id === id)?.cards) !== JSON.stringify(DEFAULT_DASHBOARD_CARDS);
    persistLayouts({ presets, activeLayoutId: id, isCustomized: customized });
    set({ activeLayoutId: id, isCustomized: customized });
  },

  deleteLayout: (id) => {
    if (id === 'default') return;
    const { presets, activeLayoutId } = get();
    const nextPresets = presets.filter((p) => p.id !== id);
    const nextActive = activeLayoutId === id ? 'default' : activeLayoutId;
    persistLayouts({ presets: nextPresets, activeLayoutId: nextActive, isCustomized: false });
    set({ presets: nextPresets, activeLayoutId: nextActive });
  },

  restoreDefaultLayout: () => {
    const { presets } = get();
    const resetDefault = structuredClone(DEFAULT_PRESET);
    const nextPresets = presets.some((p) => p.id === 'default')
      ? presets.map((p) => (p.id === 'default' ? resetDefault : p))
      : [resetDefault, ...presets];
    persistLayouts({ presets: nextPresets, activeLayoutId: 'default', isCustomized: false });
    set({
      presets: nextPresets,
      activeLayoutId: 'default',
      isCustomized: false,
      editMode: false,
    });
  },
}));
