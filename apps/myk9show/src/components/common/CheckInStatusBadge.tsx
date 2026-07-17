// CheckInStatusBadge.tsx
import { cn } from '@/lib/utils';
import type { CheckInStatus } from '@myk9/core';
import { isExhibitorAllowedStatus } from '@myk9/core';
import { StatusIcon, getStatusDescriptor, getStatusSurfaceClasses } from '@/components/status';

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
  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
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
    'inline-flex items-center gap-1 rounded-md font-semibold whitespace-nowrap',
    getStatusSurfaceClasses('entry', status),
    // Status changed in place = a 200ms color crossfade (never a snap). The
    // shared semantic surface classes change with the status, so transitioning
    // color/background-color animates the swap. Include
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
          "relative cursor-pointer hover:opacity-80 before:absolute before:left-1/2 before:top-1/2 before:min-h-11 before:min-w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
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
