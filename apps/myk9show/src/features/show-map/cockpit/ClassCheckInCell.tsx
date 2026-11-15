import { ChevronDown } from 'lucide-react';

import type { CheckInStatus } from '@/types/check-in-types';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import {
  deskPutBackReason,
  flaggedPullLabel,
  isFlaggedPull,
} from '@/components/entries/management/checkInDesk/deskStatus';

import { classifyEntryCheckInStatus } from '../showMapStatus';
import type { ShowMapDisplayStatus } from '../showMapTypes';
import type { SecretaryCockpitClassEntry } from './cockpitClassEntries';
import { StatusPill } from './StatusPill';
import type { ClassCheckIn } from './useClassCheckIn';

function displayOf(status: CheckInStatus): ShowMapDisplayStatus {
  return (
    classifyEntryCheckInStatus({ check_in_status: status }) ?? {
      value: status,
      label: status,
      kind: 'neutral',
    }
  );
}

export function ClassCheckInCell({
  entry,
  checkIn,
}: {
  entry: SecretaryCockpitClassEntry;
  checkIn: ClassCheckIn;
}) {
  const isOnline = useIsOnline();
  const putBack = checkIn.putBackOf(entry.entryId);
  const putBackNote = putBack
    ? deskPutBackReason(
        { deskCanUnpull: putBack.canUnpull, putBackReason: putBack.reason },
        isOnline
      )
    : null;
  const shown = entry.checkInValue;
  const display = entry.checkIn ?? displayOf(shown);
  const notCheckedIn = shown === 'no-status';
  const pill = <StatusPill label={display.label} kind={display.kind} outlined={notCheckedIn} />;

  const editable = checkIn.canChange && entry.deskEditable;
  // One control shape on every row. A dog not checked in says so in Run status, so with no status
  // the control reads "Set status" when it can change it and a neutral "No status" when it cannot.
  const body = notCheckedIn ? (
    <span className="text-xs text-muted-foreground">{editable ? 'Set status' : 'No status'}</span>
  ) : (
    pill
  );
  const shape = 'flex min-h-11 items-center gap-0.5 rounded-md px-1';
  return (
    <>
      {putBack?.canUnpull ? (
        <button
          type="button"
          disabled={!isOnline || checkIn.isBusy(entry.entryId)}
          aria-label={`Put ${entry.dogName} back in this class`}
          onClick={() => checkIn.requestUnpull(putBack.row)}
          className={`${shape} hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:hover:bg-transparent`}
        >
          {pill}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
      ) : checkIn.canChange ? (
        <button
          type="button"
          disabled={!editable || checkIn.isBusy(entry.entryId)}
          aria-label={
            editable
              ? `Change check-in for ${entry.dogName}: ${display.label}`
              : `Check-in for ${entry.dogName}: ${display.label}, locked`
          }
          onClick={() => checkIn.open(entry.entryId)}
          className={`${shape} hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:hover:bg-transparent`}
        >
          {body}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
      ) : (
        <div className={shape}>{body}</div>
      )}
      {putBackNote ? (
        <span className="mt-1 block text-xs text-muted-foreground">{putBackNote}</span>
      ) : (
        checkIn.canChange &&
        !entry.deskEditable &&
        entry.lockedReason && (
          <span className="mt-1 block text-xs text-muted-foreground">{entry.lockedReason}</span>
        )
      )}
      {entry.scoredAfterRemoval && (
        <span
          className="block text-xs font-medium text-foreground"
          data-testid="scored-after-removal"
        >
          {entry.scoredAfterRemoval}
        </span>
      )}
      {editable && isFlaggedPull({ deskStatusEditable: true, checkInStatus: shown }) && (
        <span className="block text-xs text-muted-foreground">{flaggedPullLabel(undefined)}</span>
      )}
    </>
  );
}
