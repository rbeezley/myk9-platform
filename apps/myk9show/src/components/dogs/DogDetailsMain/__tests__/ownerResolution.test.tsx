import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import DogDetailsMain from '../index';
import type { Dog } from '@/types/dog-types';
import type { User } from '@/types/user-types';
import { useRegistrationsStore } from '@/store/registrationsStore';
import { usePageEditTargetStore } from '@/features/actions/pageEditTarget';

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
let mockViewerPersonId: string | undefined;
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
  useAuthContext: () => ({
    userWithRoles: { databaseUserId: mockViewerPersonId },
    getUserRoles: () => [mockRole],
    hasRole: (role: string) => role === mockRole,
  }),
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
  useDogRegistrationManagement: () => ({
    registrations: mockRegistrations,
    isLoading: false,
    error: null,
    createRegistration: vi.fn(),
    updateRegistration: vi.fn(),
    deleteRegistration: vi.fn(),
    refetch: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Child component mocks (render-heavy; we only care about property sections)
// ---------------------------------------------------------------------------
vi.mock('@/components/common/ThreeDotMenu', () => ({
  default: () => <button type="button">More</button>,
}));

vi.mock('../DogDetailsTabs', () => ({
  default: function MockDogDetailsTabs() {
    const location = useLocation();
    const navigationType = useNavigationType();
    return (
      <div
        data-testid="dog-tabs"
        data-search={location.search}
        data-navigation-type={navigationType}
      />
    );
  },
}));

vi.mock('../DogDialogs', () => ({
  default: ({ isEditPanelOpen }: { isEditPanelOpen?: boolean }) => (
    <div data-testid="dog-dialogs" data-edit-open={String(Boolean(isEditPanelOpen))} />
  ),
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
    mockViewerPersonId = undefined;
    mockRegistrations = [];
    usePageEditTargetStore.setState({ target: null, owner: null });
  });

  // MYK9-928: Edit dog is the header Actions menu's first item for every viewer of the
  // page. The secretary's rail button and the exhibitor's menu item are both gone.
  it.each(['secretary', 'exhibitor'])(
    'registers Edit dog for a %s, with no visible Edit button, and run opens the panel',
    role => {
      mockRole = role;
      render(<DogDetailsMain dog={mockDog} />);

      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
      expect(usePageEditTargetStore.getState().target?.kind).toBe('dog');
      expect(screen.getByTestId('dog-dialogs')).toHaveAttribute('data-edit-open', 'false');

      act(() => usePageEditTargetStore.getState().target?.run());

      expect(screen.getByTestId('dog-dialogs')).toHaveAttribute('data-edit-open', 'true');
    }
  );

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

  // The rail's owner name goes to /people/:id, which only SECRETARY and SITE_ADMIN may open.
  it('links the owner for a secretary and leaves it plain text for an exhibitor', () => {
    mockPeople = [{ id: DOG_OWNER_ID, firstName: 'Jane', lastName: 'Smith' }];

    mockRole = 'secretary';
    const { unmount } = render(<DogDetailsMain dog={mockDog} />);
    const rail = () => document.querySelector('[data-dog-identity]') as HTMLElement;
    expect(within(rail()).getByRole('link', { name: 'Jane Smith' })).toHaveAttribute(
      'href',
      `/people/${DOG_OWNER_ID}`
    );
    unmount();

    mockRole = 'exhibitor';
    render(<DogDetailsMain dog={mockDog} />);
    expect(within(rail()).getByText('Jane Smith')).toBeInTheDocument();
    expect(within(rail()).queryByRole('link', { name: 'Jane Smith' })).not.toBeInTheDocument();
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

  // Registrations are consulted rarely, so they have no standing room on
  // Overview: the rail summarises them and raises this panel on demand.
  it('opens the registrations panel from the rail, leaving Overview alone', async () => {
    mockRole = 'exhibitor';
    mockViewerPersonId = DOG_OWNER_ID;
    mockPeople = [{ id: DOG_OWNER_ID, firstName: 'Jane', lastName: 'Smith' }];
    mockRegistrations = [{ organization: 'AKC', registration_number: 'SR123' }];
    render(<DogDetailsMain dog={mockDog} />, { initialRoute: '/dogs/dog-1' });

    fireEvent.click(screen.getByRole('button', { name: 'Manage registrations' }));
    const manage = await screen.findByRole('dialog');
    // Opening it is not navigation: the URL, and Back, are untouched.
    expect(screen.getByTestId('dog-tabs')).toHaveAttribute('data-search', '');
    expect(screen.getByTestId('dog-tabs')).toHaveAttribute('data-navigation-type', 'POP');

    // SlideOverPanel does not portal and every panel is `fixed inset-0 z-50`, so
    // among equal-z siblings the LATER one paints on top. The panels raised FROM
    // the Manage panel must therefore follow it in document order, or they mount
    // invisibly behind its backdrop — and this is the exhibitor's only route to
    // edit or delete a registration.
    act(() => {
      useRegistrationsStore.getState().setIsAddRegistrationDialogOpen(true);
    });
    const dialogs = await screen.findAllByRole('dialog');
    expect(dialogs).toHaveLength(2);
    expect(
      manage.compareDocumentPosition(dialogs[dialogs.length - 1]) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    act(() => {
      useRegistrationsStore.getState().setIsAddRegistrationDialogOpen(false);
    });
  });

  it('opens Add registration from a deep link without moving the reader off their section', async () => {
    mockRole = 'exhibitor';
    mockViewerPersonId = DOG_OWNER_ID;
    mockPeople = [{ id: DOG_OWNER_ID, firstName: 'Jane', lastName: 'Smith' }];
    render(<DogDetailsMain dog={mockDog} />, {
      initialRoute: '/dogs/dog-1?section=career&addRegistration=true',
    });
    // The add panel is hosted by the page, so it opens over whatever section the
    // link pointed at: only `addRegistration` is stripped, and Career stays
    // selected underneath rather than the reader being dumped on Overview.
    expect(await screen.findByRole('dialog')).toHaveTextContent(/registration/i);
    await waitFor(() => {
      expect(screen.getByTestId('dog-tabs')).toHaveAttribute('data-search', '?section=career');
      expect(screen.getByTestId('dog-tabs')).toHaveAttribute('data-navigation-type', 'REPLACE');
    });
  });
});
