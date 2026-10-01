import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NewJudgeForm, type CreateJudgeData } from '@/components/shows/wizard/steps/NewJudgeForm';

interface ShowEditAddJudgeDialogProps {
  /** The show's organization (AKC or UKC); the new judge is fixed to it. */
  organization: string;
  open: boolean;
  /** Panel-owned: refuses to close while a create is pending. */
  onOpenChange: (open: boolean) => void;
  /** Panel-owned create-and-assign. Rejects on failure. */
  onCreate: (input: CreateJudgeData) => Promise<void>;
}

/**
 * Modal "new judge" dialog for the Show Edit panel. Modal on purpose: while the
 * create is pending the rest of the panel is inert, so the roster and the show's
 * organization cannot change before the new judge is assigned (MYK9-908).
 */
export const ShowEditAddJudgeDialog: React.FC<ShowEditAddJudgeDialogProps> = ({
  organization,
  open,
  onOpenChange,
  onCreate,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogTitle>Add a new judge</DialogTitle>
      <DialogDescription>
        Creates the person and their {organization} judge credentials, then assigns them to this
        show.
      </DialogDescription>
      <NewJudgeForm
        lockedOrg={organization}
        defaultOrg={organization}
        onSubmit={onCreate}
        onCancel={() => onOpenChange(false)}
      />
    </DialogContent>
  </Dialog>
);
