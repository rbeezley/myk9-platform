import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAnnouncementStore } from '../announcementStore';
import type { ShowAnnouncement } from '@/types/announcement-types';

// Mock query functions
vi.mock('@/services/database/announcements', () => ({
  getAnnouncementsByShow: vi.fn(),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  markAnnouncementRead: vi.fn(),
  markAllAnnouncementsRead: vi.fn(),
}));

// Mock supabase for realtime
const mockSubscribe = vi.fn().mockResolvedValue(undefined);
const mockChannel = vi.fn().mockReturnValue({
  on: vi.fn().mockReturnThis(),
  subscribe: mockSubscribe,
});
const mockRemoveChannel = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/store/toastStore', () => ({
  useToastStore: {
    getState: () => ({ addToast: vi.fn() }),
  },
}));

const { getAnnouncementsByShow, createAnnouncement: createQuery } =
  await import('@/services/database/announcements');

function makeAnnouncement(overrides: Partial<ShowAnnouncement> = {}): ShowAnnouncement {
  return {
    id: 'ann-1',
    show_id: 'show-1',
    author_id: 'user-1',
    author_role: 'secretary',
    author_name: 'Test User',
    title: 'Test',
    content: 'Content',
    priority: 'normal',
    expires_at: null,
    is_active: true,
    created_at: '2026-03-10T10:00:00Z',
    updated_at: '2026-03-10T10:00:00Z',
    is_read: false,
    ...overrides,
  };
}

describe('announcementStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useAnnouncementStore.setState({
      announcements: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      currentShowIds: [],
      channels: [],
    });
  });

  describe('subscribe', () => {
    it('fetches announcements and sets up realtime channels', async () => {
      const ann = makeAnnouncement();
      vi.mocked(getAnnouncementsByShow).mockResolvedValue([ann]);

      await useAnnouncementStore.getState().subscribe(['show-1']);

      const state = useAnnouncementStore.getState();
      expect(state.announcements).toHaveLength(1);
      expect(state.unreadCount).toBe(1);
      expect(state.currentShowIds).toEqual(['show-1']);
      expect(mockChannel).toHaveBeenCalledWith('announcements-show-1');
    });

    it('skips if already subscribed to same shows', async () => {
      useAnnouncementStore.setState({ currentShowIds: ['show-1'] });
      await useAnnouncementStore.getState().subscribe(['show-1']);
      expect(getAnnouncementsByShow).not.toHaveBeenCalled();
    });

    it('clears state when subscribing to empty shows', async () => {
      useAnnouncementStore.setState({
        announcements: [makeAnnouncement()],
        unreadCount: 1,
        currentShowIds: ['show-1'],
      });

      await useAnnouncementStore.getState().subscribe([]);

      const state = useAnnouncementStore.getState();
      expect(state.announcements).toEqual([]);
      expect(state.unreadCount).toBe(0);
    });

    it('sets error on fetch failure', async () => {
      vi.mocked(getAnnouncementsByShow).mockRejectedValue(new Error('Network error'));

      await useAnnouncementStore.getState().subscribe(['show-1']);

      expect(useAnnouncementStore.getState().error).toBe('Network error');
    });
  });

  describe('createAnnouncement', () => {
    it('optimistically adds and then replaces with server data', async () => {
      const created = makeAnnouncement({ id: 'server-id', title: 'From Server' });
      vi.mocked(createQuery).mockResolvedValue(created);

      await useAnnouncementStore
        .getState()
        .createAnnouncement(
          { show_id: 'show-1', title: 'New', content: 'Body', priority: 'normal' },
          'user-1',
          'secretary',
          'Jane'
        );

      const state = useAnnouncementStore.getState();
      expect(state.announcements).toHaveLength(1);
      expect(state.announcements[0].id).toBe('server-id');
    });

    it('rolls back on failure', async () => {
      vi.mocked(createQuery).mockRejectedValue(new Error('Insert failed'));

      await expect(
        useAnnouncementStore
          .getState()
          .createAnnouncement(
            { show_id: 'show-1', title: 'New', content: 'Body', priority: 'normal' },
            'user-1',
            'secretary',
            'Jane'
          )
      ).rejects.toThrow('Insert failed');

      expect(useAnnouncementStore.getState().announcements).toHaveLength(0);
    });
  });

  describe('deleteAnnouncement', () => {
    it('optimistically removes the announcement', async () => {
      const { deleteAnnouncement: deleteMock } =
        await import('@/services/database/announcements');
      vi.mocked(deleteMock).mockResolvedValue(undefined);
      useAnnouncementStore.setState({
        announcements: [makeAnnouncement()],
        unreadCount: 1,
      });

      await useAnnouncementStore.getState().deleteAnnouncement('ann-1');

      expect(useAnnouncementStore.getState().announcements).toHaveLength(0);
      expect(useAnnouncementStore.getState().unreadCount).toBe(0);
    });
  });

  describe('markRead', () => {
    it('marks a single announcement as read', async () => {
      useAnnouncementStore.setState({
        announcements: [makeAnnouncement({ is_read: false })],
        unreadCount: 1,
      });

      await useAnnouncementStore.getState().markRead('ann-1', 'user-1');

      const state = useAnnouncementStore.getState();
      expect(state.announcements[0].is_read).toBe(true);
      expect(state.unreadCount).toBe(0);
    });
  });

  describe('markAllRead', () => {
    it('marks all announcements as read', async () => {
      useAnnouncementStore.setState({
        announcements: [
          makeAnnouncement({ id: 'a1', is_read: false }),
          makeAnnouncement({ id: 'a2', is_read: false }),
        ],
        unreadCount: 2,
      });

      await useAnnouncementStore.getState().markAllRead('user-1');

      const state = useAnnouncementStore.getState();
      expect(state.announcements.every(a => a.is_read)).toBe(true);
      expect(state.unreadCount).toBe(0);
    });

    it('skips when no unread announcements', async () => {
      const { markAllAnnouncementsRead } =
        await import('@/services/database/announcements');
      useAnnouncementStore.setState({
        announcements: [makeAnnouncement({ is_read: true })],
        unreadCount: 0,
      });

      await useAnnouncementStore.getState().markAllRead('user-1');
      expect(markAllAnnouncementsRead).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('removes all channels and clears show IDs', () => {
      const fakeChannel = { topic: 'test' };
      useAnnouncementStore.setState({
        channels: [fakeChannel as never],
        currentShowIds: ['show-1'],
      });

      useAnnouncementStore.getState().unsubscribe();

      expect(mockRemoveChannel).toHaveBeenCalledWith(fakeChannel);
      expect(useAnnouncementStore.getState().currentShowIds).toEqual([]);
      expect(useAnnouncementStore.getState().channels).toEqual([]);
    });
  });
});
