import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useUserStore } from '@/store/userStore';
import { useRoleBasedDogs, useCanAccessDog } from '@/hooks/useRoleBasedData';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';
import DogDetailsMain from '@/components/dogs/DogDetailsMain';

/**
 * DogDetailPage is a thin wrapper around DogDetailsMain for the /dogs/:id route.
 * Loads the dog from role-based data, checks access, and renders DogDetailsMain.
 */
const DogDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const dogs = useRoleBasedDogs();
  const { isLoading, deleteDog, updateDog, isDeleting } = useDogStoreCompat();
  const canAccessDog = useCanAccessDog(id || '');
  const { userWithRoles } = useAuthContext();
  const people = useUserStore(state => state.people);

  // Get fromPerson context for breadcrumbs (Users > Person > Dog)
  const fromPersonId = searchParams.get('fromPerson');
  const fromPerson = fromPersonId ? people.find(p => p.id === fromPersonId) : undefined;

  const dog = useMemo(() => {
    if (!id) return null;
    return dogs.find(d => d.id === id) || null;
  }, [dogs, id]);

  // Redirect to /dogs if dog not found or no access after loading
  useEffect(() => {
    if (!isLoading && dogs.length > 0 && id) {
      if (!canAccessDog || !dogs.find(d => d.id === id)) {
        navigate('/dogs', { replace: true, state: { accessDenied: true } });
      }
    }
  }, [isLoading, dogs, id, canAccessDog, navigate]);

  async function handleDeleteDog() {
    if (!dog) return;
    try {
      await deleteDog(dog.id, userWithRoles?.id);
      navigate('/dogs', { replace: true });
    } catch (err) {
      logger.error('Failed to delete dog', 'dogs', { dogId: dog.id }, err instanceof Error ? err : new Error(String(err)));
      notifications.error('Failed to delete dog. Please try again.');
    }
  }

  if (isLoading || (dogs.length === 0 && !dog)) {
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
      onUpdate={updateDog}
      isDeleting={isDeleting}
    />
  );
};

export default DogDetailPage;
