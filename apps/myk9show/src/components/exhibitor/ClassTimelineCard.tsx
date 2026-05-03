/**
 * ClassTimelineCard — Compact card for "later today" and completed classes.
 *
 * ~64px height on mobile. Shows class name, dog, armband, estimated time.
 * Completed classes get a result badge and muted styling.
 * Pending classes show a compact check-in status badge.
 */

import { cn, formatClassLabel } from '@/lib/utils';
import { ResultBadge } from '@/components/common/ResultBadge';
import type { CheckInStatus } from '@myk9/core';
import type { ShowDayClass } from '@/types/show-day-types';
import { computeDogsAhead, formatDogsAheadText } from '@/utils/dogsAhead';
import { CheckCircle } from 'lucide-react';
import { CheckInStatusBadge } from './CheckInStatusBadge';
import { CheckInStatusMenu } from './CheckInStatusMenu';

interface ClassTimelineCardProps {
  classData: ShowDayClass;
  onNavigate?: ((classId: string) => void) | undefined;
  /** Called when the user changes check-in status */
  onCheckInChange?: ((entryId: string, newStatus: CheckInStatus) => void) | undefined;
  /** Whether self-check-in is enabled for this class */
  selfCheckinEnabled?: boolean | undefined;
  /** Navigates to the full check-in management page */
  onManage?: ((entryId: string) => void) | undefined;
  className?: string | undefined;
}

export function ClassTimelineCard({
  classData,
  onNavigate,
  onCheckInChange,
  selfCheckinEnabled = true,
  onManage,
  className,
}: ClassTimelineCardProps) {
  const isCompleted = classData.isScored;
  const classLabel = formatClassLabel(classData.element, classData.level, classData.className);
  const showCheckIn = !isCompleted && classData.entryStatus !== 'no-status';

  const dogsAheadText = formatDogsAheadText(computeDogsAhead(classData));

  return (
    <div
      className={cn(
        'w-full flex items-center gap-3 rounded-xl border p-3 transition-all duration-300 min-h-[48px]',
        isCompleted ? 'border-border/50 bg-muted/30 opacity-70' : 'border-border bg-card',
        className
      )}
    >
      {/* Status indicator */}
      <button
        type="button"
        onClick={() => onNavigate?.(classData.classId)}
        className="flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        aria-label={isCompleted ? 'Completed' : 'Pending'}
      >
        {isCompleted ? (
          <CheckCircle className="h-5 w-5 text-success-green" />
        ) : (
          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
        )}
      </button>

      {/* Class info — tappable to navigate */}
      <button
        type="button"
        onClick={() => onNavigate?.(classData.classId)}
        className={cn(
          'flex-1 min-w-0 text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded',
          !isCompleted && 'hover:opacity-80 transition-opacity'
        )}
        aria-label={`${classData.className}, ${classData.dogCallName}${isCompleted ? `, ${classData.resultStatus ?? 'completed'}` : ''}`}
      >
        <div className="flex items-center gap-2">
          <span className={cn('font-semibold truncate', isCompleted && 'line-through')}>
            {classLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{classData.dogCallName}</span>
          {classData.armband && <span>&bull; #{classData.armband}</span>}
        </div>
        {dogsAheadText && (
          <div className="text-xs text-muted-foreground mt-0.5">{dogsAheadText}</div>
        )}
      </button>

      {/* Right side: check-in badge, result badge, or estimated time */}
      <div className="flex-shrink-0 flex items-center gap-2">
        {isCompleted && classData.resultStatus ? (
          <ResultBadge resultStatus={classData.resultStatus} variant="compact" />
        ) : showCheckIn && onCheckInChange ? (
          <CheckInStatusMenu
            status={classData.entryStatus}
            onStatusChange={newStatus => onCheckInChange(classData.entryId, newStatus)}
            disabled={!selfCheckinEnabled}
          />
        ) : showCheckIn ? (
          <CheckInStatusBadge status={classData.entryStatus} compact />
        ) : classData.estimatedTimeMinutes != null ? (
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            ~{classData.estimatedTimeMinutes}m
          </span>
        ) : null}
      </div>

      {!isCompleted && onManage && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onManage(classData.entryId);
          }}
          className="text-xs text-muted-foreground hover:underline underline-offset-2 flex-shrink-0 min-h-[44px] px-1"
        >
          Manage →
        </button>
      )}
    </div>
  );
}
