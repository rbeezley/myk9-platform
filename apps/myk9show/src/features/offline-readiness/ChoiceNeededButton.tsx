import { AlertTriangle } from 'lucide-react';
import { useHeldConflictCount } from '@/features/replication-conflicts/heldConflictStore';
import { reopenHeldConflicts } from '@/features/replication-conflicts/heldConflicts';

/**
 * MYK9-1995: "1 change needs your choice" as a real button, shown wherever the offline badge is.
 * It sits beside the device status instead of replacing it, so a sync error or a count of changes
 * waiting to send stays visible. Pressing it brings back the existing choice notice.
 */
export function ChoiceNeededButton({ showId }: { showId: string | undefined }) {
  const count = useHeldConflictCount(showId);
  if (!showId || count === 0) return null;
  return (
    <button
      type="button"
      onClick={() => void reopenHeldConflicts(showId)}
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-2 text-sm font-medium text-warning hover:bg-warning/20 sm:px-3"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      {`${count} ${count === 1 ? 'change needs' : 'changes need'} your choice`}
    </button>
  );
}
