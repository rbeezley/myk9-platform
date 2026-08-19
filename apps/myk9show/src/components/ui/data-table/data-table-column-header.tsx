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
      // py-3/-my-3: the padding carries a ~44px hit area inside the header row
      // without changing the row's height or the label's position.
      className={cn(
        'flex items-center gap-1.5 hover:text-foreground transition-colors -ml-1 px-1 py-3 -my-3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
        className
      )}
      onClick={column.getToggleSortingHandler()}
      aria-label={
        sorted === 'asc'
          ? `${title}, sorted ascending. Activate to sort descending`
          : sorted === 'desc'
            ? `${title}, sorted descending. Activate to clear sorting`
            : `${title}, not sorted. Activate to sort ascending`
      }
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
