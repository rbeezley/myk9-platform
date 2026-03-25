/**
 * ShowResultsTab — renders inside ShowDetailsPage's "Results" tab.
 * Fetches finalized results, shows podium cards with element/level filters.
 */

import { useState, useMemo } from 'react';
import { Trophy, Filter, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { PodiumCard } from './PodiumCard';
import {
  useShowResults,
  filterResults,
  getFilterOptions,
  type ResultsFilters,
} from '@/hooks/queries/useShowResults';

interface ShowResultsTabProps {
  showId: string;
}

export function ShowResultsTab({ showId }: ShowResultsTabProps) {
  const { data: results = [], isLoading, error, refetch } = useShowResults(showId);
  const [filters, setFilters] = useState<ResultsFilters>({ element: null, level: null });
  const [pendingExpanded, setPendingExpanded] = useState(false);

  const filtered = useMemo(() => filterResults(results, filters), [results, filters]);
  const { elements, levels } = useMemo(() => getFilterOptions(results), [results]);

  const { withPlacements, pending } = useMemo(() => {
    const w: typeof filtered = [];
    const p: typeof filtered = [];
    for (const c of filtered) {
      (c.placements.length > 0 ? w : p).push(c);
    }
    return { withPlacements: w, pending: p };
  }, [filtered]);

  const hasActiveFilters = filters.element || filters.level;

  if (isLoading) {
    return <LoadingSpinner message="Loading results..." />;
  }

  if (error) {
    return (
      <EmptyState
        icon={Trophy}
        title="Error loading results"
        action={{ label: 'Retry', onClick: () => refetch() }}
      />
    );
  }

  if (results.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="No results yet"
        description="Results will appear here as classes complete scoring."
      />
    );
  }

  return (
    <div className="space-y-4">
      {(elements.length > 1 || levels.length > 1) && (
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />

          {elements.length > 1 && (
            <select
              value={filters.element || ''}
              onChange={e => setFilters(f => ({ ...f, element: e.target.value || null }))}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">All Elements</option>
              {elements.map(el => (
                <option key={el} value={el}>
                  {el}
                </option>
              ))}
            </select>
          )}

          {levels.length > 1 && (
            <select
              value={filters.level || ''}
              onChange={e => setFilters(f => ({ ...f, level: e.target.value || null }))}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">All Levels</option>
              {levels.map(lv => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </select>
          )}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setFilters({ element: null, level: null })}
            >
              Clear
            </Button>
          )}

          <Badge variant="secondary" className="ml-auto">
            {withPlacements.length} class{withPlacements.length !== 1 ? 'es' : ''}
          </Badge>
        </div>
      )}

      {withPlacements.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {withPlacements.map(cls => (
            <PodiumCard key={cls.classId} classTitle={cls.className} placements={cls.placements} />
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-muted-foreground">
          <p>No results match the current filters.</p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="rounded-lg border">
          <button
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50"
            onClick={() => setPendingExpanded(!pendingExpanded)}
            aria-expanded={pendingExpanded}
          >
            {pendingExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <Clock className="h-4 w-4" />
            Pending Results
            <Badge variant="outline" className="ml-auto">
              {pending.length}
            </Badge>
          </button>

          {pendingExpanded && (
            <div className="divide-y border-t px-4">
              {pending.map(cls => (
                <p key={cls.classId} className="py-2 text-sm">
                  {cls.className}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
