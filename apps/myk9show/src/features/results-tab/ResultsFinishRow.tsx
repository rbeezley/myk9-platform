import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { getTrialRegistry } from '@/features/registries';
import type { SyncableTrial } from '@/store/trial-store-types';
import { getResultsStepHref } from './resultsTabRoutes';

interface ResultsFinishRowProps {
  showId: string;
  /** A show has exactly one registry, so the first trial names it. */
  trials: readonly SyncableTrial[];
  /** Every class that ran is released and signed off by the judge. */
  allDone: boolean;
}

/**
 * The end of the show, always on the Results tab: send the results to the registry, then close the
 * show. Both stay visible from the start so nobody has to hunt for them; the hint says when they
 * are due. The buttons are links to the same pages the tab has always had (`?step=submit` and
 * `?step=close`).
 */
export function ResultsFinishRow({ showId, trials, allDone }: ResultsFinishRowProps) {
  const firstTrial = trials[0];
  const submitLabel = firstTrial
    ? `Submit to ${getTrialRegistry(firstTrial).id}`
    : 'Submit to registry';
  return (
    <section
      aria-label="Finish the show"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border bg-card p-3"
    >
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {allDone && <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />}
        {allDone
          ? 'Every class is released and signed off. Submit the results, then close the show.'
          : 'After every class is released'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant={allDone ? 'default' : 'outline'} className="min-h-11 gap-2">
          <Link to={getResultsStepHref(showId, 'submit')}>
            {submitLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11 gap-2">
          <Link to={getResultsStepHref(showId, 'close')}>
            Close the show
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
