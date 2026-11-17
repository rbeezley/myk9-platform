import React from 'react';
import type { ScoringRow } from './types';
import { PendingCell } from './PendingCell';

interface SearchTimeCellProps {
  item: ScoringRow;
  visible: boolean;
}

export const SearchTimeCell: React.FC<SearchTimeCellProps> = ({ item, visible }) => {
  if (!visible) return <PendingCell />;
  return (
    <div className="text-center">
      <span className="text-sm font-mono">{item.searchTime || '--'}</span>
    </div>
  );
};
