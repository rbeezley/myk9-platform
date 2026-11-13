import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { resolveShowDeskReturn } from '@/features/show-map/cockpit/cockpitRoutes';

/**
 * Back from the paper scoresheet. Opened from the Show Desk (a valid `returnTo`), it returns
 * there with the same class focused and says so; opened any other way it goes to the class.
 */
export function PaperScoresheetBackButton({
  returnTo,
  showId,
  classDetailsHref,
}: {
  returnTo: string | null;
  showId?: string | undefined;
  classDetailsHref: string | null;
}) {
  const navigate = useNavigate();
  const showDesk = resolveShowDeskReturn(returnTo, showId);
  const destination = showDesk?.href ?? classDetailsHref;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => (destination ? navigate(destination) : navigate(-1))}
      className="gap-2"
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="hidden sm:inline">{showDesk ? showDesk.label : 'Back to Class'}</span>
      <span className="sm:hidden">{showDesk ? 'Show' : 'Class'}</span>
    </Button>
  );
}
