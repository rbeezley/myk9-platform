/**
 * CheckinStatusDialog — the one interactive at-show dialog shim exercised by
 * the Phase 1a spike smoke test ("change an entry status"). Conforms to
 * ringside's `CheckinStatusDialogProps`.
 */
import React, { useState } from 'react';
import type { CheckinStatusDialogProps } from '@myk9/ringside';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog/confirm-dialog';
import { StatusTileGrid } from '@/components/status/StatusTileGrid';
import { handleOpenChange } from './dialogHelpers';
import { pickerStatuses } from '../entryStatusAccess';

export const CheckinStatusDialog: React.FC<CheckinStatusDialogProps> = ({
  isOpen,
  onClose,
  onStatusChange,
  dogInfo,
  className,
  showRingManagement,
  currentStatus,
  selfCheckinOnly,
}) => {
  const [confirmingPull, setConfirmingPull] = useState(false);
  if (!isOpen) return null;

  // One rule for which statuses a viewer is offered (MYK9-1807): an exhibitor sees only what
  // `self_checkin_entry` accepts, so no tile ends in a refused write.
  const statuses = pickerStatuses(selfCheckinOnly ? 'exhibitor' : 'staff', !!showRingManagement);

  return (
    <Dialog open onOpenChange={open => handleOpenChange(open, onClose)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change Status</DialogTitle>
        </DialogHeader>
        <div>
          <p>
            {dogInfo.armband != null && `#${dogInfo.armband} `}
            {dogInfo.callName}
          </p>
          <p>{dogInfo.handler}</p>
        </div>
        <StatusTileGrid
          statuses={statuses}
          currentStatus={currentStatus}
          onSelect={status =>
            status === 'pulled' ? setConfirmingPull(true) : onStatusChange(status)
          }
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirmingPull}
        onOpenChange={setConfirmingPull}
        title={`Pull ${dogInfo.callName}${className ? ` from ${className}` : ''}?`}
        description="The judge will skip this dog. You can undo right after."
        confirmLabel="Pull"
        destructive
        onConfirm={() => {
          setConfirmingPull(false);
          onStatusChange('pulled');
        }}
      />
    </Dialog>
  );
};
