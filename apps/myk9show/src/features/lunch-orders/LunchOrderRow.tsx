import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLunchRowSave } from './useLunchOrders';
import { LUNCH_TEXT_MAX, lunchRoleLabel, type LunchListItem } from './lunchOrders';

type RemoveState = 'idle' | 'removing' | 'error';

export interface LunchOrderPatch {
  lunchOrder?: string | undefined;
  dietaryNote?: string | undefined;
}

interface LunchOrderRowProps {
  item: LunchListItem;
  trialId: string;
  onRemove?: ((item: LunchListItem) => Promise<void>) | undefined;
}

/**
 * One person's lunch order and dietary note.
 *
 * - Every blur, and the row unmounting (closing the Show Desk panel never fires a blur), hands the
 *   fields that differ from the baseline to the row's save queue (useLunchRowSave). Nothing is
 *   skipped: the queue runs them in order, even after this row is gone.
 * - A field the person has not touched follows newer values from the server (another device's
 *   edit); a field they are typing in is never overwritten.
 */
export function LunchOrderRow({ item, trialId, onRemove }: LunchOrderRowProps) {
  const { save, pending } = useLunchRowSave(trialId, item.key);
  const [lunchOrder, setLunchOrder] = useState(item.lunchOrder);
  const [dietaryNote, setDietaryNote] = useState(item.dietaryNote);
  // What the database holds (or is about to hold) as far as this row knows; "dirty" means
  // differing from it.
  const [baseLunch, setBaseLunch] = useState(item.lunchOrder);
  const [baseDietary, setBaseDietary] = useState(item.dietaryNote);
  // The last values the parent passed down, to notice a background refetch.
  const [seenLunch, setSeenLunch] = useState(item.lunchOrder);
  const [seenDietary, setSeenDietary] = useState(item.dietaryNote);
  const [removeState, setRemoveState] = useState<RemoveState>('idle');

  if (item.lunchOrder !== seenLunch) {
    setSeenLunch(item.lunchOrder);
    if (lunchOrder === baseLunch) setLunchOrder(item.lunchOrder);
    setBaseLunch(item.lunchOrder);
  }
  if (item.dietaryNote !== seenDietary) {
    setSeenDietary(item.dietaryNote);
    if (dietaryNote === baseDietary) setDietaryNote(item.dietaryNote);
    setBaseDietary(item.dietaryNote);
  }

  function dirtyPatch(): LunchOrderPatch {
    const patch: LunchOrderPatch = {};
    if (lunchOrder !== baseLunch) patch.lunchOrder = lunchOrder;
    if (dietaryNote !== baseDietary) patch.dietaryNote = dietaryNote;
    return patch;
  }

  function flush() {
    const patch = dirtyPatch();
    if (Object.keys(patch).length === 0) return;
    // Treated as saved right away so a second blur sends only what changed since; a failure
    // makes those fields dirty again so Try again resends them.
    if (patch.lunchOrder !== undefined) setBaseLunch(patch.lunchOrder);
    if (patch.dietaryNote !== undefined) setBaseDietary(patch.dietaryNote);
    save.mutate(
      { item, patch },
      {
        onError: () => {
          if (patch.lunchOrder !== undefined)
            setBaseLunch(current => (current === patch.lunchOrder ? item.lunchOrder : current));
          if (patch.dietaryNote !== undefined)
            setBaseDietary(current => (current === patch.dietaryNote ? item.dietaryNote : current));
        },
      }
    );
  }

  // Closing the panel unmounts without a blur: queue whatever is still unsaved.
  const latest = useRef({ patch: dirtyPatch(), item, mutate: save.mutate });
  useEffect(() => {
    latest.current = { patch: dirtyPatch(), item, mutate: save.mutate };
  });
  useEffect(
    () => () => {
      const { patch, item: current, mutate } = latest.current;
      if (Object.keys(patch).length === 0) return;
      mutate({ item: current, patch });
    },
    []
  );

  async function remove() {
    if (!onRemove) return;
    setRemoveState('removing');
    try {
      await onRemove(item);
    } catch {
      setRemoveState('error');
    }
  }

  return (
    <li className="rounded-md border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {item.name}{' '}
          <span className="font-normal text-muted-foreground">{lunchRoleLabel(item.role)}</span>
        </p>
        <p className="min-h-4 text-xs" role="status" aria-live="polite">
          {(pending > 0 || removeState === 'removing') && (
            <span className="text-muted-foreground">Saving...</span>
          )}
          {pending === 0 && removeState !== 'removing' && save.isSuccess && (
            <span className="text-muted-foreground">Saved</span>
          )}
          {pending === 0 && save.isError && (
            <span className="text-destructive">
              Could not save. Check your connection.{' '}
              <button type="button" className="underline" onClick={flush}>
                Try again
              </button>
            </span>
          )}
          {removeState === 'error' && (
            <span className="text-destructive">
              Could not remove {item.name}. Check your connection.{' '}
              <button type="button" className="underline" onClick={() => void remove()}>
                Try again
              </button>
            </span>
          )}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          aria-label={`Lunch order for ${item.name}`}
          placeholder="Lunch order"
          maxLength={LUNCH_TEXT_MAX}
          value={lunchOrder}
          onChange={event => setLunchOrder(event.target.value)}
          onBlur={flush}
        />
        <Input
          aria-label={`Dietary note for ${item.name}`}
          placeholder="Dietary note (allergies, vegetarian)"
          maxLength={LUNCH_TEXT_MAX}
          value={dietaryNote}
          onChange={event => setDietaryNote(event.target.value)}
          onBlur={flush}
        />
      </div>
      {onRemove && item.savedId !== null && !item.assigned && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => void remove()}
        >
          Remove {item.name}
        </Button>
      )}
    </li>
  );
}
