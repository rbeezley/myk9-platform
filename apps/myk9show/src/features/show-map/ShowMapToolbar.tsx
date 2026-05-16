import { ChevronsDownUp, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ShowMapFilter } from './showMapTypes';

interface ShowMapToolbarProps {
  filter: ShowMapFilter;
  onFilterChange: (filter: ShowMapFilter) => void;
  onCollapseAll: () => void;
  onExpandTrials: () => void;
}

const filters: Array<{ value: ShowMapFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'needs-attention', label: 'Attention' },
  { value: 'complete', label: 'Complete' },
];

export function ShowMapToolbar({
  filter,
  onFilterChange,
  onCollapseAll,
  onExpandTrials,
}: ShowMapToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b bg-background p-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-1 rounded-md border bg-muted/30 p-1">
        {filters.map(item => (
          <Button
            key={item.value}
            type="button"
            variant={filter === item.value ? 'default' : 'ghost'}
            size="sm"
            className="min-h-9"
            onClick={() => onFilterChange(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={onCollapseAll}
        >
          <ChevronsDownUp className="h-4 w-4" />
          Collapse all
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={onExpandTrials}
        >
          <GitBranch className="h-4 w-4" />
          Expand trials
        </Button>
      </div>
    </div>
  );
}
