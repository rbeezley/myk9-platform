import React, { useState } from 'react';

import DogCard from './DogCard';
import { Dog } from '../../types/dog-types';
import DogPhotoEditDialog from './DogPhotoEditDialog'; // Import the new dialog

interface AssociatedDogsSectionProps {
  dogs: Dog[];
  onViewDogDetails?: (id: string) => void;
  onEditDog?: (id: string) => void;
  onDeleteDog?: (id: string) => void;
  onUpdateDogPhoto: (dogId: string, newPhotoUrl: string) => void;
  onAddRegistration?: (id: string) => void;
}

const AssociatedDogsSection: React.FC<AssociatedDogsSectionProps> = ({ 
  dogs, 
  onViewDogDetails, 
  onEditDog, 
  onDeleteDog, 
  onUpdateDogPhoto,
  onAddRegistration 
}) => {
  const [editingDogPhotoId, setEditingDogPhotoId] = useState<string | null>(null);
  const [isDogPhotoDialogOpen, setIsDogPhotoDialogOpen] = useState(false);
  const [dogPreviewImage, setDogPreviewImage] = useState<string | null>(null); // State for dog photo preview
  const [isDogPhotoDragging, setIsDogPhotoDragging] = useState(false); // State for drag-and-drop UI

  const handleOpenDogPhotoDialog = (dogId: string) => {
    setEditingDogPhotoId(dogId);
    setDogPreviewImage(null); // Clear previous preview
    setIsDogPhotoDialogOpen(true);
  };

  const handleCloseDogPhotoDialog = () => {
    setIsDogPhotoDialogOpen(false);
    setEditingDogPhotoId(null);
    setDogPreviewImage(null);
    setIsDogPhotoDragging(false);
  };

  const handleSaveDogPhotoDialog = (newPhotoUrl: string | null) => { // newPhotoUrl can be null from PhotoDialog
    if (editingDogPhotoId && newPhotoUrl) {
      onUpdateDogPhoto(editingDogPhotoId, newPhotoUrl);
    }
    handleCloseDogPhotoDialog();
  };

  // Drag and drop handlers for DogPhotoEditDialog
  const handleDogPhotoDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDogPhotoDragging(true);
  };

  const handleDogPhotoDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDogPhotoDragging(false);
  };

  const handleDogPhotoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDogPhotoDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        setDogPreviewImage(loadEvent.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDogPhotoFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        setDogPreviewImage(loadEvent.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const currentDogForPhotoEdit = dogs.find(dog => dog.id === editingDogPhotoId);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dogs.map(dog => (
          <DogCard
            key={dog.id}
            dog={dog}
            {...(onViewDogDetails !== undefined && { onViewDetails: onViewDogDetails })}
            {...(onEditDog !== undefined && { onEditDog })}
            {...(onDeleteDog !== undefined && { onDeleteDog })}
            onEditDogPhoto={handleOpenDogPhotoDialog}
            {...(onAddRegistration !== undefined && { onAddRegistration })}
          />
        ))}
      </div>

      {/* Render DogPhotoEditDialog */}
      {currentDogForPhotoEdit && (
        <DogPhotoEditDialog
          open={isDogPhotoDialogOpen}
          onOpenChange={setIsDogPhotoDialogOpen}
          previewImage={dogPreviewImage}
          {...(currentDogForPhotoEdit.imageUrl !== undefined && { currentPhoto: currentDogForPhotoEdit.imageUrl })}
          isDragging={isDogPhotoDragging}
          onDrop={handleDogPhotoDrop}
          onDragOver={handleDogPhotoDragOver}
          onDragLeave={handleDogPhotoDragLeave}
          onFileInput={handleDogPhotoFileInput}
          {...(currentDogForPhotoEdit.callName !== undefined && { dogName: currentDogForPhotoEdit.callName })}
          onSave={handleSaveDogPhotoDialog}
          onCancel={handleCloseDogPhotoDialog}
        />
      )}
    </div>
  );
};

export default AssociatedDogsSection;
