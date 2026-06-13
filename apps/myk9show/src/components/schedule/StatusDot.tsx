import { CLASS_STATUS } from '@myk9/core';
import type { ClassStatusValue } from '@myk9/core';
import { cn } from '@/lib/utils';

const STATUS_DOT_COLORS: Record<ClassStatusValue, string> = {
  [CLASS_STATUS.SCHEDULED]: 'bg-slate-500 dark:bg-slate-400',
  [CLASS_STATUS.UPCOMING]: 'bg-slate-500 dark:bg-slate-400',
  [CLASS_STATUS.IN_PROGRESS]: 'bg-amber-600 dark:bg-amber-400',
  [CLASS_STATUS.COMPLETED]: 'bg-green-600 dark:bg-green-400',
  [CLASS_STATUS.CANCELLED]: 'bg-slate-500 dark:bg-slate-400',
};

interface StatusDotProps {
  status: ClassStatusValue;
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <div
      className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', STATUS_DOT_COLORS[status], className)}
      aria-label={`Status: ${status}`}
    />
  );
}
