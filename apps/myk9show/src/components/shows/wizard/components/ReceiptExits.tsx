import { useNavigate } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Exit controls for the wizard's final Receipt step (UX walk remediation 4.A).
 *
 * The entry is already committed by the time this renders, so there is NO "Back"
 * here — a Back button implied the submit could be undone. Exhibitors get two
 * honest, forward exits: primary "View my entry" (lands on their entry's status)
 * and secondary "Back to show". Staff/on-behalf flows keep a single "Done" that
 * returns to wherever they came from (show detail or the show-desk late-entry
 * surface), resolved by the caller.
 */
export interface ReceiptExitsProps {
  isExhibitor: boolean;
  showId: string;
  /** Completion navigation for staff/on-behalf flows (resolveRegistrationCompletionPath). */
  onDone: () => void;
  doneLabel?: string | undefined;
  /**
   * Staff only: start the wizard over for the next paper form (MYK9-1742). When given it is the
   * primary exit and Done becomes the secondary one.
   */
  onAddAnother?: (() => void) | undefined;
  addAnotherLabel?: string | undefined;
  isLoading?: boolean;
}

export function ReceiptExits({
  isExhibitor,
  showId,
  onDone,
  doneLabel = 'Done',
  onAddAnother,
  addAnotherLabel = 'Add another entry',
  isLoading = false,
}: ReceiptExitsProps) {
  const navigate = useNavigate();

  if (!isExhibitor) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-8 mt-8">
        {onAddAnother ? (
          <>
            <Button
              size="touch"
              variant="outline"
              onClick={onDone}
              disabled={isLoading}
              className="px-6 py-3"
            >
              {doneLabel}
            </Button>
            <Button
              size="touch"
              onClick={onAddAnother}
              disabled={isLoading}
              className="gap-2 px-6 py-3"
            >
              <Plus className="h-4 w-4" />
              {addAnotherLabel}
            </Button>
          </>
        ) : (
          <Button size="touch" onClick={onDone} disabled={isLoading} className="gap-2 px-6 py-3">
            {doneLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-8 mt-8">
      <Button
        size="touch"
        variant="outline"
        onClick={() => navigate(`/shows/${encodeURIComponent(showId)}`)}
        disabled={isLoading}
        className="px-6 py-3"
      >
        Back to show
      </Button>
      <Button
        size="touch"
        onClick={() => navigate('/exhibitor/entries')}
        disabled={isLoading}
        className="gap-2 px-6 py-3"
      >
        View my entry
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default ReceiptExits;
