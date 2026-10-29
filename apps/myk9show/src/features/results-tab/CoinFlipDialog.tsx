import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatPlacement } from '@/components/classes/ClassResultsTable/utils';
import { cn } from '@/lib/utils';
import { dbSecondsToInputFormat } from '@/utils/scoringMappings';
import type { ClassTieEntry, ClassTieGroup } from './coinFlipRows';

/** Offline wording, same pattern as the other Results actions that need the server. */
export const OFFLINE_COIN_FLIP_MESSAGE = 'Connect to record the coin flip';

function resultLine(group: ClassTieGroup): string {
  const first = group.entries[0];
  if (!first) return '';
  const score = group.byPoints
    ? `${first.pointsEarned ?? 0} ${first.pointsEarned === 1 ? 'point' : 'points'}`
    : `${first.totalFaults ?? 0} ${first.totalFaults === 1 ? 'fault' : 'faults'}`;
  return first.timeSeconds ? `${score}, ${dbSecondsToInputFormat(first.timeSeconds)}` : score;
}

function dogLabel(entry: ClassTieEntry): string {
  return entry.armband === '' ? entry.dogName : `Armband ${entry.armband} ${entry.dogName}`;
}

/** The order a group will be saved in: the taps so far, plus the last dog once only one is left. */
function orderFor(group: ClassTieGroup, picks: readonly string[]): string[] {
  const rest = group.entries.map(entry => entry.entryId).filter(id => !picks.includes(id));
  return rest.length === 1 ? [...picks, ...rest] : [...picks];
}

/** Whether the tie groups can be trusted yet: they need the show row to say which key it ranks by. */
export type CoinFlipGroupsState = 'ready' | 'loading' | 'unavailable';

/** The order a group starts from: the recorded one when the flip is already on file. */
function startingPicks(group: ClassTieGroup): string[] {
  return group.recorded ? group.entries.map(entry => entry.entryId) : [];
}

interface CoinFlipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string;
  groups: readonly ClassTieGroup[];
  /** Until 'ready' the dialog says so (with a retry) instead of showing no dogs. */
  groupsState: CoinFlipGroupsState;
  onRetry: () => void;
  online: boolean;
  saving: boolean;
  /** Each group's entry ids, the dog that won the flip first. */
  onSave: (orders: string[][]) => void;
}

/**
 * Records the coin flip for the dogs tied for a ribbon (MYK9-1473). One tap per dog: the dog that
 * won the flip first, the rest follow; with two dogs the last one is implied. Saving writes every
 * group through `set_class_tie_order`, which needs the server.
 */
export function CoinFlipDialog({
  open,
  onOpenChange,
  className,
  groups,
  groupsState,
  onRetry,
  online,
  saving,
  onSave,
}: CoinFlipDialogProps) {
  const [picksByRank, setPicksByRank] = useState<Record<number, string[]>>({});
  // Any close clears the picks, including the parent closing it after a save, so a reopen
  // starts from the recorded order (adjusting state during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setPicksByRank({});
  }
  const picksFor = (group: ClassTieGroup) => picksByRank[group.rank] ?? startingPicks(group);
  const orders = groups.map(group => orderFor(group, picksFor(group)));
  const correcting = groups.length > 0 && groups.every(group => group.recorded);
  const complete =
    groupsState === 'ready' &&
    groups.length > 0 &&
    groups.every((group, index) => orders[index]?.length === group.entries.length);
  const blocked = !online ? OFFLINE_COIN_FLIP_MESSAGE : null;

  const toggle = (group: ClassTieGroup, entryId: string) =>
    setPicksByRank(previous => {
      // The first tap on a recorded group starts the order over from the dog tapped.
      const picks = previous[group.rank] ?? [];
      return {
        ...previous,
        [group.rank]: picks.includes(entryId)
          ? picks.filter(id => id !== entryId)
          : [...picks, entryId],
      };
    });

  const handleOpenChange = (next: boolean) => {
    if (!next) setPicksByRank({});
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{correcting ? 'Change the coin flip' : 'Record the coin flip'}</DialogTitle>
          <DialogDescription>
            {className}
            <br />
            Flip a coin for the dogs below. Tap the dog that won the flip first. These dogs finished
            with the same score and time.
          </DialogDescription>
        </DialogHeader>

        {groupsState !== 'ready' && (
          <div role="status" className="space-y-2 text-sm text-muted-foreground">
            <p>
              {groupsState === 'loading'
                ? 'Loading the show details…'
                : 'The show details could not be read, so the tied dogs cannot be listed yet.'}
            </p>
            {groupsState === 'unavailable' && (
              <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
                Try again
              </Button>
            )}
          </div>
        )}

        <div className="space-y-5">
          {groups.map((group, index) => {
            const order = orders[index] ?? [];
            return (
              <fieldset key={group.rank} className="space-y-2">
                <legend className="text-sm font-semibold">
                  Tied for {formatPlacement(group.rank)}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {resultLine(group)}
                  </span>
                </legend>
                <ul className="space-y-2">
                  {group.entries.map(entry => {
                    const position = order.indexOf(entry.entryId);
                    return (
                      <li key={entry.entryId}>
                        <Button
                          type="button"
                          variant={position >= 0 ? 'default' : 'outline'}
                          className={cn('min-h-11 w-full justify-between text-left')}
                          aria-pressed={position >= 0}
                          disabled={saving}
                          onClick={() => toggle(group, entry.entryId)}
                        >
                          <span>{dogLabel(entry)}</span>
                          <span>
                            {position >= 0 ? formatPlacement(group.rank + position) : 'Tap'}
                          </span>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            );
          })}
        </div>

        {blocked && (
          <p role="status" className="text-sm text-muted-foreground">
            {blocked}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={saving}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={saving || !complete || blocked !== null}
            onClick={() => onSave(orders)}
          >
            {saving ? 'Saving…' : 'Save coin flip'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
