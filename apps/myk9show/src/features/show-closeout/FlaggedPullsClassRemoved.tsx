import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  useDeskPull,
  type DeskPullRow,
} from '@/components/entries/management/checkInDesk/useDeskPull';
import { DeskPullDialogs } from '@/components/entries/management/checkInDesk/DeskPullDialogs';
import { CLASS_REMOVED_LABEL, type FlaggedPull } from './flaggedPulls';
import type { CloseoutFlaggedPulls } from './useCloseoutFlaggedPulls';

/** How a pull with no class row names its class in the Pull dialog and the toasts. */
const REMOVED_CLASS_NAME = 'a removed class';

function deskRowOf(item: FlaggedPull): DeskPullRow {
  return {
    entryId: item.entryId,
    dogName: item.dogName,
    className: REMOVED_CLASS_NAME,
    armband: item.armband,
    // Listed only when the desk's own rule offers Confirm (`isDeskConfirmableFlag`).
    deskStatusEditable: true,
    deskCanUnpull: false,
  };
}

/**
 * MYK9-2180: a flagged pull whose class row is missing or deleted. The Check-in desk lists a dog
 * by its classes, so it has no line to offer Confirm or Clear on; this group carries both, using
 * the desk's own actions (`useDeskPull`): Confirm asks first and is the real Pull, which goes to
 * refund review (refunds are never automatic); Clear puts the check-in back.
 */
export function FlaggedPullsClassRemoved({ flags }: { flags: CloseoutFlaggedPulls }) {
  const items = flags.status === 'read' ? flags.classRemoved : null;
  const rows = useMemo(
    () => new Map((items ?? []).map(item => [item.entryId, deskRowOf(item)])),
    [items]
  );
  const findRow = useCallback((entryId: string) => rows.get(entryId), [rows]);
  const { refresh } = flags;
  const pull = useDeskPull(findRow, refresh, 'Pulled while closing the show');
  if (!items || items.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={CLASS_REMOVED_LABEL}
      className="mt-2 rounded-md border border-dashed p-2"
    >
      <p className="text-sm font-medium">{CLASS_REMOVED_LABEL}</p>
      <p className="text-xs text-muted-foreground">
        These dogs are flagged as pulled in a class that is no longer on the schedule, so the
        Check-in desk cannot list them. Confirm the pull or clear the flag here.
      </p>
      <ul className="mt-1 divide-y">
        {items.map(item => {
          const row = deskRowOf(item);
          const label = item.armband ? `${item.armband} ${item.dogName}` : item.dogName;
          return (
            <li key={item.entryId} className="flex flex-wrap items-center gap-2 py-1 text-sm">
              <span className="min-w-0 flex-1 basis-40">{label}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={pull.clearingId !== null || pull.isWorking}
                aria-label={`Clear the pull flag for ${item.dogName}`}
                onClick={() => void pull.clearFlag(row)}
              >
                {pull.clearingId === item.entryId ? 'Clearing...' : 'Clear'}
              </Button>
              <Button
                type="button"
                size="sm"
                className="min-h-11"
                disabled={pull.clearingId !== null || pull.isWorking}
                aria-label={`Confirm the pull for ${item.dogName}`}
                onClick={() => pull.requestPull(row)}
              >
                Confirm
              </Button>
            </li>
          );
        })}
      </ul>
      <DeskPullDialogs pull={pull} />
    </div>
  );
}
