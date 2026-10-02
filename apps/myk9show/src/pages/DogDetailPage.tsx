import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { PageShell } from '@/components/common/PageShell';
import { NotFoundState } from '@/components/common/NotFoundState';
import { ErrorState } from '@/components/common/ErrorState';
import { getUserFriendlyError } from '@/utils/errorMessages';
import { resolveDetailPageState } from './detailPageState';
import { useUserStore } from '@/store/userStore';
import { useRoleBasedDogs, useDogAccess } from '@/hooks/useRoleBasedData';
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
  const { isLoading, isFetching, error, refetch, updateDog } = useDogStoreCompat();
  const access = useDogAccess(id || '');
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

  // ONE decision for every state (`detailPageState`): a read failure always wins so its retry
  // is reachable; an unresolved identity or an in-flight read is loading, never "not found".
  // A dog already in hand (just created, or held while its delete runs) keeps the page up, so
  // a background refresh failing never unmounts a delete dialog mid-flight.
  const state = resolveDetailPageState({
    identity: access === 'unresolved' ? 'unresolved' : 'resolved',
    read:
      error && !dog
        ? 'error'
        : (isLoading && !isDeleteInFlight) || (!dog && (isFetching || dogs.length === 0))
          ? 'loading'
          : 'success',
    recordPresent: !!id && !!dog,
    access: access === 'denied' ? 'denied' : 'allowed',
  });

  switch (state) {
    case 'loading':
      return (
        <PageShell>
          <div role="status" aria-label="Loading dog" className="space-y-6">
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
        </PageShell>
      );
    case 'error':
      return (
        <PageShell>
          <ErrorState
            message="Couldn't load this dog."
            description={getUserFriendlyError(error, 'Check your connection and try again.')}
            onRetry={() => refetch()}
          />
        </PageShell>
      );
    case 'denied':
      return (
        <PageShell>
          <NotFoundState
            entityName="Dog"
            heading="You can't open this dog"
            description="This dog belongs to someone else, so it isn't available to you."
            backTo="/dogs"
            backLabel="Back to Dogs"
          />
        </PageShell>
      );
    case 'notFound':
      return (
        <PageShell>
          <NotFoundState entityName="Dog" backTo="/dogs" backLabel="Back to Dogs" />
        </PageShell>
      );
    case 'ready':
      break;
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
