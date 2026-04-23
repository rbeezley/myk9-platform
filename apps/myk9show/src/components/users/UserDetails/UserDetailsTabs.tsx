import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PawPrint, Plus } from 'lucide-react';
import AssociatedDogsSection from '../AssociatedDogsSection';
import { DogEditPanel } from '@/components/panels/edit/DogEditPanel';
import { AddDogPanel } from '@/components/panels/edit';
import type { User, Dog } from '@/types/dog-types';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useAuthContext, getPrimaryRole } from '@/hooks/useAuthContext';
import { mapDogToDogInput } from '@/services/mappers/dogMappers';

interface PeopleDetailsTabsProps {
  selectedUser: User;
}

const PeopleDetailsTabs: React.FC<PeopleDetailsTabsProps> = ({ selectedUser }) => {
  const navigate = useNavigate();
  const { dogs, updateDog, deleteDog } = useDogStoreCompat();
  const { getUserRoles } = useAuthContext();

  // Get actual Dog objects by owner relationship
  const userDogs = useMemo(() => {
    return dogs.filter(dog => dog.ownerId === selectedUser.id);
  }, [dogs, selectedUser.id]);

  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [dogToEdit, setDogToEdit] = useState<Dog | null>(null);

  // Create panel state
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);

  // Handler for saving dog edits from DogEditPanel
  const handleSaveDogEdit = async (updatedDogData: Partial<Dog>) => {
    if (!dogToEdit) return;
    await updateDog(dogToEdit.id, mapDogToDogInput({ ...dogToEdit, ...updatedDogData } as Dog));
    setIsEditDialogOpen(false);
    setDogToEdit(null);
  };

  // Handler for updating dog photo
  const handleUpdateDogPhoto = (dogId: string, newPhotoUrl: string) => {
    updateDog(dogId, { imageUrl: newPhotoUrl });
  };

  // Handler for deleting a dog
  const handleDeleteDog = (dogId: string) => {
    deleteDog(dogId);
  };

  // Handler for adding a new dog
  const handleAddNewDog = () => {
    setIsCreatePanelOpen(true);
  };

  return (
    <div className="w-full">
      <Card
        className="group bg-gradient-to-br from-card/95 to-card/80 myk9-subtle-card-border
                       rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                       hover:shadow-xl hover:-translate-y-1 hover:border-primary/20"
      >
        <div
          className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.02] to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl"
        />

        <div className="relative space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-amber-500/10 to-amber-500/5 rounded-xl">
              <PawPrint className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Dogs
            </h3>
            <Button
              onClick={handleAddNewDog}
              className="ml-auto"
              variant="default"
              size="sm"
              aria-label="Add New Dog"
            >
              <Plus size={16} className="inline-block align-middle" />
              Add New Dog
            </Button>
          </div>

          <AssociatedDogsSection
            dogs={userDogs}
            onViewDogDetails={dogId => {
              navigate(`/dogs/${dogId}?fromPerson=${selectedUser.id}`);
            }}
            onEditDog={dogId => {
              const dog = userDogs.find(d => d.id === dogId);
              if (dog) {
                setDogToEdit(dog);
                setIsEditDialogOpen(true);
              }
            }}
            onUpdateDogPhoto={handleUpdateDogPhoto}
            onDeleteDog={handleDeleteDog}
            onAddRegistration={dogId => {
              navigate(`/dogs/${dogId}?addRegistration=true&fromPerson=${selectedUser.id}`);
            }}
          />
        </div>
      </Card>
      <DogEditPanel
        open={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setDogToEdit(null);
        }}
        dogId={dogToEdit?.id || ''}
        dogName={dogToEdit?.callName || dogToEdit?.name || 'Dog'}
        initialDogData={dogToEdit || {}}
        onSave={handleSaveDogEdit}
        enableAutoSave={false}
      />
      <AddDogPanel
        open={isCreatePanelOpen}
        onClose={() => setIsCreatePanelOpen(false)}
        onDogCreated={() => setIsCreatePanelOpen(false)}
        userRole={getPrimaryRole(getUserRoles())}
        currentUserPersonId={selectedUser.id}
      />
    </div>
  );
};

export default PeopleDetailsTabs;
