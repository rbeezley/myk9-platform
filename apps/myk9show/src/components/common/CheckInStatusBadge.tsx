// CheckInStatusBadge.tsx
import { cn } from '@/lib/utils';
import type { CheckInStatus } from '@myk9/core';
import { getCheckinStatusConfig } from '@myk9/core';
import { CHECKIN_ICON_MAP } from './checkin-icon-map';

interface CheckInStatusBadgeProps {
  status: CheckInStatus;
  size?: 'sm' | 'md' | undefined;
  onClick?: (() => void) | undefined;
  className?: string | undefined;
}

export function CheckInStatusBadge({
  status,
  size = 'md',
  onClick,
  className,
}: CheckInStatusBadgeProps) {
  const config = getCheckinStatusConfig(status);
  if (!config) return null;

  const Icon = CHECKIN_ICON_MAP[config.icon];
  const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5';
  const iconSize = size === 'sm' ? 10 : 12;

  const badgeContent = (
    <>
      {Icon && <Icon size={iconSize} className="shrink-0" />}
      {config.label}
    </>
  );

  const badgeStyle = {
    backgroundColor: `var(${config.colorVar})`,
    color: `var(${config.textColorVar})`,
  };

  const sharedClasses = cn(
    'inline-flex items-center gap-1 font-semibold rounded-md whitespace-nowrap',
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

  if (onClick) {
    return (
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onClick();
        }}
        className={cn(sharedClasses, 'cursor-pointer hover:opacity-80')}
        style={badgeStyle}
      >
        {badgeContent}
      </button>
    );
  }

  return (
    <span className={sharedClasses} style={badgeStyle}>
      {badgeContent}
    </span>
  );
}
