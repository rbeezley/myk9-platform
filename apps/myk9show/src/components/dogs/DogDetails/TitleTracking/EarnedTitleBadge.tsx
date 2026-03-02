import React from 'react';
import { CheckCircle } from 'lucide-react';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';

interface EarnedTitleBadgeProps {
  abbreviation: string;
  earnedDate: string | null;
  isSuperseded?: boolean;
}

const EarnedTitleBadge: React.FC<EarnedTitleBadgeProps> = ({
  abbreviation,
  earnedDate,
  isSuperseded,
}) => (
  <div
    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold ${
      isSuperseded
        ? 'bg-muted text-muted-foreground line-through'
        : 'bg-success-green/15 text-success-green'
    }`}
  >
    <CheckCircle className="w-3.5 h-3.5" />
    {abbreviation}
    {earnedDate && (
      <span className="text-xs font-normal opacity-75">{formatDateMMDDYYYY(earnedDate)}</span>
    )}
  </div>
);

export default EarnedTitleBadge;
