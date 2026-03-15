import { cn } from '@/lib/utils';
import { DogsAheadBadge } from './DogsAheadBadge';

type ClassStatus = 'not_started' | 'in_progress' | 'completed' | 'paused';

const STATUS_CONFIG: Record<ClassStatus, { label: string; style: string }> = {
  not_started: { label: 'Not Started', style: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', style: 'bg-green-500/10 text-green-600 animate-pulse' },
  completed: { label: 'Completed', style: 'bg-primary/10 text-primary' },
  paused: { label: 'Paused', style: 'bg-yellow-500/10 text-yellow-600' },
};

interface LiveClassCardProps {
  classTitle: string;
  judgeName?: string;
  status: ClassStatus;
  totalEntries?: number;
  completedEntries?: number;
  inRingArmband?: string;
  nextArmbands?: string[];
  userDogsAhead?: number;
  userDogName?: string;
  staleMinutes?: number;
  onClick?: () => void;
  className?: string;
}

export function LiveClassCard({
  classTitle,
  judgeName,
  status,
  totalEntries,
  completedEntries,
  inRingArmband,
  nextArmbands = [],
  userDogsAhead,
  userDogName,
  staleMinutes,
  onClick,
  className,
}: LiveClassCardProps) {
  const total = totalEntries ?? 0;
  const completed = completedEntries ?? 0;
  const remaining = total - completed;
  const progressPct = total > 0 ? (completed / total) * 100 : 0;
  const statusConfig = STATUS_CONFIG[status];
  const hasProgress = totalEntries !== undefined && completedEntries !== undefined;

  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-card p-4 space-y-3',
        onClick && 'cursor-pointer hover:border-primary/30 transition-colors',
        className
      )}
      onClick={onClick}
    >
      {/* Header: class name + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-base">{classTitle}</h3>
          {judgeName && <p className="text-xs text-muted-foreground">Judge: {judgeName}</p>}
        </div>
        <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', statusConfig.style)}>
          {statusConfig.label}
        </span>
      </div>

      {/* Progress bar — only when totals are provided */}
      {hasProgress && (
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-valuenow={completed}
            aria-valuemin={0}
            aria-valuemax={total}
            className="h-2 bg-muted rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {remaining} of {total} remaining
          </p>
        </div>
      )}

      {/* In ring + next up */}
      {(inRingArmband || nextArmbands.length > 0) && (
        <div className="flex items-center gap-3 text-sm">
          {inRingArmband && (
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="font-semibold">#{inRingArmband}</span>
            </div>
          )}
          {nextArmbands.length > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="text-xs">Next:</span>
              {nextArmbands.map(a => (
                <span key={a} className="px-1.5 py-0.5 bg-muted rounded text-xs font-medium">
                  #{a}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* User entry indicator */}
      {userDogsAhead !== undefined && userDogName && (
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <span className="text-sm font-medium">{userDogName}</span>
          <DogsAheadBadge
            dogsAhead={userDogsAhead}
            {...(staleMinutes !== undefined ? { staleMinutes } : {})}
          />
        </div>
      )}
    </div>
  );
}
