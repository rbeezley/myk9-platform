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
import type { ClassTieEntry, ClassTieGroup } from '@/features/show-map/classTiesMutations';
import { cn } from '@/lib/utils';
import { dbSecondsToInputFormat } from '@/utils/scoringMappings';

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
  return entry.armband === null ? entry.dogName : `Armband ${entry.armband} ${entry.dogName}`;
}

/** The order a group will be saved in: the taps so far, plus the last dog once only one is left. */
function orderFor(group: ClassTieGroup, picks: readonly string[]): string[] {
  const rest = group.entries.map(entry => entry.entryId).filter(id => !picks.includes(id));
  return rest.length === 1 ? [...picks, ...rest] : [...picks];
}

interface CoinFlipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string;
  groups: readonly ClassTieGroup[];
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
  online,
  saving,
  onSave,
}: CoinFlipDialogProps) {
  const [picksByRank, setPicksByRank] = useState<Record<number, string[]>>({});
  const orders = groups.map(group => orderFor(group, picksByRank[group.rank] ?? []));
  const complete = groups.every((group, index) => orders[index]?.length === group.entries.length);
  const blocked = !online ? OFFLINE_COIN_FLIP_MESSAGE : null;

  const toggle = (rank: number, entryId: string) =>
    setPicksByRank(previous => {
      const picks = previous[rank] ?? [];
      return {
        ...previous,
        [rank]: picks.includes(entryId) ? picks.filter(id => id !== entryId) : [...picks, entryId],
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
          <DialogTitle>Record the coin flip</DialogTitle>
          <DialogDescription>
            {className}
            <br />
            Flip a coin for the dogs below. Tap the dog that won the flip first. These dogs finished
            with the same score and time.
          </DialogDescription>
        </DialogHeader>

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
                          onClick={() => toggle(group.rank, entry.entryId)}
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
