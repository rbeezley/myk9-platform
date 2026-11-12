import { MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTrialSecretaryOnlyReason } from '@/features/actions/TrialSecretaryAccessContext';
import { useAuthContext } from '@/hooks/useAuthContext';
import { PEOPLE_ROUTE_ROLES } from '@/routes/peopleRouteRoles';
import { canMarkAbsent } from './entryRowLinks';
import type { SecretaryCockpitClassEntry } from './cockpitClassEntries';
import type { CockpitLifecycle, SecretaryCockpitEntryAction } from './secretaryCockpitTypes';

/**
 * The per-dog menu in the class entries table's last column (MYK9-1798, MYK9-1873). Items, in
 * order, each only when it applies and this viewer may do it:
 * - Change class: the engine's answer for "allowed today for this entry" (the snapshot's
 *   entryRows, resolved by `ShowDeskPanel.runCommand`), never re-derived here.
 * - Edit entry: a link to the entry's form on Entry Management, where the edit sheet lives.
 * - Mark absent: a dog that can still run, and only for someone who may operate the show (the
 *   trial secretary gate Score this class uses). `onMarkAbsent` confirms, then writes the result.
 * - Open dog details / Open person details (the entry's handler): links to the existing records;
 *   the person link only for the roles `/people/:id` admits.
 * Pull is not here: it lives in the Check-in cell's picker.
 */
export function ClassEntryRowMenu({
  entry,
  actions,
  onCommand,
  editEntryHref,
  onMarkAbsent,
  classLifecycle,
}: {
  entry: SecretaryCockpitClassEntry;
  actions: readonly SecretaryCockpitEntryAction[];
  onCommand: (commandId: string) => void;
  editEntryHref: string;
  onMarkAbsent: (entry: SecretaryCockpitClassEntry) => void;
  /** The class's lifecycle: Mark absent is offered only while it is open for scoring. */
  classLifecycle: CockpitLifecycle | null;
}) {
  const secretaryOnlyReason = useTrialSecretaryOnlyReason();
  const { hasRole } = useAuthContext();
  const { dogName, armband } = entry;
  const showMarkAbsent = canMarkAbsent(entry, classLifecycle) && secretaryOnlyReason === undefined;
  const personHref = PEOPLE_ROUTE_ROLES.some(role => hasRole(role)) ? entry.handlerHref : undefined;
  const showOpenLinks = Boolean(entry.dogHref || personHref);
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
            className="min-h-11"
            title={action.why || undefined}
            onClick={() => onCommand(action.commandId)}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild className="min-h-11">
          <Link to={editEntryHref}>Edit entry</Link>
        </DropdownMenuItem>
        {showMarkAbsent && (
          <DropdownMenuItem className="min-h-11" onClick={() => onMarkAbsent(entry)}>
            Mark absent
          </DropdownMenuItem>
        )}
        {showOpenLinks && <DropdownMenuSeparator />}
        {entry.dogHref && (
          <DropdownMenuItem asChild className="min-h-11">
            <Link to={entry.dogHref}>Open dog details</Link>
          </DropdownMenuItem>
        )}
        {personHref && (
          <DropdownMenuItem asChild className="min-h-11">
            <Link to={personHref}>Open person details</Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
