import { useEffect, useMemo, useRef } from 'react';
import { ArrowRight, CheckCircle2, Printer } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { calculateResultsRowsLeft } from '@/features/show-closeout/fromResultsRows';
import { useResultsSentCheck } from '@/features/show-closeout/useResultsSentCheck';
import { readHandlerToDecide } from '@/features/show-closeout/handlerToDecide';
import { buildFinishList } from '@/features/show-closeout/finishList';
import { FINISH_LIST_ANCHOR } from '@/features/show-map/cockpit/cockpitRoutes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { SecretaryEntry } from '@/services/database/entries';
import { trialLabelOf, type ResultsClassRow } from './buildResultsClassRows';

interface ResultsFinishRowProps {
  showId: string;
  trials: readonly SyncableTrial[];
  /** Every class in the show, so the list counts what the Results tab itself counts. */
  rows: readonly ResultsClassRow[];
  /** The show's entries, for the entries still left as "I'll decide at the show" (MYK9-2031). */
  entries: readonly SecretaryEntry[];
  /** Opens the after-show packet for a trial (MYK9-1924 phase 2a); absent = no packet button. */
  onOpenAfterShow?: (trialId: string) => void;
}

/**
 * "Finish the show" (MYK9-1945): everything left after the last class, in order, each line a link
 * to the place that does it. A line with nothing left shows a tick. The lines are
 * `calculateWhatIsLeft`'s (the same function the filter counts, Show Desk and the close step
 * read); a line that opens the class list filters it to exactly the classes the line counted.
 */
export function ResultsFinishRow({
  showId,
  trials,
  rows,
  entries,
  onOpenAfterShow,
}: ResultsFinishRowProps) {
  // Until the schedule is confirmed the rows may be partial: not loaded reads as "checking".
  const scheduleReady = useTrialStore(
    state => state.trialsHasConfirmedSnapshot && state.trialClassesHasConfirmedSnapshot
  );
  const sent = useResultsSentCheck(showId, scheduleReady ? rows : null);
  const items = useMemo(
    () =>
      buildFinishList(
        showId,
        calculateResultsRowsLeft(rows, trials, {
          ...sent,
          handlerToDecide: readHandlerToDecide(entries),
        })
      ),
    [entries, rows, sent, showId, trials]
  );
  const ref = useRef<HTMLElement>(null);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === `#${FINISH_LIST_ANCHOR}`) ref.current?.scrollIntoView?.({ block: 'start' });
  }, [hash]);
  return (
    <section
      id={FINISH_LIST_ANCHOR}
      ref={ref}
      aria-label="Finish the show"
      className="space-y-2 rounded-lg border bg-card p-3"
    >
      <h2 className="text-sm font-semibold">Finish the show</h2>
      <ul className="divide-y">
        {items.map(item => {
          const text = (
            <span
              className={cn(
                'flex items-center gap-2',
                item.state === 'done' && 'text-muted-foreground'
              )}
            >
              {item.state === 'done' && (
                <CheckCircle2 className="h-4 w-4 text-primary" aria-label="Done" />
              )}
              <span>
                {item.label}
                {item.note && (
                  <span className="block text-xs text-muted-foreground">{item.note}</span>
                )}
              </span>
            </span>
          );
          return (
            <li key={item.key}>
              {item.href === null ? (
                <div className="flex min-h-11 items-center justify-between gap-3 rounded-md py-1 text-sm">
                  {text}
                </div>
              ) : (
                <Link
                  to={item.href}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-md py-1 text-sm hover:bg-muted/50"
                >
                  {text}
                  <ArrowRight className="h-4 w-4 flex-none" aria-hidden="true" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {onOpenAfterShow && (
        <div className="flex flex-wrap gap-2 pt-1">
          {trials.map(trial => (
            <Button
              key={trial.id}
              type="button"
              variant="outline"
              className="min-h-11 gap-2"
              onClick={() => onOpenAfterShow(trial.id)}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              {trials.length > 1
                ? `After-show packet: ${trialLabelOf(trial)}`
                : 'After-show packet'}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
