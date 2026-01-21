import React from 'react';
import { Calendar } from 'lucide-react';
import { formatTrialDate } from '../../utils/dateUtils';
import { cn } from '../../lib/utils';

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
  className,
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
    <span
      className={cn(
        'inline-flex items-center gap-1.5',
        'text-sm text-[var(--muted-foreground)]',
        className
      )}
    >
      {showIcon && <Calendar className="w-3.5 h-3.5 flex-shrink-0" />}
      {displayText}
    </span>
  );
};
