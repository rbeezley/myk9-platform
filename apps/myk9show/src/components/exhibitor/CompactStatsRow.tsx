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
import { FileText, Calendar, DollarSign, History, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  CURRENT_ENTRIES_LABEL,
  CURRENT_ENTRIES_QUALIFIER,
} from '@/pages/MyEntriesPage/modules/myShowsCopy';

interface StatItem {
  icon: ReactNode;
  label: string;
  /** Small muted sub-label rendered under the label, above the value. */
  qualifier?: string;
  value: number;
  displayValue?: string;
  /** When set, renders a quiet text state instead of a large numeric/dollar value. */
  quietValue?: string;
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
  completedShows: number;
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
  completedShows,
  currentFees,
  amountDue,
  currentFeesHref,
  onNavigate,
  className,
}: CompactStatsRowProps) {
  const [expanded, setExpanded] = useState(false);
  const currentEntries = acceptedEntries + pendingEntries;
  const paidInFull = amountDue <= 0;
  const feeHref = paidInFull ? '/exhibitor/payments' : (currentFeesHref ?? '/cart');
  const stats: StatItem[] = [
    {
      icon: <FileText className="h-5 w-5" />,
      // exhibitor-count-integrity: this card is intentionally scoped to CURRENT
      // (non-past) entries, while the My Entries "All" tab below counts every
      // entry ever made (including completed/past shows) — a different scope
      // with the same generic "Entries" word read as a contradiction in the
      // audit. The visible label + qualifier below name the scope explicitly
      // so the two numbers are never read as the same count.
      label: CURRENT_ENTRIES_LABEL,
      qualifier: CURRENT_ENTRIES_QUALIFIER,
      value: currentEntries,
      detail: `${acceptedEntries} accepted · ${pendingEntries} pending`,
      // Was `/exhibitor/entries` — a navigation to the page you are already on,
      // i.e. a chevron and a "View details" label that did nothing. This card
      // counts upcoming + in-review entries, so the Upcoming tab is the filter
      // that actually shows them.
      href: '/exhibitor/entries?tab=upcoming',
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
      // Counts shows the exhibitor is DONE with — every run scored, or the
      // show over — because this card deep-links to the Completed tab, which
      // uses that same rule. Labelled "Past" while counting past-by-date, it
      // could read 0 beside a non-empty tab during a show being scored.
      label: completedShows === 1 ? 'Completed Show' : 'Completed Shows',
      value: completedShows,
      detail: 'entered',
      href: '/exhibitor/entries?tab=completed',
      iconColor: 'text-muted-foreground',
    },
    {
      icon: <DollarSign className="h-5 w-5" />,
      label: 'Current Fees',
      value: currentFees,
      ...(paidInFull
        ? { quietValue: 'Paid in full' }
        : {
            displayValue: `$${currentFees.toLocaleString()}`,
            detail: `Amount due $${amountDue.toLocaleString()}`,
            detailClassName: 'text-warning',
          }),
      href: feeHref,
      iconColor: paidInFull ? 'text-success' : 'text-warning',
      iconChipClassName: paidInFull
        ? 'border-success/25 bg-success/10'
        : 'border-warning/30 bg-warning/10',
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
          'hidden max-[720px]:flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm',
          'active:scale-[0.99] transition-all duration-state',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          expanded && 'mb-3'
        )}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          <span className="font-semibold text-foreground tabular-nums">{currentEntries}</span>
          <span className="text-muted-foreground">
            {currentEntries === 1 ? 'entry' : 'entries'}
          </span>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <span className="font-semibold text-foreground tabular-nums">{upcomingShows}</span>
          <span className="text-muted-foreground">upcoming</span>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          {amountDue > 0 ? (
            <span className="font-semibold text-warning tabular-nums">
              ${amountDue.toLocaleString()} due
            </span>
          ) : (
            <span className="text-muted-foreground tabular-nums">Paid in full</span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-state',
            expanded && 'rotate-180'
          )}
        />
      </button>

      <div
        id="exhibitor-stat-cards"
        className={cn(
          // Narrow phones stay one-up: at 390px, two columns leave only ~66px
          // for text after icon, gap, and padding, which clips the readable 14px
          // scope/detail copy. Wider phones and tablets return to two columns;
          // four-across only returns at xl, where the persistent sidebar still
          // leaves enough width for every label and detail.
          'grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4',
          !expanded && 'max-[720px]:hidden'
        )}
      >
        {stats.map(stat => (
          <button
            key={stat.label}
            type="button"
            onClick={() => onNavigate(stat.href)}
            className={cn(
              'group relative min-h-[92px] overflow-hidden rounded-xl border border-border bg-card p-3 text-left shadow-sm',
              'hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]',
              'transition-all duration-enter',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
            )}
            aria-label={`${stat.label}: ${stat.quietValue ?? stat.value}.${stat.qualifier ? ` ${stat.qualifier}.` : ''}${stat.detail ? ` ${stat.detail}.` : ''} View details.`}
          >
            <ChevronRight
              aria-hidden="true"
              className="absolute right-3 top-3 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-muted-foreground"
            />
            <span className="flex items-start gap-4 pr-4">
              <span
                data-slot="icon"
                className={cn(
                  'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted shadow-sm',
                  stat.iconChipClassName,
                  stat.iconColor
                )}
              >
                {stat.icon}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </span>
                {stat.qualifier && (
                  <span className="text-xs font-medium text-muted-foreground">
                    {stat.qualifier}
                  </span>
                )}
                {stat.quietValue ? (
                  <span className="text-sm font-semibold leading-none text-muted-foreground">
                    {stat.quietValue}
                  </span>
                ) : (
                  <span className="text-2xl font-bold leading-none text-foreground tabular-nums">
                    {stat.displayValue ?? stat.value}
                  </span>
                )}
                {stat.detail && (
                  <span
                    className={cn(
                      'truncate text-xs font-medium text-muted-foreground',
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
