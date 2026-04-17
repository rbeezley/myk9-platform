/**
 * ShowResultsTab — renders inside ShowDetailsPage's "Results" tab.
 * Contains sub-tabs: Podium (existing results), Show Stats, Judge Stats.
 */

import { useState, useMemo } from 'react';
import {
  Trophy,
  Filter,
  ChevronDown,
  ChevronRight,
  Clock,
  BarChart3,
  Scale,
  Medal,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import {
  PrimaryTabs,
  PrimaryTabsContent,
  type PrimaryTabDef,
} from '@/components/common/PrimaryTabs';
import { PodiumCard } from './PodiumCard';
import {
  useShowResults,
  filterResults,
  getFilterOptions,
  type ResultsFilters,
  type ClassResult,
} from '@/hooks/queries/useShowResults';
import { useVisibleResultFields, deriveClassState } from '@/hooks/useVisibleResultFields';
import { useShowStats } from '@/hooks/queries/useShowStats';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { ShowStatsSubTab } from '@/components/analytics/ShowStatsSubTab';
import { JudgeStatsSubTab } from '@/components/analytics/JudgeStatsSubTab';

interface VisibilityGatedPodiumCardProps {
  cls: ClassResult;
  showId: string;
}

function VisibilityGatedPodiumCard({ cls, showId }: VisibilityGatedPodiumCardProps) {
  const classState = deriveClassState('completed', cls.resultsReleasedAt);
  const { showPlacement, isLoading } = useVisibleResultFields(
    showId,
    cls.trialId,
    cls.classId,
    classState
  );

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <div className="border-b bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold tracking-tight">{cls.className}</h3>
        </div>
        <div className="flex items-center justify-center p-6">
          <LoadingSpinner />
        </div>
      </Card>
    );
  }

  if (!showPlacement) {
    return (
      <Card className="overflow-hidden">
        <div className="border-b bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold tracking-tight">{cls.className}</h3>
        </div>
        <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
          Results pending review
        </div>
      </Card>
    );
  }

  return <PodiumCard classTitle={cls.className} placements={cls.placements} />;
}

interface PodiumContentProps {
  showId: string;
}

function PodiumContent({ showId }: PodiumContentProps) {
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
            <VisibilityGatedPodiumCard key={cls.classId} cls={cls} showId={showId} />
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

interface ShowResultsTabProps {
  showId: string;
}

export function ShowResultsTab({ showId }: ShowResultsTabProps) {
  const { data: showEntries } = useShowStats(showId);
  const { data: judges } = useShowJudges(showId);

  const hasScoredEntries = (showEntries || []).some(e => e.resultText !== 'pending');
  const hasJudges = (judges || []).length > 0;

  const subTabDefs: PrimaryTabDef[] = useMemo(
    () => [
      { id: 'podium', label: 'Podium', icon: Medal },
      ...(hasScoredEntries ? [{ id: 'show-stats', label: 'Show Stats', icon: BarChart3 }] : []),
      ...(hasJudges ? [{ id: 'judge-stats', label: 'Judge Stats', icon: Scale }] : []),
    ],
    [hasScoredEntries, hasJudges]
  );

  const [activeSubTab, setActiveSubTab] = useState('podium');

  return (
    <PrimaryTabs tabs={subTabDefs} value={activeSubTab} onValueChange={setActiveSubTab}>
      <PrimaryTabsContent value="podium">
        <PodiumContent showId={showId} />
      </PrimaryTabsContent>

      {hasScoredEntries && (
        <PrimaryTabsContent value="show-stats">
          <ShowStatsSubTab showId={showId} />
        </PrimaryTabsContent>
      )}

      {hasJudges && (
        <PrimaryTabsContent value="judge-stats">
          <JudgeStatsSubTab showId={showId} />
        </PrimaryTabsContent>
      )}
    </PrimaryTabs>
  );
}
