import { ChevronsDownUp, GitBranch, Maximize2, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ShowMapFilter } from './showMapTypes';

interface ShowMapToolbarProps {
  filter: ShowMapFilter;
  onFilterChange: (filter: ShowMapFilter) => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCollapseAll: () => void;
  onExpandTrials: () => void;
}

const filters: Array<{ value: ShowMapFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'needs-attention', label: 'Needs attention' },
  { value: 'complete', label: 'Complete' },
];

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ShowMapToolbar({
  filter,
  onFilterChange,
  onFitView,
  onZoomIn,
  onZoomOut,
  onCollapseAll,
  onExpandTrials,
}: ShowMapToolbarProps) {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3 border-b bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
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
          <IconButton label="Fit view" onClick={onFitView}>
            <Maximize2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Zoom in" onClick={onZoomIn}>
            <Plus className="h-4 w-4" />
          </IconButton>
          <IconButton label="Zoom out" onClick={onZoomOut}>
            <Minus className="h-4 w-4" />
          </IconButton>
          <IconButton label="Collapse all" onClick={onCollapseAll}>
            <ChevronsDownUp className="h-4 w-4" />
          </IconButton>
          <IconButton label="Expand trials" onClick={onExpandTrials}>
            <GitBranch className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </TooltipProvider>
  );
}
