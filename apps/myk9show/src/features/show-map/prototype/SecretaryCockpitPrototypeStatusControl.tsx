import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type {
  CockpitClassPrototype,
  CockpitPrototypeStatus,
} from './secretaryCockpitPrototypeData';
import { COCKPIT_STATUS_LABELS } from './secretaryCockpitPrototypeData';

const STATUS_STYLES: Record<CockpitPrototypeStatus, string> = {
  'not-started': 'border-info/30 bg-info/10 text-info-strong',
  'in-progress': 'border-warning/30 bg-warning/10 text-warning',
  complete: 'border-success/30 bg-success/10 text-success',
  cancelled: 'border-border bg-muted text-muted-foreground',
};

const COMMON_STATUSES: readonly CockpitPrototypeStatus[] = [
  'not-started',
  'in-progress',
  'complete',
];

interface SecretaryCockpitPrototypeStatusControlProps {
  classItem: CockpitClassPrototype;
  onStatusChange: (
    classItem: CockpitClassPrototype,
    status: CockpitPrototypeStatus
  ) => void;
  prefix?: string;
}

export function SecretaryCockpitPrototypeStatusControl({
  classItem,
  onStatusChange,
  prefix,
}: SecretaryCockpitPrototypeStatusControlProps) {
  const currentLabel = COCKPIT_STATUS_LABELS[classItem.status];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          STATUS_STYLES[classItem.status]
        )}
        aria-label={`Change status for ${classItem.name}. Current status: ${currentLabel}`}
        onClick={event => event.stopPropagation()}
      >
        {prefix}
        {currentLabel}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Class status</DropdownMenuLabel>
          {COMMON_STATUSES.map(status => (
            <DropdownMenuItem
              key={status}
              disabled={classItem.status === status}
              className="min-h-11"
              onClick={() => onStatusChange(classItem, status)}
            >
              <Check
                className={cn('h-4 w-4', classItem.status !== status && 'invisible')}
                aria-hidden="true"
              />
              {COCKPIT_STATUS_LABELS[status]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={classItem.status === 'cancelled'}
          className="min-h-11 text-destructive focus:text-destructive"
          onClick={() => onStatusChange(classItem, 'cancelled')}
        >
          Cancel class
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SecretaryCockpitPrototypeLifecycleTime({
  classItem,
  compact = false,
}: {
  classItem: CockpitClassPrototype;
  compact?: boolean;
}) {
  const labels = [
    classItem.actualStartTime ? `Started ${classItem.actualStartTime}` : null,
    classItem.actualEndTime ? `Finished ${classItem.actualEndTime}` : null,
  ].filter((label): label is string => label !== null);

  if (labels.length === 0) return null;

  return (
    <span className="text-sm text-muted-foreground">
      {compact ? labels[labels.length - 1] : labels.join(' · ')}
    </span>
  );
}
