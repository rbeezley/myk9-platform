import { cn } from '@/lib/utils';
import { type EntryDisplayStatus } from '@/constants/live-status-config';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { StatusBadge } from '@/components/status';

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
  const borderClass = isCurrentUser ? 'border-l-orange-500' : 'border-l-border';

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-lg border-l-4 bg-card p-3',
        borderClass,
        isCurrentUser && 'bg-orange-500/5',
        className
      )}
    >
      {/* Armband */}
      <ArmbandBadge armband={armband} />

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
          <StatusBadge family="entry" status={status} variant="outline" />
        )}
      </div>
    </div>
  );
}
