/**
 * The judge-day capacity cards are a server read with their own failure modes. A failed read must
 * say so and offer the page's one "Try again", never read as "no judge-days" or "0 spots"; and an
 * over-limit day uses the shared wording (MYK9-1006). Real useJudgeDayCapacity, scripted supabase.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import WaitlistManagementPage from '../index';

const state = vi.hoisted(() => ({
  summary: null as null | (() => { data: unknown; error: unknown }),
  availability: null as null | (() => { data: unknown; error: unknown }),
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
  const from = (table: string) =>
    table === 'judge_day_summary'
      ? chain(() => state.summary!())
      : chain(() => ({ data: [], error: null }));
  const rpc = () => Promise.resolve(state.availability!());
  // Everything else (auth, functions) stays the real client; only `from` is scripted.
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
  const availability = {
    data: [
      {
        class_id: 'c1',
        judge_id: 'j1',
        show_date: '2026-10-10',
        day_capacity: capacity,
        day_taken: confirmed,
        day_mail_in_reserved: 0,
        day_remaining: Math.max(0, capacity - confirmed),
      },
    ],
    error: null,
  };
  const summary = {
    data: [
      {
        judge_id: 'j1',
        judge_name: 'Judge One',
        show_date: '2026-10-10',
        waitlist_count: 1,
        class_ids: ['c1'],
        class_names: ['Novice A'],
      },
    ],
    error: null,
  };
  state.availability = () => availability;
  state.summary = () => summary;
};

describe('WaitlistManagementPage judge-day capacity', () => {
  beforeEach(() => {
    setDay(3);
  });

  it('a failed capacity read says so, offers Try again, and recovers', async () => {
    state.summary = () => ({ data: null, error: new Error('view down') });
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
});
