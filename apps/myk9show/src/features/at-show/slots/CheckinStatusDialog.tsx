/**
 * CheckinStatusDialog — the one interactive at-show dialog shim exercised by
 * the Phase 1a spike smoke test ("change an entry status"). Conforms to
 * ringside's `CheckinStatusDialogProps`.
 */
import React, { useState } from 'react';
import type { CheckinStatusDialogProps } from '@myk9/ringside';
import { STAFF_CHECK_IN_STATUSES, type CheckInStatus } from '@myk9/core';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog/confirm-dialog';
import { StatusIcon, getStatusDescriptor } from '@/components/status';
import { handleOpenChange } from './dialogHelpers';

/** Additional statuses only stewards/judges may set (ring management). */
const RING_MANAGEMENT_CHECK_IN_STATUSES: readonly CheckInStatus[] = ['in-ring', 'completed'];

export const CheckinStatusDialog: React.FC<CheckinStatusDialogProps> = ({
  isOpen,
  onClose,
  onStatusChange,
  dogInfo,
  className,
  showRingManagement,
}) => {
  const [confirmingPull, setConfirmingPull] = useState(false);
  if (!isOpen) return null;

  const statuses = showRingManagement
    ? [...STAFF_CHECK_IN_STATUSES, ...RING_MANAGEMENT_CHECK_IN_STATUSES]
    : STAFF_CHECK_IN_STATUSES;

  return (
    <Dialog open onOpenChange={open => handleOpenChange(open, onClose)}>
      <DialogContent>
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
        <div className="flex flex-col gap-2">
          {statuses.map(status => {
            const descriptor = getStatusDescriptor('entry', status);
            return (
              <Button
                key={status}
                variant="outline"
                className="min-h-11 justify-start"
                onClick={() =>
                  status === 'pulled' ? setConfirmingPull(true) : onStatusChange(status)
                }
              >
                <StatusIcon family="entry" status={status} size="sm" decorative />
                {descriptor.label}
              </Button>
            );
          })}
        </div>
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
