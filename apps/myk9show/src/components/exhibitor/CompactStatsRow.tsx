/**
 * CompactStatsRow — At-a-glance stat cards for the exhibitor dashboard.
 *
 * Each stat is a tappable card with a compact icon chip, large number, and label.
 * Cards stay neutral so state colors only appear when they carry meaning.
 *
 * INTENT: On phones (≤720px) the four-card grid is collapsed behind a single
 * summary line so the exhibitor's schedule (the entry cards below) is fast to
 * reach — "this respects my time". The summary still surfaces the actionable fee
 * balance, and one tap expands the full grid so every deep-link is preserved.
 * Desktop is unchanged: the grid always shows and the summary toggle is hidden.
 */

import { cn } from '@/lib/utils';
import { FileText, Calendar, DollarSign, History, ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';

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
  currentFeesHref?: string;
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
  currentFeesHref,
  onNavigate,
  className,
}: CompactStatsRowProps) {
  const [expanded, setExpanded] = useState(false);
  const currentEntries = acceptedEntries + pendingEntries;
  const feeDetail = amountDue > 0 ? `Amount due $${amountDue.toLocaleString()}` : 'Paid in full';
  const feeHref = amountDue > 0 ? (currentFeesHref ?? '/cart') : '/exhibitor/entries';
  const stats: StatItem[] = [
    {
      icon: <FileText className="h-5 w-5" />,
      // exhibitor-count-integrity: this is intentionally scoped to CURRENT
      // (non-past) entries, while the My Entries "All" tab below counts every
      // entry ever made (including completed/past shows) — a different scope
      // with the same generic "Entries" word read as a contradiction in the
      // audit. Naming the scope here removes the ambiguity without changing
      // either number.
      label: currentEntries === 1 ? 'Current Entry' : 'Current Entries',
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
      ...(amountDue > 0 ? { detailClassName: 'text-warning' } : {}),
      href: feeHref,
      iconColor: amountDue > 0 ? 'text-warning' : 'text-success',
      iconChipClassName:
        amountDue > 0 ? 'border-warning/30 bg-warning/10' : 'border-success/25 bg-success/10',
    },
  ];

  return (
    <div className={className}>
      {/* Mobile-only summary line. Collapses the four-card grid so the schedule
          below is reachable without scrolling past a 2×2 block of cards. Hidden
          on desktop (≥721px), where the grid is always shown. */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        aria-expanded={expanded}
        aria-controls="exhibitor-stat-cards"
        className={cn(
          'hidden max-[720px]:flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 text-left shadow-sm',
          'active:scale-[0.99] transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          expanded && 'mb-3'
        )}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          <span className="font-semibold text-foreground tabular-nums">{currentEntries}</span>
          <span className="text-muted-foreground">
            {currentEntries === 1 ? 'entry' : 'entries'}
          </span>
          <span aria-hidden className="text-muted-foreground/50">
            ·
          </span>
          <span className="font-semibold text-foreground tabular-nums">{upcomingShows}</span>
          <span className="text-muted-foreground">upcoming</span>
          <span aria-hidden className="text-muted-foreground/50">
            ·
          </span>
          {amountDue > 0 ? (
            <span className="font-semibold text-warning tabular-nums">
              ${amountDue.toLocaleString()} due
            </span>
          ) : (
            <span className="text-muted-foreground tabular-nums">
              ${currentFees.toLocaleString()} fees
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        />
      </button>

      <div
        id="exhibitor-stat-cards"
        className={cn(
          // Base 2 columns covers the phone grid (≤720px, revealed behind the
          // summary toggle) AND every tablet/small-laptop width up to xl. The
          // 4-across grid only returns at ≥1280px (xl): the persistent ~310px
          // sidebar means a viewport below xl leaves the grid < ~830px, at
          // which four cells truncate the "N accepted · N pending" detail
          // (measured live — clips at 1024px). At xl the grid is ~970px and
          // four 234px tiles fit cleanly, so desktop keeps its four-across row.
          'grid grid-cols-2 gap-3 xl:grid-cols-4',
          !expanded && 'max-[720px]:hidden'
        )}
      >
        {stats.map(stat => (
          <button
            key={stat.label}
            type="button"
            onClick={() => onNavigate(stat.href)}
            className={cn(
              'group relative min-h-[92px] overflow-hidden rounded-xl border border-border/60 bg-card p-3 text-left shadow-sm',
              'hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]',
              'transition-all duration-300',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
            )}
            aria-label={`${stat.value} ${stat.label}.${stat.detail ? ` ${stat.detail}.` : ''} View details.`}
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
    </div>
  );
}
