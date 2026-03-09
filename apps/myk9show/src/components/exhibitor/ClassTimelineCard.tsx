/**
 * ClassTimelineCard — Compact card for "later today" and completed classes.
 *
 * ~64px height on mobile. Shows class name, dog, armband, estimated time.
 * Completed classes get a result badge and muted styling.
 */

import { cn, formatClassLabel } from '@/lib/utils';
import { ResultBadge } from '@/components/common/ResultBadge';
import type { ShowDayClass } from '@/types/show-day-types';
import { CheckCircle } from 'lucide-react';

interface ClassTimelineCardProps {
  classData: ShowDayClass;
  onNavigate?: ((classId: string) => void) | undefined;
  className?: string | undefined;
}

export function ClassTimelineCard({ classData, onNavigate, className }: ClassTimelineCardProps) {
  const isCompleted = classData.isScored;

  const classLabel = formatClassLabel(classData.element, classData.level, classData.className);

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(classData.classId)}
      className={cn(
        'w-full text-left flex items-center gap-3 rounded-xl border p-3 transition-all duration-300 min-h-[48px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        isCompleted
          ? 'border-border/50 bg-muted/30 opacity-70'
          : 'border-border bg-card hover:bg-card/90 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]',
        className
      )}
      aria-label={`${classData.className}, ${classData.dogCallName}${isCompleted ? `, ${classData.resultStatus ?? 'completed'}` : ''}`}
    >
      {/* Status indicator */}
      <div className="flex-shrink-0">
        {isCompleted ? (
          <CheckCircle className="h-5 w-5 text-success-green" />
        ) : (
          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
        )}
      </div>

      {/* Class info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('font-semibold truncate', isCompleted && 'line-through')}>
            {classLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{classData.dogCallName}</span>
          {classData.armband && <span>&bull; #{classData.armband}</span>}
        </div>
      </div>

      {/* Right side: result badge or estimated time */}
      <div className="flex-shrink-0">
        {isCompleted && classData.resultStatus ? (
          <ResultBadge resultStatus={classData.resultStatus} variant="compact" />
        ) : classData.estimatedTimeMinutes != null ? (
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            ~{classData.estimatedTimeMinutes}m
          </span>
        ) : null}
      </div>
    </button>
  );
}
