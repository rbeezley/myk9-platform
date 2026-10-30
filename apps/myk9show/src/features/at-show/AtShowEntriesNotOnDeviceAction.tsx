import { OfflineReadyBadge } from '@/features/offline-readiness/OfflineReadyBadge';
import { useAuthContext } from '@/hooks/useAuthContext';

const retryButtonClass =
  'inline-flex min-h-11 items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 text-sm text-warning hover:bg-warning/20';

/**
 * MYK9-1520: the recovery action under "Entries are not on this device".
 *
 * Signed-in users get the offline badge, so "Save for show day" is the one
 * action the show page already offers. Anonymous passcode sessions have no
 * offline readiness (the badge renders nothing for them), so they get a plain
 * retry of the show's hydration instead.
 */
export function AtShowEntriesNotOnDeviceAction({
  showId,
  refresh,
}: {
  showId: string | undefined;
  refresh: (forceSync: boolean) => Promise<void>;
}) {
  const { user } = useAuthContext();
  if (user?.is_anonymous === true) {
    return (
      <button type="button" className={retryButtonClass} onClick={() => void refresh(true)}>
        Try again
      </button>
    );
  }
  return <OfflineReadyBadge showId={showId} />;
}
