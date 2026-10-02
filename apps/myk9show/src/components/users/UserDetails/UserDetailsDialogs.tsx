import React from 'react';
import ProfilePhotoDialog from '@/components/users/ProfilePhotoDialog';
import { personDeleteDetail } from '@/features/delete';
import { JudgeQualificationPanel, UserEditPanel } from '@/components/panels/edit';
import type { User as UserType } from '@/types/user-types';
interface UserDetailsDialogsProps {
  person: UserType;
  formData: {
    name: string;
    photo: string;
  };
  /**
   * Whether the viewer may delete this person (`canDeletePerson`, the
   * `soft_delete_person` gate). Delete person is the Edit panel's footer button.
   */
  canDelete: boolean;
  isEditModalOpen: boolean;
  setIsEditModalOpen: (open: boolean) => void;
  isPhotoModalOpen: boolean;
  setIsPhotoModalOpen: (open: boolean) => void;
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
  canDelete,
  isEditModalOpen,
  setIsEditModalOpen,
  isPhotoModalOpen,
  setIsPhotoModalOpen,
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
  // A live person is deleted from the Edit panel's footer, through the shared dialog whose
  // server preview names the dogs they still own (the owns-dogs guard) before Delete is
  // enabled. A removed person has no Edit panel; a site admin purges them on Deleted Items.
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
        onDelete={
          canDelete && !person.deletedAt
            ? {
                kind: 'person',
                objectLabel: 'person',
                targets: [
                  {
                    id: person.id,
                    name: formData.name,
                    detail: personDeleteDetail({ email: person.email, town: person.city }),
                  },
                ],
                onDeleted: onPersonDeleted,
              }
            : undefined
        }
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
