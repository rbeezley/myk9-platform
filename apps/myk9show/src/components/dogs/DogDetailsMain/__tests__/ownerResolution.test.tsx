import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import DogDetailsMain from '../index';
import type { Dog } from '@/types/dog-types';
import type { User } from '@/types/user-types';

// ---------------------------------------------------------------------------
// Minimal Dog fixture
// ---------------------------------------------------------------------------
const DOG_OWNER_ID = 'owner-abc';
const mockDog: Dog = {
  id: 'dog-1',
  name: 'Champion Test Dog',
  callName: 'Buddy',
  breed: 'Golden Retriever',
  sex: 'male',
  ownerId: DOG_OWNER_ID,
  status: 'active',
};

// ---------------------------------------------------------------------------
// Supabase mock — use vi.hoisted so the factory can reference the fns
// ---------------------------------------------------------------------------
const { mockSingle, mockFrom } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockEq = vi.fn(() => ({ single: mockSingle }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  return { mockSingle, mockFrom };
});

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

// ---------------------------------------------------------------------------
// Store mocks
// ---------------------------------------------------------------------------
// mockPeople is mutated per-test; the factory closure reads it at call time
let mockPeople: User[] = [];
let mockRole = 'secretary';
let mockRegistrations: { organization: string; registration_number: string }[] = [];

vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (s: { people: unknown[] }) => unknown) =>
    selector({ people: mockPeople }),
}));

vi.mock('@/store/entryStore', () => ({
  useEntryStore: (selector: (s: { entries: unknown[] }) => unknown) => selector({ entries: [] }),
}));

// ---------------------------------------------------------------------------
// Hook / dependency mocks
// ---------------------------------------------------------------------------
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ getUserRoles: () => [mockRole], hasRole: () => false }),
  getPrimaryRole: () => mockRole,
}));

// Delete-permission logic is covered in useRoleBasedData.test.ts; mock it here so
// this render test doesn't pull the dog data layer (useDogStoreCompat → logging).
vi.mock('@/hooks/useRoleBasedData', () => ({
  useCanDeleteDog: () => false,
}));

vi.mock('@/hooks/useBreadcrumb', () => ({
  useBreadcrumb: () => [],
}));

vi.mock('@/hooks/usePerformanceStatistics', () => ({
  usePerformanceStatistics: () => ({ stats: null }),
}));

vi.mock('@/hooks/useTitleProgress', () => ({
  useTitleProgress: () => ({
    progressBySport: {},
    earnedAbbreviations: [],
  }),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/queries/useRegistrationsDatabase', () => ({
  useRegistrationsByDogQuery: () => ({ data: mockRegistrations, isLoading: false }),
}));

// ---------------------------------------------------------------------------
// Child component mocks (render-heavy; we only care about property sections)
// ---------------------------------------------------------------------------
vi.mock('@/components/common/ThreeDotMenu', () => ({
  default: () => <button type="button">More</button>,
}));

vi.mock('../DogDetailsTabs', () => ({
  default: function MockDogDetailsTabs({
    autoOpenAddRegistration,
    showRegistrationDetails,
  }: {
    autoOpenAddRegistration: boolean;
    showRegistrationDetails: boolean;
  }) {
    const location = useLocation();
    const navigationType = useNavigationType();
    return (
      <div
        data-testid="dog-tabs"
        data-add-registration={String(autoOpenAddRegistration)}
        data-show-registration-details={String(showRegistrationDetails)}
        data-search={location.search}
        data-navigation-type={navigationType}
      />
    );
  },
}));

vi.mock('../DogDialogs', () => ({
  default: () => <div data-testid="dog-dialogs" />,
}));

vi.mock('@/components/dogs/DogStatusDialog', () => ({
  default: () => <div data-testid="status-dialog" />,
}));

vi.mock('@/components/common/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb" />,
}));

vi.mock('@/components/common/RecordStatsRow', () => ({
  RecordStatsRow: () => <div data-testid="stats-row" />,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DogDetailsMain — owner resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPeople = [];
    mockRole = 'secretary';
    mockRegistrations = [];
  });

  it('renders owner name immediately when found in the people store, with no Supabase query', async () => {
    const storeOwner: User = {
      id: DOG_OWNER_ID,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
    };
    mockPeople = [storeOwner];

    render(<DogDetailsMain dog={mockDog} />);

    // Owner name appears in both the property sidebar and the associations sidebar
    expect(screen.getAllByText('Jane Smith').length).toBeGreaterThanOrEqual(1);
    // Supabase should NOT have been called because the owner was in the store
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('renders the identity rail before the tabs, with the owner inside it', () => {
    mockPeople = [
      { id: DOG_OWNER_ID, firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
    ];

    render(<DogDetailsMain dog={mockDog} />);

    const rail = document.querySelector('[data-dog-identity]');
    expect(rail).not.toBeNull();
    expect(rail).toHaveTextContent('Jane Smith');
    const tabs = screen.getByTestId('dog-tabs');
    expect(rail!.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows Loading… then owner name when owner is not in the store but DB returns data', async () => {
    // Owner not in store
    mockPeople = [];

    // Use a controlled promise so we can observe the loading state before resolving
    let resolveQuery!: (v: unknown) => void;
    const queryPromise = new Promise(res => {
      resolveQuery = res;
    });
    mockSingle.mockReturnValueOnce(queryPromise);

    render(<DogDetailsMain dog={mockDog} />);

    // Loading placeholder should appear while the query is pending (shows in both sidebars)
    expect(screen.getAllByText('Loading\u2026').length).toBeGreaterThanOrEqual(1);

    // Resolve the query with owner data
    resolveQuery({
      data: {
        id: DOG_OWNER_ID,
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
      },
      error: null,
    });

    // After resolution, owner name should appear (in both sidebars)
    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('falls back gracefully to "Unknown Owner" when DB returns an error', async () => {
    mockPeople = [];

    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'Row not found', code: 'PGRST116' },
    });

    render(<DogDetailsMain dog={mockDog} />);

    await waitFor(() => {
      expect(screen.getAllByText('Unknown Owner').length).toBeGreaterThanOrEqual(1);
    });

    // No crash — the component is still mounted
    expect(document.querySelector('[data-dog-identity]')).not.toBeNull();
  });

  // MYK9-518 moved this reveal from component state into the URL, so opening it
  // is a real navigation: Back closes the management view instead of leaving the
  // page. Scoping it to one dog stopped being something to enforce — the reveal
  // now lives in a URL whose path names the dog, so no other dog's URL carries it.
  it('reveals registration management as a history entry Back can close', () => {
    mockRole = 'exhibitor';
    mockPeople = [{ id: DOG_OWNER_ID, firstName: 'Jane', lastName: 'Smith' }];
    mockRegistrations = [{ organization: 'AKC', registration_number: 'SR123' }];
    render(<DogDetailsMain dog={mockDog} />, { initialRoute: '/dogs/dog-1' });

    const toggle = screen.getByRole('button', { name: 'Manage registrations' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    const tabs = screen.getByTestId('dog-tabs');
    expect(tabs).toHaveAttribute('data-show-registration-details', 'true');
    expect(tabs).toHaveAttribute('data-search', '?tab=registrations');
    expect(tabs).toHaveAttribute('data-navigation-type', 'PUSH');
  });

  // The button stays visible while the view is open and is often the only
  // registration control on screen after scrolling back up, so a second click
  // has to do something. Toggling also keeps the params changing, so RRv7 never
  // stacks an identical-params push.
  it('collapses the management view on a second click', () => {
    mockRole = 'exhibitor';
    mockPeople = [{ id: DOG_OWNER_ID, firstName: 'Jane', lastName: 'Smith' }];
    mockRegistrations = [{ organization: 'AKC', registration_number: 'SR123' }];
    render(<DogDetailsMain dog={mockDog} />, { initialRoute: '/dogs/dog-1?tab=registrations' });

    const toggle = screen.getByRole('button', { name: 'Manage registrations' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    const tabs = screen.getByTestId('dog-tabs');
    expect(tabs).toHaveAttribute('data-show-registration-details', 'false');
    expect(tabs).toHaveAttribute('data-search', '');
    // Collapse REPLACES so it unwinds the open instead of stacking an entry
    // that would re-expand the section on the way out of the page.
    expect(tabs).toHaveAttribute('data-navigation-type', 'REPLACE');
    expect(screen.getByRole('button', { name: 'Manage registrations' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('does not carry the reveal onto another dog', () => {
    mockRole = 'exhibitor';
    mockPeople = [{ id: DOG_OWNER_ID, firstName: 'Jane', lastName: 'Smith' }];
    mockRegistrations = [{ organization: 'AKC', registration_number: 'SR123' }];
    render(<DogDetailsMain dog={{ ...mockDog, id: 'dog-2' }} />, {
      initialRoute: '/dogs/dog-2',
    });
    expect(screen.getByTestId('dog-tabs')).toHaveAttribute(
      'data-show-registration-details',
      'false'
    );
  });

  it('opens the management view for a legacy registration bookmark', () => {
    mockRole = 'exhibitor';
    mockPeople = [{ id: DOG_OWNER_ID, firstName: 'Jane', lastName: 'Smith' }];
    mockRegistrations = [{ organization: 'AKC', registration_number: 'SR123' }];
    render(<DogDetailsMain dog={mockDog} />, {
      initialRoute: '/dogs/dog-1?tab=registrations',
    });
    expect(screen.getByTestId('dog-tabs')).toHaveAttribute(
      'data-show-registration-details',
      'true'
    );
  });

  it('lands on Overview and opens Add registration from a mixed deep link', async () => {
    mockRole = 'exhibitor';
    mockPeople = [{ id: DOG_OWNER_ID, firstName: 'Jane', lastName: 'Smith' }];
    render(<DogDetailsMain dog={mockDog} />, {
      initialRoute: '/dogs/dog-1?section=career&addRegistration=true',
    });
    await waitFor(() => {
      expect(screen.getByTestId('dog-tabs')).toHaveAttribute('data-search', '');
      expect(screen.getByTestId('dog-tabs')).toHaveAttribute('data-add-registration', 'true');
      expect(screen.getByTestId('dog-tabs')).toHaveAttribute('data-navigation-type', 'REPLACE');
    });
  });
});
