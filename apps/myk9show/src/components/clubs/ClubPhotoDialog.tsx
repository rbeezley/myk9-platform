import React from 'react';
import PhotoDialog from '@/components/common/PhotoDialog';

interface ClubPhotoDialogProps {
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
  onSave: (previewImage: string | null) => void;
}

const ClubPhotoDialog: React.FC<ClubPhotoDialogProps> = (props) => (
  <PhotoDialog {...props} title="Update Club Logo" previewAlt="Club Logo Preview" />
);

export default ClubPhotoDialog;