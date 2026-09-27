/**
 * ShowResultsTab — renders inside ShowDetailsPage's "Results" tab.
 * Contains sub-tabs: Podium (existing results), Show Stats, Judge Stats.
 */

import { useState, useMemo } from 'react';
import { Trophy, ChevronDown, ChevronRight, Clock, BarChart3, Scale, Medal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import {
  PrimaryTabs,
  PrimaryTabsContent,
  type PrimaryTabDef,
} from '@/components/common/PrimaryTabs';
import { ListFilterBar, ListResultLine, type ListFilterField } from '@/components/list-toolkit';
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
  const [filters, setFilters] = useState<ResultsFilters>({ element: null, level: null });
  const [search, setSearch] = useState('');
  const [pendingExpanded, setPendingExpanded] = useState(false);

  const elementLevelFiltered = useMemo(() => filterResults(results, filters), [results, filters]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return elementLevelFiltered;
    return elementLevelFiltered.filter(cls => cls.className.toLowerCase().includes(query));
  }, [elementLevelFiltered, search]);
  const { elements, levels } = useMemo(() => getFilterOptions(results), [results]);

  const { withPlacements, pending } = useMemo(() => {
    const w: typeof filtered = [];
    const p: typeof filtered = [];
    for (const c of filtered) {
      (c.placements.length > 0 ? w : p).push(c);
    }
    return { withPlacements: w, pending: p };
  }, [filtered]);

  const hasActiveFilters = Boolean(filters.element || filters.level || search.trim());

  // A field with a single possible value can never narrow anything, so it's
  // omitted — same rule the old per-field <select>s followed. Search stays
  // available regardless: unlike Element/Level it is never moot (Codex P2 on
  // PR #2566 — the search box used to be hidden along with these).
  const filterFields: ListFilterField[] = [
    ...(elements.length > 1
      ? [
          {
            kind: 'options' as const,
            key: 'element',
            label: 'Element',
            value: filters.element,
            onChange: (value: string | null) => setFilters(f => ({ ...f, element: value })),
            options: elements.map(element => ({ value: element, label: element })),
          },
        ]
      : []),
    ...(levels.length > 1
      ? [
          {
            kind: 'options' as const,
            key: 'level',
            label: 'Level',
            value: filters.level,
            onChange: (value: string | null) => setFilters(f => ({ ...f, level: value })),
            options: levels.map(level => ({ value: level, label: level })),
          },
        ]
      : []),
  ];

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
      <EmptyState
        icon={Trophy}
        title={emptyState.title}
        description={emptyState.description}
        action={null}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <ListFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by class name..."
          fields={filterFields}
          onClearAll={() => {
            setFilters({ element: null, level: null });
            setSearch('');
          }}
        />
        <ListResultLine
          shown={withPlacements.length}
          total={results.filter(cls => cls.placements.length > 0).length}
          noun={['class', 'classes']}
          filtered={hasActiveFilters}
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
