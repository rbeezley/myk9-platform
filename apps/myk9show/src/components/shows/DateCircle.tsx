import React from 'react';
import { cn } from '@/lib/utils';
import { STATUS_STYLES, type ShowCardStatus } from '@/utils/showCardUtils';

interface DateCircleProps {
  startDate: string;
  endDate?: string;
  status: ShowCardStatus;
  size?: 'sm' | 'md';
}

function computeDays(startDate: string, endDate?: string): number | null {
  if (!endDate || endDate === startDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 1 ? diff : null;
}

/** Parse date string, handling both ISO datetime and date-only formats */
function parseDate(dateStr: string): Date {
  // If it already contains 'T' (ISO datetime), parse directly
  if (dateStr.includes('T')) return new Date(dateStr);
  // Date-only: append T00:00:00 to avoid UTC offset issues
  return new Date(dateStr + 'T00:00:00');
}

function formatMonth(dateStr: string): string {
  const date = parseDate(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

function formatDay(dateStr: string): string {
  const date = parseDate(dateStr);
  return String(date.getDate());
}

function formatMonthLong(dateStr: string): string {
  const date = parseDate(dateStr);
  return date.toLocaleDateString('en-US', { month: 'long' });
}

export const DateCircle: React.FC<DateCircleProps> = ({
  startDate,
  endDate,
  status,
  size = 'sm',
}) => {
  const styles = STATUS_STYLES[status];
  const days = computeDays(startDate, endDate);
  const month = formatMonth(startDate);
  const day = formatDay(startDate);
  const monthLong = formatMonthLong(startDate);

  const ariaLabel = days ? `${monthLong} ${day}, ${days} day show` : `${monthLong} ${day}`;

  const sizeClasses = size === 'md' ? 'w-[60px] h-[60px]' : 'w-14 h-14';
  const monthSize = size === 'md' ? 'text-[11px]' : 'text-[10px]';
  const daySize = size === 'md' ? 'text-[22px]' : 'text-xl';

  return (
    <div
      className="flex flex-col items-center gap-1 flex-shrink-0"
      aria-label={ariaLabel}
      role="group"
    >
      <div
        data-testid="date-box"
        className={cn(
          sizeClasses,
          'rounded-xl border-2 flex flex-col items-center justify-center bg-card/50',
          styles.border
        )}
      >
        <span className={cn(monthSize, 'font-bold tracking-wider leading-none', styles.monthText)}>
          {month}
        </span>
        <span className={cn(daySize, 'font-extrabold leading-tight text-foreground')}>{day}</span>
      </div>
      {days && (
        <span
          className={cn(
            'text-[9px] font-semibold px-2 py-0.5 rounded-full',
            styles.badgeBg,
            styles.monthText
          )}
        >
          {days} days
        </span>
      )}
    </div>
  );
};
