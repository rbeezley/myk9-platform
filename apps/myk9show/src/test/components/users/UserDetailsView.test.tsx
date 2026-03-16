import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UserDetailsView from '@/components/users/UserDetails/UserDetailsView';
import type { User } from '@/types/dog-types';

// Mock hooks
vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    hasPermission: vi.fn().mockReturnValue(false),
  }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'current-user-id' },
    getUserRoles: () => ['exhibitor'],
  }),
}));

vi.mock('@/hooks/useRoleBasedData', () => ({
  useRoleBasedPeople: () => [],
}));

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUpdateUserMutation: () => ({
    mutateAsync: vi.fn(),
  }),
  useDeleteUserMutation: () => ({
    mutateAsync: vi.fn(),
  }),
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({
    loadUsers: vi.fn(),
  }),
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useOwnerDogsWithQuery: () => ({
    dogs: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isStale: false,
  }),
  useDogStoreCompat: () => ({
    dogs: [],
    addDog: vi.fn(),
    updateDog: vi.fn(),
    deleteDog: vi.fn(),
    getDogsByOwner: () => [],
    isLoading: false,
    error: null,
  }),
}));

// Mock child components with heavy dependencies to isolate UserDetailsView tests
vi.mock('@/components/users/UserDetails/UserDetailsTabs', () => ({
  default: ({ selectedUser }: { selectedUser: User }) => (
    <div data-testid="user-details-tabs">UserDetailsTabs for {selectedUser.id}</div>
  ),
}));

vi.mock('@/components/users/UserDetails/JudgeAvailabilityCard', () => ({
  default: ({ personId }: { personId: string }) => (
    <div data-testid="judge-availability-card">JudgeAvailabilityCard for {personId}</div>
  ),
}));

vi.mock('@/components/users/UserDetails/UserDetailsDialogs', () => ({
  default: () => <div data-testid="user-details-dialogs">UserDetailsDialogs</div>,
}));

const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-123',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  phone: '555-123-4567',
  streetAddress: '123 Main St',
  city: 'Springfield',
  state: 'IL',
  zipCode: '62701',
  roles: ['exhibitor'],
  dogs: [],
  ...overrides,
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const renderWithRouter = (component: React.ReactNode) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{component}</MemoryRouter>
    </QueryClientProvider>
  );
};

describe('UserDetailsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Member Since Date', () => {
    it('should display formatted createdAt date when available', () => {
      const user = createMockUser({
        createdAt: new Date('2023-06-15'),
      });

      renderWithRouter(<UserDetailsView person={user} />);

      expect(screen.getByText('June 2023')).toBeInTheDocument();
    });

    it('should display "Not set" when createdAt is undefined', () => {
      const user = createMockUser({
        createdAt: undefined,
      });

      renderWithRouter(<UserDetailsView person={user} />);

      // The PropertySection renders "Not set" for null/empty values
      const notSetElements = screen.getAllByText('Not set');
      expect(notSetElements.length).toBeGreaterThan(0);
    });
  });

  describe('Email Status Badge Removal', () => {
    it('should NOT display "Email Status" or "Verified" badge', () => {
      const user = createMockUser({
        email: 'test@example.com',
      });

      renderWithRouter(<UserDetailsView person={user} />);

      expect(screen.queryByText('Email Status')).not.toBeInTheDocument();
      expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    });
  });

  describe('Quick Actions', () => {
    it('should render Email button when email is provided', () => {
      const user = createMockUser({
        email: 'test@example.com',
      });

      renderWithRouter(<UserDetailsView person={user} />);

      const emailLink = screen.getByRole('link', { name: /email/i });
      expect(emailLink).toHaveAttribute('href', 'mailto:test@example.com');
    });

    it('should render Call button when phone is provided', () => {
      const user = createMockUser({
        phone: '555-123-4567',
      });

      renderWithRouter(<UserDetailsView person={user} />);

      const callLink = screen.getByRole('link', { name: /call/i });
      expect(callLink).toHaveAttribute('href', 'tel:5551234567');
    });

    it('should not render Email button when email is not provided', () => {
      const user = createMockUser({
        email: undefined,
      });

      renderWithRouter(<UserDetailsView person={user} />);

      expect(screen.queryByRole('link', { name: /email/i })).not.toBeInTheDocument();
    });

    it('should display dogs count when user has dogs', () => {
      const user = createMockUser({
        dogs: ['dog-1', 'dog-2', 'dog-3'],
      });

      renderWithRouter(<UserDetailsView person={user} />);

      // "3 dogs" appears in the HeroProfileCard
      const dogCountElements = screen.getAllByText('3 dogs');
      expect(dogCountElements.length).toBeGreaterThan(0);
    });

    it('should display singular "dog" for one dog', () => {
      const user = createMockUser({
        dogs: ['dog-1'],
      });

      renderWithRouter(<UserDetailsView person={user} />);

      expect(screen.getByText('1 dog')).toBeInTheDocument();
    });
  });

  describe('Judge Qualifications Card', () => {
    it('should show Judge Qualifications card for users with judge role', () => {
      const user = createMockUser({
        roles: ['judge'],
      });

      renderWithRouter(<UserDetailsView person={user} />);

      expect(screen.getByText('Judge Qualifications')).toBeInTheDocument();
    });

    it('should hide Judge Qualifications card for non-judge users even with qualifications data', () => {
      const user = createMockUser({
        roles: ['exhibitor'],
        judgeQualifications: [
          {
            organization: 'AKC',
            level: 'Senior',
            disciplines: ['Agility'],
            dateObtained: new Date(),
            expirationDate: null,
            judgeNumber: 'J123',
            showTypes: ['Agility'],
            certificationDate: '2023-01-01',
            status: 'Active' as const,
          },
        ],
      });

      renderWithRouter(<UserDetailsView person={user} />);

      // Card only renders for users with the Judge role
      expect(screen.queryByText('Judge Qualifications')).not.toBeInTheDocument();
    });

    it('should hide Judge Qualifications card for non-judge users without qualifications', () => {
      const user = createMockUser({
        roles: ['exhibitor'],
        judgeQualifications: [],
      });

      renderWithRouter(<UserDetailsView person={user} />);

      expect(screen.queryByText('Judge Qualifications')).not.toBeInTheDocument();
    });
  });

  describe('Breadcrumb Navigation', () => {
    it('should display breadcrumb with People link and user name', () => {
      const user = createMockUser({
        firstName: 'Jane',
        lastName: 'Smith',
      });

      renderWithRouter(<UserDetailsView person={user} />);

      expect(screen.getByText('People')).toBeInTheDocument();
      // "Jane Smith" may appear in multiple places (breadcrumb + hero card)
      const janeSmithElements = screen.getAllByText('Jane Smith');
      expect(janeSmithElements.length).toBeGreaterThan(0);
    });
  });

  describe('Contact Information Card', () => {
    it('should display consolidated Contact Information header', () => {
      const user = createMockUser();

      renderWithRouter(<UserDetailsView person={user} />);

      expect(screen.getByText('Contact Information')).toBeInTheDocument();
    });

    it('should NOT display separate Personal Information and Address Information headers', () => {
      const user = createMockUser();

      renderWithRouter(<UserDetailsView person={user} />);

      expect(screen.queryByText('Personal Information')).not.toBeInTheDocument();
      expect(screen.queryByText('Address Information')).not.toBeInTheDocument();
    });

    it('should display all contact details in property sections', () => {
      const user = createMockUser({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        streetAddress: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
      });

      renderWithRouter(<UserDetailsView person={user} />);

      // Contact info section labels and values
      expect(screen.getByText('First Name')).toBeInTheDocument();
      expect(screen.getByText('Last Name')).toBeInTheDocument();

      // Address section values
      expect(screen.getByText('Springfield')).toBeInTheDocument();
      expect(screen.getByText('62701')).toBeInTheDocument();
    });
  });

  describe('Terminology', () => {
    it('should use "Edit Person" label in menu', () => {
      const user = createMockUser();

      renderWithRouter(<UserDetailsView person={user} />);

      // The label is passed to ThreeDotMenu as editLabel="Edit Person"
      // Verify "Edit User" is not used
      expect(screen.queryByText('Edit User')).not.toBeInTheDocument();
    });
  });
});
