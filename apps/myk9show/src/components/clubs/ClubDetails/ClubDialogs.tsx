import React from 'react';
import { Club } from '@/types/club-types';
import { ClubEditPanel } from '@/components/panels/edit/ClubEditPanel';
import ClubPhotoDialog from '../ClubPhotoDialog';
import { RegistrationWorkflow } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { RegistrationFormData } from '@/types/show-registration-types';
import { DeleteConfirmationDialog } from '@/components/base/DeleteConfirmationDialog';
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
  // Registration dialog
  showRegistrationDialog: boolean;
  onRegistrationDialogChange: (open: boolean) => void;
  selectedShowForRegistration: string | null;
  onRegistrationComplete: (data: RegistrationFormData) => void;
  onRegistrationCancel: () => void;
  // Delete dialog
  showDeleteDialog: boolean;
  onDeleteDialogChange: (open: boolean) => void;
  onConfirmDelete: () => Promise<void>;
  isDeleting: boolean;
  // Add member dialog
  showAddMemberDialog: boolean;
  onAddMemberDialogChange: (open: boolean) => void;
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
  showRegistrationDialog,
  onRegistrationDialogChange,
  selectedShowForRegistration,
  onRegistrationComplete,
  onRegistrationCancel,
  showDeleteDialog,
  onDeleteDialogChange,
  onConfirmDelete,
  isDeleting,
  showAddMemberDialog,
  onAddMemberDialogChange,
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

      {/* Registration Workflow Dialog */}
      <Dialog open={showRegistrationDialog} onOpenChange={onRegistrationDialogChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0">
          {selectedShowForRegistration && (
            <RegistrationWorkflow
              showId={selectedShowForRegistration}
              onComplete={onRegistrationComplete}
              onCancel={onRegistrationCancel}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Club Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={onDeleteDialogChange}
        onConfirm={onConfirmDelete}
        entityName={club.name}
        entityType="Club"
        description="This will mark the club as deleted and hide it from normal view. An administrator can restore it later if needed."
        isDeleting={isDeleting}
      />

      {/* Add Member Dialog */}
      <AddMemberDialog
        open={showAddMemberDialog}
        onOpenChange={onAddMemberDialogChange}
        club={club}
      />
    </>
  );
};
