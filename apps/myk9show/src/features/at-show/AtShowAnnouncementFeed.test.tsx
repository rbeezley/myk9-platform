import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/test/utils/testUtils';
import { AtShowAnnouncementFeed } from './AtShowAnnouncementFeed';
import { useAnnouncementStore } from '@/store/announcementStore';
import type { ShowAnnouncement } from '@/types/announcement-types';

// J5.4 / R1 — a judge/steward signed in via show passcode has no account-side
// Message Center (ringside is mounted outside UnifiedAppLayout). This feed
// mounts the EXISTING announcement store/component read-only inside the
// AtShowAccessGate guard stack. No composer is rendered here.

const mockUser = { id: 'passcode-anon-user-1' };

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: mockUser }),
}));

function makeAnnouncement(overrides: Partial<ShowAnnouncement> = {}): ShowAnnouncement {
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
    ...overrides,
  };
}

describe('AtShowAnnouncementFeed', () => {
  beforeEach(() => {
    useAnnouncementStore.setState({
      announcements: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      currentShowIds: [],
      channels: [],
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn(),
      markRead: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('renders children with no banner when there are no announcements for the show', () => {
    render(
      <AtShowAnnouncementFeed showId="show-1">
        <div>RINGSIDE CONTENT</div>
      </AtShowAnnouncementFeed>
    );

    expect(screen.getByText('RINGSIDE CONTENT')).toBeInTheDocument();
    expect(screen.queryByText('Show announcements')).not.toBeInTheDocument();
  });

  it('subscribes to the current show on mount', () => {
    const subscribe = vi.fn().mockResolvedValue(undefined);
    useAnnouncementStore.setState({ subscribe });

    render(
      <AtShowAnnouncementFeed showId="show-1">
        <div>RINGSIDE CONTENT</div>
      </AtShowAnnouncementFeed>
    );

    expect(subscribe).toHaveBeenCalledWith(['show-1']);
  });

  it('renders the feed for a passcode session and shows the announcement on expand', () => {
    useAnnouncementStore.setState({
      announcements: [makeAnnouncement()],
      unreadCount: 1,
    });

    render(
      <AtShowAnnouncementFeed showId="show-1">
        <div>RINGSIDE CONTENT</div>
      </AtShowAnnouncementFeed>
    );

    // Banner renders collapsed by default, with the unread badge.
    expect(screen.getByText('Show announcements')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('Ring 2 delayed 15 minutes')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show announcements/i }));

    expect(screen.getByText('Ring 2 delayed 15 minutes')).toBeInTheDocument();
    // Underlying page content still renders alongside the feed (not replaced).
    expect(screen.getByText('RINGSIDE CONTENT')).toBeInTheDocument();
  });

  it('does not render any compose affordance (read-only, per R1 design)', () => {
    useAnnouncementStore.setState({ announcements: [makeAnnouncement()], unreadCount: 1 });

    render(
      <AtShowAnnouncementFeed showId="show-1">
        <div>RINGSIDE CONTENT</div>
      </AtShowAnnouncementFeed>
    );
    fireEvent.click(screen.getByRole('button', { name: /show announcements/i }));

    expect(screen.queryByRole('button', { name: /compose/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('marks an announcement read on click, using the caller session id', () => {
    const markRead = vi.fn().mockResolvedValue(undefined);
    useAnnouncementStore.setState({
      announcements: [makeAnnouncement()],
      unreadCount: 1,
      markRead,
    });

    render(
      <AtShowAnnouncementFeed showId="show-1">
        <div>RINGSIDE CONTENT</div>
      </AtShowAnnouncementFeed>
    );
    fireEvent.click(screen.getByRole('button', { name: /show announcements/i }));
    fireEvent.click(screen.getByRole('article', { name: 'Ring 2 delayed 15 minutes' }));

    expect(markRead).toHaveBeenCalledWith('ann-1', 'passcode-anon-user-1');
  });
});
