import React from 'react';
import { Club } from '@/types/club-types';
import type { ClubMember } from '@/types/club-membership-types';
import { ClubEditPanel } from '@/components/panels/edit/ClubEditPanel';
import ClubPhotoDialog from '../ClubPhotoDialog';
import { DeleteObjectDialog, clubDeleteDetail } from '@/features/delete';
import { AddMemberDialog } from '../members/AddMemberDialog';

interface ClubDialogsProps {
  club: Club;
  // Edit panel
  showEditPanel: boolean;
  onCloseEditPanel: () => void;
  onSaveEdit: (formData: Partial<Club>) => Promise<void>;
  // Photo dialog
  showPhotoDialog: boolean;
  onPhotoDialogChange: (open: boolean) => void;
  previewImage: string | null;
  isDragging: boolean;
  onPhotoDrop: (e: React.DragEvent) => void;
  onPhotoDragOver: (e: React.DragEvent) => void;
  onPhotoDragLeave: (e: React.DragEvent) => void;
  onPhotoFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPhotoCancel: () => void;
  onPhotoSave: (savedImage: string | null) => Promise<void>;
  // Delete dialog
  showDeleteDialog: boolean;
  onDeleteDialogChange: (open: boolean) => void;
  /** After the shared dialog deleted the club. */
  onClubDeleted: () => void;
  // Add member dialog
  showAddMemberDialog: boolean;
  onAddMemberDialogChange: (open: boolean) => void;
  members: ClubMember[];
}

export const ClubDialogs: React.FC<ClubDialogsProps> = ({
  club,
  showEditPanel,
  onCloseEditPanel,
  onSaveEdit,
  showPhotoDialog,
  onPhotoDialogChange,
  previewImage,
  isDragging,
  onPhotoDrop,
  onPhotoDragOver,
  onPhotoDragLeave,
  onPhotoFileInput,
  onPhotoCancel,
  onPhotoSave,
  showDeleteDialog,
  onDeleteDialogChange,
  onClubDeleted,
  showAddMemberDialog,
  onAddMemberDialogChange,
  members,
}) => {
  return (
    <>
      {/* Edit Club Panel */}
      <ClubEditPanel
        open={showEditPanel}
        onClose={onCloseEditPanel}
        clubId={club.id}
        clubName={club.name}
        initialClubData={club}
        onSave={onSaveEdit}
      />

      {/* Club Photo Dialog */}
      <ClubPhotoDialog
        open={showPhotoDialog}
        onOpenChange={onPhotoDialogChange}
        previewImage={previewImage}
        currentPhoto={club.logo}
        isDragging={isDragging}
        onDrop={onPhotoDrop}
        onDragOver={onPhotoDragOver}
        onDragLeave={onPhotoDragLeave}
        onFileInput={onPhotoFileInput}
        onCancel={onPhotoCancel}
        onSave={onPhotoSave}
      />

      {showDeleteDialog && (
        <DeleteObjectDialog
          open
          onOpenChange={onDeleteDialogChange}
          kind="club"
          targets={[{ id: club.id, name: club.name, detail: clubDeleteDetail(club) }]}
          onDeleted={onClubDeleted}
        />
      )}

      {/* Add Member Dialog */}
      <AddMemberDialog
        open={showAddMemberDialog}
        onOpenChange={onAddMemberDialogChange}
        club={club}
        members={members}
      />
    </>
  );
};
