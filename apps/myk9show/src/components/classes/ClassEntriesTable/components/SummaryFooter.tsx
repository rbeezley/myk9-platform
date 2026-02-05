/**
 * Summary footer showing entry counts and statistics
 */

import React from 'react';
import { EntryData } from '../../types/classTypes';

interface SummaryFooterProps {
  entries: EntryData[];
}

export const SummaryFooter: React.FC<SummaryFooterProps> = ({ entries }) => {
  const qualifiedCount = entries.filter(e => e.status === 'Qualified').length;
  const nqCount = entries.filter(e => e.status === 'Not Qualified').length;

  return (
    <div className="flex justify-between items-center text-sm text-muted-foreground bg-muted/30 rounded-lg p-4">
      <span>Total entries: {entries.length}</span>
      <span>
        Qualified: {qualifiedCount} | NQ: {nqCount}
      </span>
    </div>
  );
};
