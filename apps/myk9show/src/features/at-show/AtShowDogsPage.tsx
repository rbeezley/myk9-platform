/**
 * Ringside dog finder: every dog in the show with search, sort, and a Favorites tab,
 * like v3's Home. Staff (MYK9-1509) read the replica, so it works offline; an exhibitor
 * (MYK9-1517) reads the privacy-reviewed server list, online only. A staff row opens the
 * dog page; favorites reuse the armband sync the entry lists use, for both.
 */
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getStatusDescriptor } from '@/components/status';
import { cn } from '@/lib/utils';
import { useAtShowDogFavoritesSynced } from './dogFavoritesSync';
import { useAtShowStaffDogs } from './useAtShowStaffDogs';
import { useAtShowExhibitorDogs } from './useAtShowExhibitorDogs';
import { useDogViewerKind } from './useStaffDogGate';
import {
  filterStaffDogs,
  formatDogCount,
  sortStaffDogs,
  type StaffDog,
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

const ROW_BODY = 'flex min-h-11 min-w-0 flex-1 items-center gap-3';

/** Staff rows open the dog page; the exhibitor view has no dog page to open. */
const DogRowBody: React.FC<{ to: string | null; children: React.ReactNode }> = ({
  to,
  children,
}) =>
  to ? (
    <Link to={to} className={ROW_BODY}>
      {children}
    </Link>
  ) : (
    <div className={ROW_BODY}>{children}</div>
  );

/** Trial, class and check-in status: the approved exhibitor fields. */
const ExhibitorClassLines: React.FC<{ dog: StaffDog }> = ({ dog }) => (
  <span className="block text-xs text-muted-foreground">
    {dog.entries.map(entry => (
      <span key={entry.entryId} className="block truncate">
        {[
          entry.trialLabel,
          entry.className,
          getStatusDescriptor('entry', entry.checkInStatus).label,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    ))}
  </span>
);

export const AtShowDogsPage: React.FC = () => {
  const { showId } = useParams<{ showId: string }>();
  const kind = useDogViewerKind(showId);
  const isExhibitor = kind === 'exhibitor';
  // Both hooks always run; the one that does not apply gets no show and stays idle.
  const staffDogs = useAtShowStaffDogs(kind === 'staff' ? showId : undefined);
  const exhibitorDogs = useAtShowExhibitorDogs(isExhibitor ? showId : undefined);
  const { dogs, showName, isLoading, isComplete, loadFailed, onRetry } = isExhibitor
    ? exhibitorDogs
    : staffDogs;
  const { favoriteArmbands, toggleFavoriteArmband } = useAtShowDogFavoritesSynced(
    kind ? showId : undefined
  );
  const [tab, setTab] = useState<StaffDogTab>(() => loadDogTab(showId));
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<StaffDogSort>('armband');

  const visible = useMemo(
    () => sortStaffDogs(filterStaffDogs(dogs, { tab, query, favoriteArmbands }), sort),
    [dogs, tab, query, favoriteArmbands, sort]
  );

  // Staff and exhibitors only: an unresolved role goes back to the class picker.
  if (!kind) return <Navigate to={`/at-show/${showId}`} replace />;

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
          <p className="text-sm text-muted-foreground">
            {isExhibitor
              ? "We couldn't load this show's dogs. The list needs a connection."
              : "We couldn't read this show's dogs."}
          </p>
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
          {dogs.length === 0
            ? isExhibitor
              ? 'No dogs to show. This list is for exhibitors with an entry in this show.'
              : 'No dogs on this device yet.'
            : 'No dogs match.'}
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
                <DogRowBody to={isExhibitor ? null : atShowDogPath(showId as string, dog.key)}>
                  <span className="shrink-0 rounded-full bg-[color:var(--chip-stone-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--chip-stone-fg)]">
                    {dog.armband != null ? `#${dog.armband}` : '—'}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{dog.dogName}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {[dog.breed, dog.handler].filter(Boolean).join(' · ')}
                    </span>
                    {isExhibitor && <ExhibitorClassLines dog={dog} />}
                  </span>
                </DogRowBody>
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
