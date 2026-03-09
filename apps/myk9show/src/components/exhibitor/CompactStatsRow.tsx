/**
 * CompactStatsRow — Inline stats replacing the 4 large GlassCards.
 *
 * Renders key numbers as compact, clickable badges in a horizontal row.
 * Wraps on mobile, stays inline on desktop.
 */

import { cn } from '@/lib/utils';
import { FileText, Calendar, Heart } from 'lucide-react';
import { type ReactNode } from 'react';

interface StatItem {
  icon: ReactNode;
  singular: string;
  plural: string;
  value: number;
  href: string;
}

interface CompactStatsRowProps {
  activeEntries: number;
  upcomingShows: number;
  totalDogs: number;
  onNavigate: (path: string) => void;
  className?: string | undefined;
}

export function CompactStatsRow({
  activeEntries,
  upcomingShows,
  totalDogs,
  onNavigate,
  className,
}: CompactStatsRowProps) {
  const stats: StatItem[] = [
    {
      icon: <FileText className="h-3.5 w-3.5" />,
      singular: 'active entry',
      plural: 'active entries',
      value: activeEntries,
      href: '/exhibitor/entries',
    },
    {
      icon: <Calendar className="h-3.5 w-3.5" />,
      singular: 'upcoming show',
      plural: 'upcoming shows',
      value: upcomingShows,
      href: '/shows',
    },
    {
      icon: <Heart className="h-3.5 w-3.5" />,
      singular: 'dog registered',
      plural: 'dogs registered',
      value: totalDogs,
      href: '/dogs',
    },
  ];

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {stats.map(stat => (
        <button
          key={stat.href}
          type="button"
          onClick={() => onNavigate(stat.href)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
            'bg-muted/50 hover:bg-muted text-sm text-muted-foreground hover:text-foreground',
            'transition-colors duration-200 min-h-[36px]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
          )}
          aria-label={`${stat.value} ${stat.value === 1 ? stat.singular : stat.plural}. View details.`}
        >
          {stat.icon}
          <span className="font-semibold">{stat.value}</span>
          <span>{stat.value === 1 ? stat.singular : stat.plural}</span>
        </button>
      ))}
    </div>
  );
}
