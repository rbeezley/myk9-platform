import React from 'react';
import { cn } from '@/lib/utils';
import { STATUS_STYLES, type ShowCardStatus } from '@/utils/showCardUtils';
import { toLocalDate } from '@/utils/date-format';

interface DateCircleProps {
  startDate: string;
  endDate?: string;
  status: ShowCardStatus;
  size?: 'sm' | 'md';
}

function computeDays(startDate: string, endDate?: string): number | null {
  if (!endDate) return null;
  const startOnly = startDate.split('T')[0];
  const endOnly = endDate.split('T')[0];
  if (startOnly === endOnly) return null;
  const start = toLocalDate(startDate);
  const end = toLocalDate(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 1 ? diff : null;
}

function formatMonth(dateStr: string): string {
  const date = toLocalDate(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

function formatDay(dateStr: string): string {
  const date = toLocalDate(dateStr);
  return String(date.getDate());
}

function formatMonthLong(dateStr: string): string {
  const date = toLocalDate(dateStr);
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
