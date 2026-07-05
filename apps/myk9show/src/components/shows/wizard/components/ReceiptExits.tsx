import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
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
  isLoading?: boolean;
}

export function ReceiptExits({ isExhibitor, showId, onDone, isLoading = false }: ReceiptExitsProps) {
  const navigate = useNavigate();

  if (!isExhibitor) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-8 mt-8">
        <Button onClick={onDone} disabled={isLoading} className="gap-2 px-6 py-3">
          Done
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-8 mt-8">
      <Button
        variant="outline"
        onClick={() => navigate(`/shows/${encodeURIComponent(showId)}`)}
        disabled={isLoading}
        className="px-6 py-3"
      >
        Back to show
      </Button>
      <Button
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
