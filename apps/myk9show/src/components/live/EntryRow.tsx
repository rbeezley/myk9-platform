import { cn } from '@/lib/utils';

type EntryStatus = 'checked_in' | 'not_checked_in' | 'at_gate' | 'in_ring' | 'completed' | 'pulled';

const STATUS_LABELS: Record<EntryStatus, string> = {
  checked_in: 'Checked In',
  not_checked_in: 'Not Checked In',
  at_gate: 'At Gate',
  in_ring: 'In Ring',
  completed: 'Completed',
  pulled: 'Pulled',
};

const STATUS_BORDER: Record<EntryStatus, string> = {
  checked_in: 'border-l-green-500',
  not_checked_in: 'border-l-gray-300',
  at_gate: 'border-l-yellow-500',
  in_ring: 'border-l-primary',
  completed: 'border-l-transparent',
  pulled: 'border-l-red-500',
};

const STATUS_BADGE_STYLE: Record<EntryStatus, string> = {
  checked_in: 'bg-green-500/10 text-green-600',
  not_checked_in: 'bg-muted text-muted-foreground',
  at_gate: 'bg-yellow-500/10 text-yellow-600',
  in_ring: 'bg-primary/10 text-primary',
  completed: 'bg-muted text-muted-foreground',
  pulled: 'bg-red-500/10 text-red-600',
};

interface EntryRowProps {
  armband: string;
  dogName: string;
  breed?: string;
  handlerName: string;
  status: EntryStatus;
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
  const borderClass = isCurrentUser ? 'border-l-orange-500' : STATUS_BORDER[status];

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
            className={cn('rounded px-2 py-0.5 text-xs font-medium', STATUS_BADGE_STYLE[status])}
          >
            {STATUS_LABELS[status]}
          </span>
        )}
      </div>
    </div>
  );
}
