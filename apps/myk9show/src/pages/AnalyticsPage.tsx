import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const { data: allEntries = [], isLoading } = useMyLifetimeStats();

  const [selectedDog, setSelectedDog] = useState<string>('all');
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

  const orgOptions = useMemo(() => {
    const set = new Set<string>();
    for (const entry of allEntries) {
      if (entry.organization) set.add(entry.organization);
    }
    return Array.from(set).sort();
  }, [allEntries]);

  const filteredEntries = useMemo(() => {
    let entries: StatsEntry[] = allEntries;
    if (selectedDog !== 'all') {
      entries = entries.filter((e) => e.dogId === selectedDog);
    }
    if (selectedOrg !== 'all') {
      entries = entries.filter((e) => e.organization === selectedOrg);
    }
    return entries;
  }, [allEntries, selectedDog, selectedOrg]);

  const summary = useMemo(
    () => computeSummaryStats(filteredEntries),
    [filteredEntries],
  );
  const dogStats = useMemo(
    () => computePerDogStats(filteredEntries),
    [filteredEntries],
  );
  const distribution = useMemo(
    () => computeResultDistribution(filteredEntries),
    [filteredEntries],
  );
  const fastestTimes = useMemo(
    () => computeFastestTimes(filteredEntries, FASTEST_TIMES_LIMIT),
    [filteredEntries],
  );
  const trend = useMemo(
    () => computeQualificationTrend(filteredEntries),
    [filteredEntries],
  );

  const hasData = allEntries.length > 0;
  const hasFilteredData = filteredEntries.length > 0;

  const filterControls = hasData ? (
    <>
      <Select value={selectedDog} onValueChange={setSelectedDog}>
        <SelectTrigger className="w-[180px]" data-testid="dog-filter">
          <SelectValue placeholder="All Dogs" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Dogs</SelectItem>
          {dogOptions.map((dog) => (
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
          {orgOptions.map((org) => (
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
        <div className="space-y-6">
          <StatsSummaryCards stats={summary} />

          {trend.length > 1 && <QualificationTrendChart data={trend} />}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResultDistributionChart data={distribution} />
            <DogBreakdownCards
              dogs={dogStats}
              onDogClick={(dogId) => navigate(`/dogs/${dogId}`)}
            />
          </div>

          {fastestTimes.length > 0 && (
            <FastestTimesTable times={fastestTimes} showShowColumn />
          )}
        </div>
      )}
    </PageShell>
  );
}
