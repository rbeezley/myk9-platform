import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ClubDetails } from '@/components/clubs/ClubDetails';
import { ClubsOfflineState } from '@/components/clubs/ClubsOfflineState';
import { DetailPageSkeleton } from '@/components/common/SkeletonLoaders';
import { NotFoundState } from '@/components/common/NotFoundState';
import { PageShell } from '@/components/common/PageShell';
import { Button } from '@/components/ui/button';
import { useClubDetailData } from '@/hooks/useClubDetailData';

/**
 * ClubDetailPage is a thin wrapper around ClubDetails for the /clubs/:id route.
 * Loads the club (replica when signed in, server when signed out; see
 * useClubDetailData) and renders ClubDetails.
 */
const ClubDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { club, status, isGuest, retry } = useClubDetailData(id);

  if (status === 'loading') {
    return <DetailPageSkeleton />;
  }

  if (status === 'offline') {
    return (
      <PageShell maxWidth="max-w-xl">
        <ClubsOfflineState
          description="Connect to the internet to see this club."
          onRetry={retry}
        />
      </PageShell>
    );
  }

  if (status === 'unavailable') {
    return (
      <PageShell maxWidth="max-w-xl">
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <h1 className="text-2xl font-semibold">Club details are unavailable</h1>
          <p className="text-muted-foreground">
            We couldn&apos;t check this club right now.
            {!isGuest && ' Your saved club information is still safe.'}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={retry}>Try again</Button>
            <Button asChild variant="outline">
              <Link to="/clubs">Back to clubs</Link>
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  if (status === 'not-found') {
    return (
      <PageShell>
        <NotFoundState entityName="Club" backTo="/clubs" backLabel="Back to Clubs" />
      </PageShell>
    );
  }

  return <ClubDetails selectedClub={club} />;
};

export default ClubDetailPage;
