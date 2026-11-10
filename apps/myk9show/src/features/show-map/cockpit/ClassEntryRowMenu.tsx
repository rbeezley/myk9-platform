import { MoreHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SecretaryCockpitEntryAction } from './secretaryCockpitTypes';

/**
 * The per-dog menu in the class entries table's last column (MYK9-1798). F29b: the only
 * reachable home for a secretary-initiated move-up. `ShowMapRowActionsMenu` renders the same
 * set, but mounts only inside the public Show Map, which is read-only by intent (#291).
 * `ShowDeskPanel` owns the dialog and the mutation; an item emits the commandId its
 * runCommand resolves. See docs/plan-f29b-operational-actions-home.md.
 *
 * `actions` is the engine's answer for "allowed today for this entry" (the snapshot's
 * entryRows), so nothing here re-derives eligibility. A row with none shows no menu. Pull is
 * not here: it lives in the Check-in cell's picker.
 */
export function ClassEntryRowMenu({
  dogName,
  armband,
  actions,
  onCommand,
}: {
  dogName: string;
  /** Two rows can share a call name; the armband tells the triggers apart. */
  armband?: string | number | null | undefined;
  actions: readonly SecretaryCockpitEntryAction[];
  onCommand: (commandId: string) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild nativeButton>
        <Button
          type="button"
          variant="ghost"
          // Irreversible show-day actions: never below the 44px floor.
          size="touch"
          className="w-11 px-0"
          aria-label={armband ? `Actions for #${armband} ${dogName}` : `Actions for ${dogName}`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map(action => (
          <DropdownMenuItem
            key={action.commandId}
            title={action.why || undefined}
            onClick={() => onCommand(action.commandId)}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
