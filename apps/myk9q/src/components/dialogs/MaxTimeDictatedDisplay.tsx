import React from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import type { ClassRequirements } from './MaxTimeDialog.types';

interface MaxTimeDictatedDisplayProps {
  dictatedTime: string;
  requirements: ClassRequirements | null;
}

export const MaxTimeDictatedDisplay: React.FC<MaxTimeDictatedDisplayProps> = ({
  dictatedTime,
  requirements,
}) => {
  return (
    <div className="dictated-time-display">
      <div className="dictated-time-item">
        <div className="dictated-time-icon">
          <Clock className="h-6 w-6" />
        </div>
        <div className="dictated-time-content">
          <label>Max Time (Fixed)</label>
          <div className="dictated-time-value">{dictatedTime}</div>
        </div>
      </div>
      <div className="dictated-notice">
        <AlertCircle className="notice-icon" />
        <p>This class has a fixed max time set by the organization rules.</p>
      </div>
      {requirements?.has_30_second_warning === false && (
        <div className="dictated-notice">
          <AlertCircle className="notice-icon" />
          <p><strong>Note:</strong> {requirements.warning_notes || 'This class does not receive a 30-second warning.'}</p>
        </div>
      )}
    </div>
  );
};
