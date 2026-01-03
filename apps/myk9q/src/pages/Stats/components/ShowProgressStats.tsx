/**
 * ShowProgressStats Component
 *
 * Displays 4 key show progress metrics in the same card style as other Stats cards:
 * - Unread announcements
 * - Favorite dogs with pending entries
 * - Classes in progress
 * - Completion percentage
 *
 * Uses proper license_key filtering for accurate data.
 */

import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Heart, Clock, CheckCircle } from 'lucide-react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useAnnouncementStore } from '@/stores/announcementStore';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import { loadFavoritesAsSet } from '@/utils/favoritesUtils';
import type { Class, Entry, Trial } from '@/services/replication';
import { logger } from '@/utils/logger';
import './ShowProgressStats.css';

interface ShowProgressStatsProps {
  trialId?: string;
}

interface ProgressStats {
  unreadAnnouncements: number;
  favoritesCount: number;
  activeClasses: number;
  completedClasses: number;
  totalClasses: number;
  completionPercent: number;
}

/**
 * Fetch show progress stats with proper license_key filtering
 */
async function fetchShowProgressStats(
  licenseKey: string,
  showId: string | number
): Promise<ProgressStats> {
  try {
    const manager = await ensureReplicationManager();
    const classesTable = manager.getTable('classes');
    const entriesTable = manager.getTable('entries');
    const trialsTable = manager.getTable('trials');

    if (!classesTable || !entriesTable || !trialsTable) {
      logger.warn('[ShowProgressStats] Required tables not available');
      return {
        unreadAnnouncements: 0,
        favoritesCount: 0,
        activeClasses: 0,
        completedClasses: 0,
        totalClasses: 0,
        completionPercent: 0,
      };
    }

    // Get all data
    const allTrials = (await trialsTable.getAll()) as Trial[];
    const allClasses = (await classesTable.getAll()) as Class[];
    const allEntries = (await entriesTable.getAll()) as Entry[];

    // Filter trials to current show
    const showTrials = allTrials.filter(t => String(t.show_id) === String(showId));
    const showTrialIds = new Set(showTrials.map(t => String(t.id)));

    // Filter classes to current show's trials
    const showClasses = allClasses.filter(c => showTrialIds.has(String(c.trial_id)));

    // Filter entries to current license_key
    const showEntries = allEntries.filter(e => e.license_key === licenseKey);

    // Build set of class IDs that have entries
    const classIdsWithEntries = new Set(showEntries.map(e => String(e.class_id)));

    // Count active classes (only classes with entries can be "in progress")
    const activeClasses = showClasses.filter(c =>
      c.class_status === 'in_progress' || c.class_status === 'in-progress'
    ).length;

    // Count completed classes: either marked completed OR has no entries
    const completedClasses = showClasses.filter(c =>
      c.class_status === 'completed' || !classIdsWithEntries.has(String(c.id))
    ).length;

    const totalClasses = showClasses.length;
    const completionPercent = totalClasses > 0
      ? Math.round((completedClasses / totalClasses) * 100)
      : 0;

    // Get total count of favorite dogs
    const favoriteDogs = loadFavoritesAsSet('dog', licenseKey);
    const favoritesCount = favoriteDogs.size;

    logger.log(`[ShowProgressStats] Stats: ${activeClasses} active, ${completedClasses}/${totalClasses} completed, ${favoritesCount} favorites`);

    return {
      unreadAnnouncements: 0, // Will be filled from store
      favoritesCount,
      activeClasses,
      completedClasses,
      totalClasses,
      completionPercent,
    };
  } catch (error) {
    logger.error('[ShowProgressStats] Error fetching stats:', error);
    return {
      unreadAnnouncements: 0,
      favoritesCount: 0,
      activeClasses: 0,
      completedClasses: 0,
      totalClasses: 0,
      completionPercent: 0,
    };
  }
}

export function ShowProgressStats({ trialId }: ShowProgressStatsProps) {
  const navigate = useNavigate();
  const hapticFeedback = useHapticFeedback();
  const { showContext } = useAuth();
  const licenseKey = showContext?.licenseKey;
  const showId = showContext?.showId;

  // Get unread count from announcement store
  const { unreadCount, setLicenseKey, currentLicenseKey, fetchAnnouncements } = useAnnouncementStore();

  // Ensure announcement store is initialized for current license key
  // If license key differs, setLicenseKey triggers a fetch
  // If same license key, we still fetch to ensure fresh data (handles expired announcements)
  useEffect(() => {
    if (!showContext?.licenseKey) return;

    if (currentLicenseKey !== showContext.licenseKey) {
      // Different license key - setLicenseKey will fetch
      setLicenseKey(showContext.licenseKey, showContext.showName);
    } else {
      // Same license key - fetch directly to get fresh data
      // This ensures expired announcements are properly excluded
      fetchAnnouncements(showContext.licenseKey);
    }
  }, [showContext, currentLicenseKey, setLicenseKey, fetchAnnouncements]);

  // Fetch progress stats with proper filtering
  const { data: stats } = useQuery({
    queryKey: ['showProgressStats', licenseKey, showId],
    queryFn: () => fetchShowProgressStats(licenseKey!, showId!),
    enabled: !!licenseKey && !!showId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Merge announcement count with other stats
  const mergedStats = useMemo((): ProgressStats => {
    return {
      unreadAnnouncements: unreadCount,
      favoritesCount: stats?.favoritesCount ?? 0,
      activeClasses: stats?.activeClasses ?? 0,
      completedClasses: stats?.completedClasses ?? 0,
      totalClasses: stats?.totalClasses ?? 0,
      completionPercent: stats?.completionPercent ?? 0,
    };
  }, [unreadCount, stats]);

  const handleCardClick = (card: 'announcements' | 'favorites' | 'active' | 'progress') => {
    hapticFeedback.light();

    switch (card) {
      case 'announcements':
        navigate('/announcements');
        break;
      case 'favorites':
        navigate('/home', { state: { filter: 'favorites' } });
        break;
      case 'active':
        if (trialId) {
          navigate(`/trial/${trialId}/classes`);
        }
        break;
      case 'progress':
        if (trialId) {
          navigate(`/trial/${trialId}/classes`, { state: { filter: 'completed' } });
        }
        break;
    }
  };

  return (
    <div className="show-progress-stats">
      {/* Unread Announcements */}
      <div
        className="stats-card stats-card--clickable"
        onClick={() => handleCardClick('announcements')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleCardClick('announcements')}
      >
        <div className="card-icon announcements">
          <Bell />
        </div>
        <div className="card-content">
          <h3>Messages</h3>
          <p className="card-value">{mergedStats.unreadAnnouncements}</p>
          <p className="card-subtitle">unread</p>
        </div>
      </div>

      {/* Favorites */}
      <div
        className="stats-card stats-card--clickable"
        onClick={() => handleCardClick('favorites')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleCardClick('favorites')}
      >
        <div className="card-icon favorites">
          <Heart />
        </div>
        <div className="card-content">
          <h3>Favorites</h3>
          <p className="card-value">{mergedStats.favoritesCount}</p>
          <p className="card-subtitle">{mergedStats.favoritesCount === 1 ? 'dog' : 'dogs'}</p>
        </div>
      </div>

      {/* Classes In Progress */}
      <div
        className={`stats-card ${trialId ? 'stats-card--clickable' : ''}`}
        onClick={() => trialId && handleCardClick('active')}
        role={trialId ? 'button' : undefined}
        tabIndex={trialId ? 0 : undefined}
        onKeyDown={(e) => trialId && e.key === 'Enter' && handleCardClick('active')}
      >
        <div className="card-icon in-progress">
          <Clock />
        </div>
        <div className="card-content">
          <h3>In Progress</h3>
          <p className="card-value">{mergedStats.activeClasses}</p>
          <p className="card-subtitle">{mergedStats.activeClasses === 1 ? 'class' : 'classes'}</p>
        </div>
      </div>

      {/* Completion */}
      <div
        className={`stats-card ${trialId ? 'stats-card--clickable' : ''}`}
        onClick={() => trialId && handleCardClick('progress')}
        role={trialId ? 'button' : undefined}
        tabIndex={trialId ? 0 : undefined}
        onKeyDown={(e) => trialId && e.key === 'Enter' && handleCardClick('progress')}
      >
        <div className="card-icon completion">
          <CheckCircle />
        </div>
        <div className="card-content">
          <h3>Classes</h3>
          <p className="card-value">{mergedStats.completionPercent}%</p>
          <p className="card-subtitle">{mergedStats.completedClasses} of {mergedStats.totalClasses} done</p>
        </div>
      </div>
    </div>
  );
}

export default ShowProgressStats;
