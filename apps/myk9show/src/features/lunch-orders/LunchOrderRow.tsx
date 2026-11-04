import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLunchRowSave } from './useLunchOrders';
import { LUNCH_TEXT_MAX, lunchRoleLabel, type LunchListItem } from './lunchOrders';

type RemoveState = 'idle' | 'removing' | 'error';

interface LunchOrderRowProps {
  item: LunchListItem;
  trialId: string;
  /** Told whether this row holds typed text that is not saved yet. */
  onDirtyChange: (rowKey: string, dirty: boolean) => void;
  onRemove?: ((item: LunchListItem) => Promise<void>) | undefined;
}

/**
 * One person's lunch order and dietary note, saved with an explicit Save button.
 * Newer server values replace the fields only while the row is not dirty, so a refetch never
 * clobbers text being typed.
 */
export function LunchOrderRow({ item, trialId, onDirtyChange, onRemove }: LunchOrderRowProps) {
  const save = useLunchRowSave(trialId);
  const [lunchOrder, setLunchOrder] = useState(item.lunchOrder);
  const [dietaryNote, setDietaryNote] = useState(item.dietaryNote);
  // What the database holds as far as this row knows; dirty means differing from it.
  const [baseLunch, setBaseLunch] = useState(item.lunchOrder);
  const [baseDietary, setBaseDietary] = useState(item.dietaryNote);
  // The last server values passed down, to notice a refetch that changed them.
  const [seenLunch, setSeenLunch] = useState(item.lunchOrder);
  const [seenDietary, setSeenDietary] = useState(item.dietaryNote);
  const [removeState, setRemoveState] = useState<RemoveState>('idle');

  const dirty = lunchOrder !== baseLunch || dietaryNote !== baseDietary;

  // A refetch brought different server values: adopt them only when nothing typed is at stake.
  if (item.lunchOrder !== seenLunch || item.dietaryNote !== seenDietary) {
    setSeenLunch(item.lunchOrder);
    setSeenDietary(item.dietaryNote);
    if (!dirty) {
      setLunchOrder(item.lunchOrder);
      setDietaryNote(item.dietaryNote);
    }
    // Dirty means "differs from what is saved", so the baseline always follows the server.
    setBaseLunch(item.lunchOrder);
    setBaseDietary(item.dietaryNote);
  }

  useEffect(() => {
    onDirtyChange(item.key, dirty);
    return () => onDirtyChange(item.key, false);
  }, [dirty, item.key, onDirtyChange]);

  function saveRow() {
    const sent = { lunchOrder, dietaryNote };
    save.mutate(
      { item, ...sent },
      {
        onSuccess: () => {
          setBaseLunch(sent.lunchOrder);
          setBaseDietary(sent.dietaryNote);
        },
      }
    );
  }

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
          {(save.isPending || removeState === 'removing') && (
            <span className="text-muted-foreground">Saving...</span>
          )}
          {!save.isPending && save.isError && (
            <span className="text-destructive">
              Could not save. Check your connection.{' '}
              <button type="button" className="underline" onClick={saveRow}>
                Try again
              </button>
            </span>
          )}
          {!save.isPending && !save.isError && dirty && (
            <span className="text-muted-foreground">Not saved</span>
          )}
          {!save.isPending && !save.isError && !dirty && save.isSuccess && (
            <span className="text-muted-foreground">Saved</span>
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
        />
        <Input
          aria-label={`Dietary note for ${item.name}`}
          placeholder="Dietary note (allergies, vegetarian)"
          maxLength={LUNCH_TEXT_MAX}
          value={dietaryNote}
          onChange={event => setDietaryNote(event.target.value)}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          aria-label={`Save lunch order for ${item.name}`}
          disabled={!dirty || save.isPending}
          onClick={saveRow}
        >
          Save
        </Button>
        {onRemove && item.savedId !== null && !item.assigned && (
          <Button type="button" variant="ghost" size="sm" onClick={() => void remove()}>
            Remove {item.name}
          </Button>
        )}
      </div>
    </li>
  );
}
