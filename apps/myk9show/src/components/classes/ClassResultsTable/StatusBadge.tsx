import React from 'react';
import { StatusBadge as SharedStatusBadge } from '@/components/status';
import type { ScoringRow } from './types';

interface StatusBadgeProps {
  item: ScoringRow;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ item }) => {
  if (item.isScored) {
    return <SharedStatusBadge family="entry" status="completed" label="Scored" />;
  }

  if (item.hasEdits) {
    return <SharedStatusBadge family="entry" status="in-ring" variant="outline" label="Editing" />;
  }

  return <SharedStatusBadge family="entry" status="pending" variant="outline" />;
};
