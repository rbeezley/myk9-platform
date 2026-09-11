import { createClient } from '@supabase/supabase-js';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { mockSupabase } from '@/test/mocks/supabase';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';
import {
  buildEntryBalanceRecoveryHref,
  mapEntryRowToBalanceSource,
  summarizeEntryBalances,
} from '@/features/payments/entryBalanceSummary';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { useCartStore } from '@/store/cartStore';
import type { EntryCartItemInsert } from '@/store/cartStore.types';
import CartPage from '@/pages/CartPage';
import { AmountDueSection } from '@/pages/exhibitor/AmountDueSection';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-423' } }),
}));
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({ profile: { id: 'profile-423' }, isLoading: false }),
}));
vi.mock('@/hooks/queries/useJudgeDayCapacity', () => ({
  useJudgeDayCapacity: () => ({
    judgeDays: [],
    fullClassIds: [],
    isLoading: false,
    isFetching: false,
    error: null,
  }),
}));

const entries = [
  {
    id: 'entry-53',
    dog_id: 'dog-53',
    class_id: 'class-53',
    dog: 'Ranger',
    className: 'Interior Advanced',
  },
  {
    id: 'entry-54',
    dog_id: 'dog-54',
    class_id: 'class-54',
    dog: 'Juni',
    className: 'Exterior Excellent',
  },
  {
    id: 'entry-57',
    dog_id: 'dog-57',
    class_id: 'class-57',
    dog: 'Maple',
    className: 'Interior Novice B',
  },
] as const;

function FeeCard({ recoveryProbeEntryId }: { recoveryProbeEntryId?: string }) {
  const navigate = useNavigate();
  const summary = summarizeEntryBalances(
    entries.map(entry => ({
      id: entry.id,
      showId: 'show-423',
      showName: 'Recovery Trial',
      showDate: new Date('2099-12-01'),
      entryCloseDay: '2099-11-20',
      entryStatus: EntryStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: 'credit_card',
      totalFee: 30,
    }))
  );
  const recoveryHref = buildEntryBalanceRecoveryHref(summary);
  const hrefWithProbe = recoveryProbeEntryId
    ? recoveryHref.replace('entryIds=', `entryIds=${recoveryProbeEntryId},`)
    : recoveryHref;
  return (
    <CompactStatsRow
      currentFees={summary.currentFeesCents / 100}
      amountDue={summary.amountDueCents / 100}
      currentFeesHref={hrefWithProbe}
      onNavigate={navigate}
    />
  );
}

describe('MYK9-423 fee-card payment recovery', () => {
  it('clears both money surfaces when the same recovered entries return paid', () => {
    function MoneySurfaces({ paid }: { paid: boolean }) {
      const navigate = useNavigate();
      const summary = summarizeEntryBalances(
        entries.map(entry =>
          mapEntryRowToBalanceSource({
            id: entry.id,
            show_id: 'show-423',
            entry_status: 'submitted',
            payment_status: paid ? 'paid' : 'pending',
            payment_method: 'credit_card',
            entry_fee: 30,
            show: {
              id: 'show-423',
              name: 'Recovery Trial',
              start_date: '2099-12-01',
              end_date: '2099-12-02',
              entry_close_date: '2099-11-20',
            },
          })
        )
      );
      return (
        <>
          <section aria-label="My Shows balance">
            <CompactStatsRow
              currentFees={summary.currentFeesCents / 100}
              amountDue={summary.amountDueCents / 100}
              currentFeesHref={buildEntryBalanceRecoveryHref(summary)}
              onNavigate={navigate}
            />
          </section>
          <section aria-label="My Payments balance">
            <AmountDueSection summary={summary} isLoading={false} isError={false} />
          </section>
        </>
      );
    }
    const { rerender } = render(<MoneySurfaces paid={false} />);
    const showBalance = within(screen.getByRole('region', { name: 'My Shows balance' }));
    const paymentBalance = within(screen.getByRole('region', { name: 'My Payments balance' }));
    expect(showBalance.getByText('$90.00')).toBeInTheDocument();
    expect(paymentBalance.getByText('$90.00')).toBeInTheDocument();
    expect(paymentBalance.getByRole('link', { name: 'Finish payment' })).toBeInTheDocument();

    // Only the three original rows' payment_status changes; identity and fees
    // remain intact. The real row mapper, summary and both displays must agree.
    rerender(<MoneySurfaces paid />);
    expect(
      showBalance.getByRole('button', {
        name: 'Entry fees: paid in full. View your payments.',
      })
    ).toBeInTheDocument();
    expect(paymentBalance.getByText('$0.00')).toBeInTheDocument();
    expect(paymentBalance.getByText('Current entries are paid up.')).toBeInTheDocument();
    expect(screen.queryByText('$90.00')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Finish payment' })).not.toBeInTheDocument();
  });

  it('clicks Finish Payment into exactly the recovered entries and quoted fees with no original cart', async () => {
    // Assert presentation through the real router/store/recovery, not a loader spy.
    // Only PostgREST transport is replaced; returned cart items depend on real
    // recovery upserts, so an empty-hydration regression cannot get canned lines.
    let cart: Record<string, unknown> | null = null;
    let savedItems: EntryCartItemInsert[] = [];
    const requests: Array<{
      table: string;
      method: string;
      params: URLSearchParams;
      body?: unknown;
    }> = [];
    const databaseEntries = [
      ...entries,
      {
        id: 'entry-unrelated',
        dog_id: 'dog-unrelated',
        class_id: 'class-unrelated',
        dog: 'Unrelated',
        className: 'Unrelated Class',
      },
      {
        id: 'entry-outsider',
        dog_id: 'dog-outsider',
        class_id: 'class-outsider',
        dog: 'Outsider',
        className: 'Outsider Class',
      },
    ].map(entry => ({
      ...entry,
      show_id: 'show-423',
      payment_status: 'pending',
      entry_status: 'submitted',
      deleted_at: null,
      handler_id: null,
      entry_fee: 30,
      jump_height: null,
      special_requests: null,
      class: { entry_fee: 30 },
      show: { pre_entry_fee: 30, day_of_show_fee: 35, start_date: '2099-12-01' },
    }));

    const client = createClient('http://localhost:42300', 'synthetic-test-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input, init) => {
          const url = new URL(String(input));
          const table = url.pathname.split('/').at(-1)!;
          const method = init?.method ?? 'GET';
          const params = url.searchParams;
          const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;
          requests.push({ table, method, params, body: requestBody });
          const json = (data: unknown) =>
            new Response(JSON.stringify(data), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          const body = () => JSON.parse(String(init?.body));
          const matches = (row: Record<string, unknown>) =>
            [...params].every(([column, filter]) => {
              if (filter.startsWith('eq.')) return String(row[column]) === filter.slice(3);
              if (filter.startsWith('in.(')) {
                return filter.slice(4, -1).split(',').includes(String(row[column]));
              }
              if (filter === 'is.null') return row[column] === null;
              return true;
            });

          if (table === 'entry_carts') {
            if (method === 'POST') {
              cart = {
                ...body(),
                id: 'cart-423',
                show: {
                  id: 'show-423',
                  name: 'Recovery Trial',
                  start_date: '2099-12-01',
                  entry_close_date: '2099-11-20',
                },
              };
              return json(cart);
            }
            if (method === 'PATCH') {
              Object.assign(cart!, body());
              return json(null);
            }
            // maybeSingle GET uses an array response and unwraps it in supabase-js.
            return json(cart && matches(cart) ? [cart] : []);
          }
          if (table === 'exhibitor_profiles') return json([{ person_id: 'person-423' }]);
          if (table === 'dogs')
            return json(
              databaseEntries
                .filter(entry => entry.id !== 'entry-outsider')
                .map(entry => ({ id: entry.dog_id }))
            );
          if (table === 'entries') return json(databaseEntries.filter(matches));
          if (table === 'entry_cart_items') {
            if (method === 'POST') {
              savedItems = body();
              return json(null);
            }
            if (savedItems.length === 0) return json([]);
            return json(
              savedItems.map((item, index) => {
                const entry = databaseEntries.find(entry => entry.id === item.entry_id)!;
                return {
                  ...item,
                  id: 'item-' + index,
                  dog: {
                    id: entry.dog_id,
                    name: entry.dog,
                    call_name: entry.dog,
                    registrations: [],
                  },
                  class: {
                    id: entry.class_id,
                    name: entry.className,
                    level: 'Novice',
                    trial_id: 'trial-423',
                  },
                  handler: null,
                };
              })
            );
          }
          // Unrelated display metadata stays at its empty/default state.
          if (table === 'platform_settings' || table === 'shows' || table === 'clubs')
            return json([]);
          throw new Error('Unexpected fixture request: ' + method + ' ' + table);
        },
      },
    });
    // The shared setup mock has a generic proxy return type; replace only its
    // transport entry point with the real SDK builder for this one test.
    mockSupabase.from.mockImplementation(
      table => client.from(table) as unknown as ReturnType<typeof mockSupabase.from>
    );
    useCartStore.getState().reset();

    const { user } = render(
      <Routes>
        <Route
          path="/exhibitor/entries"
          element={<FeeCard recoveryProbeEntryId="entry-outsider" />}
        />
        <Route path="/cart" element={<CartPage />} />
      </Routes>,
      { initialRoute: '/exhibitor/entries' }
    );
    await user.click(
      screen.getByRole('button', { name: /Entry fees: \$90.00 due.*Finish payment/i })
    );

    const checkout = await screen.findByRole('button', { name: 'Pay $96.30 and confirm entries' });
    expect(checkout).toBeEnabled();
    expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(3);
    for (const entry of entries) {
      const heading = screen.getByRole('heading', { name: entry.dog, level: 3 });
      const card = heading.closest<HTMLElement>('.bg-card');
      expect(card).not.toBeNull();
      if (!card) throw new Error(`Missing cart card for ${entry.dog}`);
      expect(within(card).getByText(entry.className)).toBeInTheDocument();
      expect(within(card).getByText('$30.00')).toBeInTheDocument();
    }
    expect(screen.queryByText('Unrelated')).not.toBeInTheDocument();
    expect(screen.getByText('Entry Fees (3 entries)').parentElement).toHaveTextContent('$90.00');
    expect(screen.getByText('Total').parentElement).toHaveTextContent('$96.30');
    expect(savedItems.map(item => item.entry_id).sort()).toEqual(
      entries.map(entry => entry.id).sort()
    );
    const recoveryRead = requests.find(
      request => request.table === 'entries' && request.params.has('id')
    )!;
    expect(recoveryRead.params.get('show_id')).toBe('eq.show-423');
    expect(recoveryRead.params.get('payment_status')).toBe('eq.pending');
    expect(recoveryRead.params.get('id')).toContain('entry-outsider');
  });
});
