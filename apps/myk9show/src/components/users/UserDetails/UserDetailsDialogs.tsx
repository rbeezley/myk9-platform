import React from 'react';
import { Trash2 } from 'lucide-react';
import ProfilePhotoDialog from '@/components/users/ProfilePhotoDialog';
import StandardDialog from '@/components/common/StandardDialog';
import { JudgeQualificationPanel, UserEditPanel } from '@/components/panels/edit';
import type { User as UserType } from '@/types/user-types';
interface UserDetailsDialogsProps {
  person: UserType;
  formData: {
    name: string;
    photo: string;
  };
  isEditModalOpen: boolean;
  setIsEditModalOpen: (open: boolean) => void;
  isPhotoModalOpen: boolean;
  setIsPhotoModalOpen: (open: boolean) => void;
  isDeleteDialogOpen: boolean;
  setIsDeleteDialogOpen: (open: boolean) => void;
  isQualificationsPanelOpen: boolean;
  setIsQualificationsPanelOpen: (open: boolean) => void;
  previewImage: string | null;
  setPreviewImage: (image: string | null) => void;
  isDragging: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDeleteUser: () => Promise<void>;
  onUserEditSave: (userData: Partial<UserType>) => Promise<void>;
  onQualificationsSaved: () => void;
  onPhotoSave: () => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const UserDetailsDialogs: React.FC<UserDetailsDialogsProps> = ({
  person,
  formData,
  isEditModalOpen,
  setIsEditModalOpen,
  isPhotoModalOpen,
  setIsPhotoModalOpen,
  isDeleteDialogOpen,
  setIsDeleteDialogOpen,
  isQualificationsPanelOpen,
  setIsQualificationsPanelOpen,
  previewImage,
  setPreviewImage,
  isDragging,
  onDrop,
  onDragOver,
  onDragLeave,
  onDeleteUser,
  onUserEditSave,
  onQualificationsSaved,
  onPhotoSave,
  onFileInput,
}) => {
  return (
    <>
      {/* Edit Person Panel */}
      <UserEditPanel
        open={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        userId={person.id}
        userName={`${person.firstName} ${person.lastName}`}
        initialUserData={person}
        onSave={onUserEditSave}
        enableAutoSave={false}
      />

      <ProfilePhotoDialog
        open={isPhotoModalOpen}
        onOpenChange={setIsPhotoModalOpen}
        previewImage={previewImage}
        currentPhoto={formData.photo}
        isDragging={isDragging}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onFileInput={onFileInput}
        onCancel={() => {
          setIsPhotoModalOpen(false);
          setPreviewImage(null);
        }}
        onSave={onPhotoSave}
      />

      <StandardDialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onSave={onDeleteUser}
        title="Delete Person"
        titleIcon={<Trash2 className="w-5 h-5" />}
        description="Are you sure you want to delete this person? This action cannot be undone."
        saveLabel="Delete"
        cancelLabel="Cancel"
        saveButtonProps={{ variant: 'destructive' }}
      >
        <p className="text-muted-foreground">
          This will permanently remove {formData.name} from your account.
        </p>
      </StandardDialog>

      {/* Judge Qualifications Panel */}
      <JudgeQualificationPanel
        open={isQualificationsPanelOpen}
        onClose={() => setIsQualificationsPanelOpen(false)}
        userId={person.id}
        userName={`${person.firstName} ${person.lastName}`}
        onSaved={onQualificationsSaved}
      />
    </>
  );
};

export default UserDetailsDialogs;
