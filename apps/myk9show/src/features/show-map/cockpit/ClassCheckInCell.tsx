import { ChevronDown } from 'lucide-react';

import type { CheckInStatus } from '@/types/check-in-types';
import {
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
  const shown = checkIn.statusOf(entry);
  const display =
    shown === entry.checkInValue ? (entry.checkIn ?? displayOf(shown)) : displayOf(shown);
  const notCheckedIn = shown === 'no-status';
  const pill = <StatusPill label={display.label} kind={display.kind} outlined={notCheckedIn} />;

  if (!checkIn.canChange || !entry.deskEditable) {
    // A dog not checked in says so once, in Run status; a locked row says why.
    return (
      <>
        {entry.checkIn && !entry.notCheckedIn && pill}
        {entry.lockedReason && (
          <span className="mt-1 block text-xs text-muted-foreground">{entry.lockedReason}</span>
        )}
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={checkIn.isBusy(entry.entryId)}
        aria-label={`Change check-in for ${entry.dogName}: ${display.label}`}
        onClick={() => checkIn.open(entry.entryId)}
        className="flex min-h-11 items-center gap-0.5 rounded-md px-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {pill}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </button>
      {isFlaggedPull({ deskStatusEditable: true, checkInStatus: shown }) && (
        <span className="block text-xs text-muted-foreground">{flaggedPullLabel(undefined)}</span>
      )}
    </>
  );
}
