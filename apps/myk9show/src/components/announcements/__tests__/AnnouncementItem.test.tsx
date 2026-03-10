import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnnouncementItem } from '../AnnouncementItem';
import type { ShowAnnouncement } from '@/types/announcement-types';

vi.mock('@/lib/timeUtils', () => ({
  formatRelativeTime: () => '2m ago',
}));

vi.mock('@/components/notifications/notification-styles', () => ({
  PRIORITY_BORDER: {
    urgent: 'border-l-red-500',
    high: 'border-l-amber-500',
    normal: 'border-l-blue-500',
  },
}));

function makeAnnouncement(overrides: Partial<ShowAnnouncement> = {}): ShowAnnouncement {
  return {
    id: 'ann-1',
    show_id: 'show-1',
    author_id: 'user-1',
    author_role: 'secretary',
    author_name: 'Jane Doe',
    title: 'Gate 3 Moved',
    content: 'Gate 3 has been moved to Ring B',
    priority: 'normal',
    expires_at: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_read: false,
    ...overrides,
  };
}

describe('AnnouncementItem', () => {
  it('renders title, content, author, and role badge', () => {
    render(<AnnouncementItem announcement={makeAnnouncement()} />);

    expect(screen.getByText('Gate 3 Moved')).toBeInTheDocument();
    expect(screen.getByText('Gate 3 has been moved to Ring B')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Secretary')).toBeInTheDocument();
  });

  it('applies reduced opacity when read', () => {
    const { container } = render(
      <AnnouncementItem announcement={makeAnnouncement({ is_read: true })} />
    );
    expect(container.firstChild).toHaveClass('opacity-50');
  });

  it('calls onMarkRead when clicked and unread', () => {
    const onMarkRead = vi.fn();
    render(<AnnouncementItem announcement={makeAnnouncement()} onMarkRead={onMarkRead} />);

    fireEvent.click(screen.getByRole('article'));
    expect(onMarkRead).toHaveBeenCalledWith('ann-1');
  });

  it('does not call onMarkRead when already read', () => {
    const onMarkRead = vi.fn();
    render(
      <AnnouncementItem
        announcement={makeAnnouncement({ is_read: true })}
        onMarkRead={onMarkRead}
      />
    );

    fireEvent.click(screen.getByRole('article'));
    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it('shows edit/delete buttons when showActions is true', () => {
    render(
      <AnnouncementItem
        announcement={makeAnnouncement()}
        showActions
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Edit announcement')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete announcement')).toBeInTheDocument();
  });

  it('hides edit/delete buttons by default', () => {
    render(<AnnouncementItem announcement={makeAnnouncement()} />);

    expect(screen.queryByLabelText('Edit announcement')).not.toBeInTheDocument();
  });

  it('calls onDelete with announcement id', () => {
    const onDelete = vi.fn();
    render(<AnnouncementItem announcement={makeAnnouncement()} showActions onDelete={onDelete} />);

    fireEvent.click(screen.getByLabelText('Delete announcement'));
    expect(onDelete).toHaveBeenCalledWith('ann-1');
  });

  it('renders urgent priority with red styling', () => {
    render(<AnnouncementItem announcement={makeAnnouncement({ priority: 'urgent' })} />);
    const article = screen.getByRole('article');
    expect(article).toHaveClass('border-l-red-500');
  });
});
