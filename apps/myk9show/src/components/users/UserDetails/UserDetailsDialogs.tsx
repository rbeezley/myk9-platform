import React from 'react';
import ProfilePhotoDialog from '@/components/users/ProfilePhotoDialog';
import { AdminDeleteUserDialog } from '@/components/admin/users/AdminDeleteUserDialog';
import { JudgeQualificationPanel, UserEditPanel } from '@/components/panels/edit';
import type { User as UserType } from '@/types/user-types';
interface UserDetailsDialogsProps {
  person: UserType;
  formData: {
    name: string;
    photo: string;
  };
  /**
   * Whether the viewer may destroy the record outright, not merely remove it.
   * The roster has always offered both; this page offered neither honestly —
   * its dialog said "permanently remove … cannot be undone" while calling the
   * SOFT delete. Both surfaces now open the same dialog (MYK9-153, F5).
   */
  canPermanentlyDelete: boolean;
  onPermanentDeleteUser: () => Promise<void>;
  isDeletingUser: boolean;
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
  onPhotoSave: () => void | Promise<void>;
  isSavingPhoto?: boolean;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const UserDetailsDialogs: React.FC<UserDetailsDialogsProps> = ({
  person,
  formData,
  canPermanentlyDelete,
  onPermanentDeleteUser,
  isDeletingUser,
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
  isSavingPhoto,
  onFileInput,
}) => {
  // The owns-live-dogs guard lives inside AdminDeleteUserDialog, which queries
  // the dogs itself and names them. This page used to pass a count and render
  // its own copy of that check — two guards, one of which could go stale.
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
        isSaving={isSavingPhoto ?? false}
      />

      <AdminDeleteUserDialog
        open={isDeleteDialogOpen}
        onOpenChange={open => {
          if (!open) setIsDeleteDialogOpen(false);
        }}
        onSoftDelete={onDeleteUser}
        onPermanentDelete={onPermanentDeleteUser}
        entityName={formData.name}
        isDeleting={isDeletingUser}
        personId={person.id}
        allowPermanent={canPermanentlyDelete}
        alreadyRemoved={Boolean(person.deletedAt)}
      />

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
