import { cn } from '@/lib/utils';
import {
  type EntryDisplayStatus,
  ENTRY_STATUS_LABELS,
  ENTRY_STATUS_BORDER,
  ENTRY_STATUS_BADGE,
} from '@/constants/live-status-config';

interface EntryRowProps {
  armband: string;
  dogName: string;
  breed?: string;
  handlerName: string;
  status: EntryDisplayStatus;
  isCurrentUser?: boolean;
  result?: string;
  time?: string;
  className?: string;
}

export function EntryRow({
  armband,
  dogName,
  breed,
  handlerName,
  status,
  isCurrentUser,
  result,
  time,
  className,
}: EntryRowProps) {
  const borderClass = isCurrentUser ? 'border-l-orange-500' : ENTRY_STATUS_BORDER[status];

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-lg border-l-4 bg-card p-3',
        borderClass,
        isCurrentUser && 'bg-orange-500/5',
        status === 'in_ring' && !isCurrentUser && 'bg-primary/5',
        className
      )}
    >
      {/* Armband */}
      <div className="flex h-10 w-14 flex-shrink-0 items-center justify-center rounded-md bg-muted text-sm font-bold">
        #{armband}
      </div>

      {/* Dog + Handler info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{dogName}</span>
          {isCurrentUser && (
            <span className="rounded bg-orange-500 px-1.5 py-0.5 text-xs font-bold text-white">
              YOU
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {breed && <span>{breed} · </span>}
          {handlerName}
        </div>
      </div>

      {/* Status / Result */}
      <div className="flex-shrink-0 text-right">
        {status === 'completed' && result ? (
          <div className="flex flex-col items-end gap-0.5">
            <span
              className={cn(
                'rounded px-2 py-0.5 text-xs font-bold',
                result === 'Q' ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'
              )}
            >
              {result}
            </span>
            {time && <span className="text-xs text-muted-foreground">{time}</span>}
          </div>
        ) : (
          <span
            className={cn('rounded px-2 py-0.5 text-xs font-medium', ENTRY_STATUS_BADGE[status])}
          >
            {ENTRY_STATUS_LABELS[status]}
          </span>
        )}
      </div>
    </div>
  );
}
