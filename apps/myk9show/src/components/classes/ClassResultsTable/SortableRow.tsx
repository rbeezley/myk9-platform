import { createContext, useContext, type ReactNode, type CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TableRow } from '@/components/ui/table';

// Context shape
interface SortableRowContextValue {
  listeners: ReturnType<typeof useSortable>['listeners'];
  position: number;
}

const SortableRowContext = createContext<SortableRowContextValue | null>(null);

// SortableRow: wraps <TableRow>, provides sortable bindings + position via Context
export function SortableRow({
  id,
  position,
  children,
}: {
  id: string;
  position: number;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 1 : undefined,
  };
  return (
    <SortableRowContext.Provider value={{ listeners, position }}>
      <TableRow ref={setNodeRef} style={style} {...attributes}>
        {children}
      </TableRow>
    </SortableRowContext.Provider>
  );
}

// DragHandleCell: renders handle + position number. NO <TableCell> wrapper.
export function DragHandleCell() {
  const ctx = useContext(SortableRowContext);
  if (!ctx) throw new Error('DragHandleCell must be used inside SortableRow');
  const { listeners, position } = ctx;
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="cursor-grab select-none text-[#c4c9d4]"
        style={{ fontSize: '15px', touchAction: 'none' }}
        {...listeners}
      >
        ⠿
      </span>
      <span className="text-[#9ca3af] font-medium" style={{ fontSize: '12px' }}>
        {position}
      </span>
    </div>
  );
}
