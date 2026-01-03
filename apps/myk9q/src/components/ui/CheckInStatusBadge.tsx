import React from 'react';
import { StatusBadge } from './StatusBadge';
import { getCheckinStatusIcon, getCheckinStatusLabel } from '@/utils/statusIcons';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

export interface CheckInStatusBadgeProps {
  /** Check-in status: 'none', 'checked-in', 'conflict', 'pulled', 'at-gate', 'come-to-gate' */
  status?: string;
  /** Whether the badge is clickable */
  clickable?: boolean;
  /** Click handler */
  onClick?: (e: React.MouseEvent) => void;
  /** Icon size (default: 16) */
  iconSize?: number;
  /** Additional CSS classes */
  className?: string;
  /** Render as button instead of div */
  asButton?: boolean;
}

/**
 * Standardized check-in status badge with Lucide icons
 * Uses centralized colors from design-tokens.css and StatusBadge component
 *
 * @example
 * <CheckInStatusBadge status="checked-in" clickable onClick={handleClick} />
 * <CheckInStatusBadge status="at-gate" iconSize={20} />
 */
export const CheckInStatusBadge: React.FC<CheckInStatusBadgeProps> = ({
  status = 'none',
  clickable = false,
  onClick,
  iconSize = 16,
  className = '',
  asButton = false
}) => {
  const haptic = useHapticFeedback();

  // Get label and icon from centralized statusConfig via statusIcons utility
  const label = getCheckinStatusLabel(status);
  const icon = getCheckinStatusIcon(status, { size: iconSize, className: 'status-icon' });

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      // Provide different haptic feedback based on status
      if (status === 'conflict') {
        haptic.warning(); // Warning pulse for conflicts
      } else {
        haptic.light(); // Quick tap for normal status changes
      }
      onClick(e);
    }
  };

  return (
    <StatusBadge
      label={label}
      statusColor={status}
      statusType="checkin"
      icon={icon}
      clickable={clickable}
      onClick={handleClick}
      className={`${className} no-haptic`}
      asButton={asButton}
    />
  );
};
