import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { ScheduleSlipScriptCard } from '../ScheduleSlipScriptCard';

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

describe('ScheduleSlipScriptCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAnnouncement.mockResolvedValue({ id: 'announcement-1' });
    mockDeleteAnnouncement.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates the generated PA script and copies it', async () => {
    const { user } = render(
      <ScheduleSlipScriptCard
        showId="show-1"
        showName="Bluegrass Classic"
        defaultClassName="Container Novice A"
      />
    );

    expect(screen.getByRole('heading', { name: 'Schedule delay script' })).toBeInTheDocument();
    expect((screen.getByLabelText('PA script') as HTMLTextAreaElement).value).toContain(
      'Container Novice A will start later than the posted schedule.'
    );

    await user.clear(screen.getByLabelText('Ring or area'));
    await user.type(screen.getByLabelText('Ring or area'), 'Ring 3');
    await user.clear(screen.getByLabelText('Delay minutes'));
    await user.type(screen.getByLabelText('Delay minutes'), '45');
    await user.clear(screen.getByLabelText('Affected class'));
    await user.type(screen.getByLabelText('Affected class'), 'Interior Advanced');
    await user.type(screen.getByLabelText('Optional note'), 'Gate will call the next class twice.');

    const script = screen.getByLabelText('PA script');
    expect((script as HTMLTextAreaElement).value).toContain(
      'Ring 3 is running about 45 minutes behind'
    );
    expect((script as HTMLTextAreaElement).value).toContain(
      'Interior Advanced will start later than the posted schedule.'
    );
    expect((script as HTMLTextAreaElement).value).toContain('Gate will call the next class twice.');

    const expectedScript = (script as HTMLTextAreaElement).value;
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Copy script' }));

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith(expectedScript);
    });
  });

  it('uses the default delay when the delay field is empty', async () => {
    const { user } = render(
      <ScheduleSlipScriptCard
        showId="show-1"
        showName="Bluegrass Classic"
        defaultClassName="Container Novice A"
      />
    );

    await user.clear(screen.getByLabelText('Delay minutes'));

    expect((screen.getByLabelText('PA script') as HTMLTextAreaElement).value).toContain(
      'Ring 1 is running about 30 minutes behind.'
    );
  });

  it('posts the generated script as a normal show announcement', async () => {
    const { user } = render(
      <ScheduleSlipScriptCard
        showId="show-1"
        showName="Bluegrass Classic"
        defaultClassName="Container Novice A"
      />
    );

    await user.clear(screen.getByLabelText('Ring or area'));
    await user.type(screen.getByLabelText('Ring or area'), 'Ring 3');
    await user.click(screen.getByRole('button', { name: 'Post announcement' }));

    await waitFor(() => {
      expect(mockCreateAnnouncement).toHaveBeenCalledWith(
        {
          show_id: 'show-1',
          title: 'Schedule delay: Ring 3',
          content: expect.stringContaining('Ring 3 is running about 30 minutes behind.'),
          priority: 'normal',
          expires_at: expect.any(String),
        },
        'user-1',
        'secretary',
        'Jane Secretary'
      );
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Schedule announcement posted',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Undo' }),
      })
    );
    expect(screen.getByLabelText('Ring or area')).toHaveValue('Ring 1');
  });

  it('can undo a posted schedule announcement from the success toast', async () => {
    const { user } = render(
      <ScheduleSlipScriptCard
        showId="show-1"
        showName="Bluegrass Classic"
        defaultClassName="Container Novice A"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Post announcement' }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        'Schedule announcement posted',
        expect.objectContaining({
          action: expect.objectContaining({ label: 'Undo' }),
        })
      );
    });

    const undoOptions = mockToastSuccess.mock.calls.find(
      ([message]) => message === 'Schedule announcement posted'
    )?.[1] as { action: { onClick: () => void } };
    undoOptions.action.onClick();

    await waitFor(() => {
      expect(mockDeleteAnnouncement).toHaveBeenCalledWith('announcement-1');
    });
  });

  it('posts a checked push alert on the high-priority announcement lane', async () => {
    const { user } = render(
      <ScheduleSlipScriptCard
        showId="show-1"
        showName="Bluegrass Classic"
        defaultClassName="Container Novice A"
      />
    );

    await user.click(screen.getByLabelText('Send push alert'));
    await user.click(screen.getByRole('button', { name: 'Post announcement' }));

    await waitFor(() => {
      expect(mockCreateAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'high',
        }),
        'user-1',
        'secretary',
        'Jane Secretary'
      );
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Schedule announcement posted and push alert queued',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Undo' }),
      })
    );
  });

  it('shows an error and re-enables posting when announcement creation fails', async () => {
    mockCreateAnnouncement.mockRejectedValueOnce(new Error('boom'));
    const { user } = render(
      <ScheduleSlipScriptCard
        showId="show-1"
        showName="Bluegrass Classic"
        defaultClassName="Container Novice A"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Post announcement' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Could not post schedule announcement');
    });
    expect(screen.getByRole('button', { name: 'Post announcement' })).not.toBeDisabled();
  });
});
