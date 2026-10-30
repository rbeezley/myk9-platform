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
  const { dogs, isLoading, loadFailed, onRetry } = useAtShowStaffDogs(isStaff ? showId : undefined);
  const { favoriteArmbands, toggleFavoriteArmband } = useAtShowDogFavoritesSynced(
    isStaff ? showId : undefined
  );
  const { state, checkInAll } = useCheckInAllClasses();

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
  const results = state.phase === 'done' ? state.results : {};
  const remaining = toCheckIn;
  // A success only stands while the replica still shows the entry checked in: if another
  // device resets it, the outcome is stale and the entry is offered again.
  const uncheckedIds = new Set(toCheckIn);
  const outcomeOf = (entryId: string) =>
    results[entryId] === 'ok' && uncheckedIds.has(entryId) ? undefined : results[entryId];
  const outcomes = Object.keys(results).map(outcomeOf);
  const okCount = outcomes.filter(value => value === 'ok').length;
  const failedCount = outcomes.filter(value => value === 'failed').length;
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

      {state.phase === 'done' && okCount > 0 && failedCount === 0 && (
        <p className="mb-3 rounded-lg border px-3 py-2 text-sm font-medium" role="status">
          ✓ Checked in to {okCount} {okCount === 1 ? 'class' : 'classes'}
        </p>
      )}
      {(remaining.length > 0 || state.phase === 'checking') && (
        <Button
          className="mb-3 min-h-11 w-full"
          disabled={state.phase === 'checking'}
          onClick={() => void checkInAll(remaining)}
        >
          {state.phase === 'checking' ? 'Checking In...' : `Check In All (${remaining.length})`}
        </Button>
      )}
      {failedCount > 0 && (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {failedCount} {failedCount === 1 ? 'class' : 'classes'} could not be checked in. Try
          again.
        </p>
      )}

      <h2 className="mb-2 text-sm font-semibold">Class Entries</h2>
      <ul className="space-y-2">
        {dog.entries.map(entry => {
          const result = resultLine(entry);
          const outcome = outcomeOf(entry.entryId);
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
                {entry.classId && (
                  <Link
                    to={`/at-show/${showId}/class/${entry.classId}`}
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
                {outcome === 'ok' && <span className="text-xs font-medium">✓ Checked in</span>}
                {outcome === 'failed' && (
                  <span className="text-xs font-medium text-destructive">Check-in failed</span>
                )}
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
