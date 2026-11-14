import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { getResultsStepHref } from '@/features/results-tab/resultsTabRoutes';

/** Once results are in, the next step is Close (MYK9-1945): point at it rather than a dead end. */
export function CloseTheShowLink({ showId }: { showId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="close-the-show-next">
      <p className="text-sm text-muted-foreground">Results are in. Next, close the show.</p>
      <Button asChild className="min-h-11 gap-2">
        <Link to={getResultsStepHref(showId, 'close')}>
          Close the show
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
