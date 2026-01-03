import React, { useEffect, useState } from 'react';
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

import DogSidebar from '@/components/dogs/DogDetails/DogSidebar/DogSidebar';
import DogDetailsMain from '@/components/dogs/DogDetailsMain';

/**
 * DogDetails page component that follows the standardized entity page pattern.
 * Renders a sidebar with dog navigation and the main content area with EntityPageLayout and EntityCardContainer.  
 */
const DogDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dogs = useRoleBasedDogs(); // Use filtered dogs based on role
  const people = useUserStore(state => state.people);
  const { setSelectedDogId } = useDogSidebarStore();
  const { deleteDog, updateDog } = useDogStoreCompat();
  const { userWithRoles, getUserRoles } = useAuthContext();
  const currentUserPersonId = useCurrentUserPersonId();
  
  // Panel state
  const [showCreateDogPanel, setShowCreateDogPanel] = useState(false);
  const canAccessDog = useCanAccessDog(id || '');
  
  // Get navigation context from URL parameters
  const fromPersonId = searchParams.get('fromPerson');
  const fromPerson = fromPersonId ? people.find(p => p.id === fromPersonId) : undefined;
  
  // Initialize loading state
  const [isLoading, setIsLoading] = React.useState(true);
  
  // Find the selected dog
  const selectedDog = id ? dogs.find(dog => dog.id === id) : null;
  
  // Update the selected dog ID in the sidebar store when the URL param changes
  useEffect(() => {
    setSelectedDogId(id || null);
  }, [id, setSelectedDogId]);

  // Handle loading state and navigation
  useEffect(() => {
    if (dogs.length === 0) {
      // No dogs available
      setIsLoading(false);
      return;
    }

    // Check if user has access to the requested dog
    if (id && !canAccessDog) {
      // User doesn't have access to this dog
      console.warn(`User does not have access to dog ${id}`);
      if (dogs.length > 0) {
        navigate(`/dogs/${dogs[0].id}`, { replace: true });
      }
      return;
    }
    
    if (id && !selectedDog) {
      // ID is provided but dog not found, navigate to the first dog
      navigate(`/dogs/${dogs[0].id}`, { replace: true });
    } else {
      // Data is ready
      setIsLoading(false);
    }
  }, [id, selectedDog, dogs, navigate, canAccessDog]);

  // Handle dog deletion with proper navigation
  const handleDeleteDog = async () => {
    if (selectedDog) {
      console.log('🗑️ DogDetailsPage handleDeleteDog called:', { 
        dogId: selectedDog.id,
        dogName: selectedDog.name,
        userWithRoles: userWithRoles?.id,
        databaseUserId: userWithRoles?.databaseUserId
      });

      if (!userWithRoles?.databaseUserId) {
        console.error('❌ No database user ID available for deletion');
        // Still proceed with deletion but without tracking who deleted it
      }
      
      // Remove dog from database with user tracking
      await deleteDog(selectedDog.id, userWithRoles?.databaseUserId);
      
      // Navigate to appropriate page after deletion
      const remainingDogs = dogs.filter(d => d.id !== selectedDog.id);
      if (remainingDogs.length > 0) {
        // Navigate to first remaining dog
        navigate(`/dogs/${remainingDogs[0].id}`, { replace: true });
      } else {
        // No dogs left, navigate to dogs list (or home)
        navigate('/dogs', { replace: true });
      }
    }
  };

  // Handle creating a new dog
  const handleCreateDog = async (newDog: Dog) => {
    try {
      setShowCreateDogPanel(false);
      // Navigate to the newly created dog
      navigate(`/dogs/${newDog.id}`, { replace: true });
    } catch (error) {
      console.error('Failed to create dog:', error);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Fixed sidebar with proper z-index */}
      <div className="fixed inset-y-0 left-0 z-[60] w-72 bg-card border-r border-border">
        <DogSidebar 
          selectedDogId={id || null} 
          onAdd={() => setShowCreateDogPanel(true)}
        />
      </div>
      
      {/* Main content area with proper left margin */}
      <main className="flex-1 overflow-auto ml-72 pt-16">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <div className="bg-muted/50 rounded-full p-6 mb-6 inline-flex">
                <Loader2 className="h-12 w-12 text-muted-foreground animate-spin" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-foreground">Loading Dogs</h3>
              <p className="text-muted-foreground">Please wait while we fetch your dog information...</p>
            </div>
          </div>
        ) : selectedDog ? (
          <DogDetailsMain dog={selectedDog} fromPerson={fromPerson} onDelete={handleDeleteDog} onUpdate={updateDog} />
        ) : dogs.length === 0 ? (
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
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p className="text-lg mb-2">No dog selected</p>
              <p className="text-sm">Select a dog from the sidebar to view details</p>
            </div>
          </div>
        )}
      </main>
      
      {/* Create Dog Panel */}
      <AddDogPanel
        open={showCreateDogPanel}
        onClose={() => setShowCreateDogPanel(false)}
        onDogCreated={handleCreateDog}
        userRole={getUserRoles()[0]}
        currentUserPersonId={currentUserPersonId || undefined}
      />
    </div>
  );
};

export default DogDetails;
