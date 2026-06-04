import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { useMyLifetimeStats } from '@/hooks/queries/useMyLifetimeStats';
import {
  computeSummaryStats,
  computePerDogStats,
  computeResultDistribution,
  computeFastestTimes,
  computeQualificationTrend,
} from '@/components/analytics/analytics-utils';
import type { StatsEntry } from '@/components/analytics/analytics-utils';
import {
  StatsSummaryCards,
  StatsSummaryCardsSkeleton,
} from '@/components/analytics/StatsSummaryCards';
import { ResultDistributionChart } from '@/components/analytics/ResultDistributionChart';
import { DogBreakdownCards } from '@/components/analytics/DogBreakdownCards';
import { FastestTimesTable } from '@/components/analytics/FastestTimesTable';
import { QualificationTrendChart } from '@/components/analytics/QualificationTrendChart';
import { useSubscriptionGate, TRIAL_SHOW_LIMIT } from '@/hooks/useSubscriptionGate';
import { FeatureGate } from '@/components/subscription/FeatureGate';
import { useTrackSectionView, TRACKED_SECTIONS } from '@/hooks/useTrackSectionView';
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const FASTEST_TIMES_LIMIT = 10;

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: allEntries = [], isLoading } = useMyLifetimeStats();

  const selectedDog = searchParams.get('dog') ?? 'all';
  const [selectedOrg, setSelectedOrg] = useState<string>('all');

  const dogOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of allEntries) {
      if (!map.has(entry.dogId)) {
        map.set(entry.dogId, entry.dogCallName);
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [allEntries]);

  // Coerce unknown/stale dog IDs to 'all' once data has loaded.
  // Without this, a bookmarked ?dog=<deleted-id> filters to zero entries and
  // hasFilteredData is false, leaving users with header + filters but no body.
  const effectiveDog =
    isLoading || selectedDog === 'all' || dogOptions.some(d => d.id === selectedDog)
      ? selectedDog
      : 'all';

  const orgOptions = useMemo(() => {
    const set = new Set<string>();
    for (const entry of allEntries) {
      if (entry.organization) set.add(entry.organization);
    }
    return Array.from(set).sort();
  }, [allEntries]);

  const filteredEntries = useMemo(() => {
    let entries: StatsEntry[] = allEntries;
    if (effectiveDog !== 'all') {
      entries = entries.filter(e => e.dogId === effectiveDog);
    }
    if (selectedOrg !== 'all') {
      entries = entries.filter(e => e.organization === selectedOrg);
    }
    return entries;
  }, [allEntries, effectiveDog, selectedOrg]);

  const summary = useMemo(() => computeSummaryStats(filteredEntries), [filteredEntries]);
  const dogStats = useMemo(() => computePerDogStats(filteredEntries), [filteredEntries]);
  const distribution = useMemo(() => computeResultDistribution(filteredEntries), [filteredEntries]);
  const fastestTimes = useMemo(
    () => computeFastestTimes(filteredEntries, FASTEST_TIMES_LIMIT),
    [filteredEntries]
  );
  const trend = useMemo(() => computeQualificationTrend(filteredEntries), [filteredEntries]);

  const scoredShowCount = useMemo(() => {
    const showIds = new Set(allEntries.filter(e => e.resultText !== 'pending').map(e => e.showId));
    return showIds.size;
  }, [allEntries]);

  const { tier, isInTrial } = useSubscriptionGate(
    isLoading ? undefined : { trialShowCount: scoredShowCount }
  );

  const pageRef = useTrackSectionView(TRACKED_SECTIONS.LIFETIME_PAGE, 'analytics');
  const trendRef = useTrackSectionView(TRACKED_SECTIONS.QUALIFICATION_TREND, 'analytics');
  const dogBreakdownRef = useTrackSectionView(TRACKED_SECTIONS.DOG_BREAKDOWN, 'analytics');
  const fastestTimesRef = useTrackSectionView(TRACKED_SECTIONS.FASTEST_TIMES, 'analytics');

  const hasData = allEntries.length > 0;
  const hasFilteredData = filteredEntries.length > 0;

  const filterControls = hasData ? (
    <>
      <Select
        value={effectiveDog}
        onValueChange={value => {
          setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (value === 'all') next.delete('dog');
            else next.set('dog', value);
            return next;
          });
        }}
      >
        <SelectTrigger className="w-[180px]" data-testid="dog-filter">
          <SelectValue placeholder="All Dogs" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Dogs</SelectItem>
          {dogOptions.map(dog => (
            <SelectItem key={dog.id} value={dog.id}>
              {dog.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={selectedOrg} onValueChange={setSelectedOrg}>
        <SelectTrigger className="w-[180px]" data-testid="org-filter">
          <SelectValue placeholder="All Organizations" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Organizations</SelectItem>
          {orgOptions.map(org => (
            <SelectItem key={org} value={org}>
              {org}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  ) : null;

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[{ label: 'My Analytics', href: '/analytics' }]}
        title="My Analytics"
        actions={filterControls}
      />

      {isInTrial && hasData && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          You&apos;re exploring Premium Analytics free for your first {TRIAL_SHOW_LIMIT} shows.
          You&apos;ve used {scoredShowCount} of {TRIAL_SHOW_LIMIT}.{' '}
          <Link to="/pricing-page" className="font-medium underline">
            Learn more
          </Link>
        </div>
      )}

      {isLoading && <StatsSummaryCardsSkeleton />}

      {!isLoading && !hasData && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BarChart3 className="h-16 w-16 text-muted-foreground/40 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Analytics Yet</h2>
          <p className="text-muted-foreground max-w-md">
            Enter shows and get scored to see your performance analytics here.
          </p>
        </div>
      )}

      {!isLoading && hasFilteredData && (
        <div ref={pageRef} className="space-y-6">
          <StatsSummaryCards stats={summary} />

          <ResultDistributionChart data={distribution} />

          <FeatureGate feature="performance_stats" userPlan={tier}>
            {trend.length > 1 && (
              <div ref={trendRef}>
                <QualificationTrendChart data={trend} />
              </div>
            )}
          </FeatureGate>

          <FeatureGate feature="performance_stats" userPlan={tier}>
            <div ref={dogBreakdownRef}>
              <DogBreakdownCards dogs={dogStats} onDogClick={dogId => navigate(`/dogs/${dogId}`)} />
            </div>
          </FeatureGate>

          <FeatureGate feature="performance_stats" userPlan={tier}>
            {fastestTimes.length > 0 && (
              <div ref={fastestTimesRef}>
                <FastestTimesTable times={fastestTimes} showShowColumn />
              </div>
            )}
          </FeatureGate>
        </div>
      )}
    </PageShell>
  );
}
