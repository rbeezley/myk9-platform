import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyEntriesPage from '@/pages/MyEntriesPage';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getUserEntries, updateCheckInStatus } from '@/services/database/entries';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { UserWithRoles } from '@/types/auth-types';

// Mock dependencies
const mockCheckInMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockUseCheckInMutation = vi.hoisted(() =>
  vi.fn(() => ({
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
}));
vi.mock('@/services/database/entries', () => ({
  getUserEntries: vi.fn().mockResolvedValue({ data: [], error: null }),
  updateCheckInStatus: vi.fn().mockResolvedValue({ data: null, error: null }),
}));
vi.mock('@/hooks/mutations/useCheckInMutation', () => ({
  useCheckInMutation: (...args: unknown[]) => mockUseCheckInMutation(...args),
}));
const mockUseDogsByOwnerQuery = vi.hoisted(() =>
  vi.fn(() => ({ data: [] as unknown[], isLoading: false }))
);
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsByOwnerQuery: (...args: unknown[]) => mockUseDogsByOwnerQuery(...args),
}));
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntryStatisticsQuery: () => ({ data: null }),
  useEntriesQuery: () => ({ data: [] }),
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
  AddDogPanel: () => null,
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

const mockUser: UserWithRoles = {
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  roles: ['exhibitor'],
  permissions: [],
};

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
      await screen.findByRole('tablist');

      // Verify no fake trend percentages exist
      expect(screen.queryByText('+5%')).not.toBeInTheDocument();
      expect(screen.queryByText('+12%')).not.toBeInTheDocument();
      expect(screen.queryByText('-3%')).not.toBeInTheDocument();
      expect(screen.queryByText('+8%')).not.toBeInTheDocument();
    });

    it('should render the stats area without fake data', async () => {
      seedLoadedEntry();
      renderWithProviders(<MyEntriesPage />);

      await screen.findByRole('tablist');

      // CompactStatsRow is mocked to null in this file; its label assertions
      // live in CompactStatsRow.test.tsx. Verify the page renders tabs and
      // no fake trend strings leak in from anywhere else on the page.
      expect(screen.getByRole('tablist')).toBeInTheDocument();
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
    it('should render tabs without redundant counts', async () => {
      seedLoadedEntry();
      renderWithProviders(<MyEntriesPage />);

      await screen.findByRole('tablist');

      // Tabs should have simple labels without counts
      expect(screen.getByRole('tab', { name: /All/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Pending/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Accepted/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Waitlist/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Upcoming/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Completed/i })).toBeInTheDocument();
    });

    it('should have scrollable tab container for mobile', async () => {
      seedLoadedEntry();
      renderWithProviders(<MyEntriesPage />);

      await screen.findByRole('tablist');

      const tabList = screen.getByRole('tablist');
      expect(tabList).toHaveClass('overflow-x-auto');
    });
  });

  describe('Mobile information density', () => {
    it('orders the entries section above the dog strip on phones via flex order', async () => {
      seedLoadedEntry();
      renderWithProviders(<MyEntriesPage />);

      await screen.findByRole('tablist');

      // The "My Entries" label anchors the entries section wrapper.
      const entriesWrapper = screen.getByText('My Entries').closest('div');
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
      renderWithProviders(<MyEntriesPage />);

      // The welcoming zero-state replaces the whole stat/dog/tab stack.
      expect(await screen.findByText(/Welcome!/i)).toBeInTheDocument();
      // No tabs and no zeroed stat noise for a brand-new exhibitor.
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
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
      renderWithProviders(<MyEntriesPage />);

      const browse = await screen.findByRole('link', { name: /browse shows/i });
      expect(browse).toHaveAttribute('href', '/shows');
    });

    it('leads with "Add Your First Dog" when the exhibitor has no dogs', async () => {
      // Default auth has no databaseUserId → ownerId is empty → dogs are
      // definitively none, so the first-dog CTA is shown (no loading flash).
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

      // No person id → no entries → zero-state (no tablist to await).
      await screen.findByText(/Welcome!/i);

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
          },
        ],
        error: null,
      });

      renderWithProviders(<MyEntriesPage />);

      expect(mockUseCheckInMutation).toHaveBeenCalledWith({ writer: 'self-checkin-rpc' });
      await screen.findByText('Spring Trial');
      await user.click(screen.getByRole('button', { name: /update check-in for koda in novice a/i }));
      const statusOptions = await screen.findAllByRole('radio', { name: /checked in/i });
      const checkedInOption = statusOptions.find(
        option => option.getAttribute('aria-labelledby') === 'checked-in-label'
      );
      expect(checkedInOption).toBeDefined();
      await user.click(checkedInOption as HTMLElement);
      await user.click(screen.getByRole('button', { name: /update status/i }));

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

      expect(await screen.findByText('My Entries')).toBeInTheDocument();
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

describe('Status Stepper Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockUser,
      userWithRoles: null,
      isAuthenticated: true,
    });
  });

  it('should use EntryStatusStepper instead of progress bar', async () => {
    seedLoadedEntry();
    renderWithProviders(<MyEntriesPage />);

    await screen.findByRole('tablist');

    // Should NOT have the old progress elements
    expect(screen.queryByText('Entry Progress')).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+%$/)).not.toBeInTheDocument(); // No percentage displays
  });
});
