import React, { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useClubStore } from '@/store/clubStore';
import { ClubDetails } from '@/components/clubs/ClubDetails';
import { DetailPageSkeleton } from '@/components/common/SkeletonLoaders';
import { Button } from '@/components/ui/button';

/**
 * ClubDetailPage is a thin wrapper around ClubDetails for the /clubs/:id route.
 * Loads the club from the store and renders ClubDetails.
 */
const ClubDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const clubs = useClubStore(state => state.clubs);
  const readiness = useClubStore(state => state.clubReadiness);
  const ensureClubsReady = useClubStore(state => state.ensureClubsReady);

  useEffect(() => {
    void ensureClubsReady({ requestedClubId: id });
  }, [ensureClubsReady, id]);

  const club = useMemo(() => {
    if (!id) return null;
    const found = clubs.find(c => c.id === id);
    if (!found) return null;
    // Ensure arrays are defined for ClubDetails
    return {
      ...found,
      upcomingShows: Array.isArray(found.upcomingShows) ? found.upcomingShows : [],
      pastShows: Array.isArray(found.pastShows) ? found.pastShows : [],
    };
  }, [clubs, id]);

  if (readiness === 'loading' && !club) {
    return <DetailPageSkeleton />;
  }

  if ((readiness === 'unavailable' || readiness === 'offline') && !club) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Club details are unavailable</h1>
        <p className="text-muted-foreground">
          We couldn&apos;t check this club right now. Your saved club information is still safe.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => void ensureClubsReady({ requestedClubId: id, force: true })}>
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link to="/clubs">Back to clubs</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (readiness === 'fresh' && id && !club) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Club not found</h1>
        <p className="text-muted-foreground">
          That club is not in the public directory. It may have been removed or is not available
          yet.
        </p>
        <Button asChild>
          <Link to="/clubs">Back to clubs</Link>
        </Button>
      </div>
    );
  }

  return <ClubDetails selectedClub={club} />;
};

export default ClubDetailPage;
