import React from 'react';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { cn } from '@/lib/utils';

interface DogIneligibleReasonProps {
  /** Wire to the control's `aria-describedby` so screen readers get the reason. */
  id: string;
  /** The `issues` from `getDogEligibilityStatus` — the only source of the wording. */
  issues: string[];
  dateOfBirth?: string | undefined;
  className?: string;
}

/**
 * Why a dog in the picker is greyed out (MYK9-1060). Visible text, not hover
 * only: secretaries use tablets at shows. Renders nothing for an eligible dog.
 */
export const DogIneligibleReason: React.FC<DogIneligibleReasonProps> = ({
  id,
  issues,
  dateOfBirth,
  className,
}) => {
  if (issues.length === 0) return null;
  const born = dateOfBirth ? ` — born ${formatDateMMDDYYYY(dateOfBirth)}` : '';
  return (
    <p id={id} className={cn('text-xs text-destructive', className)}>
      {issues.join('; ')}
      {born}
    </p>
  );
};
