import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useUserStore } from '@/store/userStore';
import { useRoleBasedDogs, useCanAccessDog } from '@/hooks/useRoleBasedData';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';
import DogDetailsMain from '@/components/dogs/DogDetailsMain';
import { useForceDeleteDogMutation } from '@/hooks/queries/useDogsDatabase';
import { getDogDisplayName, type Dog } from '@/types/dog-types';
import { translateDogDbError } from '@/hooks/translateDogDbError';

/** `force_delete_dog` (migration 20260915214500) raises exactly these. */
const PG_INSUFFICIENT_PRIVILEGE = '42501';
const PG_NO_DATA_FOUND = 'P0002';

/**
 * `forceDeleteDog` rejects with `createDatabaseError(...)` — a plain object
 * literal CAST to `DatabaseError`, never an `Error` instance (see
 * `services/database/databaseError.ts`). So `err instanceof Error` is false on
 * this path: the toast fell back to "Failed to delete dog. Please try again."
 * and Sentry received `Error("[object Object]")`, leaving a refused override
 * with no reason at all. The ordinary delete escapes this only because
 * `useDogStoreCompat.deleteDog` runs inside `runDogMutation`, which calls
 * `translateDogDbError`; `forceDeleteMutation.mutateAsync` is called directly
 * and has no such seam, so this supplies one.
 *
 * The two codes the RPC raises are handled here rather than in
 * `translateDogDbError` because its wording is create/update-shaped ("permission
 * to save this dog"), which is the wrong sentence for a refused delete.
 * Anything else is handed to the shared translator, normalised to a real
 * `Error` first so its `base` carries the server's message instead of
 * `String(object)`.
 */
function toForceDeleteError(err: unknown): Error {
  if (err instanceof Error) return translateDogDbError(err);

  const raw = (err ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof raw.code === 'string' ? raw.code : '';
  const message = typeof raw.message === 'string' && raw.message ? raw.message : '';

  if (code === PG_INSUFFICIENT_PRIVILEGE) {
    return Object.assign(
      new Error('You no longer have permission to delete this dog and its entries.'),
      { cause: err }
    );
  }
  if (code === PG_NO_DATA_FOUND) {
    return Object.assign(new Error('This dog has already been deleted. Refresh to see the list.'), {
      cause: err,
    });
  }

  const normalised = Object.assign(
    new Error(message || 'Failed to delete dog. Please try again.'),
    {
      code,
      cause: err,
    }
  );
  return translateDogDbError(normalised);
}

/**
 * DogDetailPage is a thin wrapper around DogDetailsMain for the /dogs/:id route.
 * Loads the dog from role-based data, checks access, and renders DogDetailsMain.
 */
const DogDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  // Dog passed from the create flow so the page renders immediately while
  // the query cache refetches in the background. Lazy-initialized once on
  // mount so it survives tab navigation (useUrlTab calls navigate, clearing
  // location.state on subsequent renders).
  const [createdDog] = useState<Dog | null>(
    () => (location.state as { createdDog?: Dog } | null)?.createdDog ?? null
  );

  const forceDeleteMutation = useForceDeleteDogMutation();

  const dogs = useRoleBasedDogs();
  const { isLoading, isFetching, deleteDog, updateDog, isDeleting } = useDogStoreCompat();
  const canAccessDog = useCanAccessDog(id || '');
  const { userWithRoles } = useAuthContext();
  const people = useUserStore(state => state.people);

  // Get fromPerson context for breadcrumbs (Users > Person > Dog)
  const fromPersonId = searchParams.get('fromPerson');
  const fromPerson = fromPersonId ? people.find(p => p.id === fromPersonId) : undefined;

  // MYK9-595: the dog a delete started from this page is held here for as long
  // as the delete is in flight. Both delete mutations optimistically strip the
  // dog from every `queryKeys.dogs` list in `onMutate`, so from the moment the
  // RPC leaves until it settles the roster this page reads says the dog does
  // not exist. Without this latch the page blanks (unmounting the confirmation
  // dialog) and the redirect effect below throws the user to /dogs with a false
  // `accessDenied`. It is cleared only in the handlers' `catch`, which runs
  // after the mutation's `onError` has already restored the dog — so there is
  // no frame in which the delete is neither in flight nor rolled back.
  //
  // Scoped to `id`: the route renders this page without a `key`, so navigating
  // from dog-1 to dog-2 mid-delete REUSES this component. An unscoped latch
  // would keep dog-2's guard disabled and then yank the user to /dogs when
  // dog-1's RPC settled.
  const [dogBeingDeleted, setDogBeingDeleted] = useState<Dog | null>(null);
  const isDeleteInFlight = !!id && dogBeingDeleted?.id === id;

  const resolvedDog = useMemo(() => {
    if (!id) return null;
    return dogs.find(d => d.id === id) || createdDog || null;
  }, [dogs, id, createdDog]);

  const dog = resolvedDog ?? (isDeleteInFlight ? dogBeingDeleted : null);

  // Redirect to /dogs if dog not found or no access after loading.
  // Skip while isFetching — post-create refetch may not have resolved yet.
  // Skip while createdDog is available — it was just created and is valid.
  // Skip while a delete this page started is in flight — see above.
  useEffect(() => {
    if (createdDog || isLoading || isFetching || isDeleteInFlight) return;
    if (dogs.length > 0 && id) {
      if (!canAccessDog || !dogs.find(d => d.id === id)) {
        navigate('/dogs', { replace: true, state: { accessDenied: true } });
      }
    }
  }, [createdDog, isLoading, isFetching, isDeleteInFlight, dogs, id, canAccessDog, navigate]);

  async function handleDeleteDog() {
    if (!dog) return;
    setDogBeingDeleted(dog);
    try {
      // callName is optional; fall back to the registered name so a dog
      // without a nickname never yields "undefined was deleted."
      const dogName = getDogDisplayName(dog);
      await deleteDog(dog.id, userWithRoles?.id);
      notifications.success(`${dogName} was deleted.`);
      navigate('/dogs', { replace: true });
    } catch (err) {
      setDogBeingDeleted(null);
      logger.error(
        'Failed to delete dog',
        'dogs',
        { dogId: dog.id },
        err instanceof Error ? err : new Error(String(err))
      );
      notifications.error(
        err instanceof Error && err.message
          ? err.message
          : 'Failed to delete dog. Please try again.'
      );
      // DogDialogs closes only after this callback resolves. Preserve the
      // rejected result so a server refusal (for example MK002) leaves the
      // dog and confirmation dialog visible for correction.
      throw err;
    }
  }

  /**
   * Platform-admin override: deletes the dog even though it has paid or scored
   * entries. Deliberately a separate handler rather than a flag on the one
   * above — it reaches a different RPC with a different authorisation gate, and
   * conflating them is how the guard gets bypassed by accident.
   */
  async function handleForceDeleteDog() {
    if (!dog) return;
    setDogBeingDeleted(dog);
    try {
      const dogName = getDogDisplayName(dog);
      await forceDeleteMutation.mutateAsync({ id: dog.id });
      notifications.success(`${dogName} and its entries were deleted. No refund was issued.`);
      navigate('/dogs', { replace: true });
    } catch (err) {
      setDogBeingDeleted(null);
      const error = toForceDeleteError(err);
      logger.error('Failed to force delete dog', 'dogs', { dogId: dog.id }, error);
      notifications.error(error.message);
      // Same contract as handleDeleteDog: the page stays mounted (the redirect
      // effect and the skeleton both stand down while `isDeleteInFlight`) and
      // the rejection is re-thrown, so DogDialogs leaves the confirmation
      // dialog open with the error toast beside it.
      throw err;
    }
  }

  // `isLoading` folds in the ordinary delete's `isPending`, which would swap
  // the page for the skeleton — and unmount the dialog — the moment a delete
  // starts. While a delete this page started is in flight the loaded page stays.
  if ((isLoading && !isDeleteInFlight) || (!dog && dogs.length === 0 && !createdDog)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="h-8 w-48 bg-muted/50 rounded-lg animate-pulse" />
        <div className="flex gap-6">
          <div className="h-48 w-48 bg-muted/50 rounded-xl animate-pulse shrink-0" />
          <div className="flex-1 space-y-4">
            <div className="h-6 w-64 bg-muted/50 rounded animate-pulse" />
            <div className="h-4 w-40 bg-muted/50 rounded animate-pulse" />
            <div className="h-4 w-56 bg-muted/50 rounded animate-pulse" />
            <div className="h-4 w-32 bg-muted/50 rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!dog) return null;

  return (
    <DogDetailsMain
      dog={dog}
      fromPerson={fromPerson}
      onDelete={handleDeleteDog}
      onForceDelete={handleForceDeleteDog}
      onUpdate={updateDog}
      isDeleting={isDeleting || forceDeleteMutation.isPending}
    />
  );
};

export default DogDetailPage;
