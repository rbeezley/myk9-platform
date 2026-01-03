import { vi } from 'vitest';
import { AnnouncementService } from './announcementService';
import { supabase } from '../lib/supabase';
import { replicatedAnnouncementsTable } from './replication';
import type { Announcement } from '../stores/announcementStore';

// Mock the supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}));

// Mock replication module to force Supabase fallback for easier testing
vi.mock('./replication', () => ({
  replicatedAnnouncementsTable: {
    getAll: vi.fn().mockResolvedValue([]), // Return empty to trigger Supabase fallback
    get: vi.fn().mockResolvedValue(null), // Return null to simulate not found
    getActive: vi.fn().mockResolvedValue([]),
    getByPriority: vi.fn().mockResolvedValue([]),
    put: vi.fn(),
    delete: vi.fn(),
  },
  replicatedAnnouncementReadsTable: {
    getByUser: vi.fn().mockResolvedValue([]),
    put: vi.fn(),
  },
  getReplicationManager: vi.fn().mockReturnValue(null), // Disable auto-sync in tests
}));

describe('AnnouncementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockLicenseKey = 'myK9Q1-a260f472-e0d76a33-4b6c264c';

  const mockAnnouncements: Announcement[] = [
    {
      id: 1,
      title: 'Important Update',
      content: 'This is a test announcement',
      priority: 'high',
      author_role: 'admin',
      author_name: 'Admin User',
      license_key: mockLicenseKey,
      is_active: true,
      created_at: '2025-01-01T10:00:00Z',
      expires_at: undefined
    },
    {
      id: 2,
      title: 'Class Update',
      content: 'Class schedule changed',
      priority: 'normal',
      author_role: 'judge',
      author_name: 'Judge Smith',
      license_key: mockLicenseKey,
      is_active: true,
      created_at: '2025-01-01T09:00:00Z',
      expires_at: '2025-12-31T23:59:59Z'
    }
  ];

  describe('getAnnouncements', () => {
    test('should fetch announcements with default filters', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOr = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: mockAnnouncements,
        error: null,
        count: 2
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        order: mockOrder
      } as any);

      const result = await AnnouncementService.getAnnouncements(mockLicenseKey);

      expect(result.data).toEqual(mockAnnouncements);
      expect(result.count).toBe(2);
      expect(supabase.from).toHaveBeenCalledWith('announcements');
      expect(mockSelect).toHaveBeenCalledWith('*', { count: 'exact' });
      expect(mockEq).toHaveBeenCalledWith('license_key', mockLicenseKey);
      expect(mockEq).toHaveBeenCalledWith('is_active', true);
    });

    test('should filter by priority', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOr = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: [mockAnnouncements[0]],
        error: null,
        count: 1
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        order: mockOrder
      } as any);

      await AnnouncementService.getAnnouncements(mockLicenseKey, { priority: 'high' });

      expect(mockEq).toHaveBeenCalledWith('priority', 'high');
    });

    test('should filter by author role', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOr = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: [mockAnnouncements[1]],
        error: null,
        count: 1
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        order: mockOrder
      } as any);

      await AnnouncementService.getAnnouncements(mockLicenseKey, { author_role: 'judge' });

      expect(mockEq).toHaveBeenCalledWith('author_role', 'judge');
    });

    test('should apply search filter', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOr = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: [mockAnnouncements[0]],
        error: null,
        count: 1
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        order: mockOrder
      } as any);

      await AnnouncementService.getAnnouncements(mockLicenseKey, { searchTerm: 'Important' });

      expect(mockOr).toHaveBeenCalledWith(
        expect.stringContaining('title.ilike.%Important%')
      );
    });

    test('should apply pagination', async () => {
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOr = vi.fn().mockReturnThis();
      const mockRange = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: mockAnnouncements,
        error: null,
        count: 2
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        range: mockRange,
        order: mockOrder
      } as any);

      await AnnouncementService.getAnnouncements(mockLicenseKey, {
        limit: 10,
        offset: 20
      });

      expect(mockRange).toHaveBeenCalledWith(20, 29);
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    test('should throw error when query fails', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOr = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        order: mockOrder
      } as any);

      await expect(
        AnnouncementService.getAnnouncements(mockLicenseKey)
      ).rejects.toThrow();
    });

    test('should return empty array when no announcements found', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOr = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: [],
        error: null,
        count: 0
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        order: mockOrder
      } as any);

      const result = await AnnouncementService.getAnnouncements(mockLicenseKey);

      expect(result.data).toEqual([]);
      expect(result.count).toBe(0);
    });
  });

  describe('getAnnouncement', () => {
    test('should fetch a specific announcement', async () => {
      // Mock replicated table to return announcement
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce({
        ...mockAnnouncements[0],
        id: '1', // Replicated table uses string IDs
      } as any);

      const result = await AnnouncementService.getAnnouncement(1, mockLicenseKey);

      expect(result).toEqual(mockAnnouncements[0]);
      expect(replicatedAnnouncementsTable.get).toHaveBeenCalledWith('1');
    });

    test('should return null when announcement not found', async () => {
      // Mock replicated table returns null by default (not found)
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce(null);

      const result = await AnnouncementService.getAnnouncement(999, mockLicenseKey);

      expect(result).toBeNull();
      expect(replicatedAnnouncementsTable.get).toHaveBeenCalledWith('999');
    });

    test('should throw error for other database errors', async () => {
      // Mock replicated table to throw an error
      vi.mocked(replicatedAnnouncementsTable.get).mockRejectedValueOnce(
        new Error('Database error')
      );

      await expect(
        AnnouncementService.getAnnouncement(1, mockLicenseKey)
      ).rejects.toThrow('Database error');
    });
  });

  describe('createAnnouncement', () => {
    const newAnnouncement = {
      title: 'New Announcement',
      content: 'New content',
      priority: 'normal' as const,
      author_role: 'admin' as const,
      author_name: 'Test Admin',
      license_key: mockLicenseKey
    };

    test('should create a new announcement', async () => {
      const createdAnnouncement = {
        ...newAnnouncement,
        id: 3,
        is_active: true,
        created_at: '2025-01-02T10:00:00Z'
      };

      const mockFrom = vi.fn().mockReturnThis();
      const mockInsert = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: createdAnnouncement,
        error: null
      });

      vi.mocked(supabase.from).mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
        single: mockSingle
      } as any);

      const result = await AnnouncementService.createAnnouncement(newAnnouncement);

      expect(result).toEqual(createdAnnouncement);
      expect(mockInsert).toHaveBeenCalledWith(newAnnouncement);
    });

    test('should throw error when creation fails', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockInsert = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Validation error' }
      });

      vi.mocked(supabase.from).mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
        single: mockSingle
      } as any);

      await expect(
        AnnouncementService.createAnnouncement(newAnnouncement)
      ).rejects.toThrow();
    });
  });

  describe('updateAnnouncement', () => {
    test('should update announcement when user has admin role', async () => {
      const updates = { title: 'Updated Title' };
      const updatedAnnouncement = { ...mockAnnouncements[0], ...updates };

      // Mock getAnnouncement (uses replicated table)
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce({
        ...mockAnnouncements[0],
        id: '1', // Replicated table uses string IDs
      } as any);

      // Mock update
      const mockUpdate = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: updatedAnnouncement,
        error: null
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: mockSelect,
        single: mockSingle
      } as any);

      const result = await AnnouncementService.updateAnnouncement(
        1,
        updates,
        mockLicenseKey,
        'admin'
      );

      expect(result.title).toBe('Updated Title');
      expect(mockUpdate).toHaveBeenCalledWith(updates);
    });

    test('should allow user to update their own role announcements', async () => {
      const updates = { title: 'Updated by Judge' };
      const updatedAnnouncement = { ...mockAnnouncements[1], ...updates };

      // Mock getAnnouncement (uses replicated table)
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce({
        ...mockAnnouncements[1], // author_role is 'judge'
        id: '2', // Replicated table uses string IDs
      } as any);

      // Mock update
      const mockUpdate = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: updatedAnnouncement,
        error: null
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: mockSelect,
        single: mockSingle
      } as any);

      const result = await AnnouncementService.updateAnnouncement(
        2,
        updates,
        mockLicenseKey,
        'judge' // Same role as author
      );

      expect(result.title).toBe('Updated by Judge');
    });

    test('should throw error when user lacks permission', async () => {
      const updates = { title: 'Unauthorized Update' };

      // Mock getAnnouncement to return admin announcement
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce({
        ...mockAnnouncements[0], // author_role is 'admin'
        id: '1',
      } as any);

      await expect(
        AnnouncementService.updateAnnouncement(
          1,
          updates,
          mockLicenseKey,
          'judge' // Trying to update admin's announcement
        )
      ).rejects.toThrow('Insufficient permissions');
    });

    test('should throw error when announcement not found', async () => {
      const updates = { title: 'Updated Title' };

      // Mock getAnnouncement to return null (not found)
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce(null);

      await expect(
        AnnouncementService.updateAnnouncement(999, updates, mockLicenseKey, 'admin')
      ).rejects.toThrow('Announcement not found');
    });
  });

  describe('deleteAnnouncement', () => {
    test('should soft delete announcement when user has admin role', async () => {
      // Mock getAnnouncement (uses replicated table)
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce({
        ...mockAnnouncements[0],
        id: '1',
      } as any);

      // Mock update (soft delete)
      const mockUpdate = vi.fn().mockReturnThis();
      const mockEqFirst = vi.fn().mockReturnThis();
      const mockEqSecond = vi.fn().mockResolvedValue({
        error: null
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: mockUpdate,
        eq: mockEqFirst
      } as any);

      // Mock the second .eq() call in the chain
      mockEqFirst.mockReturnValue({
        eq: mockEqSecond
      } as any);

      await AnnouncementService.deleteAnnouncement(1, mockLicenseKey, 'admin');

      expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
      expect(mockEqFirst).toHaveBeenCalledWith('id', 1);
      expect(mockEqSecond).toHaveBeenCalledWith('license_key', mockLicenseKey);
    });

    test('should allow user to delete their own role announcements', async () => {
      // Mock getAnnouncement (uses replicated table)
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce({
        ...mockAnnouncements[1], // author_role is 'judge'
        id: '2',
      } as any);

      // Mock update (soft delete)
      const mockUpdate = vi.fn().mockReturnThis();
      const mockEqFirst = vi.fn().mockReturnThis();
      const mockEqSecond = vi.fn().mockResolvedValue({
        error: null
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: mockUpdate,
        eq: mockEqFirst
      } as any);

      // Mock the second .eq() call in the chain
      mockEqFirst.mockReturnValue({
        eq: mockEqSecond
      } as any);

      await AnnouncementService.deleteAnnouncement(2, mockLicenseKey, 'judge');

      expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
      expect(mockEqFirst).toHaveBeenCalledWith('id', 2);
      expect(mockEqSecond).toHaveBeenCalledWith('license_key', mockLicenseKey);
    });

    test('should throw error when user lacks permission to delete', async () => {
      // Mock getAnnouncement to return admin announcement
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce({
        ...mockAnnouncements[0], // author_role is 'admin'
        id: '1',
      } as any);

      await expect(
        AnnouncementService.deleteAnnouncement(1, mockLicenseKey, 'steward')
      ).rejects.toThrow('Insufficient permissions');
    });
  });

  describe('markAsRead', () => {
    test('should mark announcement as read', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });

      vi.mocked(supabase.from).mockReturnValue({
        upsert: mockUpsert
      } as any);

      await AnnouncementService.markAsRead(1, mockLicenseKey, 'user-123');

      expect(mockUpsert).toHaveBeenCalledWith({
        announcement_id: 1,
        user_identifier: 'user-123',
        license_key: mockLicenseKey
      });
    });

    test('should handle duplicate read records gracefully', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockUpsert = vi.fn().mockResolvedValue({
        error: { message: 'duplicate key value violates unique constraint' }
      });

      vi.mocked(supabase.from).mockReturnValue({
        upsert: mockUpsert
      } as any);

      // Should not throw error for duplicate
      await expect(
        AnnouncementService.markAsRead(1, mockLicenseKey, 'user-123')
      ).resolves.not.toThrow();
    });

    test('should throw error for non-duplicate database errors', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockUpsert = vi.fn().mockResolvedValue({
        error: { message: 'Database connection failed' }
      });

      vi.mocked(supabase.from).mockReturnValue({
        upsert: mockUpsert
      } as any);

      await expect(
        AnnouncementService.markAsRead(1, mockLicenseKey, 'user-123')
      ).rejects.toThrow();
    });
  });
});
