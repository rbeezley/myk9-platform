import React from 'react';
import ProfilePhotoDialog from '@/components/users/ProfilePhotoDialog';
import { AdminDeleteUserDialog } from '@/components/admin/users/AdminDeleteUserDialog';
import { DeleteObjectDialog, personDeleteDetail } from '@/features/delete';
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
  /** After the shared delete dialog removed this person (soft, with Undo). */
  onPersonDeleted: () => void;
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
  onPersonDeleted,
  onUserEditSave,
  onQualificationsSaved,
  onPhotoSave,
  isSavingPhoto,
  onFileInput,
}) => {
  // A live person goes through the shared delete dialog, whose server preview
  // names the dogs they still own (the owns-dogs guard) before Delete is enabled.
  // An already removed person can only be purged, by a site admin.
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

      {isDeleteDialogOpen && !person.deletedAt && (
        <DeleteObjectDialog
          open
          onOpenChange={open => {
            if (!open) setIsDeleteDialogOpen(false);
          }}
          kind="person"
          targets={[
            {
              id: person.id,
              name: formData.name,
              detail: personDeleteDetail({ email: person.email, town: person.city }),
            },
          ]}
          onDeleted={onPersonDeleted}
        />
      )}
      <AdminDeleteUserDialog
        open={isDeleteDialogOpen && Boolean(person.deletedAt) && canPermanentlyDelete}
        onOpenChange={open => {
          if (!open) setIsDeleteDialogOpen(false);
        }}
        onSoftDelete={() => undefined}
        onPermanentDelete={onPermanentDeleteUser}
        entityName={formData.name}
        isDeleting={isDeletingUser}
        alreadyRemoved
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
