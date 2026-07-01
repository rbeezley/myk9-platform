import React from 'react';
import { Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ScoringRow } from './types';
import { getPlacementBadgeClass, formatPlacement } from './utils';
import { PendingCell } from './PendingCell';

interface PlacementCellProps {
  item: ScoringRow;
  /** Staff always see placement; non-staff only when the class visibility allows it. */
  visible: boolean;
}

export const PlacementCell: React.FC<PlacementCellProps> = ({ item, visible }) => {
  if (!visible) return <PendingCell />;
  return item.placement ? (
    <Badge variant="default" className={getPlacementBadgeClass(item.placement)}>
      <Trophy className="h-4 w-4" />
      {formatPlacement(item.placement)}
    </Badge>
  ) : (
    <span className="text-sm text-muted-foreground">--</span>
  );
};
