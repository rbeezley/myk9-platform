import { useCallback, useState } from 'react';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';

export type CheckInAllState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'done'; results: Record<string, 'ok' | 'failed'> };

/**
 * "Check In All" for one dog: the same replicated (offline-queued) check-in write
 * the entry lists use, once per unchecked entry, with a result per entry so a
 * partial failure names the class that did not take.
 */
export function useCheckInAllClasses() {
  const [state, setState] = useState<CheckInAllState>({ phase: 'idle' });

  const checkInAll = useCallback(async (entryIds: readonly string[]) => {
    setState({ phase: 'checking' });
    const settled = await Promise.allSettled(
      entryIds.map(id => updateReplicatedCheckInStatus(id, 'checked-in'))
    );
    const results: Record<string, 'ok' | 'failed'> = {};
    settled.forEach((outcome, index) => {
      results[entryIds[index] as string] = outcome.status === 'fulfilled' ? 'ok' : 'failed';
    });
    setState({ phase: 'done', results });
  }, []);

  return { state, checkInAll };
}
