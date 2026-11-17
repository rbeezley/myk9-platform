/**
 * The class change words and controls on one My Shows class row (MYK9-1978):
 * "Change class…" for an accepted entry, the waiting line with "Take back
 * request", and the declined line with the secretary's reason.
 *
 * An accepted request needs no line of its own: the source row already reads
 * "moved" and the dog has a row in the new class.
 *
 * The waiting and taken-back states are held locally as well as read from the
 * entry, because the entry list is a replica that catches up after the server
 * has already answered.
 *
 * @module MyEntriesPage/modules/ClassChangeRowControls
 */

import React from 'react';
import { toast } from 'sonner';
import { cancelClassChange } from '@/services/database/entries/classChangeRequests';
import { classChangeErrorMessage } from '@/services/database/entries/classChangeErrorMessage';
import { logger } from '@/services/LoggingService';
import { EntryStatus } from '@/types/show-registration-types';
import { ChangeClassSheet } from './ChangeClassSheet';
import { declinedClassChangeReason } from './changeClassRow';
import { useClassChangeRequest } from './useClassChangeRequest';
import type { MyShowClass } from './groupEntriesByShow';

const LINK_CLASS =
  'inline-flex min-h-[44px] items-center rounded font-medium text-primary hover:underline ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

export interface ClassChangeRowControlsProps {
  cls: MyShowClass;
  dogName: string;
  showId: string;
  /** Every class this dog is already entered in at the show. */
  dogClassIds: ReadonlySet<string>;
  /** The row may offer "Change class…" (`canChangeClass`). */
  canChange: boolean;
  onChanged?: (() => void | Promise<void>) | undefined;
}

const Dot = () => (
  <span aria-hidden="true" className="text-muted-foreground">
    ·
  </span>
);

export const ClassChangeRowControls: React.FC<ClassChangeRowControlsProps> = ({
  cls,
  dogName,
  showId,
  dogClassIds,
  canChange,
  onChanged,
}) => {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  // 'sent' and 'taken-back' override the replicated status until it catches up.
  const [local, setLocal] = React.useState<'sent' | 'taken-back' | null>(null);
  const [isTakingBack, setIsTakingBack] = React.useState(false);

  const replicatedWaiting = cls.entryStatus === EntryStatus.MOVE_UP_REQUESTED;
  const waiting = local === 'sent' || (replicatedWaiting && local !== 'taken-back');
  const request = useClassChangeRequest(cls.id, waiting);
  const declined = waiting ? null : declinedClassChangeReason(cls.entryStatus, cls.specialRequests);

  const takeBack = async () => {
    setIsTakingBack(true);
    try {
      const { error } = await cancelClassChange(cls.id);
      if (error) {
        toast.error(classChangeErrorMessage(error));
        return;
      }
      setLocal('taken-back');
      toast.success('Request taken back.');
      await onChanged?.();
    } catch (err) {
      logger.error(
        'Taking back a class change failed',
        'entries',
        { entryId: cls.id },
        err as Error
      );
      toast.error(classChangeErrorMessage(null));
    } finally {
      setIsTakingBack(false);
    }
  };

  return (
    <>
      {waiting && (
        <>
          <Dot />
          <span className="text-muted-foreground">
            {request?.targetClassName
              ? `Change requested: ${request.targetClassName}. Waiting for the secretary.`
              : 'Change requested. Waiting for the secretary.'}
            {request?.reasonLabel ? ` ${request.reasonLabel}.` : ''}
          </span>
          <button
            type="button"
            onClick={() => void takeBack()}
            disabled={isTakingBack}
            aria-label={`Take back class change request for ${dogName} in ${cls.name}`}
            className={LINK_CLASS}
          >
            Take back request
          </button>
        </>
      )}
      {declined !== null && (
        <>
          <Dot />
          <span className="text-muted-foreground">
            {declined ? `Class change declined: ${declined}` : 'Class change declined.'}
          </span>
        </>
      )}
      {canChange && !waiting && (
        <>
          <Dot />
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={`Change class: ${dogName} out of ${cls.name}`}
            className={LINK_CLASS}
          >
            Change class…
          </button>
          <ChangeClassSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            entryId={cls.id}
            showId={showId}
            dogName={dogName}
            className={cls.name}
            currentClassId={cls.classId}
            dogClassIds={dogClassIds}
            onSent={async () => {
              setLocal('sent');
              await onChanged?.();
            }}
          />
        </>
      )}
    </>
  );
};
