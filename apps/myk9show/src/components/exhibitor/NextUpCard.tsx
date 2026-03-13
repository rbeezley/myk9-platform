/**
 * NextUpCard — Hero card showing the exhibitor's next class.
 *
 * Designed to be readable at arm's length on mobile (one hand on a leash).
 * Large text, high contrast, 48px+ touch targets.
 *
 * Check-in integration:
 * - Before check-in: shows large "Check In" button (primary CTA)
 * - After check-in: shows tappable status badge
 * - Secretary-set statuses: read-only badge
 */

import { cn, formatClassLabel } from '@/lib/utils';
import type { CheckInStatus } from '@myk9/core';
import type { ShowDayClass } from '@/types/show-day-types';
import { ArrowUp, Timer, LogIn } from 'lucide-react';
import { CheckInStatusMenu } from './CheckInStatusMenu';

interface NextUpCardProps {
  classData: ShowDayClass;
  onNavigate?: ((classId: string) => void) | undefined;
  /** Called when the user changes check-in status */
  onCheckInChange?: ((entryId: string, newStatus: CheckInStatus) => void) | undefined;
  /** Whether self-check-in is enabled for this class */
  selfCheckinEnabled?: boolean | undefined;
  /** Reason self-check-in is disabled */
  selfCheckinDisabledReason?: string | undefined;
  className?: string | undefined;
}

export function NextUpCard({
  classData,
  onNavigate,
  onCheckInChange,
  selfCheckinEnabled = true,
  selfCheckinDisabledReason,
  className,
}: NextUpCardProps) {
  const hasScoring = classData.scoredEntries > 0 || classData.currentDogInRing != null;
  const progressPercent =
    classData.totalEntries > 0
      ? Math.round((classData.scoredEntries / classData.totalEntries) * 100)
      : 0;

  const classLabel = formatClassLabel(classData.element, classData.level, classData.className);
  const isNotCheckedIn = classData.entryStatus === 'no-status';
  const canCheckIn = !!onCheckInChange && selfCheckinEnabled;

  const handleCheckInClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canCheckIn) {
      onCheckInChange(classData.entryId, 'checked-in');
    }
  };

  const handleStatusChange = (newStatus: CheckInStatus) => {
    onCheckInChange?.(classData.entryId, newStatus);
  };

  return (
    <div
      className={cn(
        'w-full rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-5 transition-all duration-300',
        className
      )}
    >
      {/* Header row: "Next Up" + check-in status */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => onNavigate?.(classData.classId)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <ArrowUp className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-primary">Next Up</span>
        </button>

        {/* Check-in status badge (when already checked in or secretary-set) */}
        {!isNotCheckedIn && onCheckInChange && (
          <div onClick={e => e.stopPropagation()}>
            <CheckInStatusMenu
              status={classData.entryStatus}
              onStatusChange={handleStatusChange}
              disabled={!selfCheckinEnabled}
              disabledReason={selfCheckinDisabledReason}
            />
          </div>
        )}
      </div>

      {/* Tappable content area — navigates to class detail */}
      <button
        type="button"
        onClick={() => onNavigate?.(classData.classId)}
        className={cn(
          'w-full text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg',
          'min-h-[48px]'
        )}
        aria-label={`Next up: ${classData.className}, ${classData.dogCallName}, estimated ${classData.estimatedTimeMinutes ?? '?'} minutes`}
      >
        {/* Class name */}
        <h3 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
          {classLabel}
        </h3>

        {/* Ring + progress */}
        <p className="mt-1 text-sm text-muted-foreground">
          {hasScoring ? (
            <>
              Dog {Math.min(classData.scoredEntries + 1, classData.totalEntries)} of{' '}
              {classData.totalEntries}
              {classData.currentDogInRing && (
                <span className="ml-2 text-primary font-medium">
                  &bull; {classData.currentDogInRing} in ring
                </span>
              )}
            </>
          ) : (
            <>
              {classData.totalEntries} entr{classData.totalEntries !== 1 ? 'ies' : 'y'}
              {classData.ringNumber != null && (
                <span className="ml-2">&bull; Ring {classData.ringNumber}</span>
              )}
            </>
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

        {/* Progress bar — only shown when scoring data is available */}
        {hasScoring && (
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
        )}
      </button>

      {/* Large Check In button — shown only when not checked in */}
      {isNotCheckedIn && onCheckInChange && (
        <button
          type="button"
          onClick={handleCheckInClick}
          disabled={!selfCheckinEnabled}
          aria-disabled={!selfCheckinEnabled || undefined}
          className={cn(
            'mt-4 w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-base font-semibold transition-all duration-200',
            'min-h-[48px]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            selfCheckinEnabled
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] focus-visible:ring-emerald-600'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
          aria-label={
            selfCheckinEnabled
              ? 'Check in for this class'
              : (selfCheckinDisabledReason ?? 'Check-in disabled')
          }
        >
          <LogIn className="h-5 w-5" />
          {selfCheckinEnabled ? 'Check In' : 'Check-in Disabled'}
        </button>
      )}
    </div>
  );
}
