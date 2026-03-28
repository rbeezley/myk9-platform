import React from 'react';
import { CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ScoringRow } from './types';

interface StatusBadgeProps {
  item: ScoringRow;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ item }) => {
  if (item.isScored) {
    return (
      <Badge variant="default" className="flex items-center space-x-1">
        <CheckCircle className="h-3 w-3" />
        <span>Scored</span>
      </Badge>
    );
  }

  if (item.hasEdits) {
    return (
      <Badge variant="outline" className="flex items-center space-x-1">
        <span>Editing</span>
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="flex items-center space-x-1">
      <span>Pending</span>
    </Badge>
  );
};
