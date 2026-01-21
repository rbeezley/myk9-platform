import React from 'react';
import { cn } from '../../lib/utils';
import {
  getCheckinStatusColorVar,
  getCheckinStatusTextColorVar,
  getClassStatusColorVar,
  getClassStatusTextColorVar,
} from '@/utils/statusIcons';

/**
 * StatusBadge Component - Migrated to Tailwind CSS
 *
 * Reusable status badge component
 * Used for displaying class status, entry status, check-in status, etc.
 *
 * @example
 * // Class status with time
 * <StatusBadge
 *   label="Briefing"
 *   time="2:30 PM"
 *   statusColor="briefing"
 *   clickable
 *   onClick={handleClick}
 * />
 *
 * @example
 * // Entry status with icon
 * <StatusBadge
 *   label="Qualified"
 *   statusColor="qualified"
 *   icon={<ThumbsUp />}
 *   asButton
 * />
 */

export interface StatusBadgeProps {
  /** The display label for the status */
  label: string;
  /** Optional time to display (e.g., "2:30 PM") */
  time?: string | null;
  /** Status value (e.g., 'checked-in', 'in-progress') */
  statusColor: string;
  /** Status type to determine which color mapping to use */
  statusType?: 'checkin' | 'class' | 'result';
  /** Whether the badge is clickable */
  clickable?: boolean;
  /** Click handler */
  onClick?: (e: React.MouseEvent) => void;
  /** Optional icon to display */
  icon?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Render as button instead of div */
  asButton?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  time,
  statusColor,
  statusType = 'checkin', // Default to checkin for backward compatibility
  clickable = false,
  onClick,
  icon: _icon, // Reserved for future use
  className,
  asButton = false,
}) => {
  // Get colors from centralized statusConfig instead of CSS classes
  const getColors = () => {
    if (statusType === 'checkin') {
      return {
        bg: getCheckinStatusColorVar(statusColor),
        text: getCheckinStatusTextColorVar(statusColor),
      };
    } else if (statusType === 'class') {
      return {
        bg: getClassStatusColorVar(statusColor),
        text: getClassStatusTextColorVar(statusColor),
      };
    }
    // Fallback for result or unknown types
    return {
      bg: getCheckinStatusColorVar(statusColor),
      text: getCheckinStatusTextColorVar(statusColor),
    };
  };

  const colors = getColors();

  // Apply colors via inline CSS variables instead of CSS classes
  const badgeStyle = {
    backgroundColor: `var(${colors.bg})`,
    color: `var(${colors.text})`,
  };

  const baseClasses = cn(
    'inline-flex items-center justify-center',
    'px-3 py-1.5 rounded-lg',
    'text-xs font-semibold uppercase tracking-wide',
    'min-h-[32px]',
    'transition-all duration-200',
    clickable && [
      'cursor-pointer',
      'hover:opacity-90 hover:-translate-y-px',
      'active:scale-[0.98]',
    ],
    className
  );

  const content = (
    <div className="flex items-center gap-1.5">
      <span>{label}</span>
      {time && (
        <span className="opacity-80 font-medium">{time}</span>
      )}
    </div>
  );

  if (asButton || (clickable && onClick)) {
    return (
      <button
        type="button"
        className={cn(baseClasses, 'border-none')}
        style={badgeStyle}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={baseClasses}
      onClick={clickable && onClick ? onClick : undefined}
      style={badgeStyle}
    >
      {content}
    </div>
  );
};
