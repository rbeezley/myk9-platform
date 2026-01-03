import React from 'react';
import PhotoDialog from '@/components/common/PhotoDialog';

interface DogPhotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewImage: string | null;
  currentPhoto: string;
  isDragging: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCancel: () => void;
  onSave: () => void;
}

const DogPhotoDialog: React.FC<DogPhotoDialogProps> = (props) => (
  <PhotoDialog {...props} title="Change Dog Photo" previewAlt="Dog Preview" />
);

export default DogPhotoDialog;
