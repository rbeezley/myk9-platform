import { cn } from '@/lib/utils';

type StatusFilterValue = 'all' | 'pending' | 'completed';

interface StatusFilterProps {
  filter: StatusFilterValue;
  onFilterChange: (filter: StatusFilterValue) => void;
  counts: { all: number; pending: number; completed: number };
  className?: string;
}

const SEGMENTS: { key: StatusFilterValue; label: string; shortLabel: string }[] = [
  { key: 'all', label: 'All', shortLabel: 'All' },
  { key: 'pending', label: 'Pending', shortLabel: 'Pend' },
  { key: 'completed', label: 'Completed', shortLabel: 'Done' },
];

export function StatusFilter({ filter, onFilterChange, counts, className }: StatusFilterProps) {
  // Hide when all items share the same status
  if (counts.pending === counts.all || counts.completed === counts.all) {
    return null;
  }

  return (
    <div className={cn('flex bg-muted/50 rounded-lg p-1 gap-0.5', className)}>
      {SEGMENTS.map(({ key, label, shortLabel }) => (
        <button
          key={key}
          className={cn(
            'h-10 rounded-md px-3 text-sm font-medium transition-colors',
            filter === key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onFilterChange(key)}
        >
          <span className="hidden sm:inline">{label} ({counts[key]})</span>
          <span className="sm:hidden">{shortLabel} ({counts[key]})</span>
        </button>
      ))}
    </div>
  );
}

export type { StatusFilterValue, StatusFilterProps };
