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
import { StatusIcon, getStatusDescriptor } from '@/components/status';
import { handleOpenChange } from './dialogHelpers';

/** Statuses every user can set. */
const BASE_CHECK_IN_STATUSES: readonly CheckInStatus[] = [
  'no-status',
  'checked-in',
  'conflict',
  'pulled',
  'at-gate',
  'come-to-gate',
];

/** Additional statuses only stewards/judges may set (ring management). */
const RING_MANAGEMENT_CHECK_IN_STATUSES: readonly CheckInStatus[] = ['in-ring', 'completed'];

export const CheckinStatusDialog: React.FC<CheckinStatusDialogProps> = ({
  isOpen,
  onClose,
  onStatusChange,
  dogInfo,
  showRingManagement,
}) => {
  if (!isOpen) return null;

  const statuses = showRingManagement
    ? [...BASE_CHECK_IN_STATUSES, ...RING_MANAGEMENT_CHECK_IN_STATUSES]
    : BASE_CHECK_IN_STATUSES;

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
          {statuses.map(status => {
            const descriptor = getStatusDescriptor('entry', status);
            return (
              <Button
                key={status}
                variant="outline"
                className="min-h-11 justify-start"
                onClick={() => onStatusChange(status)}
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
    </Dialog>
  );
};
