import { Show } from '@/types/show-types';
import { UserWithRoles, UserRole } from '@/types/auth-types';
import { SyncableShowEntry } from '@/store/entryStore';

/**
 * Enhanced show management relationship tracking
 * This extends the basic relationship logic with more sophisticated tracking
 */

export interface ShowManagementRelationship {
  showId: string;
  userId: string;
  role: 'secretary' | 'chairman' | 'chief_steward' | 'judge' | 'club_admin';
  startDate: string;
  endDate?: string;
  permissions: string[];
  isActive: boolean;
}

export interface EnhancedShowContext {
  show: Show;
  userRelationships: ShowManagementRelationship[];
  userEntries: SyncableShowEntry[];
  canManage: boolean;
  canJudge: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canViewPrivateData: boolean;
}

/**
 * Track show management relationships over time
 * This allows for historical tracking and role changes
 */
export class ShowManagementTracker {
  private relationships: Map<string, ShowManagementRelationship[]> = new Map();
  private lastUpdate = new Map<string, number>();

  /**
   * Add or update a management relationship
   */
  addRelationship(relationship: ShowManagementRelationship): void {
    const key = `${relationship.showId}-${relationship.userId}`;
    const existing = this.relationships.get(key) || [];
    
    // Deactivate any existing relationships of the same type
    const updated = existing.map(rel => 
      rel.role === relationship.role && rel.isActive
        ? { ...rel, isActive: false, endDate: new Date().toISOString() }
        : rel
    );
    
    // Add new relationship
    updated.push(relationship);
    this.relationships.set(key, updated);
    this.lastUpdate.set(key, Date.now());
  }

  /**
   * Get current active relationships for a user and show
   */
  getActiveRelationships(showId: string, userId: string): ShowManagementRelationship[] {
    const key = `${showId}-${userId}`;
    const relationships = this.relationships.get(key) || [];
    
    return relationships.filter(rel => rel.isActive);
  }

  /**
   * Get all relationships (including historical) for a user and show
   */
  getAllRelationships(showId: string, userId: string): ShowManagementRelationship[] {
    const key = `${showId}-${userId}`;
    return this.relationships.get(key) || [];
  }

  /**
   * Clear cache for a specific user
   */
  clearUserCache(userId: string): void {
    for (const [key] of this.relationships) {
      if (key.includes(`-${userId}`)) {
        this.relationships.delete(key);
        this.lastUpdate.delete(key);
      }
    }
  }

  /**
   * Clear all cached relationships
   */
  clearAllCache(): void {
    this.relationships.clear();
    this.lastUpdate.clear();
  }
}

// Global tracker instance
export const showManagementTracker = new ShowManagementTracker();

/**
 * Extract management relationships from show data
 * This function analyzes show data to identify management relationships
 */
export function extractManagementRelationships(
  show: Show,
  user: UserWithRoles
): ShowManagementRelationship[] {
  const relationships: ShowManagementRelationship[] = [];
  const userId = user.id;
  const userRoles = user.roles || [];

  // Secretary relationship
  if (show.secretary === userId) {
    relationships.push({
      showId: show.id,
      userId,
      role: 'secretary',
      startDate: new Date().toISOString(), // TODO: Get actual start date from show data
      permissions: ['show:update', 'show:manage_entries', 'show:generate_reports'],
      isActive: true
    });
  }

  // Chairman relationship
  if (show.chairman === userId) {
    relationships.push({
      showId: show.id,
      userId,
      role: 'chairman',
      startDate: new Date().toISOString(),
      permissions: ['show:update', 'show:manage_entries', 'show:approve'],
      isActive: true
    });
  }

  // Chief Steward relationship
  if (show.chiefSteward === userId) {
    relationships.push({
      showId: show.id,
      userId,
      role: 'chief_steward',
      startDate: new Date().toISOString(),
      permissions: ['show:manage_entries', 'show:check_in'],
      isActive: true
    });
  }

  // Judge relationships
  if (show.assignedJudges) {
    const judgeAssignment = show.assignedJudges.find(j => j.judgeId === userId);
    if (judgeAssignment) {
      relationships.push({
        showId: show.id,
        userId,
        role: 'judge',
        startDate: judgeAssignment.assignedDate,
        permissions: ['judge:view_assignments', 'judge:enter_results'],
        isActive: true
      });
    }
  }

  // Club admin relationship (if user is admin of the show's club)
  if (userRoles.includes(UserRole.SITE_ADMIN) && show.clubId) {
    // TODO: Check actual club membership when club data is available
    relationships.push({
      showId: show.id,
      userId,
      role: 'club_admin',
      startDate: new Date().toISOString(),
      permissions: ['show:create', 'show:update', 'show:delete', 'show:manage_entries'],
      isActive: true
    });
  }

  return relationships;
}

/**
 * Get enhanced show context with full relationship and permission information
 */
export function getEnhancedShowContext(
  show: Show,
  user: UserWithRoles | null,
  entries: SyncableShowEntry[]
): EnhancedShowContext | null {
  if (!user) return null;

  const userRelationships = extractManagementRelationships(show, user);
  const userEntries = entries.filter(entry => 
    entry.showId === show.id && 
    (entry.registrationData.handler === user.id || entry.dogId.includes(user.id))
  );

  // Determine permissions based on relationships
  const allPermissions = userRelationships.flatMap(rel => rel.permissions);
  const canManage = allPermissions.some(p => p.includes('show:manage') || p.includes('show:update'));
  const canJudge = allPermissions.some(p => p.includes('judge:'));
  const canEdit = allPermissions.some(p => p.includes('show:update'));
  const canDelete = allPermissions.some(p => p.includes('show:delete'));
  const canViewPrivateData = canManage || canJudge;

  return {
    show,
    userRelationships,
    userEntries,
    canManage,
    canJudge,
    canEdit,
    canDelete,
    canViewPrivateData
  };
}

/**
 * Real-time relationship synchronization
 * This function can be called when show data changes to update relationships
 */
export function syncShowRelationships(
  shows: Show[],
  user: UserWithRoles | null
): void {
  if (!user) return;

  // Clear existing relationships for this user
  showManagementTracker.clearUserCache(user.id);

  // Extract and store new relationships
  shows.forEach(show => {
    const relationships = extractManagementRelationships(show, user);
    relationships.forEach(rel => {
      showManagementTracker.addRelationship(rel);
    });
  });
}

/**
 * Get shows that user can manage
 */
export function getManagedShows(
  shows: Show[],
  user: UserWithRoles | null
): Show[] {
  if (!user) return [];

  return shows.filter(show => {
    const relationships = showManagementTracker.getActiveRelationships(show.id, user.id);
    return relationships.length > 0 || 
           show.secretary === user.id || 
           show.chairman === user.id ||
           user.roles?.includes(UserRole.SITE_ADMIN);
  });
}

/**
 * Get shows that user is judging
 */
export function getJudgingShows(
  shows: Show[],
  user: UserWithRoles | null
): Show[] {
  if (!user) return [];

  return shows.filter(show => {
    const relationships = showManagementTracker.getActiveRelationships(show.id, user.id);
    return relationships.some(rel => rel.role === 'judge') ||
           show.assignedJudges?.some(j => j.judgeId === user.id);
  });
}

/**
 * Performance monitoring for relationship tracking
 */
export class RelationshipPerformanceMonitor {
  private static instance: RelationshipPerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();
  private enabled: boolean;

  constructor() {
    // Only enable in development or when explicitly requested
    this.enabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_PERFORMANCE_MONITORING === 'true';
  }

  static getInstance(): RelationshipPerformanceMonitor {
    if (!RelationshipPerformanceMonitor.instance) {
      RelationshipPerformanceMonitor.instance = new RelationshipPerformanceMonitor();
    }
    return RelationshipPerformanceMonitor.instance;
  }

  recordOperation(operation: string, duration: number): void {
    // Skip recording if monitoring is disabled for better performance
    if (!this.enabled) return;
    
    const existing = this.metrics.get(operation) || [];
    existing.push(duration);
    
    // Keep only last 100 measurements
    if (existing.length > 100) {
      existing.shift();
    }
    
    this.metrics.set(operation, existing);
  }

  getAverageTime(operation: string): number {
    const times = this.metrics.get(operation) || [];
    return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  }

  getMetrics(): Record<string, { average: number; count: number }> {
    const result: Record<string, { average: number; count: number }> = {};
    
    for (const [operation, times] of this.metrics) {
      result[operation] = {
        average: this.getAverageTime(operation),
        count: times.length
      };
    }
    
    return result;
  }
}