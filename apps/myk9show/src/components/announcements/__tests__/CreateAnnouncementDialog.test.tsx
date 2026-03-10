import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateAnnouncementDialog } from '../CreateAnnouncementDialog';

// Mock store
const mockCreateAnnouncement = vi.fn();
vi.mock('@/store/announcementStore', () => ({
  useAnnouncementStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ createAnnouncement: mockCreateAnnouncement }),
}));

// Mock notifications
vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn() },
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  showId: 'show-1',
  showEndDate: '2026-03-15T17:00:00Z',
  authorId: 'user-1',
  authorRole: 'secretary' as const,
  authorName: 'Jane Doe',
};

describe('CreateAnnouncementDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAnnouncement.mockResolvedValue(undefined);
  });

  it('renders form fields when open', () => {
    render(<CreateAnnouncementDialog {...defaultProps} />);

    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('returns null when not open', () => {
    const { container } = render(<CreateAnnouncementDialog {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('disables submit when title or content is empty', () => {
    render(<CreateAnnouncementDialog {...defaultProps} />);
    expect(screen.getByText('Post Announcement')).toBeDisabled();
  });

  it('submits the form with correct data', async () => {
    const user = userEvent.setup();
    render(<CreateAnnouncementDialog {...defaultProps} />);

    await user.type(screen.getByLabelText('Title'), 'Test Title');
    await user.type(screen.getByLabelText('Message'), 'Test content');
    await user.click(screen.getByText('Post Announcement'));

    await waitFor(() => {
      expect(mockCreateAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({
          show_id: 'show-1',
          title: 'Test Title',
          content: 'Test content',
          priority: 'normal',
        }),
        'user-1',
        'secretary',
        'Jane Doe'
      );
    });
  });

  it('allows changing priority', async () => {
    const user = userEvent.setup();
    render(<CreateAnnouncementDialog {...defaultProps} />);

    await user.click(screen.getByText('Urgent'));
    expect(screen.getByText('Urgent').closest('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onClose after successful submit', async () => {
    const user = userEvent.setup();
    render(<CreateAnnouncementDialog {...defaultProps} />);

    await user.type(screen.getByLabelText('Title'), 'Title');
    await user.type(screen.getByLabelText('Message'), 'Content');
    await user.click(screen.getByText('Post Announcement'));

    await waitFor(() => {
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  it('shows error notification on failure', async () => {
    mockCreateAnnouncement.mockRejectedValue(new Error('fail'));
    const user = userEvent.setup();
    render(<CreateAnnouncementDialog {...defaultProps} />);

    await user.type(screen.getByLabelText('Title'), 'Title');
    await user.type(screen.getByLabelText('Message'), 'Content');
    await user.click(screen.getByText('Post Announcement'));

    const { notifications } = await import('@/lib/notifications');
    await waitFor(() => {
      expect(notifications.error).toHaveBeenCalledWith('Failed to post announcement');
    });
  });

  it('closes when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<CreateAnnouncementDialog {...defaultProps} />);

    await user.click(screen.getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
