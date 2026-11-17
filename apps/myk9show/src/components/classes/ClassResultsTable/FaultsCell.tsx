import React from 'react';
import type { ScoringRow } from './types';
import { PendingCell } from './PendingCell';
import { RESULTS_PRIVATE_LABEL } from '@/lib/resultsPrivacy';

interface FaultsCellProps {
  item: ScoringRow;
  visible: boolean;
}

export const FaultsCell: React.FC<FaultsCellProps> = ({ item, visible }) => {
  if (!visible) return <PendingCell />;
  if (item.resultsPrivate && item.faults === '') {
    // Withheld by the entry's people (MYK9-969), not zero.
    return (
      <span className="text-sm text-muted-foreground" aria-label={RESULTS_PRIVATE_LABEL}>
        —
      </span>
    );
  }
  return <span className="text-sm">{item.faults}</span>;
};
