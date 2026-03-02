import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useUserStore } from '@/store/userStore';
import { useRoleBasedDogs, useCanAccessDog } from '@/hooks/useRoleBasedData';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
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
  const { isLoading, deleteDog, updateDog } = useDogStoreCompat();
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
        navigate('/dogs', { replace: true });
      }
    }
  }, [isLoading, dogs, id, canAccessDog, navigate]);

  async function handleDeleteDog() {
    if (!dog) return;
    await deleteDog(dog.id, userWithRoles?.id);
    navigate('/dogs', { replace: true });
  }

  if (isLoading || (dogs.length === 0 && !dog)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading dog...</div>
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
    />
  );
};

export default DogDetailPage;
