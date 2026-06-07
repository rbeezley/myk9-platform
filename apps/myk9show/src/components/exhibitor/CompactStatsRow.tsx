/**
 * CompactStatsRow — At-a-glance stat cards for the exhibitor dashboard.
 *
 * Each stat is a tappable card with a large number, label, and accent icon.
 * Cards use subtle background tints to add warmth and visual distinction.
 */

import { cn } from '@/lib/utils';
import { FileText, Calendar, DollarSign, History } from 'lucide-react';
import { type ReactNode } from 'react';

interface StatItem {
  icon: ReactNode;
  label: string;
  value: number;
  displayValue?: string;
  href: string;
  accent: string;
  tint: string;
  iconColor: string;
}

interface CompactStatsRowProps {
  activeEntries: number;
  upcomingShows: number;
  pastShows: number;
  totalFees: number;
  onNavigate: (path: string) => void;
  className?: string | undefined;
}

export function CompactStatsRow({
  activeEntries,
  upcomingShows,
  pastShows,
  totalFees,
  onNavigate,
  className,
}: CompactStatsRowProps) {
  const stats: StatItem[] = [
    {
      icon: <FileText className="h-5 w-5" />,
      label: activeEntries === 1 ? 'Active Show Entry' : 'Active Show Entries',
      value: activeEntries,
      href: '/exhibitor/entries',
      accent: 'bg-primary',
      tint: 'bg-primary/8 dark:bg-primary/12 border-primary/15',
      iconColor: 'text-primary',
    },
    {
      icon: <Calendar className="h-5 w-5" />,
      label: upcomingShows === 1 ? 'Upcoming Show' : 'Upcoming Shows',
      value: upcomingShows,
      href: '/shows',
      accent: 'bg-blue-500',
      tint: 'bg-blue-500/8 dark:bg-blue-500/12 border-blue-500/15',
      iconColor: 'text-blue-500',
    },
    {
      icon: <History className="h-5 w-5" />,
      label: pastShows === 1 ? 'Past Show' : 'Past Shows',
      value: pastShows,
      href: '/exhibitor/entries?tab=completed',
      accent: 'bg-violet-500',
      tint: 'bg-violet-500/8 dark:bg-violet-500/12 border-violet-500/15',
      iconColor: 'text-violet-500',
    },
    {
      icon: <DollarSign className="h-5 w-5" />,
      label: 'Total Fees',
      value: totalFees,
      displayValue: `$${totalFees.toLocaleString()}`,
      href: '/exhibitor/entries',
      accent: 'bg-emerald-500',
      tint: 'bg-emerald-500/8 dark:bg-emerald-500/12 border-emerald-500/15',
      iconColor: 'text-emerald-500',
    },
  ];

  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>
      {stats.map(stat => (
        <button
          key={stat.label}
          type="button"
          onClick={() => onNavigate(stat.href)}
          className={cn(
            'group relative min-h-[112px] overflow-hidden rounded-lg border p-4 text-left shadow-sm',
            stat.tint,
            'hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]',
            'transition-all duration-300',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
          )}
          aria-label={`${stat.value} ${stat.label}. View details.`}
        >
          <span className={cn('absolute inset-x-0 top-0 h-1', stat.accent)} aria-hidden="true" />
          <span className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </span>
              <span className="text-3xl font-bold leading-none text-foreground tabular-nums">
                {stat.displayValue ?? stat.value}
              </span>
            </span>
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg bg-background/70 shadow-sm ring-1 ring-border/60',
                stat.iconColor
              )}
            >
              {stat.icon}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
