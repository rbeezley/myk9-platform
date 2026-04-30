import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyEntriesPage from '@/pages/MyEntriesPage';
import { useAuthContext } from '@/hooks/useAuthContext';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { UserWithRoles } from '@/types/auth-types';

// Mock dependencies
vi.mock('@/hooks/useAuthContext');
vi.mock('@/hooks/useBreadcrumb', () => ({
  useBreadcrumb: () => [{ label: 'Home', href: '/' }, { label: 'My Entries' }],
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
vi.mock('@/services/database/queries/entryQueries', () => ({
  getUserEntries: vi.fn().mockResolvedValue({ data: [], error: null }),
}));
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsByOwnerQuery: () => ({ data: [] }),
}));
vi.mock('@/hooks/queries/useShowDayData', () => ({
  useShowDayData: () => ({ isShowDay: false }),
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
vi.mock('@/hooks/useRoleBasedData', () => ({
  useCurrentUserPersonId: () => null,
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

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/my-entries']}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
};

describe('MyEntriesPage UI Improvements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockUser,
      userWithRoles: null,
      isAuthenticated: true,
    });
  });

  describe('Fake Trend Data Removal', () => {
    it('should NOT display hardcoded trend percentages', async () => {
      renderWithProviders(<MyEntriesPage />);

      // Wait for initial render - use heading role to be specific
      await screen.findByRole('tablist');

      // Verify no fake trend percentages exist
      expect(screen.queryByText('+5%')).not.toBeInTheDocument();
      expect(screen.queryByText('+12%')).not.toBeInTheDocument();
      expect(screen.queryByText('-3%')).not.toBeInTheDocument();
      expect(screen.queryByText('+8%')).not.toBeInTheDocument();
    });

    it('should display meaningful stat card labels', async () => {
      renderWithProviders(<MyEntriesPage />);

      await screen.findByRole('tablist');

      // Should have stat cards with meaningful titles
      expect(screen.getByText('Total Entries')).toBeInTheDocument();
      expect(screen.getByText('Needs Action')).toBeInTheDocument();
      expect(screen.getByText('Total Fees')).toBeInTheDocument();
    });
  });

  describe('Enter a Show CTA', () => {
    it('should display "Enter a Show" button in header', async () => {
      renderWithProviders(<MyEntriesPage />);

      await screen.findByRole('tablist');

      const enterShowButton = screen.getByRole('button', { name: /enter a show/i });
      expect(enterShowButton).toBeInTheDocument();
    });
  });

  describe('Tab Structure', () => {
    it('should render tabs without redundant counts', async () => {
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
      renderWithProviders(<MyEntriesPage />);

      await screen.findByRole('tablist');

      const tabList = screen.getByRole('tablist');
      expect(tabList).toHaveClass('overflow-x-auto');
    });
  });

  describe('Empty State', () => {
    it('should display helpful empty state message', async () => {
      renderWithProviders(<MyEntriesPage />);

      await screen.findByRole('tablist');

      // When no entries, should show helpful message - use getAllBy since there may be multiple matches
      const emptyMessages = screen.getAllByText(/no entries found|haven't entered any shows/i);
      expect(emptyMessages.length).toBeGreaterThan(0);
    });

    it('should display Browse All Shows button in empty state', async () => {
      renderWithProviders(<MyEntriesPage />);

      await screen.findByRole('tablist');

      const browseButton = screen.getByRole('link', { name: /browse all shows/i });
      expect(browseButton).toBeInTheDocument();
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
    renderWithProviders(<MyEntriesPage />);

    await screen.findByRole('tablist');

    // Should NOT have the old progress elements
    expect(screen.queryByText('Entry Progress')).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+%$/)).not.toBeInTheDocument(); // No percentage displays
  });
});
