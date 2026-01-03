import React from 'react';
import { Calendar } from 'lucide-react';
import { formatTrialDate } from '../../utils/dateUtils';

interface TrialDateBadgeProps {
  date: string;
  trialNumber?: number;
  className?: string;
  showIcon?: boolean;
  dateOnly?: boolean; // If true, only shows the date portion (excluding trial number)
}

/**
 * Reusable component for displaying trial dates with consistent formatting
 * Uses the formatTrialDate utility to ensure consistency across the app
 */
export const TrialDateBadge: React.FC<TrialDateBadgeProps> = ({
  date,
  trialNumber,
  className = '',
  showIcon = true,
  dateOnly = false
}) => {
  if (!date || date.trim() === '') return null;

  let displayText = formatTrialDate(date, trialNumber);

  // If dateOnly is true, strip off the trial number portion
  if (dateOnly && displayText.includes(' • ')) {
    displayText = displayText.split(' • ')[0];
  }

  return (
    <span className={`trial-detail ${className}`.trim()}>
      {showIcon && <Calendar size={14}  style={{ width: '14px', height: '14px', flexShrink: 0 }} />} {displayText}
    </span>
  );
};
