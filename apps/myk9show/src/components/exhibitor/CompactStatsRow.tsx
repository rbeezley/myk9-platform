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
      label: activeEntries === 1 ? 'Active Entry' : 'Active Entries',
      value: activeEntries,
      href: '/exhibitor/entries',
      tint: 'bg-primary/8 dark:bg-primary/12 border-primary/15',
      iconColor: 'text-primary',
    },
    {
      icon: <Calendar className="h-5 w-5" />,
      label: upcomingShows === 1 ? 'Upcoming Show' : 'Upcoming Shows',
      value: upcomingShows,
      href: '/shows',
      tint: 'bg-blue-500/8 dark:bg-blue-500/12 border-blue-500/15',
      iconColor: 'text-blue-500',
    },
    {
      icon: <History className="h-5 w-5" />,
      label: pastShows === 1 ? 'Past Show' : 'Past Shows',
      value: pastShows,
      href: '/exhibitor/entries?tab=completed',
      tint: 'bg-purple-500/8 dark:bg-purple-500/12 border-purple-500/15',
      iconColor: 'text-purple-400',
    },
    {
      icon: <DollarSign className="h-5 w-5" />,
      label: 'Total Fees',
      value: totalFees,
      displayValue: `$${totalFees.toLocaleString()}`,
      href: '/exhibitor/entries',
      tint: 'bg-emerald-500/8 dark:bg-emerald-500/12 border-emerald-500/15',
      iconColor: 'text-emerald-500',
    },
  ];

  return (
    <div className={cn('grid grid-cols-4 gap-3', className)}>
      {stats.map(stat => (
        <button
          key={stat.href}
          type="button"
          onClick={() => onNavigate(stat.href)}
          className={cn(
            'flex flex-col items-center gap-1.5 rounded-xl border p-4',
            stat.tint,
            'hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]',
            'transition-all duration-300 min-h-[48px]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
          )}
          aria-label={`${stat.value} ${stat.label}. View details.`}
        >
          <div className={cn('opacity-70', stat.iconColor)}>{stat.icon}</div>
          <span className="text-2xl font-bold text-foreground tabular-nums">
            {stat.displayValue ?? stat.value}
          </span>
          <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
        </button>
      ))}
    </div>
  );
}
