import { useEffect } from 'react';
import { useDesktopStore } from '../stores/desktop-store';
import { useGamingStore } from '../stores/gaming-store';
import { isTauriEnvironment } from '../services/tauriBridge';

function matchesCombo(e: KeyboardEvent, combo: string): boolean {
  const parts = combo
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length < 2) return false;

  const needCtrl = parts.includes('ctrl') || parts.includes('control');
  const needShift = parts.includes('shift');
  const needAlt = parts.includes('alt');
  const needMeta =
    parts.includes('super') || parts.includes('meta') || parts.includes('win') || parts.includes('cmd');
  const keyToken = parts.find(
    (p) => !['ctrl', 'control', 'shift', 'alt', 'super', 'meta', 'win', 'cmd'].includes(p)
  );
  if (!keyToken) return false;

  if (e.ctrlKey !== needCtrl) return false;
  if (e.shiftKey !== needShift) return false;
  if (e.altKey !== needAlt) return false;
  if (e.metaKey !== needMeta) return false;

  return e.key.toLowerCase() === keyToken;
}

export function useGlobalShortcuts(enabled: boolean = true) {
  const shortcuts = useDesktopStore((s) => s.config.shortcuts);
  const toggleFloatingWidget = useDesktopStore((s) => s.toggleFloatingWidget);
  const toggleDesktopOverlay = useDesktopStore((s) => s.toggleDesktopOverlay);
  const setClickThrough = useDesktopStore((s) => s.setClickThrough);
  const toggleGamingMode = useGamingStore((s) => s.toggleGamingMode);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      // When native global shortcuts are supported (Windows / X11 Tauri), the OS listener handles them globally.
      // We still bind focused-window fallback for Wayland & Web preview.
      const nativeCaps = useDesktopStore.getState().capabilities;
      if (isTauriEnvironment() && nativeCaps.globalShortcutsSupported) {
        return;
      }

      if (matchesCombo(e, shortcuts.toggleWidget)) {
        e.preventDefault();
        void toggleFloatingWidget();
      } else if (matchesCombo(e, shortcuts.toggleOverlay)) {
        e.preventDefault();
        void toggleDesktopOverlay();
      } else if (matchesCombo(e, shortcuts.toggleGamingMode)) {
        e.preventDefault();
        void toggleGamingMode();
      } else if (matchesCombo(e, shortcuts.toggleClickThrough)) {
        e.preventDefault();
        void setClickThrough('all');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    enabled,
    shortcuts,
    toggleFloatingWidget,
    toggleDesktopOverlay,
    toggleGamingMode,
    setClickThrough,
  ]);
}
