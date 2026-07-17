// CheckInStatusBadge.tsx
import { cn } from '@/lib/utils';
import type { CheckInStatus } from '@myk9/core';
import { isExhibitorAllowedStatus } from '@myk9/core';
import { StatusIcon, getStatusDescriptor } from '@/components/status';

interface CheckInStatusBadgeProps {
  status: CheckInStatus;
  size?: 'sm' | 'md' | undefined;
  onClick?: (() => void) | undefined;
  className?: string | undefined;
  disabled?: boolean | undefined;
  compact?: boolean | undefined;
  audience?: 'staff' | 'exhibitor' | undefined;
}

export function CheckInStatusBadge({
  status,
  size = 'md',
  onClick,
  className,
  disabled = false,
  compact = false,
  audience = 'staff',
}: CheckInStatusBadgeProps) {
  const descriptor = getStatusDescriptor('entry', status);
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-1' : 'text-sm px-2.5 py-1';
  const canChangeForAudience = audience === 'staff' || isExhibitorAllowedStatus(status);
  const isInteractive = Boolean(onClick) && !disabled && canChangeForAudience;
  const ariaLabel = isInteractive
    ? `Status: ${descriptor.label}. Click to change.`
    : `Status: ${descriptor.label}`;

  const badgeContent = (
    <>
      <StatusIcon family="entry" status={status} size="sm" decorative />
      {!compact && <span>{descriptor.label}</span>}
    </>
  );

  const sharedClasses = cn(
    'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40',
    'font-semibold text-foreground whitespace-nowrap',
    // Status changed in place = a 200ms color crossfade (never a snap). The
    // status colors are applied via CSS-var inline styles that change with the
    // status, so transitioning color/background-color animates the swap. Include
    // `opacity` in one property list so the interactive (onClick) variant's
    // hover:opacity-80 also transitions — a separate `transition-opacity` there
    // would override `transition-colors` and snap the color change on the very
    // path users use to change status. See DESIGN.md / docs/plan-motion-consistency.md.
    'transition-[color,background-color,opacity] duration-state motion-reduce:transition-none',
    sizeClasses,
    className
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onClick?.();
        }}
        className={cn(
          sharedClasses,
          'min-h-[44px] cursor-pointer hover:bg-muted/70',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        )}
        aria-label={ariaLabel}
      >
        {badgeContent}
      </button>
    );
  }

  return (
    <span className={sharedClasses} aria-label={ariaLabel}>
      {badgeContent}
    </span>
  );
}
