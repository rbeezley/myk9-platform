import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LUNCH_TEXT_MAX, lunchRoleLabel, type LunchListItem } from './lunchOrders';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface LunchOrderRowProps {
  item: LunchListItem;
  onSave: (item: LunchListItem, lunchOrder: string, dietaryNote: string) => Promise<void>;
  onRemove?: ((item: LunchListItem) => Promise<void>) | undefined;
}

/** One person's lunch order and dietary note. Saves when a field loses focus and its text changed. */
export function LunchOrderRow({ item, onSave, onRemove }: LunchOrderRowProps) {
  const [lunchOrder, setLunchOrder] = useState(item.lunchOrder);
  const [dietaryNote, setDietaryNote] = useState(item.dietaryNote);
  const [state, setState] = useState<SaveState>('idle');
  // What the database holds, so a blur with no edit never writes.
  const [savedLunch, setSavedLunch] = useState(item.lunchOrder);
  const [savedDietary, setSavedDietary] = useState(item.dietaryNote);

  async function saveIfChanged() {
    if (lunchOrder === savedLunch && dietaryNote === savedDietary) return;
    setState('saving');
    try {
      await onSave(item, lunchOrder, dietaryNote);
      setSavedLunch(lunchOrder);
      setSavedDietary(dietaryNote);
      setState('saved');
    } catch {
      setState('error');
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
          {state === 'saving' && <span className="text-muted-foreground">Saving...</span>}
          {state === 'saved' && <span className="text-muted-foreground">Saved</span>}
          {state === 'error' && (
            <span className="text-destructive">
              Could not save. Check your connection and try again.
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
          onClick={() => void onRemove(item)}
        >
          Remove {item.name}
        </Button>
      )}
    </li>
  );
}
