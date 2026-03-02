import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClubStore } from '@/store/clubStore';
import { ClubDetails } from '@/components/clubs/ClubDetails';

/**
 * ClubDetailPage is a thin wrapper around ClubDetails for the /clubs/:id route.
 * Loads the club from the store, constructs breadcrumbs, and renders ClubDetails.
 */
const ClubDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const clubs = useClubStore(state => state.clubs);
  const isLoading = useClubStore(state => state.isLoading);
  const loadClubs = useClubStore(state => state.loadClubs);

  // Load clubs if store is empty (e.g., direct URL navigation)
  useEffect(() => {
    if (clubs.length === 0 && !isLoading) loadClubs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load once on mount

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

  // Redirect to browse page if club not found after loading
  useEffect(() => {
    if (!isLoading && clubs.length > 0 && id && !clubs.find(c => c.id === id)) {
      navigate('/clubs', { replace: true });
    }
  }, [isLoading, clubs, id, navigate]);

  const breadcrumbItems = useMemo(
    () => [{ label: 'Clubs', href: '/clubs' }, ...(club ? [{ label: club.name }] : [])],
    [club]
  );

  if (isLoading || (clubs.length === 0 && !club)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading club...</div>
      </div>
    );
  }

  return <ClubDetails selectedClub={club} breadcrumbItems={breadcrumbItems} />;
};

export default ClubDetailPage;
