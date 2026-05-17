import { ChevronsDownUp, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ShowMapCompletionScope, ShowMapDayScope, ShowMapFilter } from './showMapTypes';

interface ShowMapToolbarProps {
  filter: ShowMapFilter;
  dayScope: ShowMapDayScope;
  completionScope: ShowMapCompletionScope;
  onFilterChange: (filter: ShowMapFilter) => void;
  onDayScopeChange: (scope: ShowMapDayScope) => void;
  onCompletionScopeChange: (scope: ShowMapCompletionScope) => void;
  onCollapseAll: () => void;
  onExpandTrials: () => void;
}

const filters: Array<{ value: ShowMapFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'needs-attention', label: 'Attention' },
];

const dayScopes: Array<{ value: ShowMapDayScope; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'all', label: 'All dates' },
];

const completionScopes: Array<{ value: ShowMapCompletionScope; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

export function ShowMapToolbar({
  filter,
  dayScope,
  completionScope,
  onFilterChange,
  onDayScopeChange,
  onCompletionScopeChange,
  onCollapseAll,
  onExpandTrials,
}: ShowMapToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b bg-background p-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-1 rounded-md border bg-muted/30 p-1">
          {dayScopes.map(item => (
            <Button
              key={item.value}
              type="button"
              variant={dayScope === item.value ? 'default' : 'ghost'}
              size="sm"
              className="min-h-9"
              onClick={() => onDayScopeChange(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 rounded-md border bg-muted/30 p-1">
          {completionScopes.map(item => (
            <Button
              key={item.value}
              type="button"
              variant={completionScope === item.value ? 'default' : 'ghost'}
              size="sm"
              className="min-h-9"
              onClick={() => onCompletionScopeChange(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
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
