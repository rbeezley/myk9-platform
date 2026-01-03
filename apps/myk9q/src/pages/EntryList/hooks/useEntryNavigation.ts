import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrefetch } from '@/hooks/usePrefetch';
import { getScoresheetRoute } from '../../../services/scoresheetRouter';
import { preloadScoresheetByType } from '../../../utils/scoresheetPreloader';
import { markInRing } from '../../../services/entryService';
import { Entry } from '../../../stores/entryStore';
import { UserPermissions } from '../../../utils/auth';
import { logger } from '@/utils/logger';

interface UseEntryNavigationOptions {
  /** Show context with organization info */
  showContext?: {
    org?: string;
    competition_type?: string;
  } | null;
  /** For single class view - class ID from route params */
  classId?: string;
  /** For combined class view - class ID A from route params */
  classIdA?: string;
  /** For combined class view - class ID B from route params */
  classIdB?: string;
  /** Permission checker function */
  hasPermission: (permission: keyof UserPermissions) => boolean;
  /** Pending entries for sequential prefetch */
  pendingEntries: Entry[];
  /** Local entries for ring status management */
  localEntries: Entry[];
  /** Setter for local entries state */
  setLocalEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
}

/**
 * Parse organization data from org string
 */
export function parseOrganizationData(orgString: string) {
  if (!orgString || orgString.trim() === '') {
    return {
      organization: 'AKC',
      activity_type: 'Scent Work'
    };
  }

  const parts = orgString.split(' ');
  return {
    organization: parts[0],
    activity_type: parts.slice(1).join(' '),
  };
}

/**
 * Shared hook for entry navigation, scoresheet routing, and prefetch logic.
 * Used by both EntryList and CombinedEntryList.
 */
export const useEntryNavigation = ({
  showContext,
  classId,
  classIdA,
  classIdB,
  hasPermission,
  pendingEntries,
  localEntries,
  setLocalEntries,
}: UseEntryNavigationOptions) => {
  const navigate = useNavigate();
  const { prefetch } = usePrefetch();

  const isCombinedView = !!(classIdA && classIdB);

  /**
   * Get scoresheet route for an entry
   */
  const getScoreSheetRoute = useCallback((entry: Entry): string => {
    return getScoresheetRoute({
      org: showContext?.org || '',
      element: entry.element || '',
      level: entry.level || '',
      classId: isCombinedView ? entry.classId : Number(classId),
      entryId: entry.id,
      competition_type: showContext?.competition_type || 'Regular'
    });
  }, [showContext?.org, showContext?.competition_type, classId, isCombinedView]);

  /**
   * Set dog in ring status, clearing other in-ring dogs first
   *
   * IMPORTANT: We pass the entry's current status to markInRing so it can be
   * restored when the scoresheet is canceled (user clicked wrong dog).
   */
  const setDogInRingStatus = useCallback(async (dogId: number, inRing: boolean) => {
    try {
      const currentDog = localEntries.find(entry => entry.id === dogId);

      if (inRing) {
        if (currentDog?.status !== 'in-ring') {
          const otherEntries = localEntries.filter(entry => entry.id !== dogId && entry.status === 'in-ring');
          if (otherEntries.length > 0) {
            await Promise.all(
              // Pass each entry's current status so it can be restored if needed
              otherEntries.map(entry => markInRing(entry.id, false))
            );
          }
        }
      }

      // Check using status field (not deprecated inRing property)
      const isCurrentlyInRing = currentDog?.status === 'in-ring';
      if (isCurrentlyInRing !== inRing) {
        // Pass the entry's current status so it can be saved and restored on cancel
        await markInRing(dogId, inRing, currentDog?.status);
      }
      return true;
    } catch (error) {
      logger.error('Error setting dog ring status:', error);
      return false;
    }
  }, [localEntries]);

  /**
   * Handle entry click for single class view (sets in-ring status)
   */
  const handleEntryClick = useCallback((entry: Entry) => {
    if (entry.isScored) {
      return;
    }

    if (!hasPermission('canScore')) {
      alert('You do not have permission to score entries.');
      return;
    }

    // Navigate immediately - don't wait for status update
    // The scoresheet will mark the entry as in-ring when it loads
    const route = getScoreSheetRoute(entry);

    // Fire-and-forget: update local UI state and DB in background
    // This ensures navigation happens instantly on first click
    if (entry.id && !entry.isScored) {
      // Update local state immediately for visual feedback
      setLocalEntries(prev => prev.map(e =>
        e.id === entry.id ? { ...e, inRing: true, status: 'in-ring' } : e
      ));

      // Background DB update (scoresheet will also call markInRing, but this updates other users' views)
      setDogInRingStatus(entry.id, true).catch(error => {
        logger.error('Failed to update in-ring status:', error);
      });
    }

    navigate(route);
  }, [hasPermission, setDogInRingStatus, setLocalEntries, getScoreSheetRoute, navigate]);

  /**
   * Handle score click for combined class view (navigates with paired class ID)
   */
  const handleScoreClick = useCallback((entry: Entry) => {
    if (entry.isScored) {
      return;
    }

    if (!hasPermission('canScore')) {
      alert('You do not have permission to score entries.');
      return;
    }

    if (!classIdA || !classIdB) {
      logger.error('Combined view missing class IDs');
      return;
    }

    // Determine the paired class ID (the class the entry does NOT belong to)
    const pairedClassId = entry.classId === parseInt(classIdA)
      ? parseInt(classIdB)
      : parseInt(classIdA);

    // Route to single-class scoresheet using the entry's actual class_id
    // Pass pairedClassId via location state so scoresheet knows to update both classes
    const orgData = parseOrganizationData(showContext?.org || '');
    const element = entry.element || '';

    const navigationState = { pairedClassId };

    if (orgData.organization === 'AKC') {
      if (orgData.activity_type === 'Scent Work' || orgData.activity_type === 'ScentWork') {
        navigate(`/scoresheet/akc-scent-work/${entry.classId}/${entry.id}`, { state: navigationState });
      } else if (orgData.activity_type === 'FastCat' || orgData.activity_type === 'Fast Cat') {
        navigate(`/scoresheet/akc-fastcat/${entry.classId}/${entry.id}`, { state: navigationState });
      }
    } else if (orgData.organization === 'UKC') {
      if (orgData.activity_type === 'Nosework') {
        navigate(`/scoresheet/ukc-nosework/${entry.classId}/${entry.id}`, { state: navigationState });
      } else if (element === 'Obedience') {
        navigate(`/scoresheet/ukc-obedience/${entry.classId}/${entry.id}`, { state: navigationState });
      } else if (element === 'Rally') {
        navigate(`/scoresheet/ukc-rally/${entry.classId}/${entry.id}`, { state: navigationState });
      }
    }
  }, [hasPermission, classIdA, classIdB, showContext?.org, navigate]);

  /**
   * Prefetch scoresheet data when hovering/touching entry card
   */
  const handleEntryPrefetch = useCallback((entry: Entry) => {
    if (entry.isScored || !showContext?.org) return;

    const route = getScoreSheetRoute(entry);

    // Preload scoresheet JavaScript bundle (parallel to data prefetch)
    preloadScoresheetByType(showContext.org, entry.element || '');

    // Prefetch current entry (high priority)
    prefetch(
      `scoresheet-${entry.id}`,
      async () => {
        return { entryId: entry.id, route, entry };
      },
      {
        ttl: 30, // 30 seconds cache (scoring data changes frequently)
        priority: 3 // High priority - likely next action
      }
    );

    // Sequential prefetch: Also prefetch next 2-3 entries in the list
    const currentIndex = pendingEntries.findIndex(e => e.id === entry.id);
    if (currentIndex !== -1) {
      // Prefetch next 2 entries with lower priority
      const nextEntries = pendingEntries.slice(currentIndex + 1, currentIndex + 3);
      nextEntries.forEach((nextEntry, offset) => {
        const nextRoute = getScoreSheetRoute(nextEntry);
        prefetch(
          `scoresheet-${nextEntry.id}`,
          async () => {
            return { entryId: nextEntry.id, route: nextRoute, entry: nextEntry };
          },
          {
            ttl: 30,
            priority: 2 - offset // Priority 2 for next entry, 1 for entry after
          }
        );
      });
    }
  }, [showContext, prefetch, pendingEntries, getScoreSheetRoute]);

  return {
    /** Get scoresheet route for an entry */
    getScoreSheetRoute,
    /** Handle entry click for single class view */
    handleEntryClick,
    /** Handle score click for combined class view */
    handleScoreClick,
    /** Prefetch handler for entry hover */
    handleEntryPrefetch,
    /** Parse organization data utility */
    parseOrganizationData,
    /** Whether this is a combined view */
    isCombinedView,
  };
};
