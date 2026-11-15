import { OfflineReadyBadge } from '@/features/offline-readiness/OfflineReadyBadge';
import { useSyncNote } from '@/components/shows/ShowDetails/ShowSyncStatus';
import { ScoresNotSentLink } from './scoresNotSent/ScoresNotSentLink';

/**
 * Staff-only readiness action. Rendered in EVERY branch of the page — the
 * moment the device most needs priming is precisely when classes or
 * assignments failed to load, so hiding it behind the happy path would
 * withhold the recovery action when it matters (MYK9-203).
 */
export function AtShowOfflineReadySlot({
  showId,
  isExhibitorOnly,
}: {
  showId: string | undefined;
  isExhibitorOnly: boolean;
}) {
  const note = useSyncNote();
  if (isExhibitorOnly) return null;
  return (
    <div className="mb-1 flex justify-center">
      <OfflineReadyBadge
        showId={showId}
        note={note.label}
        noteNeedsAttention={note.needsAttention}
        // MYK9-2011: the count of unsent scores opens "Scores not sent".
        wrapNote={
          showId && note.unsentScoreCount > 0
            ? content => (
                <ScoresNotSentLink showId={showId} from="Classes">
                  {content}
                </ScoresNotSentLink>
              )
            : undefined
        }
      />
    </div>
  );
}
