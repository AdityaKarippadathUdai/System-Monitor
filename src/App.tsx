/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { useSystemStore } from './store/systemStore';
import { useSystemStats } from './hooks/useSystemStats';
import { useDesktopExperienceSync } from './hooks/use-desktop-widget';
import { useGlobalShortcuts } from './hooks/use-global-shortcuts';
import { useDesktopStore } from './stores/desktop-store';
import { useGamingStore } from './stores/gaming-store';
import { isTauriEnvironment } from './services/tauriBridge';

import { Overview } from './pages/Overview';
import { Processes } from './pages/Processes';
import { CpuPage } from './pages/Cpu';
import { MemoryPage } from './pages/Memory';
import { GpuPage } from './pages/Gpu';
import { DiskPage } from './pages/Disk';
import { NetworkPage } from './pages/Network';
import { SettingsPage } from './pages/Settings';
import { DesktopExperiencePage } from './components/settings/DesktopExperiencePage';
import { FloatingWidgetWindow } from './components/desktop-widget/FloatingWidgetWindow';
import { DesktopOverlayWindow } from './components/desktop-overlay/DesktopOverlayWindow';
import { GamingOverlayWindow } from './components/gaming-mode/GamingOverlayWindow';

export default function App() {
  // Initialize shared telemetry, desktop config/appearance sync, and shortcuts
  useSystemStats();
  useDesktopExperienceSync(false);
  useGlobalShortcuts(true);

  const currentPage = useSystemStore((state) => state.currentPage);
  const config = useDesktopStore((state) => state.config);
  const gamingStatus = useGamingStore((state) => state.status);
  const isTauri = isTauriEnvironment();

  const renderActivePage = () => {
    switch (currentPage) {
      case 'overview':
        return <Overview />;
      case 'processes':
        return <Processes />;
      case 'cpu':
        return <CpuPage />;
      case 'memory':
        return <MemoryPage />;
      case 'gpu':
        return <GpuPage />;
      case 'disk':
        return <DiskPage />;
      case 'network':
        return <NetworkPage />;
      case 'desktop':
        return <DesktopExperiencePage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Overview />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#05070A] text-slate-100 antialiased relative">
      {/* Fixed Left Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Area with Header */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto bg-[#05070A]">{renderActivePage()}</main>
      </div>

      {/* In Web/Express preview mode only (outside native Tauri multi-window runtime), render active overlays cleanly in-viewport */}
      {!isTauri && config.widget.enabled && config.widget.visible && (
        <div className="fixed bottom-4 right-4 w-[310px] max-h-[420px] z-50">
          <FloatingWidgetWindow />
        </div>
      )}
      {!isTauri && config.overlay.enabled && config.overlay.visible && (
        <div className="fixed top-16 right-4 max-w-[440px] z-50">
          <DesktopOverlayWindow />
        </div>
      )}
      {!isTauri && (gamingStatus.active || config.gaming.enabled) && (
        <div className="fixed bottom-4 left-60 w-[280px] z-50">
          <GamingOverlayWindow />
        </div>
      )}
    </div>
  );
}
