import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { AtShowAnnouncementSubscription } from './AtShowAnnouncementSubscription';
import { useAnnouncementStore } from '@/store/announcementStore';
import type { ShowAnnouncement } from '@/types/announcement-types';

// Ringside is mounted outside UnifiedAppLayout, so this is the only thing that
// subscribes the announcement store to the show. Reading happens through the
// ringside menu (Message Center); MYK9-1697 deleted the inline bar.

function makeAnnouncement(): ShowAnnouncement {
  return {
    id: 'ann-1',
    show_id: 'show-1',
    author_id: 'author-1',
    author_role: 'secretary',
    author_name: 'Secretary Smith',
    title: 'Ring 2 delayed 15 minutes',
    content: 'Weather delay, resuming shortly.',
    priority: 'high',
    expires_at: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_read: false,
  };
}

describe('AtShowAnnouncementSubscription', () => {
  beforeEach(() => {
    useAnnouncementStore.setState({
      announcements: [],
      unreadCount: 0,
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn(),
    });
  });

  it('subscribes to the current show on mount and unsubscribes on unmount', () => {
    const subscribe = vi.fn().mockResolvedValue(undefined);
    const unsubscribe = vi.fn();
    useAnnouncementStore.setState({ subscribe, unsubscribe });

    const { unmount } = render(
      <AtShowAnnouncementSubscription showId="show-1">
        <div>RINGSIDE CONTENT</div>
      </AtShowAnnouncementSubscription>
    );

    expect(subscribe).toHaveBeenCalledWith(['show-1']);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe without a show', () => {
    const subscribe = vi.fn().mockResolvedValue(undefined);
    useAnnouncementStore.setState({ subscribe });

    render(
      <AtShowAnnouncementSubscription showId={undefined}>
        <div>RINGSIDE CONTENT</div>
      </AtShowAnnouncementSubscription>
    );

    expect(subscribe).not.toHaveBeenCalled();
  });

  it('renders only the ringside screen, never an announcements bar, even with unread announcements', () => {
    useAnnouncementStore.setState({ announcements: [makeAnnouncement()], unreadCount: 1 });

    render(
      <AtShowAnnouncementSubscription showId="show-1">
        <div>RINGSIDE CONTENT</div>
      </AtShowAnnouncementSubscription>
    );

    expect(screen.getByText('RINGSIDE CONTENT')).toBeInTheDocument();
    expect(screen.queryByText('Announcements')).not.toBeInTheDocument();
    expect(screen.queryByText('Ring 2 delayed 15 minutes')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
