import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { notifications } from '@/lib/notifications';
import { useTrialJudgeSupplies } from './useTrialJudgeSupplies';
import { judgeKey, type JudgeKey, type RegistryId, type TrialJudgeSupplyRow } from './types';

const MAX_LABEL = 200;
const MAX_NOTE = 500;

export interface ManageJudgeSuppliesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trialId: string;
  judge: JudgeKey;
  registryId: RegistryId | null;
}

export function ManageJudgeSuppliesDialog({
  open,
  onOpenChange,
  trialId,
  judge,
  registryId,
}: ManageJudgeSuppliesDialogProps) {
  const supplies = useTrialJudgeSupplies(trialId);
  const thisJudgeKey = useMemo(
    () => judgeKey(judge),
    [judge.person_id, judge.judge_name] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const judgeRows = useMemo(() => {
    return supplies.rows
      .filter(row => judgeKey(row) === thisJudgeKey)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [supplies.rows, thisJudgeKey]);

  // Idempotent seed on open.
  useEffect(() => {
    if (!open || !judge.judge_name) return;
    if (supplies.ensureSeeded.isPending) return;
    if (judgeRows.length > 0) return;
    supplies.ensureSeeded.mutate(
      { person_id: judge.person_id, judge_name: judge.judge_name, registry_id: registryId },
      {
        onError: err => {
          notifications.error(
            err instanceof Error
              ? `Could not load supplies: ${err.message}`
              : 'Could not load supplies'
          );
        },
      }
    );
    // intentionally not depending on supplies.ensureSeeded or judgeRows.length
    // changing every render — we only want to fire on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, thisJudgeKey, registryId]);

  const isSeeding = supplies.ensureSeeded.isPending && judgeRows.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage supplies — {judge.judge_name}</DialogTitle>
        </DialogHeader>

        {isSeeding && <SupplySkeleton />}
        {!isSeeding && judgeRows.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No supply items configured yet.
          </p>
        )}
        {!isSeeding && judgeRows.length > 0 && (
          <SupplyList
            rows={judgeRows}
            onToggle={(id, included) =>
              supplies.updateRow.mutate(
                { id, patch: { included } },
                { onError: err => notifications.error(toMessage(err, 'Could not update item')) }
              )
            }
            onEditNote={(id, note) =>
              supplies.updateRow.mutate(
                { id, patch: { note: note.trim() || null } },
                { onError: err => notifications.error(toMessage(err, 'Could not update note')) }
              )
            }
            onDelete={id =>
              supplies.deleteCustomRow.mutate(id, {
                onError: err => notifications.error(toMessage(err, 'Could not delete item')),
              })
            }
            onReorder={orderedIds =>
              supplies.reorder.mutate(orderedIds, {
                onError: err => notifications.error(toMessage(err, 'Could not reorder items')),
              })
            }
          />
        )}

        <AddCustomItem
          existingLabels={judgeRows.map(r => r.item_label.toLowerCase())}
          maxSort={judgeRows.reduce((m, r) => Math.max(m, r.sort_order), 0)}
          onAdd={item =>
            supplies.addCustomRow.mutate(
              {
                person_id: judge.person_id,
                judge_name: judge.judge_name,
                item_label: item.label,
                sort_order: item.sort_order,
                note: item.note,
              },
              { onError: err => notifications.error(toMessage(err, 'Could not add item')) }
            )
          }
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return `${fallback}: ${err.message}`;
  return fallback;
}

function SupplySkeleton() {
  return (
    <div className="py-6 space-y-2" aria-label="Loading supplies">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="h-9 rounded bg-muted/40 animate-pulse" />
      ))}
    </div>
  );
}

interface SupplyListProps {
  rows: TrialJudgeSupplyRow[];
  onToggle: (id: string, included: boolean) => void;
  onEditNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

function SupplyList({ rows, onToggle, onEditNote, onDelete, onReorder }: SupplyListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const ids = rows.map(r => r.id);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = arrayMove(ids, from, to);
    onReorder(next);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1 max-h-[50vh] overflow-y-auto" role="list">
          {rows.map(row => (
            <SupplyRow
              key={row.id}
              row={row}
              onToggle={onToggle}
              onEditNote={onEditNote}
              onDelete={onDelete}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

interface SupplyRowProps {
  row: TrialJudgeSupplyRow;
  onToggle: (id: string, included: boolean) => void;
  onEditNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
}

function SupplyRow({ row, onToggle, onEditNote, onDelete }: SupplyRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  // Initialize local note state once. After a server invalidation we
  // intentionally keep local edits rather than clobber them mid-typing;
  // the blur handler is the single source of truth for "user is done."
  const [note, setNote] = useState(row.note ?? '');

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border/40 bg-background px-2 py-1.5"
      data-testid={`supply-row-${row.id}`}
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground"
        aria-label={`Reorder ${row.item_label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Checkbox
        checked={row.included}
        onCheckedChange={checked => onToggle(row.id, checked === true)}
        aria-label={`Include ${row.item_label}`}
      />

      <span className={`flex-1 text-sm ${row.included ? '' : 'text-muted-foreground line-through'}`}>
        {row.item_label}
        {row.is_custom && (
          <span className="ml-2 text-xs text-muted-foreground">(custom)</span>
        )}
      </span>

      <Input
        type="text"
        value={note}
        onChange={e => setNote(e.target.value.slice(0, MAX_NOTE))}
        onBlur={() => {
          if (note !== (row.note ?? '')) onEditNote(row.id, note);
        }}
        placeholder="note"
        className="h-7 max-w-[140px] text-xs"
        aria-label={`Note for ${row.item_label}`}
      />

      {row.is_custom && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDelete(row.id)}
          aria-label={`Delete ${row.item_label}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}

interface AddCustomItemProps {
  existingLabels: string[];
  maxSort: number;
  onAdd: (item: { label: string; sort_order: number; note: string | null }) => void;
}

function AddCustomItem({ existingLabels, maxSort, onAdd }: AddCustomItemProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setLabel('');
    setError(null);
    setOpen(false);
  }

  function submit() {
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Item is required');
      return;
    }
    if (trimmed.length > MAX_LABEL) {
      setError(`Item must be ${MAX_LABEL} characters or fewer`);
      return;
    }
    if (existingLabels.includes(trimmed.toLowerCase())) {
      setError('Item already in the list');
      return;
    }
    onAdd({ label: trimmed, sort_order: maxSort + 10, note: null });
    reset();
  }

  if (!open) {
    return (
      <div className="pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className="text-sm"
        >
          <Plus className="h-4 w-4 mr-1" /> Add custom item
        </Button>
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-1">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          type="text"
          value={label}
          onChange={e => {
            setLabel(e.target.value.slice(0, MAX_LABEL));
            if (error) setError(null);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') reset();
          }}
          placeholder="Add custom supply…"
          className="h-8 text-sm"
        />
        <Button type="button" size="sm" onClick={submit}>
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={reset}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-destructive pl-1">{error}</p>}
    </div>
  );
}
