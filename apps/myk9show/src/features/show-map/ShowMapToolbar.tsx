import { ChevronsDownUp, GitBranch, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  showActionHelp?: boolean | undefined;
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

function ShowMapHelpPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Show map shortcuts"
          className="min-h-11"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold">Show Map shortcuts</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Use the tree without leaving the row you are working on.
            </p>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Move between rows</dt>
              <dd className="flex gap-1">
                <Kbd>Up</Kbd>
                <Kbd>Down</Kbd>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Expand or collapse</dt>
              <dd className="flex gap-1">
                <Kbd>Right</Kbd>
                <Kbd>Left</Kbd>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Open row actions</dt>
              <dd className="flex items-center gap-1">
                <Kbd>Enter</Kbd>
                <Kbd>Space</Kbd>
                <span className="ml-1 text-xs font-medium text-foreground">or right-click</span>
              </dd>
            </div>
          </dl>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ShowMapToolbar({
  filter,
  dayScope,
  completionScope,
  onFilterChange,
  onDayScopeChange,
  onCompletionScopeChange,
  onCollapseAll,
  onExpandTrials,
  showActionHelp = true,
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
        {showActionHelp && <ShowMapHelpPopover />}
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
