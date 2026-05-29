/**
 * CheckinStatusDialog — the one interactive at-show dialog shim exercised by
 * the Phase 1a spike smoke test ("change an entry status"). Conforms to
 * ringside's `CheckinStatusDialogProps`.
 */
import type React from 'react';
import type { CheckinStatusDialogProps } from '@myk9/ringside';
import type { CheckInStatus } from '@myk9/core';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { handleOpenChange } from './dialogHelpers';

/** Statuses every user can set. */
const BASE_STATUSES: readonly { value: CheckInStatus; label: string }[] = [
  { value: 'no-status', label: 'No Status' },
  { value: 'checked-in', label: 'Checked In' },
  { value: 'conflict', label: 'Conflict' },
  { value: 'pulled', label: 'Pulled' },
  { value: 'at-gate', label: 'At Gate' },
  { value: 'come-to-gate', label: 'Come to Gate' },
];

/** Additional statuses only stewards/judges may set (ring management). */
const RING_MANAGEMENT_STATUSES: readonly {
  value: CheckInStatus;
  label: string;
}[] = [
  { value: 'in-ring', label: 'In Ring' },
  { value: 'completed', label: 'Completed' },
];

export const CheckinStatusDialog: React.FC<CheckinStatusDialogProps> = ({
  isOpen,
  onClose,
  onStatusChange,
  dogInfo,
  showRingManagement,
}) => {
  if (!isOpen) return null;

  const statuses = showRingManagement
    ? [...BASE_STATUSES, ...RING_MANAGEMENT_STATUSES]
    : BASE_STATUSES;

  return (
    <Dialog open onOpenChange={(open) => handleOpenChange(open, onClose)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Status</DialogTitle>
        </DialogHeader>
        <div>
          <p>
            #{dogInfo.armband} {dogInfo.callName}
          </p>
          <p>{dogInfo.handler}</p>
        </div>
        <div className="flex flex-col gap-2">
          {statuses.map((status) => (
            <Button
              key={status.value}
              variant="outline"
              onClick={() => onStatusChange(status.value)}
            >
              {status.label}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
