import { supabase } from '../lib/supabase';
import type { Announcement } from '../stores/announcementStore';
import { logger } from '@/utils/logger';
import {
  replicatedAnnouncementsTable,
  replicatedAnnouncementReadsTable,
} from '@/services/replication';

export interface CreateAnnouncementData {
  title: string;
  content: string;
  priority: 'normal' | 'high' | 'urgent';
  author_role: 'admin' | 'judge' | 'steward';
  author_name?: string;
  expires_at?: string;
  license_key: string;
}

export interface UpdateAnnouncementData {
  title?: string;
  content?: string;
  priority?: 'normal' | 'high' | 'urgent';
  author_name?: string;
  expires_at?: string;
}

export interface AnnouncementFilters {
  priority?: 'normal' | 'high' | 'urgent';
  author_role?: 'admin' | 'judge' | 'steward';
  searchTerm?: string;
  showExpired?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Service for managing announcements with tenant isolation
 * All operations are filtered by license_key to ensure tenant isolation
 */
export class AnnouncementService {

  /**
   * Fetch announcements for a specific license key
   * Uses replicated table for offline-first access
   */
  static async getAnnouncements(
    licenseKey: string,
    filters: AnnouncementFilters = {}
  ): Promise<{ data: Announcement[]; count: number }> {
    try {
// Get all announcements from replicated table (already filtered by license_key during sync)
      let announcements = await replicatedAnnouncementsTable.getAll();

      // Apply active filter
      announcements = announcements.filter(a => a.is_active);

      // Apply filters
      if (filters.priority) {
        announcements = announcements.filter(a => a.priority === filters.priority);
      }

      if (filters.author_role) {
        announcements = announcements.filter(a => a.author_role === filters.author_role);
      }

      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        announcements = announcements.filter(a =>
          a.title.toLowerCase().includes(searchLower) ||
          a.content.toLowerCase().includes(searchLower) ||
          (a.author_name && a.author_name.toLowerCase().includes(searchLower))
        );
      }

      if (!filters.showExpired) {
        const now = new Date().toISOString();
        announcements = announcements.filter(a => !a.expires_at || a.expires_at > now);
      }

      // Sort by created_at descending (newest first)
      announcements.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Apply pagination
      const totalCount = announcements.length;
      if (filters.offset) {
        announcements = announcements.slice(filters.offset);
      }
      if (filters.limit) {
        announcements = announcements.slice(0, filters.limit);
      }

      // Transform from ReplicatedAnnouncement (string id) to Announcement (number id)
      const transformedData: Announcement[] = announcements.map(a => ({
        ...a,
        id: parseInt(a.id, 10),
        author_name: a.author_name || undefined,
        expires_at: a.expires_at || undefined,
      }));

// If cache is empty, fall back to Supabase (cache may still be syncing)
      if (transformedData.length === 0) {
// Fall through to Supabase query below
      } else {
        return {
          data: transformedData,
          count: totalCount
        };
      }

    } catch (error) {
      logger.error('Error fetching announcements from cache, falling back to Supabase:', error);
    }

    // Fall back to original Supabase implementation
try {
      let query = supabase
        .from('announcements')
        .select('*', { count: 'exact' })
        .eq('license_key', licenseKey)
        .eq('is_active', true);

      // Apply filters
      if (filters.priority) {
        query = query.eq('priority', filters.priority);
      }

      if (filters.author_role) {
        query = query.eq('author_role', filters.author_role);
      }

      if (filters.searchTerm) {
        query = query.or(`title.ilike.%${filters.searchTerm}%,content.ilike.%${filters.searchTerm}%,author_name.ilike.%${filters.searchTerm}%`);
      }

      if (!filters.showExpired) {
        const now = new Date().toISOString();
        query = query.or(`expires_at.is.null,expires_at.gt.${now}`);
      }

      // Apply pagination
      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
      } else if (filters.limit) {
        query = query.limit(filters.limit);
      }

      // Sort by created_at descending (newest first)
      query = query.order('created_at', { ascending: false });

      const { data, count, error } = await query;

      if (error) throw error;

return {
        data: data || [],
        count: count || 0
      };

    } catch (error) {
      logger.error('Error fetching announcements from Supabase:', error);
      throw error;
    }
  }

  /**
   * Get a specific announcement by ID with license key validation
   * Uses replicated table for offline-first access
   */
  static async getAnnouncement(id: number, licenseKey: string): Promise<Announcement | null> {
    try {
      const announcement = await replicatedAnnouncementsTable.get(id.toString());

      if (!announcement) {
        return null; // Not found
      }

      // Verify license key for multi-tenant security
      if (announcement.license_key !== licenseKey) {
        logger.warn('License key mismatch for announcement', id);
        return null;
      }

      // Verify is_active
      if (!announcement.is_active) {
        return null;
      }

      // Transform to Announcement type (number id)
      return {
        ...announcement,
        id: parseInt(announcement.id, 10),
        author_name: announcement.author_name || undefined,
        expires_at: announcement.expires_at || undefined,
      };

    } catch (error) {
      logger.error('Error fetching announcement:', error);
      throw error;
    }
  }

  /**
   * Create a new announcement
   */
  static async createAnnouncement(announcementData: CreateAnnouncementData): Promise<Announcement> {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .insert(announcementData)
        .select()
        .single();

      if (error) throw error;

// CRITICAL: Trigger immediate sync to update UI without refresh
      // This ensures the new announcement appears in the list immediately
      try {
        const { getReplicationManager } = await import('./replication');
        const manager = getReplicationManager();
        if (manager) {
await manager.syncTable('announcements', { forceFullSync: false });
} else {
          logger.warn('[createAnnouncement] Replication manager not available, UI may not update until next sync');
        }
      } catch (syncError) {
        logger.warn('[createAnnouncement] Failed to trigger immediate sync (non-critical):', syncError);
      }

      return data;

    } catch (error) {
      logger.error('Error creating announcement:', error);
      throw error;
    }
  }

  /**
   * Update an existing announcement with authorization check
   */
  static async updateAnnouncement(
    id: number,
    updates: UpdateAnnouncementData,
    licenseKey: string,
    userRole: 'admin' | 'judge' | 'steward' | 'exhibitor'
  ): Promise<Announcement> {
    try {
      // First, check if announcement exists and user has permission
      const existing = await this.getAnnouncement(id, licenseKey);
      if (!existing) {
        throw new Error('Announcement not found');
      }

      // Permission check: Admin can edit all, others can only edit their own role's announcements
      if (userRole !== 'admin' && existing.author_role !== userRole) {
        throw new Error('Insufficient permissions to edit this announcement');
      }

      const { data, error } = await supabase
        .from('announcements')
        .update(updates)
        .eq('id', id)
        .eq('license_key', licenseKey)
        .select()
        .single();

      if (error) throw error;

// CRITICAL: Trigger immediate sync to update UI without refresh
      try {
        const { getReplicationManager } = await import('./replication');
        const manager = getReplicationManager();
        if (manager) {
await manager.syncTable('announcements', { forceFullSync: false });
}
      } catch (syncError) {
        logger.warn('[updateAnnouncement] Failed to trigger immediate sync (non-critical):', syncError);
      }

      return data;

    } catch (error) {
      logger.error('Error updating announcement:', error);
      throw error;
    }
  }

  /**
   * Soft delete an announcement (set is_active = false)
   */
  static async deleteAnnouncement(
    id: number,
    licenseKey: string,
    userRole: 'admin' | 'judge' | 'steward' | 'exhibitor'
  ): Promise<void> {
    try {
      // First, check if announcement exists and user has permission
      const existing = await this.getAnnouncement(id, licenseKey);
      if (!existing) {
        throw new Error('Announcement not found');
      }

      // Permission check: Admin can delete all, others can only delete their own role's announcements
      if (userRole !== 'admin' && existing.author_role !== userRole) {
        throw new Error('Insufficient permissions to delete this announcement');
      }

      const { error } = await supabase
        .from('announcements')
        .update({ is_active: false })
        .eq('id', id)
        .eq('license_key', licenseKey);

      if (error) throw error;

// CRITICAL: Trigger immediate sync to update UI without refresh
      try {
        const { getReplicationManager } = await import('./replication');
        const manager = getReplicationManager();
        if (manager) {
await manager.syncTable('announcements', { forceFullSync: false });
}
      } catch (syncError) {
        logger.warn('[deleteAnnouncement] Failed to trigger immediate sync (non-critical):', syncError);
      }

    } catch (error) {
      logger.error('Error deleting announcement:', error);
      throw error;
    }
  }

  /**
   * Mark an announcement as read for a specific user
   */
  static async markAsRead(
    announcementId: number,
    licenseKey: string,
    userIdentifier: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('announcement_reads')
        .upsert({
          announcement_id: announcementId,
          user_identifier: userIdentifier,
          license_key: licenseKey
        });

      if (error && !error.message.includes('duplicate')) {
        throw error;
      }

} catch (error) {
      logger.error('Error marking announcement as read:', error);
      throw error;
    }
  }

  /**
   * Mark multiple announcements as read
   */
  static async markMultipleAsRead(
    announcementIds: number[],
    licenseKey: string,
    userIdentifier: string
  ): Promise<void> {
    try {
      const readRecords = announcementIds.map(id => ({
        announcement_id: id,
        user_identifier: userIdentifier,
        license_key: licenseKey
      }));

      const { error } = await supabase
        .from('announcement_reads')
        .upsert(readRecords);

      if (error) throw error;

} catch (error) {
      logger.error('Error marking multiple announcements as read:', error);
      throw error;
    }
  }

  /**
   * Get read status for announcements for a specific user
   * Uses replicated table for offline-first access
   */
  static async getReadStatus(
    licenseKey: string,
    userIdentifier: string,
    announcementIds?: number[]
  ): Promise<Set<number>> {
    try {
      // Get all reads for this user from replicated table
      const reads = await replicatedAnnouncementReadsTable.getByUser(userIdentifier);

      // Filter by license key (multi-tenant security)
      const filteredReads = reads.filter(r => r.license_key === licenseKey);

      // Convert announcement_id from string to number
      let readAnnouncementIds = filteredReads.map(r => parseInt(r.announcement_id, 10));

      // Filter by specific announcement IDs if provided
      if (announcementIds && announcementIds.length > 0) {
        readAnnouncementIds = readAnnouncementIds.filter(id => announcementIds.includes(id));
      }

      return new Set(readAnnouncementIds);

    } catch (error) {
      logger.error('Error fetching read status:', error);
      throw error;
    }
  }

  /**
   * Get unread count for a user in a specific show
   * Uses replicated table for offline-first access
   */
  static async getUnreadCount(licenseKey: string, userIdentifier: string): Promise<number> {
    try {
      // Get all active announcements from replicated table
      const activeAnnouncements = await replicatedAnnouncementsTable.getActive();

      // Filter by license key
      const licenseAnnouncements = activeAnnouncements.filter(a => a.license_key === licenseKey);

      const announcementIds = licenseAnnouncements.map(a => parseInt(a.id, 10));

      if (announcementIds.length === 0) return 0;

      // Get read announcements
      const readIds = await this.getReadStatus(licenseKey, userIdentifier, announcementIds);

      return announcementIds.length - readIds.size;

    } catch (error) {
      logger.error('Error getting unread count:', error);
      throw error;
    }
  }

  /**
   * Get announcements with read status for a user
   */
  static async getAnnouncementsWithReadStatus(
    licenseKey: string,
    userIdentifier: string,
    filters: AnnouncementFilters = {}
  ): Promise<{ data: (Announcement & { is_read: boolean })[]; count: number }> {
    try {
      // Fetch announcements
      const { data: announcements, count } = await this.getAnnouncements(licenseKey, filters);

      if (announcements.length === 0) {
        return { data: [], count: 0 };
      }

      // Get read status
      const readIds = await this.getReadStatus(
        licenseKey,
        userIdentifier,
        announcements.map(a => a.id)
      );

      // Combine data
      const announcementsWithReadStatus = announcements.map(announcement => ({
        ...announcement,
        is_read: readIds.has(announcement.id)
      }));

      return {
        data: announcementsWithReadStatus,
        count
      };

    } catch (error) {
      logger.error('Error fetching announcements with read status:', error);
      throw error;
    }
  }

  /**
   * Get recent urgent announcements (for notifications)
   * Uses replicated table for offline-first access
   */
  static async getRecentUrgentAnnouncements(
    licenseKey: string,
    sinceTimestamp?: string
  ): Promise<Announcement[]> {
    try {
      // Get urgent announcements from replicated table
      let urgentAnnouncements = await replicatedAnnouncementsTable.getByPriority('urgent');

      // Filter by license key and active status
      urgentAnnouncements = urgentAnnouncements.filter(a =>
        a.license_key === licenseKey && a.is_active
      );

      // Filter by timestamp if provided
      if (sinceTimestamp) {
        urgentAnnouncements = urgentAnnouncements.filter(a => a.created_at > sinceTimestamp);
      }

      // Sort by created_at descending (newest first)
      urgentAnnouncements.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Limit to 10
      const limited = urgentAnnouncements.slice(0, 10);

      // Transform to Announcement type (number id)
      return limited.map(a => ({
        ...a,
        id: parseInt(a.id, 10),
        author_name: a.author_name || undefined,
        expires_at: a.expires_at || undefined,
      }));

    } catch (error) {
      logger.error('Error fetching recent urgent announcements:', error);
      throw error;
    }
  }

  /**
   * Validate user permission to create/edit announcements
   */
  static canManageAnnouncements(userRole: string): boolean {
    return ['admin', 'judge', 'steward'].includes(userRole);
  }

  /**
   * Validate user permission to edit specific announcement
   */
  static canEditAnnouncement(
    userRole: 'admin' | 'judge' | 'steward' | 'exhibitor',
    announcementAuthorRole: 'admin' | 'judge' | 'steward'
  ): boolean {
    if (userRole === 'exhibitor') return false;
    if (userRole === 'admin') return true;
    return userRole === announcementAuthorRole;
  }

  /**
   * Generate user identifier for read tracking
   * Uses session storage for temporary identifier within session
   */
  static generateUserIdentifier(): string {
    let identifier = sessionStorage.getItem('user_session_id');
    if (!identifier) {
      identifier = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('user_session_id', identifier);
    }
    return identifier;
  }

  /**
   * Check if announcement is expired
   */
  static isExpired(announcement: Announcement): boolean {
    if (!announcement.expires_at) return false;
    return new Date() > new Date(announcement.expires_at);
  }

  /**
   * Format time ago string for announcements
   */
  static formatTimeAgo(timestamp: string): string {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now.getTime() - time.getTime();

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

    return time.toLocaleDateString();
  }

  /**
   * Get priority badge info for UI
   */
  static getPriorityBadgeInfo(priority: 'normal' | 'high' | 'urgent') {
    switch (priority) {
      case 'urgent':
        return {
          label: 'URGENT',
          color: 'bg-red-500 text-white',
          icon: '🚨'
        };
      case 'high':
        return {
          label: 'HIGH',
          color: 'bg-yellow-500 text-black',
          icon: '⚠️'
        };
      default:
        return {
          label: 'NORMAL',
          color: 'bg-gray-500 text-white',
          icon: '📢'
        };
    }
  }

  /**
   * Get role badge info for UI
   */
  static getRoleBadgeInfo(role: 'admin' | 'judge' | 'steward') {
    switch (role) {
      case 'admin':
        return {
          label: 'ADMIN',
          color: 'bg-purple-600 text-white',
          icon: '👑'
        };
      case 'judge':
        return {
          label: 'JUDGE',
          color: 'bg-blue-600 text-white',
          icon: '⚖️'
        };
      default:
        return {
          label: 'STEWARD',
          color: 'bg-green-600 text-white',
          icon: '📋'
        };
    }
  }
}