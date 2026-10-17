import React, { useMemo } from 'react';
import { Club } from '@/types/club-types';
import type { ClubMember } from '@/types/club-membership-types';
import { ClubEditPanel } from '@/components/panels/edit/ClubEditPanel';
import ClubPhotoDialog from '../ClubPhotoDialog';
import { clubDeleteDetail } from '@/features/delete';
import { AddMemberDialog } from '../members/AddMemberDialog';
import { useClubRegistryNumbers } from '@/hooks/queries/useClubRegistryNumbers';

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
  /**
   * Whether the viewer may delete this club (site admin: `computeClubPermissions`,
   * the same rule as `soft_delete_club`). The shared dialog is opened from the Edit
   * panel's footer.
   */
  canDeleteClub: boolean;
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
  canDeleteClub,
  onClubDeleted,
  showAddMemberDialog,
  onAddMemberDialogChange,
  members,
}) => {
  // MYK9-1235: the panel edits the club's numbers, so it starts from the loaded ones.
  // Until they load, `registryNumbers` is absent and the panel keeps those fields
  // disabled rather than letting a blank form delete them.
  const { data: registryNumbers } = useClubRegistryNumbers(club.id);
  const initialClubData = useMemo(
    () => (registryNumbers ? { ...club, registryNumbers } : club),
    [club, registryNumbers]
  );
  return (
    <>
      {/* Edit Club Panel */}
      <ClubEditPanel
        open={showEditPanel}
        onClose={onCloseEditPanel}
        clubId={club.id}
        clubName={club.name}
        initialClubData={initialClubData}
        onSave={onSaveEdit}
        onDelete={
          canDeleteClub
            ? {
                kind: 'club',
                objectLabel: 'club',
                targets: [{ id: club.id, name: club.name, detail: clubDeleteDetail(club) }],
                onDeleted: onClubDeleted,
              }
            : undefined
        }
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
