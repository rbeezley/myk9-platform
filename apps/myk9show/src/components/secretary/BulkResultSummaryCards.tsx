import { Users, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';
import type { BulkEntrySummary } from './bulk-result-entry-utils';

interface BulkResultSummaryCardsProps {
  summary: BulkEntrySummary;
}

export function BulkResultSummaryCards({ summary }: BulkResultSummaryCardsProps) {
  const withDataProgress =
    summary.totalEntries > 0
      ? Math.round((summary.entriesWithData / summary.totalEntries) * 100)
      : 0;
  const validProgress =
    summary.totalEntries > 0 ? Math.round((summary.validEntries / summary.totalEntries) * 100) : 0;
  const invalidProgress =
    summary.totalEntries > 0
      ? Math.round((summary.invalidEntries / summary.totalEntries) * 100)
      : 0;

  return (
    <StatsGrid columns={4}>
      <StatCard
        icon={Users}
        title="Total Entries"
        value={summary.totalEntries}
        color="primary"
        progress={100}
      />
      <StatCard
        icon={FileText}
        title="With Data"
        value={summary.entriesWithData}
        color="blue"
        progress={withDataProgress}
      />
      <StatCard
        icon={CheckCircle}
        title="Valid"
        value={summary.validEntries}
        color="emerald"
        progress={validProgress}
      />
      <StatCard
        icon={AlertCircle}
        title="Invalid"
        value={summary.invalidEntries}
        color="red"
        progress={invalidProgress}
      />
    </StatsGrid>
  );
}
