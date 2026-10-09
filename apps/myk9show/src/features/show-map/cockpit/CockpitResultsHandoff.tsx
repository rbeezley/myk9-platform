import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { getCockpitResultsControlHref } from './cockpitRoutes';

/** MYK9-1032: after the last class completes, Overview hands the show to the Results tab. */
export function CockpitResultsHandoff({ showId }: { showId: string }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/10 p-3"
      data-testid="cockpit-results-handoff"
    >
      <p className="text-sm font-medium">Every class is complete. The rest happens on Results.</p>
      <Button asChild size="sm" className="min-h-11 gap-2">
        <Link to={getCockpitResultsControlHref({ showId })}>
          Results
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
