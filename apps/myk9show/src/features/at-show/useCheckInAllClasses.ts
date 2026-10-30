import { useCallback, useState } from 'react';
import { notifications } from '@/lib/notifications';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';

const classes = (count: number) => `${count} ${count === 1 ? 'class' : 'classes'}`;

/**
 * "Check In All" for one dog: the same replicated (offline-queued) check-in write
 * the entry lists use, once per unchecked entry. Holds no ledger of its own: the
 * page derives what is left from the replica, so an entry that stays or becomes
 * unchecked is offered again. Each attempt is reported with a toast.
 */
export function useCheckInAllClasses() {
  const [isChecking, setIsChecking] = useState(false);

  const checkInAll = useCallback(async (entryIds: readonly string[]) => {
    setIsChecking(true);
    try {
      const settled = await Promise.allSettled(
        entryIds.map(id => updateReplicatedCheckInStatus(id, 'checked-in'))
      );
      const failed = settled.filter(outcome => outcome.status === 'rejected').length;
      const ok = settled.length - failed;
      if (ok > 0) notifications.success(`✓ Checked in to ${classes(ok)}`);
      if (failed > 0) {
        notifications.error(`${classes(failed)} could not be checked in`, {
          description: 'Try again, or check them in from the class list.',
        });
      }
    } finally {
      setIsChecking(false);
    }
  }, []);

  return { isChecking, checkInAll };
}
