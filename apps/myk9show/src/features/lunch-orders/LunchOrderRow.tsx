import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LUNCH_TEXT_MAX, lunchRoleLabel, type LunchListItem } from './lunchOrders';

type Status = 'idle' | 'saving' | 'saved' | 'error' | 'remove-error';

export interface LunchOrderPatch {
  lunchOrder?: string | undefined;
  dietaryNote?: string | undefined;
}

interface LunchOrderRowProps {
  item: LunchListItem;
  onSave: (item: LunchListItem, patch: LunchOrderPatch) => Promise<void>;
  onRemove?: ((item: LunchListItem) => Promise<void>) | undefined;
}

/**
 * One person's lunch order and dietary note.
 *
 * - Saves when a field loses focus, and also when the row unmounts (closing the Show Desk panel
 *   never fires a blur), sending only the fields that changed.
 * - A field the person has not touched follows newer values from the server (another device's
 *   edit); a field they are typing in is never overwritten.
 */
export function LunchOrderRow({ item, onSave, onRemove }: LunchOrderRowProps) {
  const [lunchOrder, setLunchOrder] = useState(item.lunchOrder);
  const [dietaryNote, setDietaryNote] = useState(item.dietaryNote);
  // What the database holds as far as this row knows; "dirty" means differing from it.
  const [baseLunch, setBaseLunch] = useState(item.lunchOrder);
  const [baseDietary, setBaseDietary] = useState(item.dietaryNote);
  // The last values the parent passed down, to notice a background refetch.
  const [seenLunch, setSeenLunch] = useState(item.lunchOrder);
  const [seenDietary, setSeenDietary] = useState(item.dietaryNote);
  const [status, setStatus] = useState<Status>('idle');
  const saving = useRef(false);

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

  async function saveIfChanged() {
    const patch = dirtyPatch();
    if (Object.keys(patch).length === 0 || saving.current) return;
    saving.current = true;
    setStatus('saving');
    try {
      await onSave(item, patch);
      if (patch.lunchOrder !== undefined) setBaseLunch(patch.lunchOrder);
      if (patch.dietaryNote !== undefined) setBaseDietary(patch.dietaryNote);
      setStatus('saved');
    } catch {
      setStatus('error');
    } finally {
      saving.current = false;
    }
  }

  // Closing the panel unmounts without a blur: write whatever is still unsaved.
  const latest = useRef({ patch: dirtyPatch(), item, onSave });
  useEffect(() => {
    latest.current = { patch: dirtyPatch(), item, onSave };
  });
  useEffect(
    () => () => {
      const { patch, item: current, onSave: save } = latest.current;
      if (Object.keys(patch).length === 0 || saving.current) return;
      void save(current, patch).catch(() => undefined);
    },
    []
  );

  async function remove() {
    if (!onRemove) return;
    setStatus('saving');
    try {
      await onRemove(item);
    } catch {
      setStatus('remove-error');
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
          {status === 'saving' && <span className="text-muted-foreground">Saving...</span>}
          {status === 'saved' && <span className="text-muted-foreground">Saved</span>}
          {status === 'error' && (
            <span className="text-destructive">
              Could not save. Check your connection.{' '}
              <button type="button" className="underline" onClick={() => void saveIfChanged()}>
                Try again
              </button>
            </span>
          )}
          {status === 'remove-error' && (
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
          onBlur={() => void saveIfChanged()}
        />
        <Input
          aria-label={`Dietary note for ${item.name}`}
          placeholder="Dietary note (allergies, vegetarian)"
          maxLength={LUNCH_TEXT_MAX}
          value={dietaryNote}
          onChange={event => setDietaryNote(event.target.value)}
          onBlur={() => void saveIfChanged()}
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
