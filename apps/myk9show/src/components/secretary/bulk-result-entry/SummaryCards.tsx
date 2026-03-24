import { Users, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';

interface SummaryCardsProps {
  totalEntries: number;
  entriesWithData: number;
  validEntries: number;
  invalidEntries: number;
}

export function SummaryCards({
  totalEntries,
  entriesWithData,
  validEntries,
  invalidEntries,
}: SummaryCardsProps) {
  const dataProgress = totalEntries > 0 ? Math.round((entriesWithData / totalEntries) * 100) : 0;
  const validProgress = totalEntries > 0 ? Math.round((validEntries / totalEntries) * 100) : 0;
  const invalidProgress = totalEntries > 0 ? Math.round((invalidEntries / totalEntries) * 100) : 0;

  return (
    <StatsGrid columns={4}>
      <StatCard
        icon={Users}
        title="Total Entries"
        value={totalEntries}
        color="primary"
        progress={100}
      />
      <StatCard
        icon={FileText}
        title="With Data"
        value={entriesWithData}
        color="blue"
        progress={dataProgress}
      />
      <StatCard
        icon={CheckCircle}
        title="Valid"
        value={validEntries}
        color="emerald"
        progress={validProgress}
      />
      <StatCard
        icon={AlertCircle}
        title="Invalid"
        value={invalidEntries}
        color="red"
        progress={invalidProgress}
      />
    </StatsGrid>
  );
}
