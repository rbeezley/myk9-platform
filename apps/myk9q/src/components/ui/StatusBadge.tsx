import React from 'react';
import './shared-ui.css';
import {
  getCheckinStatusColorVar,
  getCheckinStatusTextColorVar,
  getClassStatusColorVar,
  getClassStatusTextColorVar
} from '@/utils/statusIcons';

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

/**
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
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  time,
  statusColor,
  statusType = 'checkin', // Default to checkin for backward compatibility
  clickable = false,
  onClick,
  icon: _icon, // Reserved for future use
  className = '',
  asButton = false
}) => {
  // Get colors from centralized statusConfig instead of CSS classes
  const getColors = () => {
    if (statusType === 'checkin') {
      return {
        bg: getCheckinStatusColorVar(statusColor),
        text: getCheckinStatusTextColorVar(statusColor)
      };
    } else if (statusType === 'class') {
      return {
        bg: getClassStatusColorVar(statusColor),
        text: getClassStatusTextColorVar(statusColor)
      };
    }
    // Fallback for result or unknown types
    return {
      bg: getCheckinStatusColorVar(statusColor),
      text: getCheckinStatusTextColorVar(statusColor)
    };
  };

  const colors = getColors();
  const baseClassName = `status-badge ${clickable ? 'clickable touchable' : ''} ${className}`.trim();

  // Apply colors via inline CSS variables instead of CSS classes
  const badgeStyle = {
    backgroundColor: `var(${colors.bg})`,
    color: `var(${colors.text})`
  };

  const content = (
    <div className="status-badge-content">
      <span className="status-text">{label}</span>
      {time && <span className="status-time">{time}</span>}
    </div>
  );

  if (asButton || (clickable && onClick)) {
    return (
      <button
        type="button"
        className={baseClassName}
        style={badgeStyle}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={baseClassName}
      onClick={clickable && onClick ? onClick : undefined}
      style={{
        ...badgeStyle,
        ...(clickable ? { cursor: 'pointer' } : {})
      }}
    >
      {content}
    </div>
  );
};
