/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { useSystemStore } from './store/systemStore';
import { useSystemStats } from './hooks/useSystemStats';

import { Overview } from './pages/Overview';
import { Processes } from './pages/Processes';
import { CpuPage } from './pages/Cpu';
import { MemoryPage } from './pages/Memory';
import { GpuPage } from './pages/Gpu';
import { DiskPage } from './pages/Disk';
import { NetworkPage } from './pages/Network';
import { SettingsPage } from './pages/Settings';

export default function App() {
  // Initialize the real-time background telemetry hook
  useSystemStats();

  const currentPage = useSystemStore((state) => state.currentPage);

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
      case 'settings':
        return <SettingsPage />;
      default:
        return <Overview />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#05070A] text-slate-100 antialiased">
      {/* Fixed Left Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Area with Header */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto bg-[#05070A]">
          {renderActivePage()}
        </main>
      </div>
    </div>
  );
}

