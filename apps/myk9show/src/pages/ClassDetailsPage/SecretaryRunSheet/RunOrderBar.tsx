import { ListOrdered, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SortMode } from './types';

interface RunOrderBarProps {
  sortMode: SortMode;
  onSort: (mode: SortMode) => void;
}

function SortChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:border-primary/40'
      )}
    >
      {label}
    </button>
  );
}

export function RunOrderBar({ sortMode, onSort }: RunOrderBarProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 mb-4">
      <ListOrdered size={18} className="text-muted-foreground shrink-0" />
      <span className="text-sm font-semibold text-foreground">Run order</span>
      <div className="flex gap-1.5 ml-1">
        <SortChip
          label="Custom"
          active={sortMode === 'runOrder'}
          onClick={() => onSort('runOrder')}
        />
        <SortChip
          label="Armband ↑"
          active={sortMode === 'armband-asc'}
          onClick={() => onSort('armband-asc')}
        />
        <SortChip
          label="Armband ↓"
          active={sortMode === 'armband-desc'}
          onClick={() => onSort('armband-desc')}
        />
        <SortChip label="Random" active={sortMode === 'random'} onClick={() => onSort('random')} />
      </div>
      <div className="flex-1" />
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <GripVertical size={13} className="opacity-40" />
        Drag handles reorder custom runs
      </span>
    </div>
  );
}
