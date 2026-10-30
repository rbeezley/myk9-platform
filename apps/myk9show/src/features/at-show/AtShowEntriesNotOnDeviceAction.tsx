import { OfflineReadyBadge } from '@/features/offline-readiness/OfflineReadyBadge';
import { useAuthContext } from '@/hooks/useAuthContext';

const retryButtonClass =
  'inline-flex min-h-11 items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 text-sm text-warning hover:bg-warning/20';

/**
 * MYK9-1520: the recovery actions under "Entries are not on this device".
 *
 * Signed-in users get the offline badge, so "Save for show day" is the one
 * save action the show page already offers. The badge renders nothing when it
 * has no readiness to show (anonymous passcode sessions, or a readiness probe
 * that failed), so "Try again", a plain re-run of the show's hydration, is
 * always offered: the screen never leaves the user without a way forward.
 */
export function AtShowEntriesNotOnDeviceAction({
  showId,
  refresh,
}: {
  showId: string | undefined;
  refresh: (forceSync: boolean) => Promise<void>;
}) {
  const { user } = useAuthContext();
  return (
    <>
      {user?.is_anonymous === true ? null : <OfflineReadyBadge showId={showId} />}
      <button type="button" className={retryButtonClass} onClick={() => void refresh(true)}>
        Try again
      </button>
    </>
  );
}
