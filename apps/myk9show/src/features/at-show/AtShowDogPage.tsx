/**
 * Ringside staff dog page (MYK9-1509): one dog's classes with check-in state and
 * result, a jump to each class's entry list, and "Check In All" through the
 * offline check-in queue. Entry cards stay on the class page; this links there.
 */
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge, getStatusDescriptor } from '@/components/status';
import { cn } from '@/lib/utils';
import { useAtShowDogFavoritesSynced } from './dogFavoritesSync';
import { useAtShowStaffDogs } from './useAtShowStaffDogs';
import { useIsStaffDogViewer } from './useStaffDogGate';
import { useCheckInAllClasses } from './useCheckInAllClasses';
import type { StaffDogClassEntry } from './staffDogIndex';
import { atShowClassPath } from './staffDogRoutes';
import { PartialReplicaNotice, StaleReadNotice } from './StaleReadNotice';

function resultLine(entry: StaffDogClassEntry): string | null {
  if (entry.isPulled || !entry.isScored) return null;
  const parts = [
    entry.resultText,
    entry.searchTime ? `Time ${entry.searchTime}` : null,
    entry.faultCount != null
      ? `${entry.faultCount} ${entry.faultCount === 1 ? 'fault' : 'faults'}`
      : null,
    entry.placement ? `Placed ${entry.placement}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export const AtShowDogPage: React.FC = () => {
  const { showId, dogKey } = useParams<{ showId: string; dogKey: string }>();
  const isStaff = useIsStaffDogViewer(showId);
  const { dogs, isLoading, isComplete, loadFailed, onRetry } = useAtShowStaffDogs(
    isStaff ? showId : undefined
  );
  const { favoriteArmbands, toggleFavoriteArmband } = useAtShowDogFavoritesSynced(
    isStaff ? showId : undefined
  );
  const { isChecking, checkInAll } = useCheckInAllClasses();

  if (!isStaff) return <Navigate to={`/at-show/${showId}`} replace />;

  const dog = dogs.find(candidate => candidate.key === dogKey);
  const back = (
    <Link
      to={`/at-show/${showId}/dogs`}
      className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      All dogs
    </Link>
  );

  if (!dog) {
    return (
      <main className="ringside-root mx-auto max-w-2xl px-4 py-4">
        {back}
        {loadFailed ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
            <p className="text-sm text-muted-foreground">
              We couldn't read this dog on this device.
            </p>
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {isLoading ? 'Loading dog…' : "That dog isn't on this device."}
          </p>
        )}
      </main>
    );
  }

  const favorited = dog.armband != null && favoriteArmbands.has(dog.armband);
  const toCheckIn = dog.uncheckedEntryIds;
  const hasPreliminary = dog.entries.some(entry => !entry.resultsReleased && resultLine(entry));

  return (
    <main className="ringside-root mx-auto max-w-2xl px-4 py-4" data-testid="at-show-dog">
      {back}
      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">
            {dog.armband != null ? `#${dog.armband} ` : ''}
            {dog.dogName}
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            {[dog.breed, dog.handler].filter(Boolean).join(' · ')}
          </p>
        </div>
        {dog.armband != null && (
          <button
            type="button"
            aria-pressed={favorited}
            aria-label={`${favorited ? 'Remove' : 'Add'} ${dog.dogName} ${favorited ? 'from' : 'to'} favorites`}
            onClick={() => toggleFavoriteArmband(dog.armband as number)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          >
            <Heart
              className={cn('h-5 w-5', favorited && 'fill-current text-red-500')}
              aria-hidden
            />
          </button>
        )}
      </div>

      {loadFailed && <StaleReadNotice onRetry={onRetry} />}
      {!isComplete && <PartialReplicaNotice blocksCheckIn />}
      {isComplete && (toCheckIn.length > 0 || isChecking) && (
        <Button
          className="mb-3 min-h-11 w-full"
          disabled={isChecking}
          onClick={() => void checkInAll(toCheckIn)}
        >
          {isChecking ? 'Checking In...' : `Check In All (${toCheckIn.length})`}
        </Button>
      )}

      <h2 className="mb-2 text-sm font-semibold">Class Entries</h2>
      <ul className="space-y-2">
        {dog.entries.map(entry => {
          const result = resultLine(entry);
          return (
            <li
              key={entry.entryId}
              className="rounded-xl border bg-card px-4 py-3 shadow-sm"
              data-testid={`at-show-dog-entry-${entry.entryId}`}
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{entry.className}</p>
                  {entry.trialLabel && (
                    <p className="truncate text-sm text-muted-foreground">{entry.trialLabel}</p>
                  )}
                </div>
                {entry.routeClassIds.length > 0 && (
                  <Link
                    to={atShowClassPath(showId as string, entry.routeClassIds)}
                    aria-label={`Open ${entry.className} entry list`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden />
                  </Link>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge
                  family="entry"
                  status={entry.checkInStatus}
                  label={getStatusDescriptor('entry', entry.checkInStatus).label}
                />
              </div>
              {result && <p className="mt-1 text-sm">{result}</p>}
            </li>
          );
        })}
      </ul>

      {hasPreliminary && (
        <p className="mt-4 text-center text-xs text-muted-foreground" role="note">
          All Results are preliminary
        </p>
      )}
    </main>
  );
};

export default AtShowDogPage;
