import { useState, useMemo } from 'react';
import { useSystemStore } from '../store/systemStore';
import { ProcessCategory, ProcessSortField, ProcessSortOrder, ProcessInfo } from '../types/process';

export function useProcesses() {
  const processes = useSystemStore((state) => state.processes);
  const selectedProcess = useSystemStore((state) => state.selectedProcess);
  const setSelectedProcess = useSystemStore((state) => state.setSelectedProcess);
  const killProcess = useSystemStore((state) => state.killProcess);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ProcessCategory>('all');
  const [sortField, setSortField] = useState<ProcessSortField>('cpuPercent');
  const [sortOrder, setSortOrder] = useState<ProcessSortOrder>('desc');

  const filteredAndSortedProcesses = useMemo(() => {
    return processes
      .filter((proc) => {
        // Category filter
        if (activeCategory !== 'all' && proc.category !== activeCategory) {
          return false;
        }

        // Search query filter
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase().trim();
          const matchesName = proc.name.toLowerCase().includes(query);
          const matchesPid = proc.pid.toString().includes(query);
          const matchesUser = (proc.user || '').toLowerCase().includes(query);
          const matchesPath = proc.executablePath.toLowerCase().includes(query);
          return matchesName || matchesPid || matchesUser || matchesPath;
        }

        return true;
      })
      .sort((a, b) => {
        let valA: number | string = 0;
        let valB: number | string = 0;

        switch (sortField) {
          case 'cpuPercent':
            valA = a.cpuPercent;
            valB = b.cpuPercent;
            break;
          case 'memoryBytes':
            valA = a.memoryBytes;
            valB = b.memoryBytes;
            break;
          case 'gpuPercent':
            valA = a.gpuPercent ?? -1;
            valB = b.gpuPercent ?? -1;
            break;
          case 'vramBytes':
            valA = a.vramBytes ?? -1;
            valB = b.vramBytes ?? -1;
            break;
          case 'disk':
            valA = a.diskReadBytesSec + a.diskWriteBytesSec;
            valB = b.diskReadBytesSec + b.diskWriteBytesSec;
            break;
          case 'pid':
            valA = a.pid;
            valB = b.pid;
            break;
          case 'name':
            valA = a.name.toLowerCase();
            valB = b.name.toLowerCase();
            break;
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        return sortOrder === 'asc'
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      });
  }, [processes, activeCategory, searchQuery, sortField, sortOrder]);

  const handleSort = (field: ProcessSortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  return {
    processes: filteredAndSortedProcesses,
    totalCount: processes.length,
    filteredCount: filteredAndSortedProcesses.length,
    selectedProcess,
    setSelectedProcess,
    searchQuery,
    setSearchQuery,
    activeCategory,
    setActiveCategory,
    sortField,
    sortOrder,
    handleSort,
    killProcess,
  };
}
