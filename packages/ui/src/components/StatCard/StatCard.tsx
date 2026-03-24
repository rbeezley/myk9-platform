import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../../utils/cn';
import { STAT_COLORS, type StatColor } from './statCardVariants';

export interface StatCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /** Lucide icon component to display in the card header. */
  icon: LucideIcon;
  /** Label displayed above the value. */
  title: string;
  /** Primary metric — number or formatted string. */
  value: string | number;
  /** Color theme for the icon background, icon stroke, and progress bar. Defaults to `"primary"`. */
  color?: StatColor;
  /** Secondary line of text below the value (e.g. "Active: 38"). */
  subtitle?: string;
  /** Progress bar value (0-100). Omit to hide the bar. */
  progress?: number;
  /** Trend badge text. Prefixed with `+` renders emerald; `-` renders red; anything else renders muted. */
  trend?: string;
  /** Makes the card interactive (adds cursor-pointer, role=button, keyboard support). */
  onClick?: () => void;
}

/**
 * A stat card that displays a single metric with an icon, optional subtitle,
 * progress bar, and trend badge.
 *
 * @example
 * <StatCard icon={Users} title="Total Entries" value={142} color="emerald" />
 *
 * @example
 * <StatCard
 *   icon={CheckCircle}
 *   title="Completion"
 *   value="87%"
 *   progress={87}
 *   trend="+12%"
 *   color="primary"
 * />
 */
function StatCard({
  icon: Icon,
  title,
  value,
  color = 'primary',
  subtitle,
  progress,
  trend,
  onClick,
  className,
  ...props
}: StatCardProps) {
  const colors = STAT_COLORS[color];
  const clampedProgress = progress != null ? Math.min(100, Math.max(0, progress)) : undefined;
  const isPositiveTrend = trend?.startsWith('+');
  const isNegativeTrend = trend?.startsWith('-');

  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-card p-5',
        'transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 hover:shadow-md',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      {...(onClick && {
        role: 'button',
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        },
      })}
      {...props}
    >
      <div className="flex items-start gap-4">
        <div
          data-slot="icon"
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]',
            colors.iconBg
          )}
        >
          <Icon className={cn('h-5 w-5', colors.iconStroke)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </span>
            {trend && (
              <span
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-medium',
                  isPositiveTrend && 'bg-emerald-500/10 text-emerald-500',
                  isNegativeTrend && 'bg-red-500/10 text-red-500',
                  !isPositiveTrend && !isNegativeTrend && 'bg-muted text-muted-foreground'
                )}
              >
                {trend}
              </span>
            )}
          </div>
          <div className="mt-1 text-[28px] font-bold leading-none text-foreground">{value}</div>
          {subtitle && <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      {clampedProgress != null && (
        <div
          role="progressbar"
          aria-valuenow={clampedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-3 h-[3px] overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn('h-full rounded-full transition-all duration-500', colors.progressFill)}
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton placeholder with the same outer dimensions as `StatCard`.
 * Use while data is loading to prevent layout shift.
 *
 * @example
 * <StatCardSkeleton />
 */
function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border/50 bg-card p-5', className)}>
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-[10px] bg-muted" />
        <div className="min-w-0 flex-1">
          <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-7 w-2/5 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

export { StatCard, StatCardSkeleton };
