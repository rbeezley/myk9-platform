import type { CSSProperties, ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * A waiting dog's row (MYK9-1872). The grip is the only drag activator, so the per-dog menu and
 * the Check-in cell keep their clicks. Mirrors Ringside's EntryList drag handle: 44px target,
 * `touch-none` so a finger drag is not taken by page scroll (MYK9-1734), dnd-kit's keyboard
 * attributes plus an accessible name.
 */
export function SortableClassEntryRow({
  id,
  label,
  disabled,
  children,
}: {
  id: string;
  label: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 1 : 0,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <TableRow ref={setNodeRef} style={style} data-testid="class-entry-row">
      <TableCell className="w-11 px-0">
        <button
          type="button"
          {...attributes}
          {...(disabled ? {} : listeners)}
          disabled={disabled}
          aria-label={label}
          data-testid="run-order-grip"
          className={cn(
            'inline-flex h-11 w-11 touch-none items-center justify-center rounded-md text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            disabled ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing'
          )}
        >
          <GripVertical className="h-5 w-5" aria-hidden="true" />
        </button>
      </TableCell>
      {children}
    </TableRow>
  );
}
