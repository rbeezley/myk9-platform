import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import DogDetailsMain from '../index';
import type { Dog } from '@/types/dog-types';
import type { User } from '@/types/user-types';

/**
 * Dog detail page frame (MYK9-930): one page shell, the shared PageHeader
 * breadcrumb with Home and 44px links, and a DetailHero that owns the h1.
 * Same data-layer mocks as ownerResolution.test.tsx; the breadcrumb hook, the
 * shell, the header and the hero are REAL here.
 */
const mockDog: Dog = {
  id: 'dog-1',
  name: 'Champion Test Dog',
  callName: 'Buddy',
  breed: 'Golden Retriever',
  sex: 'male',
  ownerId: 'owner-abc',
  status: 'active',
  registrations: [
    {
      id: 'r1',
      organization: 'AKC',
      registeredName: 'Champion Test Dog',
      breed: 'Golden Retriever',
      registrationNumber: 'SR1',
      status: 'Active',
    },
  ],
};

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(() => ({
    select: () => ({
      eq: () => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    }),
  })),
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: mockFrom } }));

vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (s: { people: unknown[] }) => unknown) => selector({ people: [] }),
}));
vi.mock('@/store/entryStore', () => ({
  useEntryStore: (selector: (s: { entries: unknown[] }) => unknown) => selector({ entries: [] }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ getUserRoles: () => ['secretary'], hasRole: () => false }),
  getPrimaryRole: () => 'secretary',
}));
vi.mock('@/hooks/useRoleBasedData', () => ({ useCanDeleteDog: () => false }));
vi.mock('@/hooks/usePerformanceStatistics', () => ({
  usePerformanceStatistics: () => ({ stats: null }),
}));
vi.mock('@/hooks/useTitleProgress', () => ({
  useTitleProgress: () => ({ progressBySport: {}, earnedAbbreviations: [] }),
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/hooks/queries/useRegistrationsDatabase', () => ({
  useRegistrationsByDogQuery: () => ({ data: [], isLoading: false }),
  useDogRegistrationManagement: () => ({
    registrations: [],
    isLoading: false,
    error: null,
    createRegistration: vi.fn(),
    updateRegistration: vi.fn(),
    deleteRegistration: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock('@/components/common/ThreeDotMenu', () => ({
  default: () => <button type="button">More</button>,
}));
vi.mock('../DogDetailsTabs', () => ({ default: () => <div data-testid="dog-tabs" /> }));
vi.mock('../DogDialogs', () => ({ default: () => <div data-testid="dog-dialogs" /> }));
vi.mock('@/components/dogs/DogStatusDialog', () => ({
  default: () => <div data-testid="status-dialog" />,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dog detail page frame (MYK9-930)', () => {
  it('sits in the one detail-page shell, not its own 1440px container', () => {
    render(<DogDetailsMain dog={mockDog} />);

    const shell = screen.getByTestId('app-shell-page');
    expect(shell).toHaveClass('max-w-7xl');
    expect(shell.querySelector('[class*="1440"]')).toBeNull();
  });

  it('renders the shared breadcrumb: Home › Dogs › the dog, with Dogs linking to the list', () => {
    render(<DogDetailsMain dog={mockDog} />);

    const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(trail.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(trail.getByRole('link', { name: 'Dogs' })).toHaveAttribute('href', '/dogs');
    expect(trail.getByText('Buddy')).toBeInTheDocument();
  });

  it('names the person it was reached from: Home › People › Name › Dog', () => {
    const fromPerson = { id: 'p-1', firstName: 'Jane', lastName: 'Smith' } as User;
    render(<DogDetailsMain dog={mockDog} fromPerson={fromPerson} />);

    const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(trail.getByRole('link', { name: 'People' })).toHaveAttribute('href', '/people');
    expect(trail.getByRole('link', { name: 'Jane Smith' })).toHaveAttribute('href', '/people/p-1');
  });

  it('has exactly one h1, and it is the hero title', () => {
    const { container } = render(<DogDetailsMain dog={mockDog} />);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Buddy');
    expect(container.querySelector('h1.sr-only')).toBeNull();
  });

  it('puts the identity facts in the hero, not the rail', () => {
    render(<DogDetailsMain dog={mockDog} />);

    const rail = document.querySelector('[data-dog-identity]') as HTMLElement;
    expect(within(rail).queryByRole('heading', { level: 1 })).toBeNull();
    expect(within(rail).queryByText('Male')).toBeNull();
    expect(screen.getByText('Male')).toBeInTheDocument();
    expect(screen.getByText('Champion Test Dog')).toBeInTheDocument();
  });
});
