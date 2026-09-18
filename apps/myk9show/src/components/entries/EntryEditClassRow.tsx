/**
 * MYK9-632: one class row inside `EntryEditDialog`.
 *
 * Extracted so that file stays under the 500-line ceiling once the row learned
 * to tell a WITHDRAWAL apart from a PULL. Presentational: every write is the
 * caller's.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';
import { disciplineUsesJumpHeight } from '@/types/template.types';
import { EditingBadge } from '@/features/show-presence/EditingBadge';
import type { RemoveFromClassEligibility } from '@/services/database/entries/withdrawEligibility';
import { withdrawalReasonLabel } from '@/features/registries';

const JUMP_HEIGHTS = ['4"', '8"', '12"', '16"', '20"', '24"', '26"'];

export interface EntryClass {
  id: string;
  name: string;
  number: string;
  fee: number;
  jumpHeight?: string;
  /** Trial discipline; gates the jump-height field (scent work has no jump height). */
  trialType?: string;
  handlerId?: string | null;
  handler?: string;
  runOrder?: number;
  /** MYK9-632: 'withdrawn' and 'scratched' (a pull) are DIFFERENT acts. */
  status: 'entered' | 'withdrawn' | 'scratched' | 'moved' | 'absent';
  /**
   * MYK9-632: the stored `withdrawal_reason_code` ('in_season' | 'judge_change'),
   * null on a pull, and `undefined` when the row predates migration
   * 20260918041700 (which is what puts the column on the view). Only ever
   * rendered for a withdrawal.
   */
  withdrawalReasonCode?: string | null | undefined;
}

interface EntryEditClassRowProps {
  classEntry: EntryClass;
  /** The row's status after any local edit — 'withdrawn' and 'scratched' are DIFFERENT. */
  status: string;
  /**
   * The stored (or just-chosen) `withdrawal_reason_code` for this row, or
   * null/undefined when there is none. Only ever rendered for a WITHDRAWAL: a
   * pull is the club's call and carries no enumerated reason.
   */
  reasonCode?: string | null | undefined;
  /** Both verdicts for this row, or undefined while the lookup has not answered. */
  rowEligibility: RemoveFromClassEligibility | undefined;
  currentHandler: string;
  currentJumpHeight: string | undefined;
  onLeaveClass: (classId: string, className: string) => void;
  onHandlerChange: (classId: string, handler: string) => void;
  onJumpHeightChange: (classId: string, jumpHeight: string) => void;
}

export function EntryEditClassRow({
  classEntry,
  status,
  reasonCode,
  rowEligibility,
  currentHandler,
  currentJumpHeight,
  onLeaveClass,
  onHandlerChange,
  onJumpHeightChange,
}: EntryEditClassRowProps) {
  const isPulled = status === 'scratched';
  const isWithdrawn = status === 'withdrawn';
  const isRemoved = isPulled || isWithdrawn;
  // `entries_withdrawal_reason_code_check` allows exactly NULL, 'in_season' and
  // 'judge_change', and `withdrawalReasonLabel` covers both codes — so the null
  // branch here is not a fallback for some other code, it is the real state of
  // a withdrawal that carries no reason (what a secretary Decline writes, and
  // what every row reads as until migration 20260918041700 lands). It renders
  // the bare word.
  const reason = isWithdrawn ? withdrawalReasonLabel(reasonCode) : null;
  const removedLabel = isWithdrawn ? (reason ? `Withdrawn · ${reason}` : 'Withdrawn') : 'Pulled';
  // One affordance opens the chooser; it is offered while EITHER
  // act is available, and the dialog greys out the one that is
  // not. Offering nothing because a paid entry cannot be
  // WITHDRAWN would hide the pull the exhibitor is entitled to.
  const canLeave =
    rowEligibility == null || rowEligibility.withdraw.allowed || rowEligibility.pull.allowed;
  const blockedReason =
    rowEligibility && !canLeave
      ? (rowEligibility.pull.reason ?? rowEligibility.withdraw.reason)
      : undefined;
  return (
    <div
      className={`p-3 rounded-lg border ${
        isRemoved ? 'bg-muted/50 border-muted' : 'bg-card border-border'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className={`font-medium ${isRemoved ? 'line-through text-muted-foreground' : ''}`}>
            {classEntry.name}
            {classEntry.number && ` #${classEntry.number}`}
          </div>
          <div className="text-sm text-muted-foreground">${classEntry.fee.toFixed(2)}</div>
        </div>
        {isRemoved ? (
          <Badge variant="secondary">{removedLabel}</Badge>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onLeaveClass(classEntry.id, classEntry.name)}
            disabled={!canLeave}
            title={blockedReason}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <X className="h-4 w-4 mr-1" />
            Withdraw or pull
          </Button>
        )}
      </div>

      {!isRemoved && blockedReason && (
        <p className="mt-2 text-sm text-muted-foreground">{blockedReason}</p>
      )}

      {/* Advisory heads-up if a secretary already has THIS class
        row's entry open on ClassDetailsPage. Keyed on the per-class
        entries.id (not the grouped card id) so it matches the
        secretary's surface exactly, for every class in the group. */}
      <EditingBadge entityType="entry" entityId={classEntry.id} className="mt-2" />

      <div className="mt-3 space-y-1.5">
        <Label htmlFor={`handler-${classEntry.id}`} className="text-sm">
          Handler
        </Label>
        <Input
          id={`handler-${classEntry.id}`}
          aria-label={`Handler for ${classEntry.name}`}
          value={currentHandler}
          onChange={e => onHandlerChange(classEntry.id, e.target.value)}
          placeholder="Enter handler name"
          disabled={isRemoved}
        />
      </div>

      {/* Jump height only applies to jumping disciplines
        (agility, obedience, rally). Scent work has none, so
        hide the field rather than show an irrelevant select. */}
      {!isRemoved && disciplineUsesJumpHeight(classEntry.trialType) && (
        <div className="mt-3 flex items-center gap-2">
          <Label htmlFor={`jump-height-${classEntry.id}`} className="text-sm whitespace-nowrap">
            Jump Height:
          </Label>
          <Select
            value={currentJumpHeight || ''}
            onValueChange={value => onJumpHeightChange(classEntry.id, value)}
          >
            <SelectTrigger id={`jump-height-${classEntry.id}`} className="w-24">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {JUMP_HEIGHTS.map(height => (
                <SelectItem key={height} value={height}>
                  {height}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
