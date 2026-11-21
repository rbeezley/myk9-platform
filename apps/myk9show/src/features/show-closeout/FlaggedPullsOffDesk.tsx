import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  useDeskPull,
  type DeskPullRow,
} from '@/components/entries/management/checkInDesk/useDeskPull';
import { DeskPullDialogs } from '@/components/entries/management/checkInDesk/DeskPullDialogs';
import { OFF_DESK_GROUP, type FlaggedPull } from './flaggedPulls';
import type { CloseoutFlaggedPulls } from './useCloseoutFlaggedPulls';

function deskRowOf(item: FlaggedPull): DeskPullRow {
  return {
    entryId: item.entryId,
    dogName: item.dogName,
    // The Pull dialog and the toasts name the class with it, so they carry the trial day and the
    // entry reference too: two flags of one dog never read the same.
    className: `a class not on this device's class list (${item.place})`,
    armband: item.armband,
    // Listed only when the desk's own rule offers Confirm (`isDeskConfirmableFlag`).
    deskStatusEditable: true,
    deskCanUnpull: false,
  };
}

/**
 * MYK9-2180: flagged pulls the Check-in desk cannot list, because their class is not on this
 * device's class list. One neutral group: this device cannot prove a class was removed, so it
 * never says so (owner decision 2026-11-20). Every row names its trial day and a short entry
 * reference, in its text, its Confirm and Clear names, the Pull dialog and the toasts, so two
 * flags of one dog are told apart. Confirm and Clear are the desk's own actions (`useDeskPull`):
 * Confirm asks first and is the real Pull, which goes to refund review (refunds are never
 * automatic); Clear puts the check-in back.
 */
export function FlaggedPullsOffDesk({ flags }: { flags: CloseoutFlaggedPulls }) {
  const items = flags.status === 'read' ? flags.offDesk : null;
  const rows = useMemo(
    () => new Map((items ?? []).map(item => [item.entryId, deskRowOf(item)])),
    [items]
  );
  const findRow = useCallback((entryId: string) => rows.get(entryId), [rows]);
  const pull = useDeskPull(findRow, flags.refresh, 'Pulled while closing the show');
  if (!items || items.length === 0) return null;
  const busy = pull.clearingId !== null || pull.isWorking;
  return (
    <>
      <div
        role="group"
        aria-label={OFF_DESK_GROUP.label}
        className="mt-2 rounded-md border border-dashed p-2"
      >
        <p className="text-sm font-medium">{OFF_DESK_GROUP.label}</p>
        <p className="text-xs text-muted-foreground">{OFF_DESK_GROUP.note}</p>
        <ul className="mt-1 divide-y">
          {items.map(item => {
            const row = rows.get(item.entryId) ?? deskRowOf(item);
            const dog = item.armband ? `${item.armband} ${item.dogName}` : item.dogName;
            const target = `${item.dogName}, ${item.place}`;
            return (
              <li key={item.entryId} className="flex flex-wrap items-center gap-2 py-1 text-sm">
                <span className="min-w-0 flex-1 basis-40">
                  {dog}
                  <span className="block text-xs text-muted-foreground">{item.place}</span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  disabled={busy}
                  aria-label={`Clear the pull flag for ${target}`}
                  onClick={() => void pull.clearFlag(row)}
                >
                  {pull.clearingId === item.entryId ? 'Clearing...' : 'Clear'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11"
                  disabled={busy}
                  aria-label={`Confirm the pull for ${target}`}
                  onClick={() => pull.requestPull(row)}
                >
                  Confirm
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
      <DeskPullDialogs pull={pull} />
    </>
  );
}
