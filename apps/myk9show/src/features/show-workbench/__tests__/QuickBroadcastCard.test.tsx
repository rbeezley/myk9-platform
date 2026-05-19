import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { QuickBroadcastCard } from '../QuickBroadcastCard';

const mockCreateAnnouncement = vi.hoisted(() => vi.fn());
const mockDeleteAnnouncement = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());
const mockToastSuccess = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'user-1', email: 'secretary@example.com' },
    userWithRoles: {
      id: 'user-1',
      email: 'secretary@example.com',
      roles: ['secretary'],
      user_metadata: { full_name: 'Jane Secretary' },
    },
  }),
}));

vi.mock('@/store/announcementStore', () => ({
  useAnnouncementStore: (
    selector: (state: {
      createAnnouncement: typeof mockCreateAnnouncement;
      deleteAnnouncement: typeof mockDeleteAnnouncement;
    }) => unknown
  ) =>
    selector({
      createAnnouncement: mockCreateAnnouncement,
      deleteAnnouncement: mockDeleteAnnouncement,
    }),
}));

describe('QuickBroadcastCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAnnouncement.mockResolvedValue({ id: 'announcement-1' });
    mockDeleteAnnouncement.mockResolvedValue(undefined);
  });

  it('loads canned templates into editable fields', async () => {
    const { user } = render(<QuickBroadcastCard showId="show-1" />);

    await user.click(screen.getByRole('button', { name: 'Ring paused' }));

    expect(screen.getByLabelText('Title')).toHaveValue('Ring paused');
    expect(screen.getByLabelText('Message')).toHaveValue(
      'Ring activity is paused for a short break. Please stay nearby and listen for updates.'
    );
  });

  it('posts an edited template as a normal show announcement', async () => {
    const { user } = render(<QuickBroadcastCard showId="show-1" />);

    await user.click(screen.getByRole('button', { name: 'Ring paused' }));
    await user.clear(screen.getByLabelText('Message'));
    await user.type(screen.getByLabelText('Message'), 'Ring 2 will resume shortly.');
    await user.click(screen.getByRole('button', { name: 'Post broadcast' }));

    await waitFor(() => {
      expect(mockCreateAnnouncement).toHaveBeenCalledWith(
        {
          show_id: 'show-1',
          title: 'Ring paused',
          content: 'Ring 2 will resume shortly.',
          priority: 'normal',
          expires_at: expect.any(String),
        },
        'user-1',
        'secretary',
        'Jane Secretary'
      );
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Broadcast posted',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Undo' }),
      })
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Lunch is ready');
  });

  it('can undo a posted quick broadcast from the success toast', async () => {
    const { user } = render(<QuickBroadcastCard showId="show-1" />);

    await user.click(screen.getByRole('button', { name: 'Post broadcast' }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        'Broadcast posted',
        expect.objectContaining({
          action: expect.objectContaining({ label: 'Undo' }),
        })
      );
    });

    const undoOptions = mockToastSuccess.mock.calls.find(
      ([message]) => message === 'Broadcast posted'
    )?.[1] as { action: { onClick: () => void } };
    undoOptions.action.onClick();

    await waitFor(() => {
      expect(mockDeleteAnnouncement).toHaveBeenCalledWith('announcement-1');
    });
  });

  it('does not post blank copy', async () => {
    const { user } = render(<QuickBroadcastCard showId="show-1" />);

    await user.clear(screen.getByLabelText('Title'));
    await user.click(screen.getByRole('button', { name: 'Post broadcast' }));

    expect(mockToastError).toHaveBeenCalledWith('Add a title and message before posting');
    expect(mockCreateAnnouncement).not.toHaveBeenCalled();
  });
});
