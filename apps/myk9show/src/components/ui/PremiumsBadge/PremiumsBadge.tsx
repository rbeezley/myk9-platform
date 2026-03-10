import React from 'react';
import { Crown } from 'lucide-react';

const PremiumsBadge: React.FC<{ className?: string }> = ({ className }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-semibold gap-1 ${className || ''}`}
  >
    <Crown size={14} className="text-amber-500 mr-1" />
    Premium
  </span>
);

export default PremiumsBadge;
