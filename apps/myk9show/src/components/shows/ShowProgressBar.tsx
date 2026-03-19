import React from 'react';
import { cn } from '@/lib/utils';

interface ShowProgressBarProps {
  scoredTrials: number;
  totalTrials: number;
  totalEntries: number;
}

export const ShowProgressBar: React.FC<ShowProgressBarProps> = ({
  scoredTrials,
  totalTrials,
  totalEntries,
}) => {
  const percent = totalTrials > 0 ? Math.round((scoredTrials / totalTrials) * 100) : 0;
  const allScored = scoredTrials > 0 && scoredTrials === totalTrials;
  const colorClass = allScored ? 'text-green-500' : 'text-orange-500';
  const fillClass = allScored ? 'bg-green-500' : 'bg-orange-500';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex gap-2.5">
          <span>
            <span className="font-bold text-foreground/75">{totalTrials}</span> trials
          </span>
          <span>
            <span className="font-bold text-foreground/75">{totalEntries}</span> entries
          </span>
        </div>
        {scoredTrials > 0 && (
          <span className={cn('font-semibold', colorClass)}>
            {scoredTrials}/{totalTrials} scored
          </span>
        )}
      </div>
      <div
        className="h-[3px] bg-border/30 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={
          scoredTrials > 0 ? `${scoredTrials} of ${totalTrials} trials scored` : undefined
        }
      >
        <div
          data-testid="progress-fill"
          className={cn(
            'h-full rounded-full transition-all duration-300',
            scoredTrials > 0 && fillClass
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};
