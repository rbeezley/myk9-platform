import React from 'react';
import { WifiOff } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';

interface ClubsOfflineStateProps {
  /** What the visitor cannot see yet, e.g. "browse clubs". */
  description: string;
  onRetry: () => void;
}

/**
 * MYK9-747: the signed-out club directory and club pages are online-only
 * (see the INTENT in useBrowseClubsData), so offline they say so instead of
 * rendering an empty list or a not-found page.
 */
export const ClubsOfflineState: React.FC<ClubsOfflineStateProps> = ({ description, onRetry }) => (
  <EmptyState
    icon={WifiOff}
    title="You're offline"
    description={description}
    action={{ label: 'Try again', onClick: onRetry }}
  />
);
