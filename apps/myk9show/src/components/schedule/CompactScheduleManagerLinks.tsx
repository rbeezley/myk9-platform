import { ExternalLink, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getAddClassesHref } from '@/pages/secretary/ShowCreationWizard/addClassesHref';
import { getAddTrialsHref } from '@/pages/secretary/ShowCreationWizard/addTrialsHref';
import { getSetupClassesHref } from '@/pages/secretary/showSetupSections';

const inlineLinkClass =
  'inline-flex min-h-11 items-center gap-1 px-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// The schedule is where work starts, not where it happens: these only link into the pages
// that own the work. No forms, bulk actions or deletes here (docs/plan-overview-schedule-hub.md).
export function AddTrialLink({ showId }: { showId: string }) {
  return (
    <Link
      to={getAddTrialsHref(showId)}
      className={cn(buttonVariants({ size: 'sm' }), 'min-h-11 gap-1.5')}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add Trial
    </Link>
  );
}

export function TrialManagerLinks({
  showId,
  trialId,
  trialLabel,
}: {
  showId: string;
  trialId: string;
  trialLabel: string;
}) {
  return (
    <>
      <Link
        to={getAddClassesHref(showId, trialId)}
        aria-label={`Add classes to ${trialLabel}`}
        className={inlineLinkClass}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add Classes
      </Link>
      <Link
        to={getSetupClassesHref(showId, undefined, { trialId })}
        aria-label={`Manage classes in ${trialLabel}`}
        className={inlineLinkClass}
      >
        Manage classes
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </>
  );
}
