import { createClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { mockSupabase } from '@/test/mocks/supabase';
import { createSupabaseNetworkGuard } from '@/test/supabaseNetworkGuard';
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
import MyEntriesPage from '@/pages/MyEntriesPage';
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
vi.mock('@/hooks/useRoleBasedData', () => ({ useCurrentUserPersonId: () => 'person-423' }));
vi.mock('@/hooks/mutations/useCheckInMutation', () => ({
  useCheckInMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/useReplicationSync', () => ({ useReplicationSync: () => ({ status: {} }) }));
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsByOwnerQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/components/panels/edit', () => ({ AddDogPanel: () => null }));
vi.mock('@/hooks/queries/useMyWaitlistEntries', () => ({
  useMyWaitlistEntries: () => ({
    entries: [],
    activePositionCount: 0,
    isLoading: false,
    withdraw: vi.fn(),
    startPayment: vi.fn(),
    decline: vi.fn(),
    refetchWaitlistOffers: vi.fn(),
  }),
}));
vi.mock('@/hooks/queries/useSelfCheckinEnabled', () => ({ useSelfCheckinMap: () => ({}) }));
vi.mock('@/pages/MyEntriesPage/modules', async () => {
  const actual = await vi.importActual<typeof import('@/pages/MyEntriesPage/modules')>(
    '@/pages/MyEntriesPage/modules'
  );
  const { mapEntryRowToBalanceSource, summarizeEntryBalances } = await vi.importActual<
    typeof import('@/features/payments/entryBalanceSummary')
  >('@/features/payments/entryBalanceSummary');
  const balanceSummary = summarizeEntryBalances(
    ['entry-53', 'entry-54', 'entry-57'].map(id =>
      mapEntryRowToBalanceSource({
        id,
        show_id: 'show-423',
        entry_status: 'confirmed',
        payment_status: 'pending',
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
  return {
    ...actual,
    useMyEntriesData: () => ({
      entries: [
        {
          id: 'entry-53',
          registrationId: null,
          showId: 'show-423',
          showName: 'Recovery Trial',
          showDate: new Date('2099-12-01'),
          location: { venue: '', city: '', state: '' },
          dogName: 'Ranger',
          dogId: 'dog-53',
          classes: [],
          dogs: [],
          totalFee: 30,
          entryStatus: EntryStatus.ACCEPTED,
          paymentStatus: PaymentStatus.PENDING,
          submittedAt: new Date('2099-01-01'),
          lastUpdated: new Date('2099-01-01'),
        },
        {
          id: 'entry-54',
          registrationId: null,
          showId: 'show-423',
          showName: 'Recovery Trial',
          showDate: new Date('2099-12-01'),
          location: { venue: '', city: '', state: '' },
          dogName: 'Juni',
          dogId: 'dog-54',
          classes: [],
          dogs: [],
          totalFee: 30,
          entryStatus: EntryStatus.ACCEPTED,
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: 'credit_card',
          entryCloseDay: '2099-11-20',
          submittedAt: new Date('2099-01-01'),
          lastUpdated: new Date('2099-01-01'),
        },
        {
          id: 'entry-57',
          registrationId: null,
          showId: 'show-423',
          showName: 'Recovery Trial',
          showDate: new Date('2099-12-01'),
          location: { venue: '', city: '', state: '' },
          dogName: 'Maple',
          dogId: 'dog-57',
          classes: [],
          dogs: [],
          totalFee: 30,
          entryStatus: EntryStatus.ACCEPTED,
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: 'credit_card',
          entryCloseDay: '2099-11-20',
          submittedAt: new Date('2099-01-01'),
          lastUpdated: new Date('2099-01-01'),
        },
      ],
      balanceSummary,
      identityState: 'resolved',
      isLoading: false,
      isError: false,
      refreshing: false,
      refreshEntries: vi.fn(),
      updateEntryCheckIn: vi.fn(),
    }),
    useMyEntriesFilters: () => ({
      filteredEntries: [],
      selectedTab: 'all',
      selectedStatus: 'all',
      setSelectedStatus: vi.fn(),
      statusCounts: {},
      setSelectedTab: vi.fn(),
      entryStats: { currentFees: 90, currentAmountDue: 90 },
      tabCounts: {},
      scopeMatch: null,
      clearScope: vi.fn(),
      waitlistSurface: { hasPositions: false },
    }),
    useMyEntriesDialogs: () => ({
      checkInDialog: { open: false, entry: null, classEntry: null },
      editDialog: { open: false, entry: null },
      receiptDialog: { open: false, entry: null },
      addDogOpen: false,
      openCheckIn: vi.fn(),
      openEdit: vi.fn(),
      openReceipt: vi.fn(),
      openAddDog: vi.fn(),
      closeCheckIn: vi.fn(),
      closeEdit: vi.fn(),
      closeReceipt: vi.fn(),
      closeAddDog: vi.fn(),
      submitCheckInStatus: vi.fn(),
      entryUpdated: vi.fn(),
    }),
    useResultReveal: () => ({}),
    EntryFilterStrip: () => null,
    EntryScopeBanner: () => null,
    ScopedPaymentSummary: () => null,
    MyEntryCard: () => null,
    EntriesEmptyState: () => null,
  };
});

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

type RecoveryFixtureEntry = {
  id: string;
  dog_id: string;
  class_id: string;
  dog: string;
  className: string;
  fixtureEntryStatus?: string;
  fixtureDeletedAt?: string;
  fixturePaymentStatus?: string;
};

function RecoveryCartRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const entryIds = new URLSearchParams(location.search).get('entryIds');
  const hasAugmentedIds = entryIds?.includes('entry-outsider') ?? false;

  useEffect(() => {
    if (entryIds && !hasAugmentedIds) {
      const params = new URLSearchParams(location.search);
      params.set('entryIds', entryIds + ',entry-outsider,entry-withdrawn,entry-deleted,entry-paid');
      navigate(location.pathname + '?' + params.toString(), { replace: true });
    }
  }, [entryIds, hasAugmentedIds, location.pathname, location.search, navigate]);

  return hasAugmentedIds ? <CartPage /> : null;
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
    type FixtureCartItem = EntryCartItemInsert & { id: string };
    let savedItems: FixtureCartItem[] = [];
    const requests: Array<{
      table: string;
      method: string;
      params: URLSearchParams;
      body?: unknown;
    }> = [];
    const databaseEntries: RecoveryFixtureEntry[] = [
      ...(entries as readonly RecoveryFixtureEntry[]),
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
      {
        id: 'entry-withdrawn',
        dog_id: 'dog-withdrawn',
        class_id: 'class-withdrawn',
        dog: 'Withdrawn',
        className: 'Withdrawn Class',
        fixtureEntryStatus: 'withdrawn',
      },
      {
        id: 'entry-deleted',
        dog_id: 'dog-deleted',
        class_id: 'class-deleted',
        dog: 'Deleted',
        className: 'Deleted Class',
        fixtureDeletedAt: '2099-01-01T00:00:00.000Z',
      },
      {
        id: 'entry-paid',
        dog_id: 'dog-paid',
        class_id: 'class-paid',
        dog: 'Paid',
        className: 'Interior Novice A',
        fixturePaymentStatus: 'paid',
      },
    ].map(entry => ({
      ...entry,
      show_id: 'show-423',
      payment_status: entry.fixturePaymentStatus ?? 'pending',
      entry_status: entry.fixtureEntryStatus ?? 'submitted',
      deleted_at: entry.fixtureDeletedAt ?? null,
      handler_id: null,
      entry_fee: 30,
      jump_height: null,
      special_requests: null,
      class: { entry_fee: 30 },
      show: { pre_entry_fee: 30, day_of_show_fee: 35, start_date: '2099-12-01' },
    }));

    let unsupportedFilter: string | null = null;
    const client = createClient('http://localhost:42300', 'synthetic-test-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: createSupabaseNetworkGuard(async (input, init) => {
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
              if (column === 'select' || column === 'order' || column === 'limit') return true;
              if (filter.startsWith('eq.')) return String(row[column]) === filter.slice(3);
              if (filter.startsWith('in.(')) {
                return filter.slice(4, -1).split(',').includes(String(row[column]));
              }
              if (filter === 'is.null') return row[column] === null;
              if (column === 'or' && filter.startsWith('(') && filter.endsWith(')')) {
                return filter
                  .slice(1, -1)
                  .split(',')
                  .some(clause => {
                    const [field, operator, value] = clause.split('.');
                    return operator === 'eq' && String(row[field]) === value;
                  });
              }
              unsupportedFilter = column + '=' + filter;
              return false;
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
                .map(entry => ({
                  id: entry.dog_id,
                  owner_id: entry.id === 'entry-outsider' ? 'person-other' : 'person-423',
                  co_owner_id: null,
                }))
                .filter(matches)
            );
          if (table === 'entries') {
            const matchingEntries = databaseEntries.filter(matches);
            return json(matchingEntries);
          }
          if (table === 'entry_cart_items') {
            if (method === 'POST') {
              savedItems = [
                ...savedItems,
                ...(body() as EntryCartItemInsert[]).map((item, index) => ({
                  ...item,
                  id: `item-${savedItems.length + index}`,
                })),
              ].filter(
                (item, index, all) =>
                  all.findIndex(
                    candidate =>
                      candidate.cart_id === item.cart_id &&
                      candidate.dog_id === item.dog_id &&
                      candidate.class_id === item.class_id
                  ) === index
              );
              return json(null);
            }
            if (method === 'DELETE') {
              const deletedIds = (params.get('id') ?? '')
                .replace(/^eq\./, '')
                .replace(/^in\.\(|\)$/g, '')
                .split(',');
              savedItems = savedItems.filter(item => !deletedIds.includes(item.id));
              return json(null);
            }
            const matchingItems = savedItems.filter(matches);
            if (matchingItems.length === 0) return json([]);
            return json(
              matchingItems.map((item, index) => {
                const entry = databaseEntries.find(entry => entry.id === item.entry_id)!;
                return {
                  ...item,
                  id: item.id ?? 'item-' + index,
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
        }),
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
        <Route path="/exhibitor/entries" element={<MyEntriesPage />} />
        <Route path="/cart" element={<RecoveryCartRoute />} />
      </Routes>,
      { initialRoute: '/exhibitor/entries' }
    );
    await user.click(
      screen.getByRole('button', { name: /Entry fees: \$90.00 due.*Finish payment/i })
    );
    expect(unsupportedFilter).toBeNull();
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
      request => request.table === 'entries' && request.params.get('id')?.includes('entry-outsider')
    );
    expect(recoveryRead).toBeDefined();
    if (!recoveryRead) throw new Error('Expected an exact-entry recovery read');
    expect(recoveryRead.params.get('show_id')).toBe('eq.show-423');
    expect(recoveryRead.params.get('payment_status')).toBe('eq.pending');
    expect(recoveryRead.params.get('id')).toContain('entry-outsider');
    expect(recoveryRead.params.get('id')).toContain('entry-withdrawn');
    expect(recoveryRead.params.get('id')).toContain('entry-deleted');
    expect(recoveryRead.params.get('id')).toContain('entry-paid');
    expect(savedItems.some(item => item.entry_id === 'entry-paid')).toBe(false);
  });
});
