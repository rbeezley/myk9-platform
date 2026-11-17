import React from 'react';
import { Badge } from '@/components/ui/badge';
import type { ScoringRow } from './types';
import { DISPLAY_LABELS } from './constants';
import { PendingCell } from './PendingCell';
import { RESULTS_PRIVATE_LABEL } from '@/lib/resultsPrivacy';

interface QualificationCellProps {
  item: ScoringRow;
  visible: boolean;
}

export const QualificationCell: React.FC<QualificationCellProps> = ({ item, visible }) => {
  if (!visible) {
    return <PendingCell />;
  }

  if (item.resultsPrivate && !item.qualification) {
    // MYK9-969: the entry's people keep their results private. Say so, rather
    // than "Not Set", which reads as a scoring gap.
    return <span className="text-sm text-muted-foreground italic">{RESULTS_PRIVATE_LABEL}</span>;
  }

  return (
    <div>
      <div>
        <Badge variant={item.qualification === 'Qualified' ? 'default' : 'secondary'}>
          {DISPLAY_LABELS[item.qualification] || item.qualification || 'Not Set'}
        </Badge>
      </div>
      {item.qualificationReason && (
        <div className="text-xs text-muted-foreground mt-1">{item.qualificationReason}</div>
      )}
    </div>
  );
};
