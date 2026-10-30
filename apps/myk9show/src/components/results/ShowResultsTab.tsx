/**
 * ShowResultsTab — renders inside ShowDetailsPage's "Results" tab.
 * Contains sub-tabs: Podium (existing results), Show Stats, Judge Stats.
 */

import { useState, useMemo } from 'react';
import { Trophy, BarChart3, Scale, Medal } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import {
  PrimaryTabs,
  PrimaryTabsContent,
  type PrimaryTabDef,
} from '@/components/common/PrimaryTabs';
import { ListFilterBar, ListResultLine } from '@/components/list-toolkit';
import { PodiumCard } from './PodiumCard';
import { PendingClassesList } from './PendingClassesList';
import {
  RESULTS_FILTER_KEYS,
  deriveClassFilterOptions,
  derivePendingClasses,
  filterClasses,
} from './resultsClassFilters';
import { ShowStatsFilterBar } from '@/components/analytics/ShowStatsFilterBar';
import { useShowStatsFilters } from '@/hooks/useShowStatsFilters';
import type { StatsFilterOptions } from '@/components/analytics/analytics-filters';
import { useShowResults, type ClassResult } from '@/hooks/queries/useShowResults';
import { useVisibleResultFields, deriveClassState } from '@/hooks/useVisibleResultFields';
import { useShowStats } from '@/hooks/queries/useShowStats';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { ShowStatsSubTab } from '@/components/analytics/ShowStatsSubTab';
import { JudgeStatsSubTab } from '@/components/analytics/JudgeStatsSubTab';
import { isScored, type StatsEntry } from '@/components/analytics/analytics-utils';

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

const EMPTY_OPTIONS: StatsFilterOptions = {
  breed: [],
  judge: [],
  date: [],
  trial: [],
  element: [],
  level: [],
};

interface ResultsEmptyStateCopy {
  title: string;
  description: string;
}

function getResultsEmptyStateCopy(showEntries: StatsEntry[] = []): ResultsEmptyStateCopy {
  if (showEntries.length === 0) {
    return {
      title: 'No results yet',
      description: 'Results will appear here once classes are scored and released.',
    };
  }

  const hasScoredEntries = showEntries.some(isScored);

  if (!hasScoredEntries) {
    return {
      title: 'Scoring has not posted yet',
      description: 'This show has entries, but no scored runs are available yet.',
    };
  }

  return {
    title: 'Placements are being reviewed',
    description: 'Placements will appear here after the secretary releases them.',
  };
}

interface PodiumContentProps {
  showId: string;
  showEntries?: StatsEntry[];
}

function PodiumContent({ showId, showEntries = [] }: PodiumContentProps) {
  const { data: results = [], isLoading, error, refetch } = useShowResults(showId);
  const [search, setSearch] = useState('');
  const { filters, setFilter, clearFilters } = useShowStatsFilters();

  // Narrowing happens here, after useShowResults/useVisibleResultFields own what may be shown.
  const pendingAll = useMemo(
    () => derivePendingClasses(showEntries, new Set(results.map(cls => cls.classId))),
    [showEntries, results]
  );
  const options = useMemo(
    () => deriveClassFilterOptions([...results, ...pendingAll], showEntries),
    [results, pendingAll, showEntries]
  );
  const pending = useMemo(() => filterClasses(pendingAll, filters), [pendingAll, filters]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const byClass = filterClasses(results, filters);
    if (!query) return byClass;
    return byClass.filter(cls => cls.className.toLowerCase().includes(query));
  }, [results, search, filters]);

  const withPlacements = filtered;

  const hasActiveFilters =
    search.trim() !== '' || RESULTS_FILTER_KEYS.some(key => filters[key] !== null);

  const clearAll = () => {
    setSearch('');
    clearFilters(RESULTS_FILTER_KEYS);
  };

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
    const emptyState = getResultsEmptyStateCopy(showEntries);

    return (
      <div className="space-y-4">
        <EmptyState
          icon={Trophy}
          title={emptyState.title}
          description={emptyState.description}
          action={null}
        />
        <PendingClassesList classes={pendingAll} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <ListFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by class name..."
          fields={[]}
        />
        <ShowStatsFilterBar
          keys={RESULTS_FILTER_KEYS}
          filters={filters}
          options={{ ...EMPTY_OPTIONS, ...options }}
          onChange={setFilter}
          onClearAll={clearAll}
        />
        <ListResultLine
          shown={withPlacements.length}
          total={results.length}
          noun={['class', 'classes']}
          filtered={hasActiveFilters}
          onShowAll={clearAll}
        />
      </div>

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

      <PendingClassesList classes={pending} />
    </div>
  );
}

interface ShowResultsTabProps {
  showId: string;
}

export function ShowResultsTab({ showId }: ShowResultsTabProps) {
  const { data: showEntries } = useShowStats(showId);
  const { data: judges } = useShowJudges(showId);

  const hasScoredEntries = (showEntries || []).some(isScored);
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
        <PodiumContent showId={showId} showEntries={showEntries ?? []} />
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
