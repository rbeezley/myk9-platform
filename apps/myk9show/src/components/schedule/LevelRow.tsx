import { CLASS_STATUS } from '@myk9/core';
import { cn } from '@/lib/utils';
import type { LevelDetail } from './schedule-timeline.types';

interface LevelRowProps {
  level: LevelDetail;
  onClick?: () => void;
}

export function LevelRow({ level, onClick }: LevelRowProps) {
  const isInProgress = level.status === CLASS_STATUS.IN_PROGRESS;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[44px] w-full items-center justify-between rounded px-2 py-1 text-left transition-colors hover:bg-accent',
        isInProgress && 'bg-warning/100/10 '
      )}
    >
      <span
        className={cn(
          'text-xs',
          isInProgress ? 'font-medium text-warning ' : 'text-muted-foreground'
        )}
      >
        {level.level}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">
          {level.entryCount} {level.entryCount === 1 ? 'entry' : 'entries'}
        </span>
        {level.status === CLASS_STATUS.COMPLETED && (
          <span className="text-[10px] text-success ">✓</span>
        )}
        {isInProgress && <span className="text-[10px] text-warning ">●</span>}
      </div>
    </button>
  );
}
