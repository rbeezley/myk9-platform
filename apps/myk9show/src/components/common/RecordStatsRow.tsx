import type { LucideIcon } from 'lucide-react';
import { StatCard, StatCardSkeleton, StatsGrid } from '@myk9/ui';

export interface RecordStat {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
}

interface RecordStatsRowProps {
  stats: RecordStat[];
  isLoading?: boolean;
}

/**
 * Responsive row of StatCards for record detail page headers.
 * 4 columns on desktop, 2x2 on mobile.
 */
export function RecordStatsRow({ stats, isLoading }: RecordStatsRowProps) {
  if (isLoading) {
    return (
      <StatsGrid columns={4}>
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </StatsGrid>
    );
  }

  if (stats.length === 0) return null;

  return (
    <StatsGrid columns={4}>
      {stats.map(({ subtitle, ...rest }) => (
        <StatCard key={rest.title} {...rest} {...(subtitle ? { subtitle } : {})} />
      ))}
    </StatsGrid>
  );
}
