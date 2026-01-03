/**
 * ShowDetails Page
 *
 * Displays show information:
 * - Event details (organization, dates)
 * - Location and venue
 * - Contact information (secretary, chairman)
 * - Notes
 *
 * Accessible from hamburger menu as "Show Details".
 */

import { useEffect, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { User } from 'lucide-react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useLongPress } from '@/hooks/useLongPress';
import { logger } from '@/utils/logger';
import { useAuth } from '@/contexts/AuthContext';
import { useAnnouncementStore } from '@/stores/announcementStore';
import { replicatedShowsTable } from '@/services/replication';
import {
  ShowDetailsHeader,
  ShowDetailsLoading,
  ShowDetailsError,
  ContactCard,
  NotesCard,
  LocationCard,
  EventDetailsCard,
  UpcomingShowsCard
} from './ShowDetailsComponents';
import { getSecretaryInfo, getChairmanInfo } from './showDetailsUtils';
import { useDashboardData } from './hooks/useDashboardData';
import './ShowDetails.css';

export function ShowDetails() {
  const { licenseKey: urlLicenseKey } = useParams<{ licenseKey: string }>();
  const navigate = useNavigate();
  const { showContext } = useAuth();
  const hapticFeedback = useHapticFeedback();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Use URL param or auth context
  const licenseKey = urlLicenseKey || showContext?.licenseKey;
  const showId = showContext?.showId;

  // Initialize announcement store with current license key
  const { setLicenseKey } = useAnnouncementStore();

  useEffect(() => {
    if (licenseKey) {
      setLicenseKey(licenseKey, showContext?.showName);
    }
  }, [licenseKey, showContext?.showName, setLicenseKey]);

  // Use dashboard data hook for show data
  const {
    show,
    isLoading,
    error,
    refetch,
  } = useDashboardData(licenseKey, showId);

  // Fetch all shows for upcoming shows section
  const { data: allShows = [] } = useQuery({
    queryKey: ['allShows'],
    queryFn: () => replicatedShowsTable.getAllShows(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Handle refresh - full refresh when user explicitly taps refresh button
  // Uses forceSync=true to fetch fresh data from server first
  const handleRefresh = useCallback(async () => {
    hapticFeedback.medium();
    setIsManualRefreshing(true);

    // Ensure minimum 500ms feedback so users see something happened
    const minFeedbackDelay = new Promise(resolve => setTimeout(resolve, 500));

    try {
      await Promise.all([refetch({ all: true, forceSync: true }), minFeedbackDelay]);
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refetch, hapticFeedback]);

  // Hard refresh (full page reload) - triggered by long press on refresh button
  const handleHardRefresh = useCallback(() => {
    logger.log('[ShowDetails] Hard refresh triggered via long press');
    window.location.reload();
  }, []);

  // Long press handler for refresh button
  const refreshLongPressHandlers = useLongPress(handleHardRefresh, {
    delay: 800,
    enabled: !isManualRefreshing,
  });

  // Loading state
  if (isLoading) {
    return <ShowDetailsLoading />;
  }

  // Error state
  if (error || !show) {
    return <ShowDetailsError error={error} onBack={() => navigate('/home')} />;
  }

  // Get contact info
  const secretaryInfo = getSecretaryInfo(show);
  const chairmanInfo = getChairmanInfo(show);

  return (
    <div className="show-details-container">
      <ShowDetailsHeader
        subtitle={showContext?.showName || show.show_name}
        isRefreshing={isManualRefreshing}
        onRefresh={handleRefresh}
        showRefreshButton
        refreshLongPressHandlers={refreshLongPressHandlers}
      />

      <main className="show-details-content">
        <div className="show-details-info-grid">
          <EventDetailsCard show={show} />
          <LocationCard show={show} />
          <ContactCard
            title="Trial Secretary"
            icon={<User />}
            contact={secretaryInfo}
          />
          <ContactCard
            title="Trial Chairman"
            icon={<User />}
            contact={chairmanInfo}
          />
          <NotesCard notes={show.notes} />
          <UpcomingShowsCard
            shows={allShows}
            currentLicenseKey={licenseKey}
            organization={show.organization}
          />
        </div>
      </main>
    </div>
  );
}

export default ShowDetails;
