import { cn } from '@/lib/utils';
import { Users, Clock, Hash } from 'lucide-react';
import { getClassStatusDisplay, type ClassStatusValue } from '@myk9/core';

interface ClassInfo {
  id: string;
  element: string;
  level: string;
  section: string;
  judgeName: string;
  time: string;
  ring: number;
  status: ClassStatusValue;
  entryCount: number;
}

interface LiveData {
  totalEntries: number;
  completedEntries: number;
  inRingArmband?: string;
  nextArmbands?: string[];
}

interface ClassCardProps {
  classInfo: ClassInfo;
  hideRing?: boolean;
  liveData?: LiveData;
  onClick?: () => void;
}

const LIVE_STATUSES = new Set(['In Progress', 'Paused']);

export function ClassCard({
  classInfo,
  hideRing,
  liveData,
  onClick,
}: ClassCardProps) {
  const statusDisplay = getClassStatusDisplay(classInfo.status);
  const isLive = LIVE_STATUSES.has(classInfo.status) && liveData;
  const progressPct =
    isLive && liveData.totalEntries > 0
      ? (liveData.completedEntries / liveData.totalEntries) * 100
      : 0;
  const remaining = isLive ? liveData.totalEntries - liveData.completedEntries : 0;

  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-card p-4 space-y-3 transition-all',
        onClick && 'cursor-pointer hover:shadow-md hover:border-primary/30',
      )}
      onClick={onClick}
      role={onClick ? 'link' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {/* Header: element/level + status */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-base text-card-foreground">{classInfo.element}</h3>
          <p className="text-sm text-muted-foreground">
            {classInfo.level}
            {classInfo.section && <span className="ml-1">{classInfo.section}</span>}
          </p>
        </div>
        <span
          className={cn(
            'px-2 py-0.5 rounded text-xs font-medium shrink-0',
            statusDisplay.bgClass,
            statusDisplay.textClass,
            statusDisplay.darkBgClass,
            statusDisplay.darkTextClass,
          )}
        >
          {statusDisplay.label}
        </span>
      </div>

      {/* Judge */}
      {classInfo.judgeName && (
        <p className="text-xs text-muted-foreground">Judge: {classInfo.judgeName}</p>
      )}

      {/* Time + Ring */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {classInfo.time && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {classInfo.time}
          </span>
        )}
        {!hideRing && classInfo.ring > 0 && (
          <span className="flex items-center gap-1">
            <Hash className="h-3 w-3" />
            Ring {classInfo.ring}
          </span>
        )}
      </div>

      {/* Progress bar — live classes only */}
      {isLive && (
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-valuenow={liveData.completedEntries}
            aria-valuemin={0}
            aria-valuemax={liveData.totalEntries}
            className="h-2 bg-muted rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {remaining > 0 ? `${remaining} of ${liveData.totalEntries} remaining` : 'All complete'}
          </p>
        </div>
      )}

      {/* In ring + next up — live classes only */}
      {isLive &&
        (liveData.inRingArmband ||
          (liveData.nextArmbands && liveData.nextArmbands.length > 0)) && (
          <div className="flex items-center gap-3 text-sm">
            {liveData.inRingArmband && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="font-semibold">#{liveData.inRingArmband}</span>
              </div>
            )}
            {liveData.nextArmbands && liveData.nextArmbands.length > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <span className="text-xs">Next:</span>
                {liveData.nextArmbands.map((a) => (
                  <span key={a} className="px-1.5 py-0.5 bg-muted rounded text-xs font-medium">
                    #{a}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

      {/* Entry count footer */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1 border-t border-border/30">
        <Users className="h-3 w-3" />
        <strong className="text-card-foreground">{classInfo.entryCount}</strong> entries
      </div>
    </div>
  );
}
