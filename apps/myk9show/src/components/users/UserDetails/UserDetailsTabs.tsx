import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import AssociatedDogsSection from '../AssociatedDogsSection';
import { DogEditPanel } from '@/components/panels/edit/DogEditPanel';
import type { User, Dog, DogInput } from '@/types/dog-types';
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';

interface PeopleDetailsTabsProps {
  selectedUser: User;
}

const PeopleDetailsTabs: React.FC<PeopleDetailsTabsProps> = ({ selectedUser }) => {
  const navigate = useNavigate();
  const { dogs, updateDog, removeDog } = useDogStore();
  const { updateUser } = useUserStore();

  // Get actual Dog objects from the dog store by owner relationship
  const userDogs = useMemo(() => {
    return dogs.filter(dog => dog.ownerId === selectedUser.id);
  }, [dogs, selectedUser.id]);

  // Helper function to convert Dog to DogInput
  const dogToDogInput = (dog: Dog): DogInput => ({
    name: dog.name,
    breed: dog.breed,
    sex: dog.sex,
    birthDate: dog.birthDate || dog.dateOfBirth,
    color: dog.color,
    weight: typeof dog.weight === 'string' ? undefined : dog.weight,
    height: typeof dog.height === 'string' ? undefined : dog.height,
    ownerId: dog.ownerId,
    ownerName: dog.ownerName,
    microchipNumber: dog.microchipNumber || dog.microchip,
    imageUrl: dog.imageUrl,
    registrations: dog.registrations?.map(reg => ({
      organization: reg.organization,
      number: reg.registrationNumber,
      type: reg.status,
      status: reg.status,
    })),
  });

  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [dogToEdit, setDogToEdit] = useState<Dog | null>(null);

  // --- Removed obsolete editDogForm state/handlers ---

  // Handler for saving dog edits from DogEditPanel
  const handleSaveDogEdit = async (updatedDogData: Partial<Dog>) => {
    if (!dogToEdit) return;

    const isNewDog = !dogToEdit.id;

    if (isNewDog) {
      const tempId = `temp-${Date.now()}`;
      const mergedDog = { ...dogToEdit, ...updatedDogData, id: tempId, ownerId: selectedUser.id };

      const { addDog } = useDogStore.getState();
      addDog(dogToDogInput(mergedDog as Dog));

      const currentDogs = selectedUser.dogs || [];
      updateUser(selectedUser.id, { dogs: [...currentDogs, tempId] });
    } else {
      const { updateDog } = useDogStore.getState();
      updateDog(dogToEdit.id, dogToDogInput({ ...dogToEdit, ...updatedDogData } as Dog));
    }

    setIsEditDialogOpen(false);
    setDogToEdit(null);
  };

  // Handler for updating dog photo
  const handleUpdateDogPhoto = (dogId: string, newPhotoUrl: string) => {
    // Update in global dog store
    updateDog(dogId, { imageUrl: newPhotoUrl });
    // Dogs array contains only IDs, photo data is in dog store
  };

  // Handler for deleting a dog
  const handleDeleteDog = (dogId: string) => {
    removeDog(dogId); // Call removeDog from the store

    // Remove the dog from the selected person's dogs array for local consistency
    if (selectedUser.dogs) {
      const updatedDogsForPerson = selectedUser.dogs.filter(dogId2 => dogId2 !== dogId);
      updateUser(selectedUser.id, { dogs: updatedDogsForPerson });
    }
    // Optionally, close any dialogs or navigate if needed, e.g., if on that dog's page
  };

  // Handler for adding a new dog
  const handleAddNewDog = () => {
    const newDog: Dog = {
      id: '', // Will be set when creating
      name: '', // Added: Default to empty, can be set in dialog
      breed: '', // Required field
      sex: 'male', // Required field
      callName: '',
      gender: 'Male',
      ownerId: selectedUser.id, // Keep this as per Dog type
      owner: {
        id: selectedUser.id,
        name: `${selectedUser.firstName} ${selectedUser.lastName}`,
        email: selectedUser.email,
        phone: selectedUser.phone,
        profileImage: selectedUser.profileImage,
      }, // Convert User to Owner format
      registrations: [],
      spayedNeutered: false,
      description: '', // Added: Default to empty
      // Optional fields with default values
      height: '',
      weight: '',
      dateOfBirth: '', // Age can be derived from this if needed, or set in dialog
      age: 0, // Corrected: Default to 0
      imageUrl: '',
      color: '',
      microchip: '',
    };

    setDogToEdit(newDog);
    setIsEditDialogOpen(true);
  };

  const tabsConfig = [
    {
      id: 'dogs',
      label: 'Dogs',
      content: (
        <div className="mt-4 space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-foreground">Associated Dogs</h2>
            <Button
              onClick={handleAddNewDog}
              className="ml-auto"
              variant="default"
              aria-label="Add New Dog"
            >
              <Plus size={16} className="inline-block align-middle" />
              Add New Dog
            </Button>
          </div>
          <AssociatedDogsSection
            dogs={userDogs}
            onViewDogDetails={dogId => {
              // Navigate with person context for breadcrumbs: People > John Smith > Max
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
              // Navigate to the dog's details page with a query parameter to open the add registration dialog
              navigate(`/dogs/${dogId}?addRegistration=true&fromPerson=${selectedUser.id}`);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="w-full">
      <Tabs defaultValue="dogs" className="space-y-6 w-full">
        <div className="overflow-x-auto">
          <TabsList
            className="grid w-full bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 h-auto min-w-max"
            style={{ gridTemplateColumns: `repeat(${tabsConfig.length}, minmax(0, 1fr))` }}
          >
            {tabsConfig.map(tab => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 px-4 py-2 text-sm font-medium whitespace-nowrap"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {tabsConfig.map(tab => (
          <TabsContent key={tab.id} value={tab.id}>
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
      <DogEditPanel
        open={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setDogToEdit(null);
        }}
        dogId={dogToEdit?.id || ''}
        dogName={dogToEdit?.callName || dogToEdit?.name || 'New Dog'}
        initialDogData={dogToEdit || {}}
        onSave={handleSaveDogEdit}
        enableAutoSave={false}
      />
    </div>
  );
};

export default PeopleDetailsTabs;
