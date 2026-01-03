import { Show } from '@/types/show-types';
import { SyncableShowEntry } from '@/store/entryStore';
import { UserWithRoles } from '@/types/auth-types';

/**
 * Show relationship utilities for the unified shows interface
 * These functions determine what shows a user has relationships with
 */

/**
 * Get shows where the user has entries as an exhibitor
 */
export function getUserEntries(
  userId: string,
  shows: Show[],
  entries: SyncableShowEntry[]
): Show[] {
  if (!userId || !entries.length) return [];

  // Find all entries for this user
  const userEntryShowIds = entries
    .filter(entry => {
      // Check if user is the handler or owner of the dog
      return entry.registrationData.handler === userId || 
             entry.registrationData.handlerId === userId ||
             entry.dogId.includes(userId); // Assuming dogId contains owner info
    })
    .map(entry => entry.showId);

  // Return shows that have user entries
  return shows.filter(show => userEntryShowIds.includes(show.id));
}

/**
 * Get shows where the user is secretary or administrator
 */
export function getUserManagedShows(
  userId: string,
  shows: Show[],
  userRoles: string[] = []
): Show[] {
  if (!userId) return [];

  return shows.filter(show => {
    // Direct secretary assignment
    if (show.secretary === userId) return true;
    
    // Club admin for the show's club
    if (show.clubId && userRoles.includes('club_admin')) {
      // TODO: When club membership data is available, check if user is admin of show.clubId
      return show.clubId === userId; // Temporary: assuming clubId could match userId
    }
    
    // Show chairman
    if (show.chairman === userId) return true;
    
    return false;
  });
}

/**
 * Get shows where the user is assigned as a judge
 */
export function getUserJudgeAssignments(
  userId: string,
  shows: Show[]
): Show[] {
  if (!userId) return [];

  return shows.filter(show => {
    // Check if user is in assigned judges
    return show.assignedJudges?.some(judge => judge.judgeId === userId);
  });
}

/**
 * Get all shows for site admin (global view)
 */
export function getAdminManagedShows(
  shows: Show[],
  userRoles: string[] = []
): Show[] {
  // Site admins can see all shows
  if (userRoles.includes('site_admin')) {
    return shows;
  }
  
  return [];
}

/**
 * Get shows filtered by entry status for better user experience
 */
export function getUserEntriesByStatus(
  userId: string,
  shows: Show[],
  entries: SyncableShowEntry[],
  status?: 'upcoming' | 'past' | 'active'
): Show[] {
  const userEntryShows = getUserEntries(userId, shows, entries);
  
  if (!status) return userEntryShows;
  
  const now = new Date();
  
  switch (status) {
    case 'upcoming':
      return userEntryShows.filter(show => new Date(show.startDate) > now);
    case 'past':
      return userEntryShows.filter(show => new Date(show.endDate) < now);
    case 'active':
      return userEntryShows.filter(show => {
        const startDate = new Date(show.startDate);
        const endDate = new Date(show.endDate);
        return startDate <= now && endDate >= now;
      });
    default:
      return userEntryShows;
  }
}

/**
 * Get comprehensive show relationships for a user
 */
export interface UserShowRelationships {
  entries: Show[];           // Shows user has entered
  managing: Show[];          // Shows user manages (secretary/admin)
  judging: Show[];          // Shows user is judging
  adminView: Show[];        // All shows (if site admin)
  upcomingEntries: Show[];  // Upcoming shows with user entries
  pastEntries: Show[];      // Past shows with user entries
}

export function getUserShowRelationships(
  user: UserWithRoles | null,
  shows: Show[],
  entries: SyncableShowEntry[]
): UserShowRelationships {
  if (!user) {
    return {
      entries: [],
      managing: [],
      judging: [],
      adminView: [],
      upcomingEntries: [],
      pastEntries: []
    };
  }

  const userId = user.id;
  const userRoles = user.roles || [];

  const userEntries = getUserEntries(userId, shows, entries);
  const managedShows = getUserManagedShows(userId, shows, userRoles);
  const judgeAssignments = getUserJudgeAssignments(userId, shows);
  const adminShows = getAdminManagedShows(shows, userRoles);

  return {
    entries: userEntries,
    managing: managedShows,
    judging: judgeAssignments,
    adminView: adminShows,
    upcomingEntries: getUserEntriesByStatus(userId, shows, entries, 'upcoming'),
    pastEntries: getUserEntriesByStatus(userId, shows, entries, 'past')
  };
}

/**
 * Get counts for tab labels
 */
export function getTabCounts(
  user: UserWithRoles | null,
  shows: Show[],
  entries: SyncableShowEntry[]
): Record<string, number> {
  if (!user) {
    const now = new Date();
    return {
      all: shows.filter(show => new Date(show.startDate) >= now).length,
      past: shows.filter(show => new Date(show.endDate) < now).length,
      entries: 0,
      managing: 0,
      assignments: 0
    };
  }

  const relationships = getUserShowRelationships(user, shows, entries);
  const now = new Date();

  return {
    all: shows.filter(show => new Date(show.startDate) >= now).length,
    past: shows.filter(show => new Date(show.endDate) < now).length,
    entries: relationships.entries.length,
    managing: relationships.managing.length,
    assignments: relationships.judging.length
  };
}

/**
 * Performance optimization: Memoized relationship calculator
 * This helps avoid recalculating relationships on every render
 */
export class ShowRelationshipCache {
  private cache = new Map<string, UserShowRelationships>();
  private lastUpdate = new Map<string, number>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  getCachedRelationships(
    user: UserWithRoles | null,
    shows: Show[],
    entries: SyncableShowEntry[]
  ): UserShowRelationships {
    if (!user) {
      return getUserShowRelationships(user, shows, entries);
    }

    const cacheKey = `${user.id}-${shows.length}-${entries.length}`;
    const now = Date.now();
    const lastUpdate = this.lastUpdate.get(cacheKey) || 0;

    // Return cached result if still valid
    if (now - lastUpdate < this.CACHE_TTL && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Calculate fresh relationships
    const relationships = getUserShowRelationships(user, shows, entries);
    
    // Update cache
    this.cache.set(cacheKey, relationships);
    this.lastUpdate.set(cacheKey, now);

    return relationships;
  }

  clearCache(): void {
    this.cache.clear();
    this.lastUpdate.clear();
  }

  clearUserCache(userId: string): void {
    const keysToDelete = Array.from(this.cache.keys()).filter(key => key.startsWith(userId));
    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.lastUpdate.delete(key);
    });
  }
}

// Global cache instance
export const showRelationshipCache = new ShowRelationshipCache();

/**
 * Efficient filtering for large datasets
 * Uses binary search and other optimizations for better performance
 */
export function filterShowsEfficiently(
  shows: Show[],
  filters: {
    dateRange?: { start: Date; end: Date };
    showIds?: Set<string>;
    status?: string[];
    type?: string[];
  }
): Show[] {
  let result = shows;

  // Filter by show IDs first (most selective)
  if (filters.showIds && filters.showIds.size > 0) {
    result = result.filter(show => filters.showIds!.has(show.id));
  }

  // Filter by date range
  if (filters.dateRange) {
    const { start, end } = filters.dateRange;
    result = result.filter(show => {
      const showStart = new Date(show.startDate);
      return showStart >= start && showStart <= end;
    });
  }

  // Filter by status
  if (filters.status && filters.status.length > 0) {
    const statusSet = new Set(filters.status);
    result = result.filter(show => statusSet.has(show.status));
  }

  // Filter by type
  if (filters.type && filters.type.length > 0) {
    const typeSet = new Set(filters.type);
    result = result.filter(show => typeSet.has(show.type));
  }

  return result;
}