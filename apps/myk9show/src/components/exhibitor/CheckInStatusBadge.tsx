/**
 * CheckInStatusBadge — Pill showing current check-in status with icon.
 *
 * Tailwind version of myK9Q's CheckInStatusBadge. Clickable when the exhibitor
 * can change status (opens CheckInStatusMenu). Read-only for secretary-set statuses.
 */
import { cn } from '@/lib/utils';
import type { CheckInStatus } from '@myk9/core';
import { getCheckinStatusConfig, isExhibitorAllowedStatus } from '@myk9/core';
import { Circle } from 'lucide-react';
import { CHECKIN_ICON_MAP } from '@/components/common/checkin-icon-map';

/** Tailwind color classes per status — aligned with design-tokens.css */
const STATUS_COLORS: Record<CheckInStatus, { bg: string; text: string; border: string }> = {
  'no-status': {
    bg: 'bg-muted/50',
    text: 'text-muted-foreground',
    border: 'border-muted-foreground/30',
  },
  'checked-in': {
    bg: 'bg-teal-500/15',
    text: 'text-teal-600 dark:text-teal-400',
    border: 'border-teal-500/30',
  },
  conflict: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/30',
  },
  pulled: {
    bg: 'bg-red-500/15',
    text: 'text-destructive ',
    border: 'border-red-500/30',
  },
  'at-gate': {
    bg: 'bg-violet-500/15',
    text: 'text-violet-600 dark:text-violet-400',
    border: 'border-violet-500/30',
  },
  'come-to-gate': {
    bg: 'bg-blue-500/15',
    text: 'text-info ',
    border: 'border-blue-500/30',
  },
  'in-ring': {
    bg: 'bg-blue-600/15',
    text: 'text-info ',
    border: 'border-blue-600/30',
  },
  completed: {
    bg: 'bg-slate-500/15',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-500/30',
  },
};

interface CheckInStatusBadgeProps {
  status: CheckInStatus;
  /** Called when the user selects a new status. If omitted, badge is read-only. */
  onClick?: (() => void) | undefined;
  /** Override the interactive state (e.g., disable when self-check-in is off) */
  disabled?: boolean | undefined;
  /** Additional class names */
  className?: string | undefined;
  /** Compact mode (icon only, no label) */
  compact?: boolean | undefined;
}

export function CheckInStatusBadge({
  status,
  onClick,
  disabled,
  className,
  compact = false,
}: CheckInStatusBadgeProps) {
  const config = getCheckinStatusConfig(status);
  const label = config?.label ?? 'Unknown';
  const iconName = config?.icon ?? 'Circle';
  const Icon = CHECKIN_ICON_MAP[iconName] ?? Circle;
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS['no-status'];

  const isInteractive = !!onClick && !disabled;
  // Secretary-set statuses are always read-only for exhibitors
  const isReadOnly = !isExhibitorAllowedStatus(status) || !isInteractive;

  const badgeContent = (
    <>
      <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', colors.text)} />
      {!compact && <span className="text-xs font-medium">{label}</span>}
    </>
  );

  const sharedClasses = cn(
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
    colors.bg,
    colors.text,
    colors.border,
    className
  );

  if (isReadOnly) {
    return (
      <span className={sharedClasses} aria-label={`Status: ${label}`}>
        {badgeContent}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={cn(
        sharedClasses,
        'cursor-pointer transition-all duration-150',
        'hover:shadow-sm hover:brightness-95 active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        'min-h-[44px]',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      aria-label={`Status: ${label}. Click to change.`}
    >
      {badgeContent}
    </button>
  );
}
