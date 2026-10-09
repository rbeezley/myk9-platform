import { ArrowRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { LIST_NAVIGATION_STATE } from '@/components/layout/listNavigation';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ResultsClassRow } from './buildResultsClassRows';
import { RESULTS_PHASE_LABEL, type ResultsClassPhase } from './resultsNextAction';
import { getOverviewFocusHref, getResultsClassHref } from './resultsTabRoutes';

const PHASE_CHIP_CLASS: Partial<Record<ResultsClassPhase, string>> = {
  'needs-checking': 'border-warning/40 bg-warning/10 text-foreground',
  'ready-to-release': 'border-warning/40 bg-warning/10 text-foreground',
  released: 'border-primary/30 bg-primary/10 text-foreground',
  'needs-initials': 'border-primary/30 bg-primary/10 text-foreground',
  done: 'border-success/40 bg-success/10 text-foreground',
};

export function ResultsStatusChip({
  phase,
  label,
}: {
  phase: ResultsClassPhase;
  /** The registry's wording where it differs from the phase's default (initials or signature). */
  label?: string | undefined;
}) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', PHASE_CHIP_CLASS[phase])}>
      {label ?? RESULTS_PHASE_LABEL[phase]}
    </Badge>
  );
}

/**
 * One row per class: name, trial and judge, Scored, Status and Next action. The name opens the
 * class on the right; Next action goes where the work is (Overview for a class still being scored,
 * otherwise the same detail, whose Primary work card carries the step).
 */
export function ResultsClassList({
  showId,
  rows,
  selectedId,
}: {
  showId: string;
  rows: readonly ResultsClassRow[];
  selectedId: string | null;
}) {
  const { search } = useLocation();
  return (
    <ul className="divide-y divide-border rounded-lg border bg-card" aria-label="Classes">
      {rows.map(row => {
        const selected = row.id === selectedId;
        const nextHref =
          row.nextAction.kind === 'overview'
            ? getOverviewFocusHref(showId, row.id)
            : getResultsClassHref(showId, row.id, search);
        const hasAction = row.nextAction.kind !== 'none';
        return (
          <li
            key={row.id}
            className={cn(
              'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2',
              selected && 'bg-primary/10'
            )}
          >
            <Link
              to={getResultsClassHref(showId, row.id, search)}
              state={LIST_NAVIGATION_STATE}
              aria-current={selected ? 'page' : undefined}
              className="flex min-h-11 min-w-0 flex-col justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate text-sm font-medium">{row.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[row.trialLabel, row.judgeName].filter(Boolean).join(' · ')}
              </span>
            </Link>
            {hasAction ? (
              <Link
                to={nextHref}
                aria-label={`${row.nextAction.label}: ${row.name}`}
                className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {row.nextAction.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <span className="px-2 text-sm text-muted-foreground">
                <span aria-hidden="true">—</span>
                <span className="sr-only">Nothing to do</span>
              </span>
            )}
            <div className="col-span-2 flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                Scored{' '}
                <span className="font-medium text-foreground">
                  {row.scoredCount} / {row.expectedCount}
                </span>
              </span>
              <ResultsStatusChip phase={row.phase} label={row.phaseLabel} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
