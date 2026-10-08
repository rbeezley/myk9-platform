import React from 'react';
import { getUnderMinAgeDobWarning } from '@/utils/dogDobCheck';

interface DobYoungDogWarningProps {
  dateOfBirth: string;
  callName: string;
  /** `YYYY-MM-DD` show start; today when absent. */
  onDate?: string | undefined;
}

/**
 * Non-blocking note under a dog's date-of-birth field (MYK9-1060): puppies are
 * real, so this warns and never stops the save. Shared by Add Dog and Edit Dog.
 */
export const DobYoungDogWarning: React.FC<DobYoungDogWarningProps> = ({
  dateOfBirth,
  callName,
  onDate,
}) => {
  const message = getUnderMinAgeDobWarning(dateOfBirth, callName, onDate);
  if (!message) return null;
  return (
    <p role="status" className="mt-1 text-xs text-warning">
      {message}
    </p>
  );
};
