/**
 * The judge-day capacity cards are a server read with their own failure modes. A failed read must
 * say so and offer the page's one "Try again", never read as "no judge-days" or "0 spots"; and an
 * over-limit day uses the shared wording (MYK9-1006). Real useJudgeDayCapacity, scripted supabase.
 */
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { NetworkStatusContext } from '@/hooks/useNetworkStatus';
import WaitlistManagementPage from '../index';

const state = vi.hoisted(() => ({
  days: null as null | (() => { data: unknown; error: unknown }),
}));

vi.mock('@/services/database/supabaseClient', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/database/supabaseClient')>();
  const chain = (result: () => unknown) => {
    const c: Record<string, unknown> = {
      select: () => c,
      eq: () => c,
      single: () => c,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return c;
  };
  const from = () => chain(() => ({ data: [], error: null }));
  const rpc = (fn: string) =>
    fn === 'get_show_judge_day_capacity_for_manager'
      ? Promise.resolve(state.days!())
      : Promise.reject(new Error(`unexpected rpc ${fn}`));
  // Everything else (auth, functions) stays the real client; only `from` and `rpc` are scripted.
  return {
    ...actual,
    supabase: new Proxy(actual.supabase, {
      get: (target, key, receiver) =>
        key === 'from' ? from : key === 'rpc' ? rpc : Reflect.get(target, key, receiver),
    }),
  };
});

vi.mock('@/services/database/waitlists', () => ({
  getClassesWithWaitlistCounts: vi.fn().mockResolvedValue({ data: [], error: null }),
  getWaitlistOffersByClass: vi.fn().mockResolvedValue({ data: [], error: null }),
  getWaitlistByClass: vi.fn().mockResolvedValue({ data: [], error: null }),
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

const setDay = (confirmed: number, capacity = 3) => {
  const days = {
    data: [
      {
        judge_id: 'j1',
        judge_full_name: 'Judge One',
        show_date: '2026-10-10',
        class_ids: ['c1'],
        class_names: ['Novice A'],
        day_capacity: capacity,
        day_taken: confirmed,
        day_mail_in_reserved: 0,
        day_remaining: Math.max(0, capacity - confirmed),
        waitlist_count: 1,
      },
    ],
    error: null,
  };
  state.days = () => days;
};

describe('WaitlistManagementPage judge-day capacity', () => {
  beforeEach(() => {
    setDay(3);
  });
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('a failed capacity read says so, offers Try again, and recovers', async () => {
    state.days = () => ({ data: null, error: { message: 'rpc down' } });
    render(<WaitlistManagementPage showId="show-1" />);

    const alert = await screen.findByTestId('judge-day-capacity-error');
    expect(screen.queryByText(/spots? available/)).not.toBeInTheDocument();

    setDay(3);
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Judge One')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId('judge-day-capacity-error')).not.toBeInTheDocument()
    );
  });

  it('reads an over-limit judge-day with the shared wording in the stat cards too', async () => {
    setDay(5);
    render(<WaitlistManagementPage showId="show-1" />);
    await screen.findByText('Judge One');
    expect(screen.getAllByText('2 over the limit')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'View Wait List' }));

    await waitFor(() => expect(screen.getAllByText('2 over the limit')).toHaveLength(2));
    expect(screen.getAllByText(/The limit was lowered after entries came in/)).toHaveLength(2);
  });

  // Codex P2 on #2771: a page that loaded online and then went offline while idle keeps its
  // query at fetchStatus 'idle' (nothing asked it to refetch), so "paused" never fires. The cached
  // figures must still be qualified as possibly out of date.
  it('qualifies cached figures as possibly out of date when the page goes offline while idle', async () => {
    const page = (isOnline: boolean) => (
      <NetworkStatusContext.Provider
        value={{
          isOnline,
          quality: null,
          showOfflineMessage: !isOnline,
          retryConnection: vi.fn(),
        }}
      >
        <WaitlistManagementPage showId="show-1" />
      </NetworkStatusContext.Provider>
    );
    const { rerender } = render(page(true));
    expect(await screen.findByText('Judge One')).toBeInTheDocument();
    expect(screen.queryByTestId('judge-day-capacity-stale')).not.toBeInTheDocument();

    onlineManager.setOnline(false);
    rerender(page(false));

    expect(await screen.findByTestId('judge-day-capacity-stale')).toBeInTheDocument();
    expect(screen.getByText('Judge One')).toBeInTheDocument();
    expect(screen.queryByTestId('judge-day-capacity-offline')).not.toBeInTheDocument();
  });
});
