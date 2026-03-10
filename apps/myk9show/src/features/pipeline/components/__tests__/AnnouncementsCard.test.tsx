import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnnouncementsCard } from '../AnnouncementsCard';
import type { ShowAnnouncement } from '@/types/announcement-types';

// Mock stores
const mockAnnouncements: ShowAnnouncement[] = [];
const mockMarkRead = vi.fn();
const mockDeleteAnnouncement = vi.fn();

vi.mock('@/store/announcementStore', () => ({
  useAnnouncementStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      announcements: mockAnnouncements,
      unreadCount: mockAnnouncements.filter(a => !a.is_read).length,
      markRead: mockMarkRead,
      deleteAnnouncement: mockDeleteAnnouncement,
    }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: {
      id: 'user-1',
      name: 'Jane Doe',
      email: 'jane@test.com',
      roles: ['secretary'],
      scopes: [],
    },
  }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn() },
}));

function makeAnnouncement(overrides: Partial<ShowAnnouncement> = {}): ShowAnnouncement {
  return {
    id: 'ann-1',
    show_id: 'show-1',
    author_id: 'user-1',
    author_role: 'secretary',
    author_name: 'Jane Doe',
    title: 'Test Announcement',
    content: 'Test content',
    priority: 'normal',
    expires_at: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_read: false,
    ...overrides,
  };
}

describe('AnnouncementsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnnouncements.length = 0;
  });

  it('renders header with Announcements title', () => {
    render(<AnnouncementsCard showId="show-1" />);
    expect(screen.getByText('Announcements')).toBeInTheDocument();
  });

  it('shows empty state when no announcements', () => {
    render(<AnnouncementsCard showId="show-1" />);
    expect(screen.getByText('No announcements yet')).toBeInTheDocument();
  });

  it('renders announcements for the given show', () => {
    mockAnnouncements.push(makeAnnouncement());
    render(<AnnouncementsCard showId="show-1" />);
    expect(screen.getByText('Test Announcement')).toBeInTheDocument();
  });

  it('filters announcements to only the given show', () => {
    mockAnnouncements.push(makeAnnouncement({ show_id: 'other-show' }));
    render(<AnnouncementsCard showId="show-1" />);
    expect(screen.getByText('No announcements yet')).toBeInTheDocument();
  });

  it('shows New button for officials', () => {
    render(<AnnouncementsCard showId="show-1" />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('opens create dialog when New is clicked', () => {
    render(<AnnouncementsCard showId="show-1" />);
    fireEvent.click(screen.getByText('New'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows unread count badge', () => {
    mockAnnouncements.push(makeAnnouncement({ is_read: false }));
    render(<AnnouncementsCard showId="show-1" />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
