import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
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
import { saveDogPhoto } from '@/components/dogs/DogDetailsMain/utils';
import { selectOwnedDogs } from '@/utils/dogOwnership';

interface PeopleDetailsTabsProps {
  selectedUser: User;
}

const PeopleDetailsTabs: React.FC<PeopleDetailsTabsProps> = ({ selectedUser }) => {
  const navigate = useNavigate();
  const { dogs, updateDog, deleteDog } = useDogStoreCompat();
  const { getUserRoles } = useAuthContext();

  // Get actual Dog objects by owner relationship
  const userDogs = useMemo(() => {
    return selectOwnedDogs(dogs, selectedUser.id);
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

  // Handler for updating dog photo — uploads the raw File to Storage, then
  // persists the durable Storage URL. Returns true only on a real save so
  // AssociatedDogsSection can gate dialog-close on success.
  const handleUpdateDogPhoto = async (dogId: string, file: File): Promise<boolean> => {
    const dog = userDogs.find(d => d.id === dogId);
    const ownerId = dog?.ownerId ?? selectedUser.id;
    const result = await saveDogPhoto({ ownerId, dogId, file, onUpdate: updateDog });
    if (result.success) {
      toast.success('Photo updated successfully');
    } else {
      toast.error(result.error ?? 'Failed to update photo. Please try again.');
    }
    return result.success;
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
      {/* `relative` is load-bearing: the hover-gradient below is `absolute
          inset-0`, and Card's own classes carry no positioning. Without it the
          overlay resolved against an ancestor far up the tree and painted well
          outside this card. */}
      <Card
        className="group relative bg-gradient-to-br from-card/95 to-card/80 myk9-subtle-card-border
                       rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                       hover:shadow-xl hover:border-primary/20"
      >
        <div
          className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.02] to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl"
        />

        <div className="relative space-y-6">
          {/* Wraps rather than overflowing: this header sits in the centre
              column, which is narrow on a tablet. */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-amber-500/10 to-amber-500/5 rounded-xl">
              <PawPrint className="h-5 w-5 text-warning " />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Dogs
            </h3>
            {/* The count lives beside the heading of the list it counts, and is
                derived from the SAME array the rows render from. It used to be a
                sidebar card fed by useOwnerDogsWithQuery while these rows came
                from the dog store — two sources that could disagree, leaving a
                badge reading "1" above an empty list.
                Hidden at zero rather than showing "0": the store is empty while
                it is still filling, so a zero badge would assert "no dogs" during
                load. */}
            {userDogs.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                {userDogs.length}
                <span className="sr-only"> {userDogs.length === 1 ? 'dog' : 'dogs'}</span>
              </span>
            )}
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
