import { usePendingEntryCopy } from '@/features/_shared/landing/PendingEntryCopyContext';

/**
 * The Roster's status cell. It follows the same decision as the Enter CTA (MYK9-2192): never
 * "Open · accepting entries" beside a withheld Enter.
 */
export function HeadlineRosterStatus({
  canEnterOnline,
  entryClosed,
}: {
  canEnterOnline: boolean;
  entryClosed: boolean;
}) {
  const pending = usePendingEntryCopy();
  if (canEnterOnline) {
    return (
      <>
        <span className="accent">Open</span> · accepting entries
      </>
    );
  }
  return <>{entryClosed ? 'Closed' : pending.nav}</>;
}
