/**
 * NextUpCard — Hero card showing the exhibitor's next class.
 *
 * Designed to be readable at arm's length on mobile (one hand on a leash).
 * Large text, high contrast, 48px+ touch targets.
 */

import { cn, formatClassLabel } from '@/lib/utils';
import type { ShowDayClass } from '@/types/show-day-types';
import { ArrowUp, Timer } from 'lucide-react';

interface NextUpCardProps {
  classData: ShowDayClass;
  onNavigate?: ((classId: string) => void) | undefined;
  className?: string | undefined;
}

export function NextUpCard({ classData, onNavigate, className }: NextUpCardProps) {
  const progressPercent =
    classData.totalEntries > 0
      ? Math.round((classData.scoredEntries / classData.totalEntries) * 100)
      : 0;

  const classLabel = formatClassLabel(classData.element, classData.level, classData.className);

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(classData.classId)}
      className={cn(
        'w-full text-left rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-5 transition-all duration-300',
        'hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        'min-h-[48px]',
        className
      )}
      aria-label={`Next up: ${classData.className}, ${classData.dogCallName}, estimated ${classData.estimatedTimeMinutes ?? '?'} minutes`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <ArrowUp className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-primary">Next Up</span>
      </div>

      {/* Class name */}
      <h3 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">{classLabel}</h3>

      {/* Ring + progress */}
      <p className="mt-1 text-sm text-muted-foreground">
        Dog {classData.scoredEntries + 1} of {classData.totalEntries}
        {classData.currentDogInRing && (
          <span className="ml-2 text-primary font-medium">
            &bull; {classData.currentDogInRing} in ring
          </span>
        )}
      </p>

      {/* Dog + armband */}
      <p className="mt-2 text-base font-semibold text-foreground">
        {classData.dogCallName}
        {classData.armband && (
          <span className="ml-2 text-muted-foreground font-normal">
            &bull; Armband #{classData.armband}
          </span>
        )}
      </p>

      {/* Estimated time */}
      {classData.estimatedTimeMinutes != null && (
        <div className="mt-3 flex items-center gap-2">
          <Timer className="h-5 w-5 text-primary" />
          <span className="text-2xl font-bold text-primary">
            ~{classData.estimatedTimeMinutes} min
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Class progress</span>
          <span>{progressPercent}%</span>
        </div>
        <div
          className="h-2 w-full rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Class progress: ${progressPercent}%`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </button>
  );
}
