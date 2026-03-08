import React from 'react';
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card';

export interface RecordStat {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (stats.length === 0) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(({ subtitle, ...rest }) => (
        <StatCard key={rest.title} {...rest} {...(subtitle ? { subtitle } : {})} />
      ))}
    </div>
  );
}
