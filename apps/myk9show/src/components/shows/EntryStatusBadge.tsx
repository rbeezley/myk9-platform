/**
 * Entry Status Badge Component
 * Shows the current entry status for a show (accepting, closing soon, closed, submitted)
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, XCircle, CalendarClock } from 'lucide-react';
import type { Show } from '@/types/show-types';
import { getEntryStatus, getEntryStatusBadgeStyle, type EntryStatus } from '@/utils/entryStatusUtils';

interface EntryStatusBadgeProps {
  show: Show;
  userHasEntries?: boolean;
  showIcon?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const statusIcons: Record<EntryStatus, React.ReactNode> = {
  accepting: <CheckCircle2 className="h-3 w-3" />,
  closing_soon: <AlertCircle className="h-3 w-3" />,
  closed: <XCircle className="h-3 w-3" />,
  submitted: <CheckCircle2 className="h-3 w-3" />,
  not_yet_open: <CalendarClock className="h-3 w-3" />,
};

export function EntryStatusBadge({
  show,
  userHasEntries = false,
  showIcon = true,
  size = 'sm',
  className = '',
}: EntryStatusBadgeProps) {
  const statusInfo = getEntryStatus(show, userHasEntries);
  const style = getEntryStatusBadgeStyle(statusInfo.status);

  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <Badge
      className={`${style.className} ${sizeClasses} flex items-center gap-1 ${className}`}
      title={statusInfo.description}
    >
      {showIcon && statusIcons[statusInfo.status]}
      {statusInfo.label}
    </Badge>
  );
}

export default EntryStatusBadge;
