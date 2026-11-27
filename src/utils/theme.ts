import { AppearanceConfig } from '../types/desktop';

export function resolveEffectiveDarkMode(theme: AppearanceConfig['theme']): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return true;
}

export function applyThemeAndAppearance(appearance: AppearanceConfig): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark = resolveEffectiveDarkMode(appearance.theme);

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  root.dataset.fontSize = appearance.fontSize || 'md';
  root.dataset.density = appearance.density || 'comfortable';

  root.style.setProperty('--accent-color', appearance.accentColor || '#3B82F6');
  root.style.setProperty('--ui-radius', `${appearance.cornerRadius ?? 10}px`);
  root.style.setProperty('--color-cpu', appearance.metricColors?.cpu || '#3B82F6');
  root.style.setProperty('--color-gpu', appearance.metricColors?.gpu || '#06B6D4');
  root.style.setProperty('--color-memory', appearance.metricColors?.memory || '#10B981');
  root.style.setProperty('--color-network', appearance.metricColors?.network || '#EC4899');
  root.style.setProperty('--color-battery', appearance.metricColors?.battery || '#F59E0B');
  root.style.setProperty('--color-fps', appearance.metricColors?.fps || '#22C55E');
}
