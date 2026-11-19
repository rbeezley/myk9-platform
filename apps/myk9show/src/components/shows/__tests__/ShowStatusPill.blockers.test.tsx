/**
 * MYK9-2198: the pill no longer pre-checks club approval or the entry window with a toast. The
 * server's "Before you can publish" list is the one answer: with lines on it, Publish opens the
 * list instead of trying; the server's refusal stays as the backstop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ShowStatusPill } from '../ShowStatusPill';
import { useUpdateShowMutation } from '@/hooks/queries/useShowsDatabase';
import { ENTRY_WINDOW_REQUIRED_MESSAGE } from '@/features/payments/onlineEntryGate';
import type { PublishBlockersState } from '@/features/publishing/usePublishBlockers';
import { toast } from 'sonner';

const { navigate, blockersState } = vi.hoisted(() => ({
  navigate: vi.fn(),
  blockersState: { value: { status: 'ready', blockers: [] } as PublishBlockersState },
}));

vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/features/publishing/usePublishBlockers', () => ({
  showPublishBlockersQueryKey: (id: string) => ['shows', id, 'publish-blockers'],
  usePublishBlockers: () => blockersState.value,
}));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useUpdateShowMutation: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('ShowStatusPill and the publish blockers list (MYK9-2198)', () => {
  let mutateAsync: ReturnType<typeof vi.fn>;
  const onSeeBlockers = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateShowMutation).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateShowMutation>);
    blockersState.value = { status: 'ready', blockers: [] };
  });

  async function clickFirstItem() {
    render(
      <ShowStatusPill
        showId="show-1"
        status="draft"
        clubId="club-1"
        onSeeBlockers={onSeeBlockers}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /draft/i }));
    await user.click(await screen.findByRole('menuitem'));
  }

  it('opens the list instead of publishing when the server lists a blocker, with no toast', async () => {
    blockersState.value = {
      status: 'ready',
      blockers: [{ key: 'entry_dates_missing', waitingOn: 'secretary', eta: null }],
    };
    render(
      <ShowStatusPill
        showId="show-1"
        status="draft"
        clubId="club-1"
        onSeeBlockers={onSeeBlockers}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /draft/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'See what blocks publishing' }));

    expect(onSeeBlockers).toHaveBeenCalledTimes(1);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('publishes when the list is empty, with no client-side club or date toast', async () => {
    await clickFirstItem();

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'published' } });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('still tries when the list could not be read, and the server refusal is the answer', async () => {
    blockersState.value = { status: 'error', retry: vi.fn() };
    mutateAsync.mockRejectedValueOnce({ code: 'MK005', message: ENTRY_WINDOW_REQUIRED_MESSAGE });
    await clickFirstItem();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      ENTRY_WINDOW_REQUIRED_MESSAGE,
      expect.objectContaining({ action: expect.objectContaining({ label: 'Set entry window' }) })
    );
  });
});
