/**
 * Ringside staff dog finder (MYK9-1509): every dog in the show with search, sort,
 * and a Favorites tab, like v3's Home. Reads the replica, so it works offline.
 * A row opens the dog page; favorites reuse the armband sync the entry lists use.
 */
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAtShowDogFavoritesSynced } from './dogFavoritesSync';
import { useAtShowStaffDogs } from './useAtShowStaffDogs';
import { useIsStaffDogViewer } from './useStaffDogGate';
import {
  filterStaffDogs,
  formatDogCount,
  sortStaffDogs,
  type StaffDogSort,
  type StaffDogTab,
} from './staffDogIndex';
import { atShowDogPath, loadDogTab, saveDogTab } from './staffDogRoutes';
import { PartialReplicaNotice, StaleReadNotice } from './StaleReadNotice';

const SORTS: ReadonlyArray<{ id: StaffDogSort; label: string }> = [
  { id: 'armband', label: 'Armband' },
  { id: 'dog', label: 'Dog' },
  { id: 'handler', label: 'Handler' },
];

export const AtShowDogsPage: React.FC = () => {
  const { showId } = useParams<{ showId: string }>();
  const isStaff = useIsStaffDogViewer(showId);
  const { dogs, showName, isLoading, isComplete, loadFailed, onRetry } = useAtShowStaffDogs(
    isStaff ? showId : undefined
  );
  const { favoriteArmbands, toggleFavoriteArmband } = useAtShowDogFavoritesSynced(
    isStaff ? showId : undefined
  );
  const [tab, setTab] = useState<StaffDogTab>(() => loadDogTab(showId));
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<StaffDogSort>('armband');

  const visible = useMemo(
    () => sortStaffDogs(filterStaffDogs(dogs, { tab, query, favoriteArmbands }), sort),
    [dogs, tab, query, favoriteArmbands, sort]
  );

  // Staff only: an exhibitor or unresolved role goes back to the class picker.
  if (!isStaff) return <Navigate to={`/at-show/${showId}`} replace />;

  const selectTab = (next: StaffDogTab) => {
    setTab(next);
    saveDogTab(showId, next);
  };
  const favoriteTotal = dogs.filter(
    dog => dog.armband != null && favoriteArmbands.has(dog.armband)
  ).length;

  return (
    <main className="ringside-root mx-auto max-w-2xl px-4 py-4" data-testid="at-show-dogs">
      <Link
        to={`/at-show/${showId}`}
        className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Classes
      </Link>
      <h1 className="mb-3 text-center text-lg font-semibold">{showName || 'Dogs'}</h1>

      <div role="tablist" aria-label="Dog list" className="mb-3 grid grid-cols-2 gap-2">
        {(['all', 'favorites'] as const).map(id => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => selectTab(id)}
            className={cn(
              'min-h-11 rounded-lg border px-3 text-sm font-medium',
              tab === id ? 'border-primary bg-primary/10' : 'bg-card text-muted-foreground'
            )}
          >
            {id === 'all' ? 'All Dogs' : `Favorites (${favoriteTotal})`}
          </button>
        ))}
      </div>

      <div className="mb-2 flex gap-2">
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search dog, breed, handler"
          aria-label="Search dogs"
          className="min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm"
        />
        <select
          value={sort}
          onChange={event => setSort(event.target.value as StaffDogSort)}
          aria-label="Sort dogs"
          className="min-h-11 rounded-lg border bg-background px-2 text-sm"
        >
          {SORTS.map(option => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-sm text-muted-foreground" role="status">
        {formatDogCount(visible.length, dogs.length)}
      </p>

      {!isComplete && !isLoading && <PartialReplicaNotice />}
      {loadFailed && dogs.length > 0 && <StaleReadNotice onRetry={onRetry} />}
      {loadFailed && dogs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
          <p className="text-sm text-muted-foreground">We couldn't read this show's dogs.</p>
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading dogs…</p>
      ) : tab === 'favorites' && favoriteTotal === 0 ? (
        <div className="py-10 text-center">
          <p className="font-medium">No Favorites Yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap the heart icon on any dog to add them to your favorites
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {dogs.length === 0 ? 'No dogs on this device yet.' : 'No dogs match.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map(dog => {
            const favorited = dog.armband != null && favoriteArmbands.has(dog.armband);
            return (
              <li
                key={dog.key}
                className="flex min-h-12 items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm"
                data-testid={`at-show-dog-${dog.key}`}
              >
                <Link
                  to={atShowDogPath(showId as string, dog.key)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
                >
                  <span className="shrink-0 rounded-full bg-[color:var(--chip-stone-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--chip-stone-fg)]">
                    {dog.armband != null ? `#${dog.armband}` : '—'}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{dog.dogName}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {[dog.breed, dog.handler].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </Link>
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
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
};

export default AtShowDogsPage;
