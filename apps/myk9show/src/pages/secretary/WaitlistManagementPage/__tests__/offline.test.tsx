/**
 * The waitlist reads come from the replica, so the tab must work offline. The app's query client
 * defaults to networkMode 'online', which parks a query offline (pending + paused) and never calls
 * its reader. Real query lifecycle here: no mocked useJudgeDayCapacity, a fresh cache, offline.
 */
import { onlineManager } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { NetworkStatusTestProvider } from '@/test/utils/NetworkStatusTestProvider';
import WaitlistManagementPage from '../index';

// The online case needs the server's judge-day answer: an open spot is decided against it.
vi.mock('@/services/database/supabaseClient', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/database/supabaseClient')>();
  const chain = () => {
    const c: Record<string, unknown> = {
      select: () => c,
      eq: () => c,
      single: () => c,
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return c;
  };
  const rpc = () =>
    Promise.resolve({
      data: [
        {
          judge_id: 'j1',
          judge_full_name: 'Judge One',
          show_date: '2026-10-10',
          class_ids: ['c1'],
          class_names: ['Novice A'],
          day_capacity: 10,
          day_taken: 3,
          day_mail_in_reserved: 0,
          day_remaining: 7,
          waitlist_count: 1,
        },
      ],
      error: null,
    });
  return {
    ...actual,
    supabase: new Proxy(actual.supabase, {
      get: (target, key, receiver) =>
        key === 'from' ? chain : key === 'rpc' ? rpc : Reflect.get(target, key, receiver),
    }),
  };
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
  getWaitlistOffersByClass: vi.fn().mockResolvedValue({ data: [], error: null }),
  getWaitlistByClass: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'w1',
        class_id: 'c1',
        dog_id: 'd1',
        exhibitor_id: 'e1',
        handler_id: null,
        joined_via: null,
        position: 1,
        status: 'waiting',
        offered_at: null,
        offer_expires_at: null,
        created_at: '2026-03-01T10:00:00Z',
        updated_at: '2026-03-01T10:00:00Z',
        dog: { id: 'd1', name: 'Bella', call_name: 'Bella' },
        class: { id: 'c1', name: 'Novice A', class_number: '1', max_entries: null },
      },
    ],
    error: null,
  }),
  promoteWaitlistEntry: vi.fn(),
  removeFromWaitlist: vi.fn(),
  sendWaitlistOfferMessage: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: () => true }),
}));

vi.mock('@/components/shows/WaitListSettingsCard', () => ({
  WaitListSettingsCard: () => <div />,
}));

describe('WaitlistManagementPage offline', () => {
  beforeEach(() => {
    onlineManager.setOnline(false);
  });
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('reads the wait lists from the replica and says the capacity cards are unavailable', async () => {
    render(<WaitlistManagementPage showId="show-1" />);

    expect(await screen.findByText('Bella')).toBeInTheDocument();
    expect(screen.getByTestId('judge-day-capacity-offline')).toBeInTheDocument();
    expect(screen.queryByText(/spots? available/)).not.toBeInTheDocument();
  });

  it('offers no spot (the judge-day answer is online-only), disables Remove, and says so, when the app is offline', async () => {
    render(
      <NetworkStatusTestProvider
        value={{
          isOnline: false,
          quality: null,
        }}
      >
        <WaitlistManagementPage showId="show-1" />
      </NetworkStatusTestProvider>
    );

    await screen.findByText('Bella');
    expect(screen.queryByRole('button', { name: /^Offer/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove/ })).toBeDisabled();
    expect(screen.getByTestId('waitlist-online-only')).toHaveTextContent('Online only');
  });

  it('leaves Offer and Remove enabled when online', async () => {
    onlineManager.setOnline(true);
    render(<WaitlistManagementPage showId="show-1" />);

    await screen.findByText('Bella');
    expect(await screen.findByRole('button', { name: 'Offer spot to Bella' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Remove/ })).toBeEnabled();
    expect(screen.queryByTestId('waitlist-online-only')).not.toBeInTheDocument();
  });
});
