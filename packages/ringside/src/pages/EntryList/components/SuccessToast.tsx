import React from 'react';
import { CheckCircle } from 'lucide-react';

export interface SuccessToastProps {
  /** Whether the toast is visible */
  isVisible: boolean;
  /** Message to display */
  message: string;
}

/**
 * Success toast notification for entry list actions.
 * Shared between EntryList and CombinedEntryList.
 */
export const SuccessToast: React.FC<SuccessToastProps> = ({
  isVisible,
  message,
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="success-toast">
      <CheckCircle size={20} style={{ width: '20px', height: '20px', flexShrink: 0 }} />
      <span>{message}</span>
    </div>
  );
};

export default SuccessToast;
