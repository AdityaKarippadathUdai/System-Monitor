import React, { useEffect } from 'react';
import { RefreshCw, Network as NetworkIcon, SlidersHorizontal, AlertCircle } from 'lucide-react';
import { useNetworkStore } from '../store/networkStore';
import { systemMonitorService } from '../services/systemMonitor';
import { NetworkOverviewCards } from '../components/network/NetworkOverviewCards';
import { NetworkTrafficChart } from '../components/network/NetworkTrafficChart';
import { ApplicationNetworkTable } from '../components/network/ApplicationNetworkTable';
import { ApplicationDetailsView } from '../components/network/ApplicationDetailsView';
import { NetworkConnectionsTable } from '../components/network/NetworkConnectionsTable';
import { NetworkInterfacesPanel } from '../components/network/NetworkInterfacesPanel';
import { NetworkHistoryAnalytics } from '../components/network/NetworkHistoryAnalytics';

const INTERVAL_OPTIONS = [
  { label: '500 ms', value: 500 },
  { label: '1s', value: 1000 },
  { label: '2s', value: 2000 },
  { label: '5s', value: 5000 },
];

export const NetworkPage: React.FC = () => {
  const {
    overview,
    processes,
    connections,
    history,
    selectedInterface,
    selectedPeriod,
    analyticsPeriod,
    bandwidthUnit,
    monitorIntervalMs,
    selectedPid,
    selectedAppDetails,
    isLoading,
    isRefreshingProcesses,
    isRefreshingConnections,
    isLoadingDetails,
    error,
    lastUpdated,
    setSelectedInterface,
    setSelectedPeriod,
    setAnalyticsPeriod,
    setBandwidthUnit,
    setMonitorIntervalMs,
    selectApplication,
    applyStreamPayload,
    refreshAll,
    refreshProcesses,
    refreshConnections,
    refreshHistory,
    refreshSelectedAppDetails,
  } = useNetworkStore();

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    let pollTimer: number | null = null;
    let historyTimer: number | null = null;

    const startMonitoring = async () => {
      await systemMonitorService.setNetworkMonitoringActive(true, monitorIntervalMs);
      await refreshAll();

      if (cancelled) return;

      if (systemMonitorService.isTauriAvailable()) {
        unlisten = await systemMonitorService.subscribeToNetworkStream((payload) => {
          if (!cancelled) {
            applyStreamPayload(payload);
          }
        });
        historyTimer = window.setInterval(() => {
          void refreshHistory();
        }, 10000);
      } else {
        pollTimer = window.setInterval(() => {
          void refreshAll();
        }, monitorIntervalMs);
      }
    };

    void startMonitoring();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (historyTimer !== null) window.clearInterval(historyTimer);
      void systemMonitorService.setNetworkMonitoringActive(false);
    };
  }, [monitorIntervalMs, applyStreamPayload, refreshAll, refreshHistory]);

  const lastUpdatedText = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Initializing...';

  return (
    <div className="space-y-4 p-4 max-w-[1600px] mx-auto select-none">
      {/* Top Toolbar */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
            <NetworkIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-slate-100 tracking-wide">
              Network Monitor &amp; Bandwidth Attribution
            </h1>
            <p className="text-[11px] font-mono-num text-slate-400 truncate">
              Updated {lastUpdatedText}
              {overview
                ? ` · Scope: ${
                    overview.selectedInterface === 'all'
                      ? 'All Interfaces'
                      : overview.selectedInterface
                  } · Method: ${overview.capabilities.platformMethod}`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Interface Quick Selector */}
          {overview && overview.interfaces.length > 0 && (
            <select
              value={selectedInterface}
              onChange={(e) => void setSelectedInterface(e.target.value)}
              aria-label="Select network interface"
              className="bg-[#080B10] border border-[#1A2633] focus:border-cyan-500 focus:outline-none rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono-num"
            >
              <option value="all">Interface: All Interfaces</option>
              {overview.interfaces.map((iface) => (
                <option key={iface.name} value={iface.name}>
                  {iface.name} ({iface.isUp ? 'UP' : 'DOWN'}
                  {iface.ip4 ? ` · ${iface.ip4}` : ''})
                </option>
              ))}
            </select>
          )}

          {/* Sampling Interval Control */}
          <div className="inline-flex items-center gap-1.5 bg-[#080B10] border border-[#1A2633] rounded px-2 py-1">
            <SlidersHorizontal className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="text-[10px] font-mono-num text-slate-400 uppercase">Rate</span>
            {INTERVAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => void setMonitorIntervalMs(opt.value)}
                className={`px-1.5 py-0.5 rounded text-[11px] font-mono-num cursor-pointer whitespace-nowrap shrink-0 ${
                  monitorIntervalMs === opt.value
                    ? 'bg-[#162230] text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void refreshAll()}
            className="px-2.5 py-1.5 rounded bg-[#101720] hover:bg-[#16202C] border border-[#1A2633] text-xs font-mono-num text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync Now</span>
          </button>
        </div>
      </div>

      {/* Error State Banner */}
      {error && (
        <div className="bg-[#0B1118] border border-red-500/40 rounded-lg px-4 py-3 text-xs text-red-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="px-2.5 py-1 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-200 font-mono-num cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Initial Loading Skeleton */}
      {isLoading && !overview ? (
        <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-12 text-center text-xs font-mono-num text-slate-400">
          Initializing network telemetry, interface counters, and socket inspection...
        </div>
      ) : selectedPid !== null ? (
        /* Dedicated Application Details View */
        <ApplicationDetailsView
          details={selectedAppDetails}
          isLoading={isLoadingDetails}
          unit={bandwidthUnit}
          onBack={() => void selectApplication(null)}
          onRefresh={() => void refreshSelectedAppDetails()}
        />
      ) : (
        overview && (
          <>
            {/* 6 Network Overview Metric Cards */}
            <NetworkOverviewCards overview={overview} unit={bandwidthUnit} />

            {/* Real-Time Traffic Graph */}
            <NetworkTrafficChart
              history={history}
              selectedPeriod={selectedPeriod}
              unit={bandwidthUnit}
              selectedInterface={selectedInterface}
              onPeriodChange={(period) => void setSelectedPeriod(period)}
              onUnitChange={setBandwidthUnit}
            />

            {/* Primary Feature: Application Network Usage */}
            <ApplicationNetworkTable
              processes={processes}
              capabilities={overview.capabilities}
              unit={bandwidthUnit}
              isRefreshing={isRefreshingProcesses}
              onRefresh={() => void refreshProcesses()}
              onSelectApp={(pid) => void selectApplication(pid)}
            />

            {/* Network Hosts and Connections */}
            <NetworkConnectionsTable
              connections={connections}
              unit={bandwidthUnit}
              isRefreshing={isRefreshingConnections}
              onRefresh={() => void refreshConnections()}
              onSelectApp={(pid) => void selectApplication(pid)}
            />

            {/* Interfaces & Configurable Ping Monitor */}
            <NetworkInterfacesPanel
              interfaces={overview.interfaces}
              selectedInterface={selectedInterface}
              activeInterface={overview.activeInterface}
              unit={bandwidthUnit}
              onSelectInterface={(iface) => void setSelectedInterface(iface)}
            />

            {/* Historical Analytics */}
            <NetworkHistoryAnalytics
              history={history}
              analyticsPeriod={analyticsPeriod}
              unit={bandwidthUnit}
              capabilities={overview.capabilities}
              onPeriodChange={(period) => void setAnalyticsPeriod(period)}
              onSelectApp={(pid) => void selectApplication(pid)}
            />
          </>
        )
      )}
    </div>
  );
};
