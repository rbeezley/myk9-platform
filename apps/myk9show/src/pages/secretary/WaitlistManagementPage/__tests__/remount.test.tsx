/**
 * The replica subscription only listens while the tab is mounted. A queue cached from an earlier
 * visit must be re-read on remount, or the secretary sees a list that predates what changed while
 * they were away. Real query lifecycle with one shared cache across the unmount.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render, createTestQueryClient } from '@/test/utils/testUtils';
import { getWaitlistByClass } from '@/services/database/waitlists';
import WaitlistManagementPage from '../index';

const row = (id: string, dog: string) => ({
  id,
  class_id: 'c1',
  dog_id: `d-${id}`,
  exhibitor_id: 'e1',
  handler_id: null,
  joined_via: null,
  position: 1,
  status: 'waiting',
  offered_at: null,
  offer_expires_at: null,
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T10:00:00Z',
  dog: { id: `d-${id}`, name: dog, call_name: dog },
  class: { id: 'c1', name: 'Novice A', class_number: '1', max_entries: null },
});

vi.mock('@/services/database/waitlists', () => ({
  getClassesWithWaitlistCounts: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'c1',
        name: 'Novice A',
        class_number: '1',
        max_entries: null,
        trial_id: 't1',
        trial: { id: 't1', name: 'Trial 1', date: '2026-10-10' },
        accepted_count: 1,
        waitlist_count: 1,
      },
    ],
    error: null,
  }),
  getWaitlistByClass: vi.fn(),
  promoteWaitlistEntry: vi.fn(),
  removeFromWaitlist: vi.fn(),
  sendWaitlistOfferMessage: vi.fn(),
}));
vi.mock('@/hooks/queries/useJudgeDayCapacity', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/queries/useJudgeDayCapacity')>()),
  useJudgeDayCapacity: () => ({ judgeDays: [], isPaused: false }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: () => true }),
}));
vi.mock('@/components/shows/WaitListSettingsCard', () => ({
  WaitListSettingsCard: () => <div />,
}));

describe('WaitlistManagementPage remount', () => {
  it('re-reads the replica when the tab comes back, instead of showing the cached queue', async () => {
    const queryClient = createTestQueryClient();
    vi.mocked(getWaitlistByClass).mockResolvedValue({
      data: [row('w1', 'Bella')],
      error: null,
    } as never);
    const first = render(<WaitlistManagementPage showId="show-1" />, { queryClient });
    expect(await screen.findByText('Bella')).toBeInTheDocument();
    first.unmount();

    // Changed while the tab (and so its replica subscription) was gone.
    vi.mocked(getWaitlistByClass).mockResolvedValue({
      data: [row('w2', 'Tera')],
      error: null,
    } as never);
    render(<WaitlistManagementPage showId="show-1" />, { queryClient });

    expect(await screen.findByText('Tera')).toBeInTheDocument();
    expect(screen.queryByText('Bella')).not.toBeInTheDocument();
  });
});
