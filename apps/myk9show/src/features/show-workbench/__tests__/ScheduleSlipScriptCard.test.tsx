import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { ScheduleSlipScriptCard } from '../ScheduleSlipScriptCard';

const mockCreateAnnouncement = vi.hoisted(() => vi.fn());
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
    selector: (state: { createAnnouncement: typeof mockCreateAnnouncement }) => unknown
  ) =>
    selector({ createAnnouncement: mockCreateAnnouncement }),
}));

describe('ScheduleSlipScriptCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAnnouncement.mockResolvedValue(undefined);
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
          expires_at: null,
        },
        'user-1',
        'secretary',
        'Jane Secretary'
      );
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Schedule announcement posted');
  });
});
