import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchShowAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  markAnnouncementRead,
  markAllAnnouncementsRead,
} from '../announcementQueries';

// Mock supabase client
const mockFrom = vi.fn();

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function chainMock(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    ...overrides,
  };
  // Make all methods return chain by default
  for (const [key, val] of Object.entries(chain)) {
    if (typeof val === 'function' && !(key in overrides)) {
      (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  }
  return chain;
}

describe('announcementQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchShowAnnouncements', () => {
    it('returns announcements with is_read computed from reads table', async () => {
      const announcements = [
        { id: 'a1', show_id: 's1', title: 'Test 1', is_active: true, created_at: '2026-01-01' },
        { id: 'a2', show_id: 's1', title: 'Test 2', is_active: true, created_at: '2026-01-02' },
      ];
      const reads = [{ announcement_id: 'a1' }];

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return chainMock({
            order: vi.fn().mockResolvedValue({ data: announcements, error: null }),
          });
        }
        return chainMock({ in: vi.fn().mockResolvedValue({ data: reads, error: null }) });
      });

      const result = await fetchShowAnnouncements('s1');

      expect(result).toHaveLength(2);
      expect(result[0].is_read).toBe(true);
      expect(result[1].is_read).toBe(false);
    });

    it('returns empty array when no announcements', async () => {
      mockFrom.mockImplementation(() =>
        chainMock({ order: vi.fn().mockResolvedValue({ data: [], error: null }) })
      );

      const result = await fetchShowAnnouncements('s1');
      expect(result).toEqual([]);
    });

    it('throws on supabase error', async () => {
      mockFrom.mockImplementation(() =>
        chainMock({
          order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
        })
      );

      await expect(fetchShowAnnouncements('s1')).rejects.toThrow('DB error');
    });
  });

  describe('createAnnouncement', () => {
    it('inserts and returns the created row', async () => {
      const created = { id: 'new-1', title: 'New', content: 'Body' };
      mockFrom.mockImplementation(() =>
        chainMock({ single: vi.fn().mockResolvedValue({ data: created, error: null }) })
      );

      const result = await createAnnouncement(
        { show_id: 's1', title: 'New', content: 'Body', priority: 'normal' },
        'user-1',
        'secretary',
        'Jane Doe'
      );

      expect(result).toEqual(created);
      expect(mockFrom).toHaveBeenCalledWith('show_announcements');
    });
  });

  describe('updateAnnouncement', () => {
    it('updates and returns the updated row', async () => {
      const updated = { id: 'a1', title: 'Updated' };
      mockFrom.mockImplementation(() =>
        chainMock({ single: vi.fn().mockResolvedValue({ data: updated, error: null }) })
      );

      const result = await updateAnnouncement('a1', { title: 'Updated' });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteAnnouncement', () => {
    it('deletes without error', async () => {
      mockFrom.mockImplementation(() =>
        chainMock({ eq: vi.fn().mockResolvedValue({ error: null }) })
      );

      await expect(deleteAnnouncement('a1')).resolves.toBeUndefined();
    });
  });

  describe('markAnnouncementRead', () => {
    it('upserts a read record', async () => {
      mockFrom.mockImplementation(() =>
        chainMock({ upsert: vi.fn().mockResolvedValue({ error: null }) })
      );

      await expect(markAnnouncementRead('a1', 'u1')).resolves.toBeUndefined();
    });
  });

  describe('markAllAnnouncementsRead', () => {
    it('upserts multiple read records', async () => {
      mockFrom.mockImplementation(() =>
        chainMock({ upsert: vi.fn().mockResolvedValue({ error: null }) })
      );

      await expect(markAllAnnouncementsRead(['a1', 'a2'], 'u1')).resolves.toBeUndefined();
    });

    it('skips when no IDs provided', async () => {
      await markAllAnnouncementsRead([], 'u1');
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });
});
