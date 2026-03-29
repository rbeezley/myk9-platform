/**
 * ScoringEntryListPage
 *
 * Entry list page for scoring a class.
 * Uses shared hooks from @myk9/scoring-ui with Tailwind styling.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useEntryListFilters, useDragAndDropEntries } from '@myk9/scoring-ui';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Search,
  Filter,
  GripVertical,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Replication
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import type { CheckInStatus } from '@myk9/core';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';

// Local components and types
import { SortableScoringEntryCard } from './components/ScoringEntryCard';
import type { ScoringEntry, ClassInfo } from './types';
import { toScoringEntry, toClassInfo, calculatePlacements } from './types';

/**
 * Main scoring entry list page
 */
export function ScoringEntryListPage() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();

  // Data state
  const [entries, setEntries] = useState<ScoringEntry[]>([]);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Manual order state for drag-and-drop
  const [manualOrder, setManualOrder] = useState<ScoringEntry[]>([]);
  const isDraggingRef = useRef(false);

  // Load entries with dog data from replicated tables
  const loadEntriesWithDogs = async (cId: string): Promise<ScoringEntry[]> => {
    const rawEntries = await replicatedEntriesTable.getEntriesByClass(cId);
    const dogsMap = new Map();
    for (const entry of rawEntries) {
      if (entry.dogId && !dogsMap.has(entry.dogId)) {
        const dog = await replicatedDogsTable.get(entry.dogId);
        if (dog) dogsMap.set(entry.dogId, dog);
      }
    }
    const scoringEntries = rawEntries.map((entry, index) => {
      const dog = entry.dogId ? dogsMap.get(entry.dogId) : null;
      return toScoringEntry(entry, dog, index);
    });
    return calculatePlacements(scoringEntries);
  };

  // Load data from replicated tables
  useEffect(() => {
    async function loadData() {
      if (!classId) return;

      setIsLoading(true);
      setError(null);

      try {
        const cls = await replicatedClassesTable.getClassById(classId);
        if (!cls) {
          setError('Class not found');
          return;
        }

        const scoringEntries = await loadEntriesWithDogs(classId);
        setEntries(scoringEntries);
        setClassInfo(toClassInfo(cls, scoringEntries.length));
      } catch (err) {
        logger.error('Failed to load scoring data:', 'pages', {}, err as Error);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [classId]);

  // Use the entry list filters hook
  const {
    activeTab,
    setActiveTab,
    sortBy,
    setSortBy,
    searchTerm,
    setSearchTerm,
    filteredEntries: _filteredEntries,
    entryCounts,
    pendingEntries,
    completedEntries,
  } = useEntryListFilters({
    entries,
    prioritizeInRing: true,
    deprioritizePulled: true,
    manualOrder,
    defaultSort: 'run',
  });

  // Get current entries based on active tab
  const currentEntries = useMemo(() => {
    return activeTab === 'pending' ? pendingEntries : completedEntries;
  }, [activeTab, pendingEntries, completedEntries]);

  // Drag and drop hook
  const { sensors, handleDragStart, handleDragEnd, isDragging } = useDragAndDropEntries({
    localEntries: entries,
    setLocalEntries: setEntries,
    currentEntries,
    isDraggingRef,
    setManualOrder,
    onUpdateOrder: async reorderedEntries => {
      // Update run order in database
      for (const entry of reorderedEntries) {
        await replicatedEntriesTable.updateEntry(entry.entryId, {
          runOrder: entry.exhibitorOrder,
        });
      }
    },
  });

  // Navigate to scoresheet
  const handleSelectEntry = (entry: ScoringEntry) => {
    navigate(`/scoring/classes/${classId}/entries/${entry.entryId}`);
  };

  // Reset score — clears result_status and moves entry back to Pending
  const handleResetScore = async (entry: ScoringEntry) => {
    try {
      await replicatedEntriesTable.updateEntry(entry.entryId, {
        result_status: 'pending',
        resultStatus: 'pending',
        search_time_seconds: 0,
        searchTimeSeconds: 0,
        total_faults: 0,
        totalFaults: 0,
        checkInStatus: 'checked-in' as CheckInStatus,
        check_in_status: 'checked-in' as CheckInStatus,
      });
      // Reload entries with dog data
      setEntries(await loadEntriesWithDogs(classId!));
    } catch (err) {
      logger.error('Failed to reset score', 'scoring', {}, err as Error);
    }
  };

  // Refresh data
  const handleRefresh = async () => {
    if (!classId) return;
    setIsLoading(true);
    try {
      // Trigger sync then reload with dog data
      await replicatedEntriesTable.sync(classId);
      setEntries(await loadEntriesWithDogs(classId));
    } catch (err) {
      logger.error('Refresh failed:', 'pages', {}, err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-medium text-destructive">{error}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <header className="space-y-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground truncate">
              {classInfo?.name || 'Class Entries'}
            </h1>
            {classInfo && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {classInfo.judge && <span>Judge: {classInfo.judge}</span>}
                <span>•</span>
                <span>{classInfo.entryCount} Entries</span>
                {classInfo.maxTime && (
                  <>
                    <span>•</span>
                    <span>{classInfo.maxTime} max</span>
                  </>
                )}
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isLoading}
            aria-label="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {entryCounts.completed} of {entries.length} completed
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${entries.length > 0 ? (entryCounts.completed / entries.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by armband, name, handler..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Sort */}
        <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-full sm:w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="run">Run Order</SelectItem>
            <SelectItem value="armband">Armband</SelectItem>
            <SelectItem value="name">Dog Name</SelectItem>
            <SelectItem value="handler">Handler</SelectItem>
            <SelectItem value="placement">Placement</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending" className="gap-2">
            Pending
            <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-muted">
              {entryCounts.pending}
            </span>
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            Completed
            <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-muted">
              {entryCounts.completed}
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Entry List */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={currentEntries.map(e => e.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {currentEntries.length === 0 ? (
              <EmptyState tab={activeTab} searchTerm={searchTerm} />
            ) : (
              currentEntries.map(entry => (
                <SortableScoringEntryCard
                  key={entry.entryId}
                  entry={entry}
                  onSelect={handleSelectEntry}
                  onResetScore={handleResetScore}
                />
              ))
            )}
          </div>
        </SortableContext>

        {/* Drag Overlay */}
        <DragOverlay>
          {isDragging ? (
            <div className="flex items-center gap-2 px-4 py-3 bg-card border rounded-xl shadow-lg">
              <GripVertical className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Dragging entry...</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

/**
 * Empty state component
 */
function EmptyState({ tab, searchTerm }: { tab: 'pending' | 'completed'; searchTerm: string }) {
  if (searchTerm) {
    return (
      <div className="text-center py-12">
        <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No Results Found</h3>
        <p className="text-muted-foreground">No entries match "{searchTerm}"</p>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {tab === 'pending' ? 'No Pending Entries' : 'No Completed Entries'}
      </h3>
      <p className="text-muted-foreground">
        {tab === 'pending' ? 'All entries have been scored!' : 'No entries have been scored yet.'}
      </p>
    </div>
  );
}

export default ScoringEntryListPage;
