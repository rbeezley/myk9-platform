import { useEffect, useMemo, useRef } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { calculateResultsRowsLeft } from '@/features/show-closeout/fromResultsRows';
import { buildFinishList } from '@/features/show-closeout/finishList';
import { FINISH_LIST_ANCHOR } from '@/features/show-map/cockpit/cockpitRoutes';
import { cn } from '@/lib/utils';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ResultsClassRow } from './buildResultsClassRows';

interface ResultsFinishRowProps {
  showId: string;
  trials: readonly SyncableTrial[];
  /** Every class in the show, so the list counts what the Results tab itself counts. */
  rows: readonly ResultsClassRow[];
}

/**
 * "Finish the show" (MYK9-1945): everything left after the last class, in order, each line a link
 * to the place that does it. A line with nothing left shows a tick. The lines are
 * `calculateWhatIsLeft`'s (the same function the filter counts, Show Desk and the close step
 * read); a line that opens the class list filters it to exactly the classes the line counted.
 */
export function ResultsFinishRow({ showId, trials, rows }: ResultsFinishRowProps) {
  const items = useMemo(
    () => buildFinishList(showId, calculateResultsRowsLeft(rows, trials)),
    [rows, showId, trials]
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
              {item.label}
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
    </section>
  );
}
