/**
 * CompactStatsRow — At-a-glance stat cards for the exhibitor dashboard.
 *
 * Each stat is a tappable card with an accent icon, large number, and label.
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
  detail?: string;
  detailClassName?: string;
  href: string;
  iconColor: string;
  iconChipClassName?: string;
}

interface CompactStatsRowProps {
  acceptedEntries: number;
  pendingEntries: number;
  upcomingShows: number;
  pastShows: number;
  currentFees: number;
  amountDue: number;
  onNavigate: (path: string) => void;
  className?: string | undefined;
}

export function CompactStatsRow({
  acceptedEntries,
  pendingEntries,
  upcomingShows,
  pastShows,
  currentFees,
  amountDue,
  onNavigate,
  className,
}: CompactStatsRowProps) {
  const currentEntries = acceptedEntries + pendingEntries;
  const feeDetail = amountDue > 0 ? `Amount due $${amountDue.toLocaleString()}` : 'Paid in full';
  const stats: StatItem[] = [
    {
      icon: <FileText className="h-5 w-5" />,
      label: currentEntries === 1 ? 'Entry' : 'Entries',
      value: currentEntries,
      detail: `${acceptedEntries} accepted · ${pendingEntries} pending`,
      href: '/exhibitor/entries',
      iconColor: 'text-muted-foreground',
    },
    {
      icon: <Calendar className="h-5 w-5" />,
      label: upcomingShows === 1 ? 'Upcoming Show' : 'Upcoming Shows',
      value: upcomingShows,
      detail: 'entered',
      href: '/shows',
      iconColor: 'text-muted-foreground',
    },
    {
      icon: <History className="h-5 w-5" />,
      label: pastShows === 1 ? 'Past Show' : 'Past Shows',
      value: pastShows,
      detail: 'entered',
      href: '/exhibitor/entries?tab=completed',
      iconColor: 'text-muted-foreground',
    },
    {
      icon: <DollarSign className="h-5 w-5" />,
      label: 'Current Fees',
      value: currentFees,
      displayValue: `$${currentFees.toLocaleString()}`,
      detail: feeDetail,
      ...(amountDue > 0 ? { detailClassName: 'text-amber-500' } : {}),
      href: '/exhibitor/entries',
      iconColor: amountDue > 0 ? 'text-amber-500' : 'text-emerald-500',
      iconChipClassName:
        amountDue > 0
          ? 'border-amber-500/30 bg-amber-500/10'
          : 'border-emerald-500/25 bg-emerald-500/10',
    },
  ];

  return (
    <div className={cn('grid grid-cols-4 gap-3 max-[720px]:grid-cols-2', className)}>
      {stats.map(stat => (
        <button
          key={stat.label}
          type="button"
          onClick={() => onNavigate(stat.href)}
          className={cn(
            'group relative min-h-[92px] overflow-hidden rounded-lg border border-border/60 bg-card/70 p-3 text-left shadow-sm',
            'hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]',
            'transition-all duration-300',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
          )}
          aria-label={`${stat.value} ${stat.label}. View details.`}
        >
          <span className="flex items-start gap-4">
            <span
              data-slot="icon"
              className={cn(
                'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-muted-foreground/20 bg-muted/25 shadow-sm',
                stat.iconChipClassName,
                stat.iconColor
              )}
            >
              {stat.icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </span>
              <span className="text-2xl font-bold leading-none text-foreground tabular-nums">
                {stat.displayValue ?? stat.value}
              </span>
              {stat.detail && (
                <span
                  className={cn(
                    'truncate text-[11px] font-medium text-muted-foreground',
                    stat.detailClassName
                  )}
                >
                  {stat.detail}
                </span>
              )}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
