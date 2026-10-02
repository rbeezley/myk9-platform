import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as renderBare, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient, render } from '@/test/utils/testUtils';
import type { User } from '@/types/user-types';
import UserDetailsView from './UserDetailsView';

/**
 * Person detail page frame (MYK9-930): one page shell, the shared PageHeader
 * breadcrumb, and a calmer DetailHero (name, email, role badges, facts row; no
 * Email or Call buttons: the contact card carries both).
 */
const person = {
  id: 'person-1',
  firstName: 'Grace',
  lastName: 'Hopper',
  email: 'grace@example.test',
  phone: '555-0100',
  roles: ['secretary', 'judge'],
  dogs: [{ id: 'd1' }, { id: 'd2' }],
} as unknown as User;

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'viewer' }, hasPermission: () => false }),
}));
vi.mock('@/hooks/useRoleBasedData', () => ({ useRoleBasedPeople: () => ({ people: [person] }) }));
vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUpdateUserMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePermanentDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('./useSendUserInvitation', () => ({
  useSendUserInvitation: () => ({ sendInvitation: vi.fn(), isSending: false }),
}));
vi.mock('./UserDetailsTabs', () => ({ default: () => <div data-testid="user-tabs" /> }));
vi.mock('./UserDetailsDialogs', () => ({
  default: () => <div data-testid="person-dialogs" />,
}));
vi.mock('./JudgeQualificationsCard', () => ({ default: () => null }));
vi.mock('./JudgeAvailabilityCard', () => ({ default: () => null }));
vi.mock('@/components/users/AccountStatusDialog', () => ({ default: () => null }));
vi.mock('@/services/imageUploadService', () => ({ uploadProfilePhoto: vi.fn() }));
vi.mock('@/services/database/users', () => ({ restoreUser: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

const queryClient = createTestQueryClient();
function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('Person detail page frame (MYK9-930)', () => {
  // SlideOverPanel is not portaled: inside PageShell's `space-y-6` it would pick up a
  // 24px top margin on a fixed overlay. Dialogs and panels render OUTSIDE the shell.
  it('renders its dialogs and edit panel outside the PageShell spacing container', () => {
    render(<UserDetailsView person={person} />);

    const shell = screen.getByTestId('app-shell-page');
    expect(shell).toContainElement(screen.getByRole('heading', { level: 1 }));
    expect(shell).not.toContainElement(screen.getByTestId('person-dialogs'));
  });

  it('sits in the one detail-page shell, not its own 1440px container', () => {
    render(<UserDetailsView person={person} />);

    const shell = screen.getByTestId('app-shell-page');
    expect(shell).toHaveClass('max-w-7xl');
    expect(shell.querySelector('[class*="1440"]')).toBeNull();
  });

  it('renders the shared breadcrumb: Home › People › the person', () => {
    render(<UserDetailsView person={person} />);

    const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(trail.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(trail.getByRole('link', { name: 'People' })).toHaveAttribute('href', '/people');
    expect(trail.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('names the list the user walked in through, with its filters intact', () => {
    renderBare(
      <Providers>
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/people/person-1',
              state: {
                backTo: {
                  href: '/admin/users?status=active',
                  label: 'Users',
                  parent: { label: 'Admin', href: '/admin' },
                },
              },
            },
          ]}
        >
          <UserDetailsView person={person} />
        </MemoryRouter>
      </Providers>
    );

    const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(trail.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
    expect(trail.getByRole('link', { name: 'Users' })).toHaveAttribute(
      'href',
      '/admin/users?status=active'
    );
  });

  it('has exactly one h1, the hero name', () => {
    const { container } = render(<UserDetailsView person={person} />);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Grace Hopper');
    expect(container.querySelector('h1.sr-only')).toBeNull();
  });

  it('carries email, role badges and the dog count in the hero', () => {
    render(<UserDetailsView person={person} />);

    expect(screen.getAllByText('grace@example.test').length).toBeGreaterThan(0);
    expect(screen.getByText('Secretary')).toBeInTheDocument();
    expect(screen.getByText('Judge')).toBeInTheDocument();
    expect(screen.getByText('2 dogs')).toBeInTheDocument();
  });

  it('offers no hero Email or Call button; the phone is a tel link in the contact card', () => {
    render(<UserDetailsView person={person} />);

    expect(screen.queryByRole('link', { name: /^email$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^call$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '555-0100' })).toHaveAttribute('href', 'tel:5550100');
  });
});
