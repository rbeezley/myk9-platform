import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { ClubsOfflineState } from '@/components/clubs/ClubsOfflineState';
import type { ClubShowsStatus } from './useClubShows';

interface ClubShowsUnsettledProps {
  status: Exclude<ClubShowsStatus, 'ready'>;
  onRetry: () => void;
}

/**
 * MYK9-768: what the Upcoming/Past Shows tabs render while a guest's
 * server read has no answer yet. Never the "No Upcoming Shows" empty state,
 * which would claim a club has no shows when we simply do not know.
 */
export const ClubShowsUnsettled: React.FC<ClubShowsUnsettledProps> = ({ status, onRetry }) => {
  if (status === 'offline') {
    return (
      <ClubsOfflineState
        description="Connect to the internet to see this club's shows."
        onRetry={onRetry}
      />
    );
  }
  if (status === 'error') {
    return (
      <EmptyState
        icon={AlertCircle}
        title="We couldn't load this club's shows"
        description="Check your connection and try again."
        action={{ label: 'Try again', onClick: onRetry }}
      />
    );
  }
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-16 text-muted-foreground"
    >
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span>Loading this club&apos;s shows…</span>
    </div>
  );
};
