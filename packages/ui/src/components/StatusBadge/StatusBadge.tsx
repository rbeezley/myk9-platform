import * as React from 'react';
import { cn } from '../../utils/cn';
import { statusBadgeVariants, type StatusBadgeVariants } from './statusBadgeVariants';

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLElement>,
    StatusBadgeVariants {
  /** The display label for the status */
  label: string;
  /** Optional time to display (e.g., "2:30 PM") */
  time?: string | null;
  /** Optional icon to display before the label */
  icon?: React.ReactNode;
  /** Render as button instead of div (for clickable badges) */
  asButton?: boolean;
}

/**
 * StatusBadge Component
 *
 * A flexible status badge component for displaying various states like
 * check-in status, class status, result status, etc.
 *
 * Uses Tailwind classes with CVA variants for consistent styling across
 * light and dark modes.
 *
 * @example
 * ```tsx
 * // Simple status
 * <StatusBadge label="Checked In" variant="checked-in" />
 *
 * // With time
 * <StatusBadge label="Briefing" time="2:30 PM" variant="briefing" />
 *
 * // With icon
 * <StatusBadge label="In Progress" variant="in-progress" icon={<PlayIcon />} />
 *
 * // Clickable button variant
 * <StatusBadge
 *   label="Completed"
 *   variant="completed"
 *   clickable
 *   asButton
 *   onClick={handleClick}
 * />
 * ```
 */
export const StatusBadge = React.forwardRef<HTMLElement, StatusBadgeProps>(
  (
    {
      label,
      time,
      icon,
      variant,
      size,
      clickable,
      asButton = false,
      className,
      onClick,
      ...props
    },
    ref
  ) => {
    const classes = cn(statusBadgeVariants({ variant, size, clickable }), className);

    const content = (
      <>
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span>{label}</span>
        {time && (
          <span className="opacity-75 text-[0.85em] ml-1">{time}</span>
        )}
      </>
    );

    if (asButton || (clickable && onClick)) {
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          className={classes}
          onClick={onClick}
          {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        >
          {content}
        </button>
      );
    }

    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        className={classes}
        onClick={clickable ? onClick : undefined}
        {...(props as React.HTMLAttributes<HTMLDivElement>)}
      >
        {content}
      </div>
    );
  }
);

StatusBadge.displayName = 'StatusBadge';
