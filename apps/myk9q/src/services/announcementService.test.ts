import { vi } from 'vitest';
import { AnnouncementService } from './announcementService';
import { supabase } from '../lib/supabase';
import { replicatedAnnouncementsTable } from './replication';
import type { Announcement } from '../stores/announcementStore';
import type { Announcement as ReplicatedAnnouncement } from './replication/tables/ReplicatedAnnouncementsTable';
import type { AnnouncementRead } from './replication/tables/ReplicatedAnnouncementReadsTable';

/** Shorthand for the Supabase query builder return type used in mock chains */
type SupabaseQueryChain = ReturnType<typeof supabase.from>;

// Mock the supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
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
      expires_at: undefined,
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
      expires_at: '2025-12-31T23:59:59Z',
    },
  ];

  /** Helper to create a mock replicated announcement from a store announcement */
  function toReplicated(
    ann: Announcement,
    overrides: Partial<ReplicatedAnnouncement> = {}
  ): ReplicatedAnnouncement {
    return {
      id: String(ann.id),
      license_key: ann.license_key,
      title: ann.title,
      content: ann.content,
      priority: ann.priority,
      author_role: ann.author_role,
      author_name: ann.author_name ?? null,
      created_at: ann.created_at,
      updated_at: ann.created_at,
      expires_at: ann.expires_at ?? null,
      is_active: ann.is_active,
      ...overrides,
    };
  }

  describe('getAnnouncements', () => {
    test('should fetch announcements with default filters', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOr = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: mockAnnouncements,
        error: null,
        count: 2,
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        order: mockOrder,
      } as unknown as SupabaseQueryChain);

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
        count: 1,
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        order: mockOrder,
      } as unknown as SupabaseQueryChain);

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
        count: 1,
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        order: mockOrder,
      } as unknown as SupabaseQueryChain);

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
        count: 1,
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        order: mockOrder,
      } as unknown as SupabaseQueryChain);

      await AnnouncementService.getAnnouncements(mockLicenseKey, { searchTerm: 'Important' });

      expect(mockOr).toHaveBeenCalledWith(expect.stringContaining('title.ilike.%Important%'));
    });

    test('should apply pagination', async () => {
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOr = vi.fn().mockReturnThis();
      const mockRange = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: mockAnnouncements,
        error: null,
        count: 2,
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        range: mockRange,
        order: mockOrder,
      } as unknown as SupabaseQueryChain);

      await AnnouncementService.getAnnouncements(mockLicenseKey, {
        limit: 10,
        offset: 20,
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
        error: { message: 'Database error' },
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        order: mockOrder,
      } as unknown as SupabaseQueryChain);

      await expect(AnnouncementService.getAnnouncements(mockLicenseKey)).rejects.toThrow();
    });

    test('should return empty array when no announcements found', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOr = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        order: mockOrder,
      } as unknown as SupabaseQueryChain);

      const result = await AnnouncementService.getAnnouncements(mockLicenseKey);

      expect(result.data).toEqual([]);
      expect(result.count).toBe(0);
    });
  });

  describe('getAnnouncement', () => {
    test('should fetch a specific announcement', async () => {
      // Mock replicated table to return announcement
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce(
        toReplicated(mockAnnouncements[0], { id: '1' })
      );

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

      await expect(AnnouncementService.getAnnouncement(1, mockLicenseKey)).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('createAnnouncement', () => {
    const newAnnouncement = {
      title: 'New Announcement',
      content: 'New content',
      priority: 'normal' as const,
      author_role: 'admin' as const,
      author_name: 'Test Admin',
      license_key: mockLicenseKey,
    };

    test('should create a new announcement', async () => {
      const createdAnnouncement = {
        ...newAnnouncement,
        id: 3,
        is_active: true,
        created_at: '2025-01-02T10:00:00Z',
      };

      const mockFrom = vi.fn().mockReturnThis();
      const mockInsert = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: createdAnnouncement,
        error: null,
      });

      vi.mocked(supabase.from).mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
        single: mockSingle,
      } as unknown as SupabaseQueryChain);

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
        error: { message: 'Validation error' },
      });

      vi.mocked(supabase.from).mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
        single: mockSingle,
      } as unknown as SupabaseQueryChain);

      await expect(AnnouncementService.createAnnouncement(newAnnouncement)).rejects.toThrow();
    });
  });

  describe('updateAnnouncement', () => {
    test('should update announcement when user has admin role', async () => {
      const updates = { title: 'Updated Title' };
      const updatedAnnouncement = { ...mockAnnouncements[0], ...updates };

      // Mock getAnnouncement (uses replicated table)
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce(
        toReplicated(mockAnnouncements[0], { id: '1' })
      );

      // Mock update
      const mockUpdate = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: updatedAnnouncement,
        error: null,
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: mockSelect,
        single: mockSingle,
      } as unknown as SupabaseQueryChain);

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
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce(
        toReplicated(mockAnnouncements[1], { id: '2' })
      );

      // Mock update
      const mockUpdate = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: updatedAnnouncement,
        error: null,
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: mockSelect,
        single: mockSingle,
      } as unknown as SupabaseQueryChain);

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
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce(
        toReplicated(mockAnnouncements[0], { id: '1' })
      );

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
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce(
        toReplicated(mockAnnouncements[0], { id: '1' })
      );

      // Mock update (soft delete)
      const mockUpdate = vi.fn().mockReturnThis();
      const mockEqFirst = vi.fn().mockReturnThis();
      const mockEqSecond = vi.fn().mockResolvedValue({
        error: null,
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: mockUpdate,
        eq: mockEqFirst,
      } as unknown as SupabaseQueryChain);

      // Mock the second .eq() call in the chain
      mockEqFirst.mockReturnValue({
        eq: mockEqSecond,
      } as unknown as SupabaseQueryChain);

      await AnnouncementService.deleteAnnouncement(1, mockLicenseKey, 'admin');

      expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
      expect(mockEqFirst).toHaveBeenCalledWith('id', 1);
      expect(mockEqSecond).toHaveBeenCalledWith('license_key', mockLicenseKey);
    });

    test('should allow user to delete their own role announcements', async () => {
      // Mock getAnnouncement (uses replicated table)
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce(
        toReplicated(mockAnnouncements[1], { id: '2' })
      );

      // Mock update (soft delete)
      const mockUpdate = vi.fn().mockReturnThis();
      const mockEqFirst = vi.fn().mockReturnThis();
      const mockEqSecond = vi.fn().mockResolvedValue({
        error: null,
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: mockUpdate,
        eq: mockEqFirst,
      } as unknown as SupabaseQueryChain);

      // Mock the second .eq() call in the chain
      mockEqFirst.mockReturnValue({
        eq: mockEqSecond,
      } as unknown as SupabaseQueryChain);

      await AnnouncementService.deleteAnnouncement(2, mockLicenseKey, 'judge');

      expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
      expect(mockEqFirst).toHaveBeenCalledWith('id', 2);
      expect(mockEqSecond).toHaveBeenCalledWith('license_key', mockLicenseKey);
    });

    test('should throw error when user lacks permission to delete', async () => {
      // Mock getAnnouncement to return admin announcement
      vi.mocked(replicatedAnnouncementsTable.get).mockResolvedValueOnce(
        toReplicated(mockAnnouncements[0], { id: '1' })
      );

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
        upsert: mockUpsert,
      } as unknown as SupabaseQueryChain);

      await AnnouncementService.markAsRead(1, mockLicenseKey, 'user-123');

      expect(mockUpsert).toHaveBeenCalledWith({
        announcement_id: 1,
        user_identifier: 'user-123',
        license_key: mockLicenseKey,
      });
    });

    test('should handle duplicate read records gracefully', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockUpsert = vi.fn().mockResolvedValue({
        error: { message: 'duplicate key value violates unique constraint' },
      });

      vi.mocked(supabase.from).mockReturnValue({
        upsert: mockUpsert,
      } as unknown as SupabaseQueryChain);

      // Should not throw error for duplicate
      await expect(
        AnnouncementService.markAsRead(1, mockLicenseKey, 'user-123')
      ).resolves.not.toThrow();
    });

    test('should throw error for non-duplicate database errors', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockUpsert = vi.fn().mockResolvedValue({
        error: { message: 'Database connection failed' },
      });

      vi.mocked(supabase.from).mockReturnValue({
        upsert: mockUpsert,
      } as unknown as SupabaseQueryChain);

      await expect(AnnouncementService.markAsRead(1, mockLicenseKey, 'user-123')).rejects.toThrow();
    });
  });

  describe('markMultipleAsRead', () => {
    test('should mark multiple announcements as read', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });

      vi.mocked(supabase.from).mockReturnValue({
        upsert: mockUpsert,
      } as unknown as SupabaseQueryChain);

      await AnnouncementService.markMultipleAsRead([1, 2, 3], mockLicenseKey, 'user-123');

      expect(mockUpsert).toHaveBeenCalledWith([
        { announcement_id: 1, user_identifier: 'user-123', license_key: mockLicenseKey },
        { announcement_id: 2, user_identifier: 'user-123', license_key: mockLicenseKey },
        { announcement_id: 3, user_identifier: 'user-123', license_key: mockLicenseKey },
      ]);
    });

    test('should handle empty array', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });

      vi.mocked(supabase.from).mockReturnValue({
        upsert: mockUpsert,
      } as unknown as SupabaseQueryChain);

      await AnnouncementService.markMultipleAsRead([], mockLicenseKey, 'user-123');

      expect(mockUpsert).toHaveBeenCalledWith([]);
    });

    test('should throw error on database failure', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockUpsert = vi.fn().mockResolvedValue({
        error: { message: 'Database error' },
      });

      vi.mocked(supabase.from).mockReturnValue({
        upsert: mockUpsert,
      } as unknown as SupabaseQueryChain);

      await expect(
        AnnouncementService.markMultipleAsRead([1, 2], mockLicenseKey, 'user-123')
      ).rejects.toThrow();
    });
  });

  describe('getReadStatus', () => {
    test('should get read status for all announcements', async () => {
      const { replicatedAnnouncementReadsTable } = await import('./replication');
      const mockReads: AnnouncementRead[] = [
        {
          id: '1',
          announcement_id: '1',
          user_identifier: 'user-123',
          license_key: mockLicenseKey,
          read_at: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          announcement_id: '2',
          user_identifier: 'user-123',
          license_key: mockLicenseKey,
          read_at: '2025-01-01T00:00:00Z',
        },
      ];
      vi.mocked(replicatedAnnouncementReadsTable.getByUser).mockResolvedValueOnce(mockReads);

      const result = await AnnouncementService.getReadStatus(mockLicenseKey, 'user-123');

      expect(result.has(1)).toBe(true);
      expect(result.has(2)).toBe(true);
      expect(result.has(3)).toBe(false);
    });

    test('should filter by license key', async () => {
      const { replicatedAnnouncementReadsTable } = await import('./replication');
      const mockReads: AnnouncementRead[] = [
        {
          id: '1',
          announcement_id: '1',
          user_identifier: 'user-123',
          license_key: mockLicenseKey,
          read_at: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          announcement_id: '2',
          user_identifier: 'user-123',
          license_key: 'other-license',
          read_at: '2025-01-01T00:00:00Z',
        },
      ];
      vi.mocked(replicatedAnnouncementReadsTable.getByUser).mockResolvedValueOnce(mockReads);

      const result = await AnnouncementService.getReadStatus(mockLicenseKey, 'user-123');

      expect(result.has(1)).toBe(true);
      expect(result.has(2)).toBe(false); // Filtered out by license key
    });

    test('should filter by specific announcement IDs', async () => {
      const { replicatedAnnouncementReadsTable } = await import('./replication');
      const mockReads: AnnouncementRead[] = [
        {
          id: '1',
          announcement_id: '1',
          user_identifier: 'user-123',
          license_key: mockLicenseKey,
          read_at: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          announcement_id: '2',
          user_identifier: 'user-123',
          license_key: mockLicenseKey,
          read_at: '2025-01-01T00:00:00Z',
        },
        {
          id: '3',
          announcement_id: '3',
          user_identifier: 'user-123',
          license_key: mockLicenseKey,
          read_at: '2025-01-01T00:00:00Z',
        },
      ];
      vi.mocked(replicatedAnnouncementReadsTable.getByUser).mockResolvedValueOnce(mockReads);

      const result = await AnnouncementService.getReadStatus(mockLicenseKey, 'user-123', [1, 3]);

      expect(result.has(1)).toBe(true);
      expect(result.has(2)).toBe(false); // Filtered out by announcement IDs
      expect(result.has(3)).toBe(true);
    });

    test('should return empty set when no reads found', async () => {
      const { replicatedAnnouncementReadsTable } = await import('./replication');
      vi.mocked(replicatedAnnouncementReadsTable.getByUser).mockResolvedValueOnce([]);

      const result = await AnnouncementService.getReadStatus(mockLicenseKey, 'user-123');

      expect(result.size).toBe(0);
    });
  });

  describe('getUnreadCount', () => {
    test('should calculate unread count correctly', async () => {
      const { replicatedAnnouncementReadsTable } = await import('./replication');
      const activeAnnouncements: ReplicatedAnnouncement[] = [
        toReplicated(mockAnnouncements[0], { id: '1' }),
        toReplicated(mockAnnouncements[1], { id: '2' }),
        {
          id: '3',
          license_key: mockLicenseKey,
          is_active: true,
          title: '',
          content: '',
          priority: 'normal',
          author_role: 'admin',
          author_name: null,
          created_at: '',
          updated_at: '',
          expires_at: null,
        },
      ];
      vi.mocked(replicatedAnnouncementsTable.getActive).mockResolvedValueOnce(activeAnnouncements);

      const mockReads: AnnouncementRead[] = [
        {
          id: '1',
          announcement_id: '1',
          user_identifier: 'user-123',
          license_key: mockLicenseKey,
          read_at: '2025-01-01T00:00:00Z',
        },
      ];
      vi.mocked(replicatedAnnouncementReadsTable.getByUser).mockResolvedValueOnce(mockReads);

      const count = await AnnouncementService.getUnreadCount(mockLicenseKey, 'user-123');

      expect(count).toBe(2); // 3 total - 1 read = 2 unread
    });

    test('should return 0 when no announcements', async () => {
      vi.mocked(replicatedAnnouncementsTable.getActive).mockResolvedValueOnce([]);

      const count = await AnnouncementService.getUnreadCount(mockLicenseKey, 'user-123');

      expect(count).toBe(0);
    });

    test('should filter by license key', async () => {
      const { replicatedAnnouncementReadsTable } = await import('./replication');
      const activeAnnouncementsWithDifferentKeys: ReplicatedAnnouncement[] = [
        {
          id: '1',
          license_key: mockLicenseKey,
          is_active: true,
          title: '',
          content: '',
          priority: 'normal',
          author_role: 'admin',
          author_name: null,
          created_at: '',
          updated_at: '',
          expires_at: null,
        },
        {
          id: '2',
          license_key: 'other-license',
          is_active: true,
          title: '',
          content: '',
          priority: 'normal',
          author_role: 'admin',
          author_name: null,
          created_at: '',
          updated_at: '',
          expires_at: null,
        },
      ];
      vi.mocked(replicatedAnnouncementsTable.getActive).mockResolvedValueOnce(
        activeAnnouncementsWithDifferentKeys
      );
      vi.mocked(replicatedAnnouncementReadsTable.getByUser).mockResolvedValueOnce([]);

      const count = await AnnouncementService.getUnreadCount(mockLicenseKey, 'user-123');

      expect(count).toBe(1); // Only one matches license key
    });
  });

  describe('getAnnouncementsWithReadStatus', () => {
    test('should combine announcements with read status', async () => {
      const { replicatedAnnouncementReadsTable } = await import('./replication');
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const replicatedAnnouncements: ReplicatedAnnouncement[] = [
        toReplicated(mockAnnouncements[0], { id: '1', expires_at: null }),
        toReplicated(mockAnnouncements[1], { id: '2', expires_at: futureDate }),
      ];
      vi.mocked(replicatedAnnouncementsTable.getAll).mockResolvedValueOnce(replicatedAnnouncements);

      const mockReads: AnnouncementRead[] = [
        {
          id: '1',
          announcement_id: '1',
          user_identifier: 'user-123',
          license_key: mockLicenseKey,
          read_at: '2025-01-01T00:00:00Z',
        },
      ];
      vi.mocked(replicatedAnnouncementReadsTable.getByUser).mockResolvedValueOnce(mockReads);

      const result = await AnnouncementService.getAnnouncementsWithReadStatus(
        mockLicenseKey,
        'user-123'
      );

      expect(result.data).toHaveLength(2);
      expect(result.data[0].is_read).toBe(true);
      expect(result.data[1].is_read).toBe(false);
    });

    test('should handle empty announcements', async () => {
      // Mock both cache AND Supabase fallback
      vi.mocked(replicatedAnnouncementsTable.getAll).mockResolvedValueOnce([]);

      // Set up Supabase mock chain for fallback
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOr = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        or: mockOr,
        order: mockOrder,
      } as unknown as SupabaseQueryChain);

      const result = await AnnouncementService.getAnnouncementsWithReadStatus(
        mockLicenseKey,
        'user-123'
      );

      expect(result.data).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe('getRecentUrgentAnnouncements', () => {
    test('should get urgent announcements', async () => {
      const urgentAnnouncements: ReplicatedAnnouncement[] = [
        toReplicated(mockAnnouncements[0], { id: '1', priority: 'urgent' }),
        toReplicated(mockAnnouncements[1], { id: '2', priority: 'urgent' }),
      ];
      vi.mocked(replicatedAnnouncementsTable.getByPriority).mockResolvedValueOnce(
        urgentAnnouncements
      );

      const result = await AnnouncementService.getRecentUrgentAnnouncements(mockLicenseKey);

      expect(replicatedAnnouncementsTable.getByPriority).toHaveBeenCalledWith('urgent');
      expect(result).toHaveLength(2);
    });

    test('should filter by timestamp', async () => {
      const recentTime = '2025-01-01T09:30:00Z';
      const urgentAnnouncements: ReplicatedAnnouncement[] = [
        {
          id: '1',
          created_at: '2025-01-01T10:00:00Z',
          license_key: mockLicenseKey,
          is_active: true,
          priority: 'urgent',
          title: '',
          content: '',
          author_role: 'admin',
          author_name: null,
          updated_at: '',
          expires_at: null,
        },
        {
          id: '2',
          created_at: '2025-01-01T09:00:00Z',
          license_key: mockLicenseKey,
          is_active: true,
          priority: 'urgent',
          title: '',
          content: '',
          author_role: 'admin',
          author_name: null,
          updated_at: '',
          expires_at: null,
        },
      ];
      vi.mocked(replicatedAnnouncementsTable.getByPriority).mockResolvedValueOnce(
        urgentAnnouncements
      );

      const result = await AnnouncementService.getRecentUrgentAnnouncements(
        mockLicenseKey,
        recentTime
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1); // Only the one after timestamp
    });

    test('should filter by license key', async () => {
      const urgentAnnouncements: ReplicatedAnnouncement[] = [
        {
          id: '1',
          license_key: mockLicenseKey,
          is_active: true,
          priority: 'urgent',
          title: '',
          content: '',
          author_role: 'admin',
          author_name: null,
          created_at: '',
          updated_at: '',
          expires_at: null,
        },
        {
          id: '2',
          license_key: 'other-license',
          is_active: true,
          priority: 'urgent',
          title: '',
          content: '',
          author_role: 'admin',
          author_name: null,
          created_at: '',
          updated_at: '',
          expires_at: null,
        },
      ];
      vi.mocked(replicatedAnnouncementsTable.getByPriority).mockResolvedValueOnce(
        urgentAnnouncements
      );

      const result = await AnnouncementService.getRecentUrgentAnnouncements(mockLicenseKey);

      expect(result).toHaveLength(1);
      expect(result[0].license_key).toBe(mockLicenseKey);
    });

    test('should limit to 10 results', async () => {
      const urgentAnnouncements: ReplicatedAnnouncement[] = Array.from({ length: 15 }, (_, i) => ({
        id: `${i + 1}`,
        license_key: mockLicenseKey,
        is_active: true,
        priority: 'urgent' as const,
        created_at: new Date().toISOString(),
        title: '',
        content: '',
        author_role: 'admin' as const,
        author_name: null,
        updated_at: '',
        expires_at: null,
      }));
      vi.mocked(replicatedAnnouncementsTable.getByPriority).mockResolvedValueOnce(
        urgentAnnouncements
      );

      const result = await AnnouncementService.getRecentUrgentAnnouncements(mockLicenseKey);

      expect(result).toHaveLength(10);
    });

    test('should sort by created_at descending', async () => {
      const urgentAnnouncements: ReplicatedAnnouncement[] = [
        {
          id: '1',
          created_at: '2025-01-01T00:00:00Z',
          license_key: mockLicenseKey,
          is_active: true,
          title: '',
          content: '',
          priority: 'normal',
          author_role: 'admin',
          author_name: null,
          updated_at: '',
          expires_at: null,
        },
        {
          id: '2',
          created_at: '2025-01-03T00:00:00Z',
          license_key: mockLicenseKey,
          is_active: true,
          title: '',
          content: '',
          priority: 'normal',
          author_role: 'admin',
          author_name: null,
          updated_at: '',
          expires_at: null,
        },
        {
          id: '3',
          created_at: '2025-01-02T00:00:00Z',
          license_key: mockLicenseKey,
          is_active: true,
          title: '',
          content: '',
          priority: 'normal',
          author_role: 'admin',
          author_name: null,
          updated_at: '',
          expires_at: null,
        },
      ];
      vi.mocked(replicatedAnnouncementsTable.getByPriority).mockResolvedValueOnce(
        urgentAnnouncements
      );

      const result = await AnnouncementService.getRecentUrgentAnnouncements(mockLicenseKey);

      expect(result[0].id).toBe(2); // Newest first
      expect(result[1].id).toBe(3);
      expect(result[2].id).toBe(1);
    });
  });

  describe('canManageAnnouncements', () => {
    test('should return true for admin', () => {
      expect(AnnouncementService.canManageAnnouncements('admin')).toBe(true);
    });

    test('should return true for judge', () => {
      expect(AnnouncementService.canManageAnnouncements('judge')).toBe(true);
    });

    test('should return true for steward', () => {
      expect(AnnouncementService.canManageAnnouncements('steward')).toBe(true);
    });

    test('should return false for exhibitor', () => {
      expect(AnnouncementService.canManageAnnouncements('exhibitor')).toBe(false);
    });

    test('should return false for unknown role', () => {
      expect(AnnouncementService.canManageAnnouncements('unknown')).toBe(false);
    });
  });

  describe('canEditAnnouncement', () => {
    test('should return false for exhibitor', () => {
      expect(AnnouncementService.canEditAnnouncement('exhibitor', 'admin')).toBe(false);
    });

    test('should return true for admin editing any announcement', () => {
      expect(AnnouncementService.canEditAnnouncement('admin', 'judge')).toBe(true);
      expect(AnnouncementService.canEditAnnouncement('admin', 'steward')).toBe(true);
      expect(AnnouncementService.canEditAnnouncement('admin', 'admin')).toBe(true);
    });

    test('should return true for matching roles', () => {
      expect(AnnouncementService.canEditAnnouncement('judge', 'judge')).toBe(true);
      expect(AnnouncementService.canEditAnnouncement('steward', 'steward')).toBe(true);
    });

    test('should return false for non-matching roles', () => {
      expect(AnnouncementService.canEditAnnouncement('judge', 'admin')).toBe(false);
      expect(AnnouncementService.canEditAnnouncement('steward', 'judge')).toBe(false);
    });
  });

  describe('generateUserIdentifier', () => {
    let mockSessionStorage: Storage;

    beforeEach(() => {
      mockSessionStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(),
      };
      Object.defineProperty(global, 'sessionStorage', {
        value: mockSessionStorage,
        writable: true,
      });
    });

    test('should generate new identifier when none exists', () => {
      vi.mocked(sessionStorage.getItem).mockReturnValue(null);

      const id = AnnouncementService.generateUserIdentifier();

      expect(id).toMatch(/^session_\d+_[a-z0-9]+$/);
      expect(sessionStorage.setItem).toHaveBeenCalledWith('user_session_id', id);
    });

    test('should return existing identifier', () => {
      const existingId = 'session_123_abc';
      vi.mocked(sessionStorage.getItem).mockReturnValue(existingId);

      const id = AnnouncementService.generateUserIdentifier();

      expect(id).toBe(existingId);
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('isExpired', () => {
    test('should return false when expires_at is undefined', () => {
      const announcement = { ...mockAnnouncements[0], expires_at: undefined };
      expect(AnnouncementService.isExpired(announcement)).toBe(false);
    });

    test('should return false when expires_at is in the future', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const announcement = { ...mockAnnouncements[0], expires_at: futureDate };
      expect(AnnouncementService.isExpired(announcement)).toBe(false);
    });

    test('should return true when expires_at is in the past', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const announcement = { ...mockAnnouncements[0], expires_at: pastDate };
      expect(AnnouncementService.isExpired(announcement)).toBe(true);
    });
  });

  describe('formatTimeAgo', () => {
    test('should return "Just now" for recent timestamps', () => {
      const now = new Date().toISOString();
      expect(AnnouncementService.formatTimeAgo(now)).toBe('Just now');
    });

    test('should return minutes ago', () => {
      const time = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(AnnouncementService.formatTimeAgo(time)).toBe('5 minutes ago');
    });

    test('should return singular minute', () => {
      const time = new Date(Date.now() - 1 * 60 * 1000).toISOString();
      expect(AnnouncementService.formatTimeAgo(time)).toBe('1 minute ago');
    });

    test('should return hours ago', () => {
      const time = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      expect(AnnouncementService.formatTimeAgo(time)).toBe('3 hours ago');
    });

    test('should return singular hour', () => {
      const time = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      expect(AnnouncementService.formatTimeAgo(time)).toBe('1 hour ago');
    });

    test('should return days ago', () => {
      const time = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      expect(AnnouncementService.formatTimeAgo(time)).toBe('5 days ago');
    });

    test('should return singular day', () => {
      const time = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
      expect(AnnouncementService.formatTimeAgo(time)).toBe('1 day ago');
    });

    test('should return formatted date for older timestamps', () => {
      const time = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const result = AnnouncementService.formatTimeAgo(time);
      expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/); // US date format
    });
  });

  describe('getPriorityBadgeInfo', () => {
    test('should return urgent badge info', () => {
      const info = AnnouncementService.getPriorityBadgeInfo('urgent');
      expect(info.label).toBe('URGENT');
      expect(info.color).toBe('bg-red-500 text-white');
      expect(info.icon).toBe('🚨');
    });

    test('should return high badge info', () => {
      const info = AnnouncementService.getPriorityBadgeInfo('high');
      expect(info.label).toBe('HIGH');
      expect(info.color).toBe('bg-yellow-500 text-black');
      expect(info.icon).toBe('⚠️');
    });

    test('should return normal badge info', () => {
      const info = AnnouncementService.getPriorityBadgeInfo('normal');
      expect(info.label).toBe('NORMAL');
      expect(info.color).toBe('bg-gray-500 text-white');
      expect(info.icon).toBe('📢');
    });
  });

  describe('getRoleBadgeInfo', () => {
    test('should return admin badge info', () => {
      const info = AnnouncementService.getRoleBadgeInfo('admin');
      expect(info.label).toBe('ADMIN');
      expect(info.color).toBe('bg-purple-600 text-white');
      expect(info.icon).toBe('👑');
    });

    test('should return judge badge info', () => {
      const info = AnnouncementService.getRoleBadgeInfo('judge');
      expect(info.label).toBe('JUDGE');
      expect(info.color).toBe('bg-blue-600 text-white');
      expect(info.icon).toBe('⚖️');
    });

    test('should return steward badge info', () => {
      const info = AnnouncementService.getRoleBadgeInfo('steward');
      expect(info.label).toBe('STEWARD');
      expect(info.color).toBe('bg-green-600 text-white');
      expect(info.icon).toBe('📋');
    });
  });
});
