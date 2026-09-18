import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';

const ResultsControlPage = lazy(() => import('@/pages/secretary/ResultsControlPage'));
const ResultsSubmissionPage = lazy(() => import('@/pages/secretary/ResultsSubmissionPage'));

export const RESULTS_STEPS = [
  { id: 'release', label: 'Review & release' },
  { id: 'submit', label: 'Submit to registry' },
] as const;

export type ResultsStepId = (typeof RESULTS_STEPS)[number]['id'];

export function resolveResultsStep(raw: string | null): ResultsStepId {
  return raw === 'submit' ? 'submit' : 'release';
}

/**
 * The Results tab (MYK9-630 phase 2). Submit Results stopped being a peer of
 * Results and became the second STEP of it: a secretary reviews and releases,
 * then submits to the registry, and the old `/submit-results` URL redirects to
 * `?step=submit` here.
 *
 * Both steps are the existing pages, mounted unchanged — links, not
 * re-implementations. This file owns nothing but which of the two is showing.
 */
export default function ShowResultsSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const step = resolveResultsStep(searchParams.get('step'));

  const setStep = (next: ResultsStepId) => {
    setSearchParams(
      previous => {
        const params = new URLSearchParams(previous);
        if (next === 'release') params.delete('step');
        else params.set('step', next);
        return params;
      },
      { replace: true, preventScrollReset: true }
    );
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Results step">
        {RESULTS_STEPS.map(item => {
          const isActive = item.id === step;
          return (
            <Button
              key={item.id}
              type="button"
              variant={isActive ? 'secondary' : 'ghost'}
              aria-pressed={isActive}
              className={cn(
                'min-h-11 shrink-0',
                isActive && 'border border-primary/30 bg-primary/10'
              )}
              onClick={() => setStep(item.id)}
            >
              {item.label}
            </Button>
          );
        })}
      </div>
      <Suspense fallback={<LoadingSkeleton variant="cards" count={2} />}>
        {step === 'submit' ? <ResultsSubmissionPage /> : <ResultsControlPage />}
      </Suspense>
    </div>
  );
}
