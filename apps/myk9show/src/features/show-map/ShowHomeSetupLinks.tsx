import { ListChecks, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { getAddTrialsHref } from '@/pages/secretary/ShowCreationWizard/addTrialsHref';

/** The show home's setup doors (MYK9-956): add a trial, or bulk-manage classes in place. */
export function ShowHomeSetupLinks({ showId }: { showId: string }) {
  return (
    <>
      <Button asChild variant="outline" size="sm" className="min-h-11 gap-2">
        <Link to={getAddTrialsHref(showId)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Trial
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm" className="min-h-11 gap-2">
        <Link to="?select=classes">
          <ListChecks className="h-4 w-4" aria-hidden="true" />
          Select classes
        </Link>
      </Button>
    </>
  );
}
