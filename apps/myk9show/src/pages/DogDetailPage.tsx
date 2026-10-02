import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { PageShell } from '@/components/common/PageShell';
import { NotFoundState } from '@/components/common/NotFoundState';
import { useUserStore } from '@/store/userStore';
import { useRoleBasedDogs, useCanAccessDog } from '@/hooks/useRoleBasedData';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import DogDetailsMain from '@/components/dogs/DogDetailsMain';
import type { Dog } from '@/types/dog-types';

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

  const dogs = useRoleBasedDogs();
  const { isLoading, isFetching, updateDog } = useDogStoreCompat();
  const canAccessDog = useCanAccessDog(id || '');
  const people = useUserStore(state => state.people);

  // Get fromPerson context for breadcrumbs (Users > Person > Dog)
  const fromPersonId = searchParams.get('fromPerson');
  const fromPerson = fromPersonId ? people.find(p => p.id === fromPersonId) : undefined;

  // MYK9-595: while a delete started on this page is running, the dog is purged
  // from this device before the dialog finishes, so the roster this page reads
  // says the dog does not exist. Hold the last copy for THIS id until the delete
  // settles, so the page (and the dialog on it) does not blank and the redirect
  // below does not report a false "no access". Scoped to `id`: the route reuses
  // this component across dogs.
  const [dogBeingDeleted, setDogBeingDeleted] = useState<Dog | null>(null);
  const isDeleteInFlight = !!id && dogBeingDeleted?.id === id;

  const resolvedDog = useMemo(() => {
    if (!id) return null;
    return dogs.find(d => d.id === id) || createdDog || null;
  }, [dogs, id, createdDog]);

  const dog = resolvedDog ?? (isDeleteInFlight ? dogBeingDeleted : null);

  // A dog that is not on the roster, or one this viewer may not open, is the shared
  // Not Found state (MYK9-930, audit H8), not a silent bounce to the list that throws
  // away the URL the user asked for.
  // Not while isFetching -- a post-create refetch may not have resolved yet, nor while
  // createdDog is available (just created, valid), nor while a delete this page started
  // is in flight (see above).
  const dogNotFound =
    !createdDog &&
    !isLoading &&
    !isFetching &&
    !isDeleteInFlight &&
    dogs.length > 0 &&
    !!id &&
    (!canAccessDog || !dogs.find(d => d.id === id));

  // The id as of NOW: a delete that lands after the user moved to another dog
  // reports itself in the toast without moving their page.
  const currentIdRef = useRef(id);
  useEffect(() => {
    currentIdRef.current = id;
  }, [id]);

  function handleDeleteStart() {
    if (dog) setDogBeingDeleted(dog);
  }

  /** The shared dialog soft-deleted the dog, purged it and offered Undo. */
  function handleDeleted(deletedDogId: string) {
    if (currentIdRef.current === deletedDogId) {
      navigate('/dogs', { replace: true });
    } else {
      setDogBeingDeleted(null);
    }
  }

  function handleDeleteFailed() {
    setDogBeingDeleted(null);
  }

  if ((isLoading && !isDeleteInFlight) || (!dog && dogs.length === 0 && !createdDog)) {
    return (
      <PageShell>
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
      </PageShell>
    );
  }

  if (dogNotFound) {
    return (
      <PageShell>
        <NotFoundState entityName="Dog" backTo="/dogs" backLabel="Back to Dogs" />
      </PageShell>
    );
  }

  if (!dog) return null;

  return (
    <DogDetailsMain
      dog={dog}
      fromPerson={fromPerson}
      onDeleteStart={handleDeleteStart}
      onDeleted={handleDeleted}
      onDeleteFailed={handleDeleteFailed}
      onUpdate={updateDog}
    />
  );
};

export default DogDetailPage;
