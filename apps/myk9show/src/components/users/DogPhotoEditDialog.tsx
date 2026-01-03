import React from 'react';
import PhotoDialog from '../common/PhotoDialog';

// Props are largely the same as ProfilePhotoDialogProps, which mirrors PhotoDialogProps
interface DogPhotoEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewImage: string | null;
  currentPhoto?: string; // Make currentPhoto optional, as a new dog might not have one
  isDragging: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCancel: () => void;
  onSave: (previewImage: string | null) => void;
  dogName?: string; // To display in the title and alt text
}

const DogPhotoEditDialog: React.FC<DogPhotoEditDialogProps> = (props) => {
  const { dogName, ...rest } = props;
  const title = dogName ? `Change Photo for ${dogName}` : 'Change Dog Photo';
  const previewAlt = dogName ? `Photo preview for ${dogName}` : 'Dog photo preview';

  return (
    <PhotoDialog 
      {...rest} 
      currentPhoto={props.currentPhoto || ''} 
      title={title} 
      previewAlt={previewAlt} 
    />
  );
};

export default DogPhotoEditDialog;
