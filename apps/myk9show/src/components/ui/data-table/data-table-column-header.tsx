import { type Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DataTableColumnHeaderProps<TData> {
  column: Column<TData, unknown>;
  title: string;
  className?: string;
}

export function DataTableColumnHeader<TData>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData>) {
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>;
  }

  const sorted = column.getIsSorted();
  const sortIndex = column.getSortIndex();

  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-1.5 hover:text-foreground transition-colors -ml-1 px-1',
        className
      )}
      onClick={column.getToggleSortingHandler()}
    >
      {title}
      {sorted === 'asc' ? (
        <ArrowUp className="h-3 w-3" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-30" />
      )}
      {sortIndex > 0 && (
        <span className="text-[10px] font-normal text-muted-foreground">{sortIndex + 1}</span>
      )}
    </button>
  );
}
