import React from 'react';
import { useProcesses } from '../hooks/useProcesses';
import { ProcessTable } from '../components/ProcessTable';
import { ProcessDetails } from '../components/ProcessDetails';
import { useSystemStore } from '../store/systemStore';

export const Processes: React.FC = () => {
  const {
    processes,
    totalCount,
    filteredCount,
    searchQuery,
    setSearchQuery,
    activeCategory,
    setActiveCategory,
    sortField,
    sortOrder,
    handleSort,
    selectedProcess,
    setSelectedProcess,
    killProcess,
  } = useProcesses();

  const settings = useSystemStore((state) => state.settings);

  return (
    <div className="p-4 h-[calc(100vh-3.5rem)] flex flex-col max-w-[1600px] mx-auto select-none">
      <div className="flex-1 flex flex-col min-h-0">
        <ProcessTable
          processes={processes}
          totalCount={totalCount}
          filteredCount={filteredCount}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
          selectedProcess={selectedProcess}
          onSelectProcess={setSelectedProcess}
          isCompact={settings.compactProcessList}
        />
      </div>

      {selectedProcess && (
        <ProcessDetails
          process={selectedProcess}
          onClose={() => setSelectedProcess(null)}
          onKillProcess={killProcess}
        />
      )}
    </div>
  );
};
