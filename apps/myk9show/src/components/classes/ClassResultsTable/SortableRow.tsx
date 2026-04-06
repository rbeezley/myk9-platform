import { createContext, useContext } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TableRow } from '@/components/ui/table';

// Context shape
interface SortableRowContextValue {
  listeners: ReturnType<typeof useSortable>['listeners'];
  position: number;
}

const SortableRowContext = createContext<SortableRowContextValue>({
  listeners: undefined,
  position: 0,
});

// SortableRow: wraps <TableRow>, provides sortable bindings + position via Context
export function SortableRow({
  id,
  position,
  children,
}: {
  id: string;
  position: number;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: React.CSSProperties = {
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
  const { listeners, position } = useContext(SortableRowContext);
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="cursor-grab select-none text-[#c4c9d4]"
        style={{ fontSize: 15 }}
        {...listeners}
      >
        ⠿
      </span>
      <span className="text-[#9ca3af] font-medium" style={{ fontSize: 12 }}>
        {position}
      </span>
    </div>
  );
}
