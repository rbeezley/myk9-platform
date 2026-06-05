import React from 'react';
import PhotoDialog from '../common/PhotoDialog';

interface ProfilePhotoDialogProps {
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
  onSave: () => void | Promise<void>;
  isSaving?: boolean;
}

const ProfilePhotoDialog: React.FC<ProfilePhotoDialogProps> = (props) => (
  <PhotoDialog {...props} title="Change Profile Photo" previewAlt="Profile Preview" />
);

export default ProfilePhotoDialog;
