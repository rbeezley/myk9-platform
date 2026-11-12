import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CONFLICT_REOPEN_LABEL } from '@/lib/offlineCopy';
import { logger } from '@/services/LoggingService';
import { reopenClassConflict } from './reopenClassConflict';

async function showChoiceAgain(classId: string) {
  try {
    const found = await reopenClassConflict(classId);
    // Settled elsewhere in the meantime: the class row re-reads on its own, so say why nothing opened.
    if (!found) toast.info('This class is already settled. The check can show now.');
  } catch (err) {
    logger.warn('Could not reopen the class conflict', 'replication', { err, classId });
    toast.error("We couldn't bring the choice back. Try again.");
  }
}

/** Sits beside the "changed somewhere else" reason and raises the closed conflict notice again. */
export function ReopenConflictButton({ classId }: { classId: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-11"
      onClick={() => void showChoiceAgain(classId)}
    >
      {CONFLICT_REOPEN_LABEL}
    </Button>
  );
}
