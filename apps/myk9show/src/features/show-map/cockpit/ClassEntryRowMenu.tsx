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
import { useIsOnline } from '@/hooks/useNetworkStatus';
import {
  CHANGE_CLASS_OFFLINE_REASON,
  CHANGE_HANDLER_OFFLINE_REASON,
} from '../changeClassEligibility';
import { PEOPLE_ROUTE_ROLES } from '@/routes/peopleRouteRoles';
import { getPaperScoringEntryHref } from '@/pages/scoring/scoringRoutes';
import { canMarkAbsent } from './entryRowLinks';
import type { SecretaryCockpitClassEntry } from './cockpitClassEntries';
import type { CockpitLifecycle, SecretaryCockpitEntryAction } from './secretaryCockpitTypes';

/** The engine's Change class command (`<action id>:<node id>`). */
const isChangeClassCommand = (commandId: string) => commandId.startsWith('move-up-entry:');

/** A menu label with, when the item is disabled, the reason under it. */
function ItemLabel({ label, reason }: { label: string; reason: string | undefined }) {
  if (!reason) return <>{label}</>;
  return (
    <span className="flex flex-col">
      {label}
      <span className="text-xs text-muted-foreground">{reason}</span>
    </span>
  );
}

/**
 * The per-dog menu in the class entries table's last column (MYK9-1798, MYK9-1873). Items, in
 * order, each only when it applies and this viewer may do it:
 * - Change class: the engine's answer for "allowed today for this entry" (the snapshot's
 *   entryRows, resolved by `ShowDeskPanel.runCommand`), never re-derived here.
 * - Change handler: opens the entry sheet in place (the sheet's one field for a scent work entry
 *   is the handler); a link to Entry Management when the stored entry is not at hand. Change class and Change handler need a connection, so
 *   offline they are disabled with the reason beside them, before she taps (MYK9-1940).
 * - Enter result / Edit result: the paper scoring route opened on this dog, for a dog that can
 *   still have a result.
 * - Mark absent: a dog that can still run, and only for someone who may operate the show (the
 *   trial secretary gate Score this class uses). `onMarkAbsent` writes the result at once and offers Undo.
 * - Print armband label: the one print panel, opened on this dog, for a lost label or a late entry.
 *   Only a dog that has an armband has a label.
 * - Open dog details / Open person details (the entry's handler): links to the existing records;
 *   the person link only for the roles `/people/:id` admits.
 * Pull is not here: it lives in the Check-in cell's picker.
 */
export function ClassEntryRowMenu({
  entry,
  actions,
  onCommand,
  editEntryHref,
  classId,
  onMarkAbsent,
  onPrintLabel,
  classLifecycle,
  onChangeHandler,
}: {
  entry: SecretaryCockpitClassEntry;
  actions: readonly SecretaryCockpitEntryAction[];
  onCommand: (commandId: string) => void;
  editEntryHref: string;
  /** The class the row is in: the paper scoring route is keyed on it. */
  classId: string;
  onMarkAbsent: (entry: SecretaryCockpitClassEntry) => void;
  /** Opens the print panel on this dog's armband label (MYK9-2073). */
  onPrintLabel: (entry: SecretaryCockpitClassEntry) => void;
  /** The class's lifecycle: Mark absent is offered only while it is open for scoring. */
  classLifecycle: CockpitLifecycle | null;
  /**
   * Opens the entry sheet in place (MYK9-1940). Absent when the stored entry is not at hand, and
   * Change handler then links to the entry's form on Entry Management.
   */
  onChangeHandler?: ((entry: SecretaryCockpitClassEntry) => void) | undefined;
}) {
  const secretaryOnlyReason = useTrialSecretaryOnlyReason();
  const isOnline = useIsOnline();
  const { hasRole } = useAuthContext();
  const { dogName, armband } = entry;
  const showMarkAbsent = canMarkAbsent(entry, classLifecycle) && secretaryOnlyReason === undefined;
  // The paper scoring route for this one dog, as the class run sheet's row button opened it: a
  // dog that can still have a result (not pulled or withdrawn) gets Enter result, or Edit result
  // once scored. Locked to the trial secretary like Score this class.
  const canScore =
    entry.state !== 'pulled' && entry.state !== 'withdrawn' && entry.state !== 'pending';
  const scoreLabel = entry.state === 'scored' ? 'Edit result' : 'Enter result';
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
        {actions.map(action => {
          const offlineReason =
            !isOnline && isChangeClassCommand(action.commandId)
              ? CHANGE_CLASS_OFFLINE_REASON
              : undefined;
          return (
            <DropdownMenuItem
              key={action.commandId}
              className="min-h-11"
              title={offlineReason ?? (action.why || undefined)}
              disabled={offlineReason !== undefined}
              onClick={() => onCommand(action.commandId)}
            >
              <ItemLabel label={action.label} reason={offlineReason ?? action.note} />
            </DropdownMenuItem>
          );
        })}
        {isOnline ? (
          onChangeHandler ? (
            <DropdownMenuItem className="min-h-11" onClick={() => onChangeHandler(entry)}>
              Change handler
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild className="min-h-11">
              <Link to={editEntryHref}>Change handler</Link>
            </DropdownMenuItem>
          )
        ) : (
          <DropdownMenuItem className="min-h-11" disabled title={CHANGE_HANDLER_OFFLINE_REASON}>
            <ItemLabel label="Change handler" reason={CHANGE_HANDLER_OFFLINE_REASON} />
          </DropdownMenuItem>
        )}
        {canScore &&
          (secretaryOnlyReason !== undefined ? (
            <DropdownMenuItem className="min-h-11" disabled title={secretaryOnlyReason}>
              {scoreLabel}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild className="min-h-11">
              <Link to={getPaperScoringEntryHref(classId, entry.entryId)}>{scoreLabel}</Link>
            </DropdownMenuItem>
          ))}
        {showMarkAbsent && (
          <DropdownMenuItem className="min-h-11" onClick={() => onMarkAbsent(entry)}>
            Mark absent
          </DropdownMenuItem>
        )}
        {armband && (
          <DropdownMenuItem className="min-h-11" onClick={() => onPrintLabel(entry)}>
            Print armband label
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
