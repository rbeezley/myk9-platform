import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyEntriesPage from '@/pages/MyEntriesPage';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getUserEntries, updateCheckInStatus } from '@/services/database/entries';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { UserRole, type UserWithRoles } from '@/types/auth-types';
import { fromAny } from '@total-typescript/shoehorn';

// Mock dependencies
const mockCheckInMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockUseCheckInMutation = vi.hoisted(() =>
  vi.fn((_options?: unknown) => ({
    mutateAsync: mockCheckInMutateAsync,
  }))
);

vi.mock('@/hooks/useAuthContext');
vi.mock('@/hooks/useBreadcrumb', () => ({
  useBreadcrumb: () => [{ label: 'Home', href: '/' }, { label: 'My Shows' }],
}));
vi.mock('@/services/NotificationService', () => ({
  useStatusUpdates: () => ({ status: null }),
}));
vi.mock('@/services/AuditService', () => ({
  auditService: {
    log: vi.fn(),
  },
  AuditAction: {
    READ: 'READ',
    UPDATE: 'UPDATE',
  },
}));
vi.mock('@/services/LoggingService', () => ({
  LoggingService: {
    getInstance: () => ({
      error: vi.fn(),
      log: vi.fn(),
      info: vi.fn(),
    }),
  },
  // useMyEntriesData's catch block calls the `logger` named export; without it
  // the mock throws inside the error path and masks whatever is being tested.
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('@/services/database/entries', () => ({
  getUserEntries: vi.fn().mockResolvedValue({ data: [], error: null }),
  updateCheckInStatus: vi.fn().mockResolvedValue({ data: null, error: null }),
}));
vi.mock('@/hooks/mutations/useCheckInMutation', () => ({
  useCheckInMutation: (options?: unknown) => mockUseCheckInMutation(options),
}));
const mockUseDogsByOwnerQuery = vi.hoisted(() =>
  vi.fn((_ownerId?: string, _enabled?: boolean) => ({ data: [] as unknown[], isLoading: false }))
);
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsByOwnerQuery: (ownerId?: string, enabled?: boolean) =>
    mockUseDogsByOwnerQuery(ownerId, enabled),
}));
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntryStatisticsQuery: () => ({ data: null }),
  useEntriesQuery: () => ({ data: [] }),
}));
vi.mock('@/hooks/queries/useSelfCheckinEnabled', () => ({
  useSelfCheckinMap: (classIds: string[]) =>
    Object.fromEntries(classIds.map(classId => [classId, true])),
}));
vi.mock('@/components/exhibitor/CompactStatsRow', () => ({
  CompactStatsRow: () => null,
}));
vi.mock('@/components/exhibitor/DogStrip', () => ({
  DogStrip: () => null,
}));
const mockUseCurrentUserPersonId = vi.hoisted(() => vi.fn((): string | null => null));
vi.mock('@/hooks/useRoleBasedData', () => ({
  useCurrentUserPersonId: () => mockUseCurrentUserPersonId(),
}));
vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: () => <div data-testid="add-dog-panel" />,
}));

// The wait-list section reads `waitlist_entries` — a table the entries axis
// knows nothing about. Both hooks default to "no positions" so every existing
// test in this file is unchanged; the MYK9-417 block below seeds a real one.
const mockUseMyWaitlistEntries = vi.hoisted(() =>
  vi.fn(() => ({
    entries: [] as unknown[],
    activePositionCount: 0,
    isLoading: false,
    error: null,
    withdraw: { mutate: vi.fn(), isPending: false },
    startPayment: {
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      variables: undefined,
    },
    decline: {
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      variables: undefined,
    },
    refetchWaitlistOffers: vi.fn(),
  }))
);
vi.mock('@/hooks/queries/useMyWaitlistEntries', () => ({
  useMyWaitlistEntries: () => mockUseMyWaitlistEntries(),
}));
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({ profile: { id: 'exhibitor-1' }, isLoading: false }),
}));

// Mock entry data
const mockEntries = [
  {
    id: 'entry-1',
    registrationId: 'reg-1',
    showId: 'show-1',
    showName: 'Spring Agility Trial',
    showDate: new Date(Date.now() + 86400000), // Tomorrow
    location: { venue: 'Test Venue', city: 'Test City', state: 'CA' },
    dogName: 'Max',
    dogId: 'dog-1',
    classes: [{ id: 'class-1', name: 'Novice A', number: '101', fee: 25, status: 'entered' }],
    totalFee: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    confirmationNumber: 'ABC123',
    submittedAt: new Date(Date.now() - 604800000), // 1 week ago
    lastUpdated: new Date(Date.now() - 86400000), // Yesterday
  },
  {
    id: 'entry-2',
    registrationId: 'reg-2',
    showId: 'show-2',
    showName: 'Summer Obedience Trial',
    showDate: new Date(Date.now() + 604800000), // 1 week from now
    location: { venue: 'Test Venue 2', city: 'Test City 2', state: 'NY' },
    dogName: 'Bella',
    dogId: 'dog-2',
    classes: [{ id: 'class-2', name: 'Open A', number: '201', fee: 30, status: 'entered' }],
    totalFee: 30,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    confirmationNumber: 'DEF456',
    submittedAt: new Date(Date.now() - 172800000), // 2 days ago
    lastUpdated: new Date(Date.now() - 86400000), // Yesterday
  },
];

const mockUser = fromAny<UserWithRoles, unknown>({
  id: 'user-1',
  email: 'test@example.com',
  user_metadata: { first_name: 'Test', last_name: 'User' },
  roles: [UserRole.EXHIBITOR],
  permissions: [],
});

const settledSyncStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: {
    entries: 'success',
    dogs: 'success',
    classes: 'success',
    shows: 'success',
  },
};

const renderWithProviders = (
  ui: React.ReactElement,
  initialRoute = '/my-entries',
  syncStatus: ReplicationSyncContextValue['status'] = settledSyncStatus
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ReplicationSyncContext.Provider
        value={{ status: syncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
      >
        <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
      </ReplicationSyncContext.Provider>
    </QueryClientProvider>
  );
};

function makeResultRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    registration_id: 'reg-1',
    show_id: 'show-1',
    dog_id: 'dog-1',
    class_id: 'class-1',
    trial_id: 'trial-1',
    handler_id: 'person-1',
    entry_status: 'accepted',
    payment_status: 'paid_online',
    entry_fee: 25,
    check_in_status: 'checked-in',
    is_scored: true,
    result_status: 'qualified',
    search_time_seconds: 42.18,
    total_faults: 0,
    final_placement: 1,
    class_results_released_at: '2026-09-14T20:00:00.000Z',
    dog_image_url: '/placeholder-dog.png',
    submitted_at: '2026-06-01T12:00:00.000Z',
    created_at: '2026-06-01T12:00:00.000Z',
    updated_at: '2026-06-01T12:00:00.000Z',
    dog: { id: 'dog-1', name: 'Ditto', call_name: 'Ditto' },
    show: {
      id: 'show-1',
      name: 'Rocky Mountain Classic',
      start_date: '2026-09-14',
      end_date: '2026-09-14',
      entry_close_date: '2026-09-01',
      venue_name: 'Fairgrounds',
      city: 'Denver',
      state: 'CO',
    },
    class: { id: 'class-1', name: 'Container Novice A', class_number: '101' },
    trial: { id: 'trial-1', trial_type: 'Scent Work' },
    registration: { id: 'reg-1', confirmation_number: 'ABC123', payment_status: 'paid_online' },
    ...overrides,
  };
}

// Authenticate with a resolved person id so getUserEntries actually runs.
const seedAuthWithPerson = () =>
  (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
    user: mockUser,
    userWithRoles: { ...mockUser, databaseUserId: 'person-1' },
    isAuthenticated: true,
  });

// Seed one loaded entry so the page renders its full stat/tab layout instead of
// the no-entry FirstRunZeroState. The row is unscored/unreleased to avoid the
// result-reveal dialog firing during structural assertions.
const seedLoadedEntry = () => {
  seedAuthWithPerson();
  (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [
      makeResultRow({
        is_scored: false,
        result_status: null,
        final_placement: null,
        class_results_released_at: null,
      }),
    ],
    error: null,
  });
};

/**
 * One accepted, unscored entry — the shape the exhibitor self check-in flow
 * needs. Shared by the success and failure paths so the two tests cannot drift
 * apart on fixture details that have nothing to do with what they assert.
 */
const buildSelfCheckinEntryRow = () => ({
  id: 'entry-1',
  registration_id: 'reg-1',
  show_id: 'show-1',
  dog_id: 'dog-1',
  class_id: 'class-1',
  trial_id: 'trial-1',
  handler_id: 'person-1',
  entry_status: 'accepted',
  payment_status: 'paid_online',
  entry_fee: 25,
  check_in_status: 'no-status',
  is_scored: false,
  result_status: null,
  search_time_seconds: null,
  total_faults: null,
  final_placement: null,
  submitted_at: '2026-06-01T12:00:00.000Z',
  created_at: '2026-06-01T12:00:00.000Z',
  updated_at: '2026-06-01T12:00:00.000Z',
  dog: { id: 'dog-1', name: 'Koda', call_name: 'Koda' },
  show: {
    id: 'show-1',
    name: 'Spring Trial',
    start_date: '2026-06-15',
    end_date: '2026-06-16',
    entry_close_date: '2026-06-01',
    venue: 'Test Venue',
    city: 'Portland',
    state: 'OR',
  },
  class: { id: 'class-1', name: 'Novice A', class_number: '101' },
  trial: { id: 'trial-1', trial_type: 'Scent Work' },
  registration: { id: 'reg-1', confirmation_number: 'ABC123' },
});

/** Walks the collapsed details panel down to a submitted check-in status change. */
const submitSelfCheckin = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByText('Spring Trial');
  // Per-class check-in controls live behind the collapsed details panel.
  await user.click(screen.getByRole('button', { name: /entered classes/i }));
  await user.click(screen.getByRole('button', { name: /update check-in for koda in novice a/i }));
  const statusOptions = await screen.findAllByRole('radio', { name: /checked in/i });
  const checkedInOption = statusOptions.find(
    option => option.getAttribute('aria-labelledby') === 'checked-in-label'
  );
  expect(checkedInOption).toBeDefined();
  await user.click(checkedInOption as HTMLElement);
  await user.click(screen.getByRole('button', { name: /update status/i }));
};

describe('MyEntriesPage UI Improvements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // clearAllMocks resets call history but not return-value overrides, so restore
    // the defaults (no dogs, no entries) for every test explicitly — otherwise a
    // prior seedLoadedEntry() leaks its resolved entry into later zero-state tests.
    mockUseDogsByOwnerQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseCurrentUserPersonId.mockReturnValue(null);
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null });
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockUser,
      userWithRoles: null,
      isAuthenticated: true,
    });
  });

  it('names the exhibitor hub My Shows', async () => {
    renderWithProviders(<MyEntriesPage />);

    expect(await screen.findByRole('heading', { name: 'My Shows' })).toBeInTheDocument();
  });

  describe('Fake Trend Data Removal', () => {
    it('should NOT display hardcoded trend percentages', async () => {
      seedLoadedEntry();
      renderWithProviders(<MyEntriesPage />);

      // Wait for the full layout (tabs only render once entries exist)
      await screen.findByRole('radiogroup', { name: /filter by time/i });

      // Verify no fake trend percentages exist
      expect(screen.queryByText('+5%')).not.toBeInTheDocument();
      expect(screen.queryByText('+12%')).not.toBeInTheDocument();
      expect(screen.queryByText('-3%')).not.toBeInTheDocument();
      expect(screen.queryByText('+8%')).not.toBeInTheDocument();
    });

    it('should render the stats area without fake data', async () => {
      seedLoadedEntry();
      renderWithProviders(<MyEntriesPage />);

      await screen.findByRole('radiogroup', { name: /filter by time/i });

      // CompactStatsRow is mocked to null in this file; its label assertions
      // live in CompactStatsRow.test.tsx. Verify the page renders its filters
      // and no fake trend strings leak in from anywhere else on the page.
      expect(
        screen.getByRole('radiogroup', { name: /filter by entry status/i })
      ).toBeInTheDocument();
      expect(screen.queryByText('+5%')).not.toBeInTheDocument();
      expect(screen.queryByText('+12%')).not.toBeInTheDocument();
    });
  });

  describe('Enter a Show CTA', () => {
    it('should display "Enter a Show" button in header', async () => {
      // The header CTA is present in every state, including the zero-state.
      renderWithProviders(<MyEntriesPage />);

      const enterShowButton = await screen.findByRole('button', { name: /enter a show/i });
      expect(enterShowButton).toBeInTheDocument();
    });
  });

  describe('Tab Structure', () => {
    it('keeps the tab strip on the time axis alone', async () => {
      seedLoadedEntry();
      renderWithProviders(<MyEntriesPage />);

      await screen.findByRole('radiogroup', { name: /filter by time/i });

      // One axis, and a real partition: every entry is in exactly one of
      // Upcoming or Completed, and they sum to All. Status used to sit here as
      // three more sibling tabs, which double-counted every entry and made
      // "accepted AND still ahead of me" unexpressable — see Phase A of
      // docs/plan-ia-exhibitor-surface.md.
      //
      // The axis is now a radiogroup rather than a tablist: it narrows the same
      // list of the same cards, so it is a filter, and tab semantics would
      // promise assistive tech a different VIEW. The partition it expresses is
      // unchanged and still pinned in useMyEntriesFilters.test.ts.
      const timeAxis = screen.getByRole('radiogroup', { name: /filter by time/i });
      for (const label of [/All/i, /Upcoming/i, /Completed/i]) {
        expect(within(timeAxis).getByRole('radio', { name: label })).toBeInTheDocument();
      }
      expect(within(timeAxis).getAllByRole('radio')).toHaveLength(3);
      // Nothing on this page claims tab semantics any more.
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('offers entry status as a composable second axis, not more tabs', async () => {
      seedLoadedEntry();
      renderWithProviders(<MyEntriesPage />);

      await screen.findByRole('radiogroup', { name: /filter by time/i });

      // radiogroup, not tablist: these chips NARROW whichever tab is active.
      // Tab semantics would tell assistive tech the selection is replaced.
      const statusAxis = screen.getByRole('radiogroup', { name: /filter by entry status/i });
      for (const label of [/Any status/i, /Pending/i, /Accepted/i, /Waitlist/i]) {
        expect(within(statusAxis).getByRole('radio', { name: label })).toBeInTheDocument();
      }

      // The retired ids must not come back on the time axis.
      const timeAxis = screen.getByRole('radiogroup', { name: /filter by time/i });
      for (const label of [/Pending/i, /Accepted/i, /Waitlist/i]) {
        expect(within(timeAxis).queryByRole('radio', { name: label })).not.toBeInTheDocument();
      }
    });

    it('wraps the filters on narrow screens instead of scrolling them sideways', async () => {
      seedLoadedEntry();
      renderWithProviders(<MyEntriesPage />);

      // The tab strip used to scroll horizontally on phones, which hides
      // options with no indication they exist. Chips wrap instead.
      for (const name of [/filter by time/i, /filter by entry status/i]) {
        const axis = await screen.findByRole('radiogroup', { name });
        expect(axis).toHaveClass('flex-wrap');
        expect(axis).not.toHaveClass('overflow-x-auto');
      }
    });
  });

  describe('Mobile information density', () => {
    it('orders the entries section above the dog strip on phones via flex order', async () => {
      seedLoadedEntry();
      renderWithProviders(<MyEntriesPage />);

      await screen.findByRole('radiogroup', { name: /filter by time/i });

      // The "All entries" label anchors the entries section wrapper.
      const entriesWrapper = screen.getByText('All entries').closest('div');
      expect(entriesWrapper).not.toBeNull();
      expect(entriesWrapper).toHaveClass('max-[720px]:order-1');

      // The dog strip lives in a sibling wrapper that drops below on mobile.
      const stack = entriesWrapper!.parentElement!;
      expect(stack).toHaveClass('flex', 'flex-col', 'gap-8');
      const dogWrapper = Array.from(stack.children).find(child =>
        child.className.includes('max-[720px]:order-2')
      );
      expect(dogWrapper).toBeTruthy();
    });
  });

  describe('Zero State (no entries)', () => {
    it('renders FirstRunZeroState instead of the stat/tab stack', async () => {
      // A RESOLVED identity is what makes "you have no entries" a claim the
      // page may make. Without it this test passed against the old bug, where
      // an unresolved person id also produced the welcome screen.
      seedAuthWithPerson();
      renderWithProviders(<MyEntriesPage />);

      // The welcoming zero-state replaces the whole stat/dog/tab stack.
      expect(await screen.findByText(/Welcome!/i)).toBeInTheDocument();
      // No filters and no zeroed stat noise for a brand-new exhibitor.
      expect(screen.queryByRole('radiogroup', { name: /filter by time/i })).not.toBeInTheDocument();
    });

    it('shows a syncing skeleton instead of the first-run welcome while entries are still syncing', async () => {
      const { container } = renderWithProviders(<MyEntriesPage />, '/my-entries', {
        ...settledSyncStatus,
        isSyncing: true,
        tablesStatus: {
          entries: 'syncing',
          dogs: 'success',
          classes: 'success',
          shows: 'success',
        },
      });

      await waitFor(() => expect(container.querySelector('.animate-pulse')).toBeInTheDocument());
      expect(screen.queryByText(/Welcome!/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add your first dog/i })).not.toBeInTheDocument();
    });

    it('offers a Browse Shows link pointing at /shows', async () => {
      seedAuthWithPerson();
      renderWithProviders(<MyEntriesPage />);

      const browse = await screen.findByRole('link', { name: /browse shows/i });
      expect(browse).toHaveAttribute('href', '/shows');
    });

    it('leads with "Add Your First Dog" when the exhibitor has no dogs', async () => {
      // Identity resolved, dog query settled empty → dogs are definitively
      // none, so the first-dog CTA is shown (no loading flash).
      seedAuthWithPerson();
      mockUseDogsByOwnerQuery.mockReturnValue({ data: [], isLoading: false });
      renderWithProviders(<MyEntriesPage />);

      expect(
        await screen.findByRole('button', { name: /add your first dog/i })
      ).toBeInTheDocument();
    });

    it('leads with browsing shows (no first-dog CTA) when the exhibitor already has dogs', async () => {
      seedAuthWithPerson();
      mockUseDogsByOwnerQuery.mockReturnValue({
        data: [{ id: 'dog-1', name: 'Koda' }],
        isLoading: false,
      });
      // No entries seeded (default getUserEntries → []), so still zero-state.
      renderWithProviders(<MyEntriesPage />);

      expect(await screen.findByText(/find a show/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add your first dog/i })).not.toBeInTheDocument();
    });

    it('stays dog-neutral while dog ownership is still resolving', async () => {
      seedAuthWithPerson();
      // Dogs query in flight: ownership unknown → must not flash a dog CTA or the
      // brand-new "Welcome" copy at an exhibitor who may already own dogs.
      mockUseDogsByOwnerQuery.mockReturnValue({ data: [], isLoading: true });
      renderWithProviders(<MyEntriesPage />);

      expect(await screen.findByRole('link', { name: /browse shows/i })).toBeInTheDocument();
      expect(screen.queryByText(/Welcome!/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add your first dog/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add another dog/i })).not.toBeInTheDocument();
    });

    it('enables the dog query off the legacy person id when databaseUserId is absent', async () => {
      // Mirrors entry loading: when the auth record has no databaseUserId but the
      // legacy lookup resolves a person id, dogs must still load — otherwise the
      // zero-state would wrongly treat a dog-owning exhibitor as having none.
      mockUseCurrentUserPersonId.mockReturnValue('legacy-person-1');
      mockUseDogsByOwnerQuery.mockReturnValue({
        data: [{ id: 'dog-1', name: 'Koda' }],
        isLoading: false,
      });
      renderWithProviders(<MyEntriesPage />);

      // hasDogs resolves true → leads with browsing, no first-dog CTA.
      expect(await screen.findByText(/find a show/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add your first dog/i })).not.toBeInTheDocument();
      // The query was enabled with the legacy id (second arg = enabled flag).
      expect(mockUseDogsByOwnerQuery).toHaveBeenCalledWith('legacy-person-1', true);
    });
  });

  describe('Entry Loading', () => {
    it('does not load entries when no person id source is available', async () => {
      renderWithProviders(<MyEntriesPage />);

      // No person id means we do not know WHOSE entries to load, so the page
      // must claim nothing. It previously rendered "Welcome!" here — telling a
      // cold-offline-booted exhibitor they had never entered a show while
      // their entries sat in IndexedDB.
      expect(await screen.findByText(/Getting your shows ready/i)).toBeInTheDocument();
      expect(screen.queryByText(/Welcome!/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add your first dog/i })).not.toBeInTheDocument();
      expect(getUserEntries).not.toHaveBeenCalled();
    });

    it('loads entries with databaseUserId when the legacy person lookup is empty', async () => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        user: mockUser,
        userWithRoles: { ...mockUser, databaseUserId: 'person-1' },
        isAuthenticated: true,
      });

      renderWithProviders(<MyEntriesPage />);

      // getUserEntries returns [] by default → zero-state, so assert the call
      // directly rather than waiting on a tablist that never renders.
      await waitFor(() => expect(getUserEntries).toHaveBeenCalledWith('person-1'));
    });

    it('routes exhibitor self check-in through the owner-scoped RPC mutation', async () => {
      const user = userEvent.setup();
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        user: mockUser,
        userWithRoles: { ...mockUser, databaseUserId: 'person-1' },
        isAuthenticated: true,
      });
      (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [buildSelfCheckinEntryRow()],
        error: null,
      });

      renderWithProviders(<MyEntriesPage />);

      expect(mockUseCheckInMutation).toHaveBeenCalledWith({ writer: 'self-checkin-rpc' });
      await submitSelfCheckin(user);

      await waitFor(() =>
        expect(mockCheckInMutateAsync).toHaveBeenCalledWith({
          entryId: 'entry-1',
          // My Entries models each class row as the concrete entry row, so
          // EntryClass.id is entry.id rather than the catalog class_id.
          classId: 'entry-1',
          newStatus: 'checked-in',
        })
      );
      expect(updateCheckInStatus).not.toHaveBeenCalled();
      // The success path is the ONLY path that may close the dialog. Pinned
      // here so the failure-path fix below cannot regress into closing it too.
      await waitFor(() =>
        expect(screen.queryByText('Update Check-In Status')).not.toBeInTheDocument()
      );
    });

    it('keeps the check-in dialog open and explains a failed check-in', async () => {
      // Regression: the page handler wrapped `updateEntryCheckIn` in a bare
      // `catch {}` labelled "Error handled in hook". The hook only logs and
      // rethrows, so swallowing it here resolved the promise CheckInStatusDialog
      // uses to decide success — the dialog closed as if the check-in saved
      // while the status silently reverted. On show day that means an exhibitor
      // believes their dog is checked in and is marked absent.
      const user = userEvent.setup();
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        user: mockUser,
        userWithRoles: { ...mockUser, databaseUserId: 'person-1' },
        isAuthenticated: true,
      });
      (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [buildSelfCheckinEntryRow()],
        error: null,
      });
      mockCheckInMutateAsync.mockRejectedValueOnce(
        new Error('We could not save your check-in. Please try again.')
      );

      renderWithProviders(<MyEntriesPage />);
      await submitSelfCheckin(user);

      await waitFor(() => expect(mockCheckInMutateAsync).toHaveBeenCalled());

      // The dialog must stay open, carrying the failure where the action was.
      expect(await screen.findByRole('alert')).toHaveTextContent(/could not save your check-in/i);
      expect(screen.getByText('Update Check-In Status')).toBeInTheDocument();
    });

    it('uses enrollment payment status when secretary marks a grouped entry paid', async () => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        user: mockUser,
        userWithRoles: { ...mockUser, databaseUserId: 'person-1' },
        isAuthenticated: true,
      });
      (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [
          {
            id: 'entry-1',
            registration_id: 'reg-1',
            show_id: 'show-1',
            dog_id: 'dog-1',
            class_id: 'class-1',
            trial_id: 'trial-1',
            handler_id: 'person-1',
            entry_status: 'accepted',
            payment_status: 'pending',
            entry_fee: 30,
            check_in_status: 'checked-in',
            is_scored: false,
            result_status: null,
            search_time_seconds: null,
            total_faults: null,
            final_placement: null,
            submitted_at: '2026-06-01T12:00:00.000Z',
            created_at: '2026-06-01T12:00:00.000Z',
            updated_at: '2026-06-01T12:00:00.000Z',
            dog: { id: 'dog-1', name: 'Blakley', call_name: 'Blakley' },
            show: {
              id: 'show-1',
              name: 'A Trial',
              start_date: '2026-06-15',
              end_date: '2026-06-16',
              entry_close_date: '2026-06-01',
              venue: 'Test Venue',
              city: 'Portland',
              state: 'OR',
            },
            class: { id: 'class-1', name: 'Exterior Novice B', class_number: '104' },
            trial: { id: 'trial-1', trial_type: 'Scent Work' },
            registration: {
              id: 'reg-1',
              confirmation_number: 'MK9-000049',
              payment_status: 'paid_by_cash',
            },
          },
        ],
        error: null,
      });

      renderWithProviders(<MyEntriesPage />);

      await screen.findByText('A Trial');
      expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
      expect(screen.queryByText('Payment Due')).not.toBeInTheDocument();
    });

    it('opens the result reveal from a resultEntryId query param when the result is visible', async () => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        user: mockUser,
        userWithRoles: { ...mockUser, databaseUserId: 'person-1' },
        isAuthenticated: true,
      });
      (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [makeResultRow()],
        error: null,
      });

      renderWithProviders(<MyEntriesPage />, '/exhibitor/entries?resultEntryId=entry-1');

      expect(await screen.findByRole('dialog', { name: /New result/i })).toBeInTheDocument();
      expect(screen.getAllByText('Ditto').length).toBeGreaterThan(0);
    });

    it('opens and closes the My Entries result reveal without hitting an update loop', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        user: mockUser,
        userWithRoles: { ...mockUser, databaseUserId: 'person-1' },
        isAuthenticated: true,
      });
      (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [makeResultRow()],
        error: null,
      });

      renderWithProviders(<MyEntriesPage />, '/exhibitor/entries');

      // Result buttons render inside the collapsed details panel.
      await user.click(await screen.findByRole('button', { name: /entered classes/i }));
      await user.click(await screen.findByRole('button', { name: /New result/i }));

      expect(await screen.findByRole('dialog', { name: /New result/i })).toBeInTheDocument();
      expect(screen.getAllByText('Ditto').length).toBeGreaterThan(0);

      await user.click(screen.getByRole('button', { name: /Close/i }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /New result/i })).not.toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /New result/i })).not.toBeInTheDocument();
      expect(
        consoleErrorSpy.mock.calls.some(call =>
          call.some(arg => typeof arg === 'string' && arg.includes('Maximum update depth exceeded'))
        )
      ).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it('ignores a resultEntryId query param when the result is not visible', async () => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        user: mockUser,
        userWithRoles: { ...mockUser, databaseUserId: 'person-1' },
        isAuthenticated: true,
      });
      (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [
          makeResultRow({
            id: 'entry-1',
            result_status: null,
            final_placement: null,
            class_results_released_at: null,
          }),
        ],
        error: null,
      });

      renderWithProviders(<MyEntriesPage />, '/exhibitor/entries?resultEntryId=entry-1');

      expect(await screen.findByText('All entries')).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: /New result/i })).not.toBeInTheDocument();
    });
  });
});

describe('Receipt Button Visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockUser,
      userWithRoles: null,
      isAuthenticated: true,
    });
  });

  it('should only show Receipt button for paid entries', () => {
    // This test validates the logic in the component
    // Receipt should show when: confirmationNumber exists AND payment is PAID_*
    const paidEntry = mockEntries[0]; // PAID_ONLINE
    const pendingEntry = mockEntries[1]; // PENDING

    // Paid entry should qualify for receipt
    const paidHasReceipt =
      paidEntry.confirmationNumber &&
      (paidEntry.paymentStatus === PaymentStatus.PAID_ONLINE ||
        paidEntry.paymentStatus === PaymentStatus.PAID_BY_CHECK ||
        paidEntry.paymentStatus === PaymentStatus.PAID_BY_CASH);
    expect(paidHasReceipt).toBe(true);

    // Pending entry should NOT qualify for receipt
    const pendingHasReceipt =
      pendingEntry.confirmationNumber &&
      (pendingEntry.paymentStatus === PaymentStatus.PAID_ONLINE ||
        pendingEntry.paymentStatus === PaymentStatus.PAID_BY_CHECK ||
        pendingEntry.paymentStatus === PaymentStatus.PAID_BY_CASH);
    expect(pendingHasReceipt).toBe(false);
  });
});

describe('Current Status Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockUser,
      userWithRoles: null,
      isAuthenticated: true,
    });
  });

  it('should use direct status labels without progress bars or lifecycle steppers', async () => {
    seedLoadedEntry();
    const { container } = renderWithProviders(<MyEntriesPage />);

    await screen.findByRole('radiogroup', { name: /filter by time/i });

    // Should NOT have the old progress elements
    expect(screen.queryByText('Entry Progress')).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+%$/)).not.toBeInTheDocument(); // No percentage displays
    expect(container.querySelector('.entry-status-stepper')).not.toBeInTheDocument();
  });
});

describe('Add Dog panel survives page loading states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDogsByOwnerQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseCurrentUserPersonId.mockReturnValue(null);
    seedAuthWithPerson();
  });

  // The page re-enters its loading branch on replication sync ticks, which are
  // driven by a timer the exhibitor can't see. If that branch returns early
  // above the dialogs, an in-progress Add Dog wizard is torn down and silently
  // reset to its first tab with an empty form.
  it('keeps the Add Dog panel mounted while entries are still loading', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<MyEntriesPage />);

    expect(await screen.findByTestId('add-dog-panel')).toBeInTheDocument();
  });

  it('keeps the Add Dog panel mounted when entries fail to load', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: new Error('network down'),
    });

    renderWithProviders(<MyEntriesPage />);

    expect(await screen.findByTestId('add-dog-panel')).toBeInTheDocument();
  });
});

/**
 * My Payments' per-row "Receipt" link arrives here carrying the order it came
 * from. Before the reader existed the link dropped the exhibitor into every
 * entry they had ever made; these assert the narrowing, the explanation, and
 * the way back out.
 */
describe('Receipt deep-link scope from My Payments', () => {
  const unscored = {
    is_scored: false,
    result_status: null,
    final_placement: null,
    class_results_released_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseDogsByOwnerQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseCurrentUserPersonId.mockReturnValue(null);
    seedAuthWithPerson();
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        makeResultRow(unscored),
        makeResultRow({
          ...unscored,
          id: 'entry-2',
          registration_id: 'reg-2',
          show_id: 'show-2',
          class_id: 'class-2',
          class: { id: 'class-2', name: 'Interior Novice A', class_number: '102' },
          show: {
            id: 'show-2',
            name: 'Autumn Classic',
            start_date: '2026-10-10',
            end_date: '2026-10-10',
            entry_close_date: '2026-10-01',
            venue_name: 'Fairgrounds',
            city: 'Denver',
            state: 'CO',
          },
          registration: { id: 'reg-2', confirmation_number: 'DEF456' },
        }),
      ],
      error: null,
    });
  });

  it('narrows the list to the order the link named, and says why', async () => {
    renderWithProviders(<MyEntriesPage />, '/exhibitor/entries?showId=show-1&entryIds=entry-1');

    expect(await screen.findByText('Rocky Mountain Classic')).toBeInTheDocument();
    expect(screen.queryByText('Autumn Classic')).not.toBeInTheDocument();
    // A silently short list would read as "the rest of my entries are gone".
    expect(
      screen.getByText(/Showing 1 of 2 entries — the ones your payment for Rocky Mountain/)
    ).toBeInTheDocument();
  });

  it('restores the full list from the banner', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyEntriesPage />, '/exhibitor/entries?showId=show-1&entryIds=entry-1');

    await screen.findByText('Rocky Mountain Classic');
    await user.click(screen.getByRole('button', { name: 'Show all entries' }));

    expect(await screen.findByText('Autumn Classic')).toBeInTheDocument();
    expect(screen.queryByText(/Showing 1 of 2 entries/)).not.toBeInTheDocument();
  });

  it('shows everything and admits the link is stale when nothing matches', async () => {
    renderWithProviders(<MyEntriesPage />, '/exhibitor/entries?showId=gone&entryIds=gone');

    expect(await screen.findByText('Rocky Mountain Classic')).toBeInTheDocument();
    expect(screen.getByText('Autumn Classic')).toBeInTheDocument();
    expect(screen.getByText(/could not find the entries from that payment/)).toBeInTheDocument();
  });

  it('renders no scope banner on an ordinary visit', async () => {
    renderWithProviders(<MyEntriesPage />, '/exhibitor/entries');

    await screen.findByText('Rocky Mountain Classic');
    expect(screen.getByText('Autumn Classic')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all entries' })).not.toBeInTheDocument();
  });
});

/**
 * MYK9-417. My Shows read the wait list from two places that never spoke:
 * the `Waitlist` chip and its list from `entries` (via `isWaitlistEntry`), the
 * "My Wait List Positions" section from the `waitlist_entries` table. An
 * exhibitor holding position #1 was shown a `Waitlist 0` chip and, on clicking
 * it, "No waitlisted entries … Nothing to do here right now" — printed inches
 * above the live position it denied.
 *
 * These render the PAGE, not the resolver, on purpose: the pure rule is pinned
 * in waitlistSurface.test.ts, and a fix that never reaches the chip, the empty
 * state or the section would pass that file and change nothing here.
 */
describe('Wait list positions with no waitlisted entry row (MYK9-417)', () => {
  /** The reproduction's shape: an entry that is NOT waitlisted... */
  const submittedEntry = {
    is_scored: false,
    result_status: null,
    final_placement: null,
    class_results_released_at: null,
    entry_status: 'submitted',
  };

  /** ...beside the exhibitor's one and only `waitlist_entries` row. */
  const junisPosition = {
    id: 'waitlist-1',
    classId: 'class-32',
    className: 'Interior Advanced',
    showName: 'Heartland Scent Work Classic',
    exhibitorId: 'exhibitor-1',
    exhibitorName: 'Test User',
    dogId: null,
    dogName: 'Juni',
    handlerId: null,
    position: 1,
    status: 'waiting',
    offeredAt: null,
    offerExpiresAt: null,
    promotedEntryId: null,
    createdAt: '2026-09-01T12:00:00.000Z',
  };

  const seedPosition = (entries: unknown[], activePositionCount = entries.length) =>
    mockUseMyWaitlistEntries.mockReturnValue({
      entries,
      activePositionCount,
      isLoading: false,
      error: null,
      withdraw: { mutate: vi.fn(), isPending: false },
      startPayment: {
        mutate: vi.fn(),
        isPending: false,
        isError: false,
        error: null,
        variables: undefined,
      },
      decline: {
        mutate: vi.fn(),
        isPending: false,
        isError: false,
        error: null,
        variables: undefined,
      },
      refetchWaitlistOffers: vi.fn(),
    });

  const waitlistChip = () =>
    within(screen.getByRole('radiogroup', { name: /filter by entry status/i })).getByRole('radio', {
      name: /waitlist/i,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseDogsByOwnerQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseCurrentUserPersonId.mockReturnValue(null);
    seedAuthWithPerson();
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [makeResultRow(submittedEntry)],
      error: null,
    });
    seedPosition([junisPosition]);
  });

  // `vi.clearAllMocks()` clears call history but NOT return-value overrides
  // (see the note in the first describe), so a seeded position would otherwise
  // follow this file into whichever describe runs next.
  afterEach(() => seedPosition([]));

  it('counts the position on the Waitlist chip', async () => {
    renderWithProviders(<MyEntriesPage />);

    await screen.findByRole('radiogroup', { name: /filter by entry status/i });
    // The bug read "Waitlist 0" with Juni sitting at #1 below it.
    expect(waitlistChip()).toHaveTextContent(/^Waitlist\s*1$/);
  });

  it('shows the position — not the "nothing to do" empty state — under the Waitlist filter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyEntriesPage />);

    await screen.findByRole('radiogroup', { name: /filter by entry status/i });
    await user.click(waitlistChip());

    expect(await screen.findByText('My Wait List Positions')).toBeInTheDocument();
    expect(screen.getByText('Juni')).toBeInTheDocument();
    // The sentence the page had no business saying.
    expect(screen.queryByText('No waitlisted entries')).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing to do here right now/)).not.toBeInTheDocument();
  });

  it('keeps the empty state for an exhibitor who genuinely holds no position', async () => {
    // The other half of the same rule: suppressing the copy unconditionally
    // would trade one wrong answer for a blank space.
    seedPosition([]);
    const user = userEvent.setup();
    renderWithProviders(<MyEntriesPage />);

    await screen.findByRole('radiogroup', { name: /filter by entry status/i });
    expect(waitlistChip()).toHaveTextContent(/^Waitlist\s*0$/);
    await user.click(waitlistChip());

    expect(await screen.findByText('No waitlisted entries')).toBeInTheDocument();
    expect(screen.queryByText('My Wait List Positions')).not.toBeInTheDocument();
  });

  it('explains a deep-linked expired offer without counting it on the chip', async () => {
    // `?waitlistOffer=` pulls a terminal row into the display list so the
    // section can say what happened to it. The exhibitor no longer holds that
    // position, so the chip must not claim they do.
    // jsdom implements no layout, so the focused-offer effect's scrollIntoView
    // is undefined and throws through the whole render.
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    seedPosition([{ ...junisPosition, status: 'expired' }], 0);
    renderWithProviders(<MyEntriesPage />, '/exhibitor/entries?waitlistOffer=waitlist-1');

    await screen.findByRole('radiogroup', { name: /filter by entry status/i });
    expect(waitlistChip()).toHaveTextContent(/^Waitlist\s*0$/);
    expect(screen.getByText('My Wait List Positions')).toBeInTheDocument();
  });

  it('does not greet an exhibitor who holds a position as brand new', async () => {
    // `add_to_waitlist` needs no entry row, so a position can be an
    // exhibitor's ONLY standing. "Welcome! Let's get you set up" printed above
    // a live #1 is the same contradiction, one branch up.
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null });
    renderWithProviders(<MyEntriesPage />);

    expect(await screen.findByText('My Wait List Positions')).toBeInTheDocument();
    expect(screen.getByText('Juni')).toBeInTheDocument();
    expect(screen.queryByText(/Welcome! Let’s get you set up/)).not.toBeInTheDocument();
    expect(screen.queryByText(/You haven’t entered any shows yet/)).not.toBeInTheDocument();
  });

  it('still greets a genuinely brand-new exhibitor as brand new', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null });
    seedPosition([]);
    renderWithProviders(<MyEntriesPage />);

    expect(await screen.findByText(/Welcome! Let’s get you set up/)).toBeInTheDocument();
    expect(screen.queryByText('My Wait List Positions')).not.toBeInTheDocument();
  });

  it('hides the positions section behind a status filter that excludes them', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyEntriesPage />);

    await screen.findByRole('radiogroup', { name: /filter by entry status/i });
    expect(screen.getByText('My Wait List Positions')).toBeInTheDocument();

    const statusAxis = screen.getByRole('radiogroup', { name: /filter by entry status/i });
    await user.click(within(statusAxis).getByRole('radio', { name: /accepted/i }));

    // Leaving it up under Accepted is the same contradiction pointing the
    // other way: a section the active filter says should not be there.
    await waitFor(() =>
      expect(screen.queryByText('My Wait List Positions')).not.toBeInTheDocument()
    );
  });
});
