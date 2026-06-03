import React, { useState } from 'react';

import DogCard from './DogCard';
import { Dog } from '../../types/dog-types';
import DogPhotoEditDialog from './DogPhotoEditDialog';

interface AssociatedDogsSectionProps {
  dogs: Dog[];
  onViewDogDetails?: (id: string) => void;
  onEditDog?: (id: string) => void;
  onDeleteDog?: (id: string) => void;
  onUpdateDogPhoto: (dogId: string, file: File) => Promise<boolean>;
  onAddRegistration?: (id: string) => void;
}

const AssociatedDogsSection: React.FC<AssociatedDogsSectionProps> = ({
  dogs,
  onViewDogDetails,
  onEditDog,
  onDeleteDog,
  onUpdateDogPhoto,
  onAddRegistration,
}) => {
  const [editingDogPhotoId, setEditingDogPhotoId] = useState<string | null>(null);
  const [isDogPhotoDialogOpen, setIsDogPhotoDialogOpen] = useState(false);
  // Preview is base64 only for the <img> preview inside the dialog; never persisted.
  const [dogPreviewImage, setDogPreviewImage] = useState<string | null>(null);
  // The raw File is what actually gets uploaded; captured alongside the preview.
  const [dogPhotoFile, setDogPhotoFile] = useState<File | null>(null);
  const [isDogPhotoDragging, setIsDogPhotoDragging] = useState(false);
  const [isSavingDogPhoto, setIsSavingDogPhoto] = useState(false);

  const handleOpenDogPhotoDialog = (dogId: string) => {
    setEditingDogPhotoId(dogId);
    setDogPreviewImage(null);
    setDogPhotoFile(null);
    setIsDogPhotoDialogOpen(true);
  };

  const handleCloseDogPhotoDialog = () => {
    setIsDogPhotoDialogOpen(false);
    setEditingDogPhotoId(null);
    setDogPreviewImage(null);
    setDogPhotoFile(null);
    setIsDogPhotoDragging(false);
  };

  const handleSaveDogPhotoDialog = async (_preview: string | null) => {
    if (!editingDogPhotoId || !dogPhotoFile) return;
    setIsSavingDogPhoto(true);
    try {
      const saved = await onUpdateDogPhoto(editingDogPhotoId, dogPhotoFile);
      if (saved) handleCloseDogPhotoDialog();
    } finally {
      setIsSavingDogPhoto(false);
    }
  };

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
      setDogPhotoFile(file);
      const reader = new FileReader();
      reader.onload = loadEvent => {
        setDogPreviewImage(loadEvent.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDogPhotoFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setDogPhotoFile(file);
      const reader = new FileReader();
      reader.onload = loadEvent => {
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

      {currentDogForPhotoEdit && (
        <DogPhotoEditDialog
          open={isDogPhotoDialogOpen}
          onOpenChange={setIsDogPhotoDialogOpen}
          previewImage={dogPreviewImage}
          {...(currentDogForPhotoEdit.imageUrl !== undefined && {
            currentPhoto: currentDogForPhotoEdit.imageUrl,
          })}
          isDragging={isDogPhotoDragging}
          onDrop={handleDogPhotoDrop}
          onDragOver={handleDogPhotoDragOver}
          onDragLeave={handleDogPhotoDragLeave}
          onFileInput={handleDogPhotoFileInput}
          {...(currentDogForPhotoEdit.callName !== undefined && {
            dogName: currentDogForPhotoEdit.callName,
          })}
          isSaving={isSavingDogPhoto}
          onSave={handleSaveDogPhotoDialog}
          onCancel={handleCloseDogPhotoDialog}
        />
      )}
    </div>
  );
};

export default AssociatedDogsSection;
