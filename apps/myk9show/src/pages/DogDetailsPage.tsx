import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useDogSidebarStore } from '@/store/dogSidebarStore';
import { useUserStore } from '@/store/userStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useRoleBasedDogs, useCanAccessDog, useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useAuthContext } from '@/hooks/useAuthContext';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { AddDogPanel } from '@/components/panels/edit';
import type { Dog } from '@/types/dog-types';
import { SidebarLayout, useSidebarLayoutState } from '@/components/layout/SidebarLayout';

import DogSidebar from '@/components/dogs/DogDetails/DogSidebar/DogSidebar';
import DogDetailsMain from '@/components/dogs/DogDetailsMain';

/**
 * DogDetails page component that follows the standardized entity page pattern.
 * Uses SidebarLayout for consistent sidebar behavior across the app.
 */
function DogDetails(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dogs = useRoleBasedDogs();
  const people = useUserStore(state => state.people);
  const { setSelectedDogId } = useDogSidebarStore();
  const { deleteDog, updateDog } = useDogStoreCompat();
  const { userWithRoles, getUserRoles } = useAuthContext();
  const currentUserPersonId = useCurrentUserPersonId();

  // Panel state
  const [showCreateDogPanel, setShowCreateDogPanel] = useState(false);
  const canAccessDog = useCanAccessDog(id || '');

  // Sidebar state management using the shared hook
  const { mobileOpen, setMobileOpen, closeMobile } = useSidebarLayoutState();

  // Get navigation context from URL parameters
  const fromPersonId = searchParams.get('fromPerson');
  const fromPerson = fromPersonId ? people.find(p => p.id === fromPersonId) : undefined;

  // Initialize loading state
  const [isLoading, setIsLoading] = useState(true);

  // Find the selected dog
  const selectedDog = id ? dogs.find(dog => dog.id === id) : null;

  // Update the selected dog ID in the sidebar store when the URL param changes
  useEffect(() => {
    setSelectedDogId(id || null);
  }, [id, setSelectedDogId]);

  // Handle loading state and navigation
  useEffect(() => {
    if (dogs.length === 0) {
      setIsLoading(false);
      return;
    }

    // Check if user has access to the requested dog
    if (id && !canAccessDog) {
      console.warn(`User does not have access to dog ${id}`);
      if (dogs.length > 0) {
        navigate(`/dogs/${dogs[0].id}`, { replace: true });
      }
      return;
    }

    if (id && !selectedDog) {
      navigate(`/dogs/${dogs[0].id}`, { replace: true });
    } else {
      setIsLoading(false);
    }
  }, [id, selectedDog, dogs, navigate, canAccessDog]);

  // Handle dog deletion with proper navigation
  async function handleDeleteDog(): Promise<void> {
    if (!selectedDog) return;

    await deleteDog(selectedDog.id, userWithRoles?.databaseUserId);

    const remainingDogs = dogs.filter(d => d.id !== selectedDog.id);
    if (remainingDogs.length > 0) {
      navigate(`/dogs/${remainingDogs[0].id}`, { replace: true });
    } else {
      navigate('/dogs', { replace: true });
    }
  }

  // Handle creating a new dog
  function handleCreateDog(newDog: Dog): void {
    setShowCreateDogPanel(false);
    navigate(`/dogs/${newDog.id}`, { replace: true });
  }

  // Render the sidebar component
  const sidebarContent = (
    <DogSidebar
      selectedDogId={id || null}
      onAdd={() => setShowCreateDogPanel(true)}
      onCloseMobile={closeMobile}
    />
  );

  // Render main content based on loading/data state
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <div className="bg-muted/50 rounded-full p-6 mb-6 inline-flex">
              <Loader2 className="h-12 w-12 text-muted-foreground animate-spin" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-foreground">Loading Dogs</h3>
            <p className="text-muted-foreground">Please wait while we fetch your dog information...</p>
          </div>
        </div>
      );
    }

    if (selectedDog) {
      return (
        <DogDetailsMain
          dog={selectedDog}
          fromPerson={fromPerson}
          onDelete={handleDeleteDog}
          onUpdate={updateDog}
        />
      );
    }

    if (dogs.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">No Dogs Available</h1>
            <p className="text-muted-foreground mb-6">
              Get started by adding your first dog to track health records, registrations, and competitions.
            </p>
            <Button
              onClick={() => setShowCreateDogPanel(true)}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Dog
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <p className="text-lg mb-2">No dog selected</p>
          <p className="text-sm">Select a dog from the sidebar to view details</p>
        </div>
      </div>
    );
  };

  return (
    <>
      <SidebarLayout
        sidebar={sidebarContent}
        sidebarWidth={288} // w-72 = 18rem = 288px
        mobileMenuLabel="Dogs Menu"
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      >
        {renderContent()}
      </SidebarLayout>

      {/* Create Dog Panel */}
      <AddDogPanel
        open={showCreateDogPanel}
        onClose={() => setShowCreateDogPanel(false)}
        onDogCreated={handleCreateDog}
        userRole={getUserRoles()[0]}
        currentUserPersonId={currentUserPersonId || undefined}
      />
    </>
  );
};

export default DogDetails;
