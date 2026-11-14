import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AccountMenuContent } from '@/components/layout/AccountMenuContent';
import { ScopeType, UserRole } from '@/types/auth-types';
import MockShowTestPage from './MockShowTestPage';

const TEST_CLUB = 'club-test';
const ORDINARY_CLUB = 'club-ordinary';

const { authState, mockFrom, mockRpc } = vi.hoisted(() => ({
  authState: { clubId: 'club-test', role: 'secretary', clubsFail: false },
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'tester-1', email: 'tester@example.com' },
    hasRole: (role: string) => role === authState.role,
    signOut: vi.fn(),
    getUserRoles: () => [authState.role],
    userWithRoles: {
      id: 'tester-1',
      roles: [authState.role],
      scopes: [
        {
          userId: 'tester-1',
          roleId: authState.role,
          scopeType: ScopeType.CLUB,
          scopeId: authState.clubId,
          createdAt: new Date(),
        },
      ],
      user_metadata: {},
    },
  }),
}));

vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));
vi.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isOnline: true }) }));
vi.mock('@/hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => ({ status: 'synced', queueSize: 0 }),
}));
vi.mock('@/services/pwa/refreshApp', () => ({ refreshApp: vi.fn() }));

/** Only TEST_CLUB is marked is_demo; the clubs query answers like the database would. */
function stubDatabase() {
  mockFrom.mockImplementation((table: string) => {
    const empty = { data: [], error: null };
    if (table === 'clubs') {
      return {
        select: () => ({
          in: (_column: string, ids: string[]) => ({
            eq: () =>
              Promise.resolve(
                authState.clubsFail
                  ? { data: null, error: { message: 'offline' } }
                  : { data: ids.includes(TEST_CLUB) ? [{ id: TEST_CLUB }] : [], error: null }
              ),
          }),
        }),
      };
    }
    const read = {
      eq: vi.fn(),
      order: vi.fn(),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (value: typeof empty) => unknown) => Promise.resolve(empty).then(resolve),
    };
    read.eq.mockReturnValue(read);
    read.order.mockReturnValue(read);
    return { select: () => read };
  });
}

function renderPage() {
  return render(
    <Routes>
      <Route path="/account" element={<div>Account page</div>} />
      <Route path="/account/mock-show-test" element={<MockShowTestPage />} />
    </Routes>,
    { initialRoute: '/account/mock-show-test' }
  );
}

function renderMenu() {
  return render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Account menu</DropdownMenuTrigger>
      <AccountMenuContent
        onAbout={vi.fn()}
        onGuardedSignOut={vi.fn()}
        onConfirmDevAction={vi.fn()}
      />
    </DropdownMenu>
  );
}

describe('mock show test access (MYK9-2022)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
    stubDatabase();
    authState.clubId = TEST_CLUB;
    authState.role = UserRole.SECRETARY;
    authState.clubsFail = false;
  });

  it('shows the tasks, both rules and the closing questions to a test club secretary', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Mock show test' })).toBeInTheDocument();
    expect(screen.getByText(/Pay only with the test card/)).toBeInTheDocument();
    expect(screen.getByText(/Do not type exhibitors' real email addresses/)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(12);
    expect(screen.getByRole('button', { name: /Send a note/ })).toBeInTheDocument();
    expect(screen.getByText(/Would you run a real show on this/)).toBeInTheDocument();
  });

  it('sends a secretary of an ordinary club back to the account page', async () => {
    authState.clubId = ORDINARY_CLUB;
    renderPage();

    expect(await screen.findByText('Account page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mock show test' })).not.toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('shows the menu item to a test club manager only', async () => {
    renderMenu();
    expect(await screen.findByRole('menuitem', { name: 'Mock show test' })).toHaveAttribute(
      'href',
      '/account/mock-show-test'
    );
  });

  it('gives a secretary of an ordinary club no menu item', async () => {
    authState.clubId = ORDINARY_CLUB;
    renderMenu();

    await screen.findByRole('menuitem', { name: 'Sign out' });
    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('clubs'));
    expect(screen.queryByRole('menuitem', { name: 'Mock show test' })).not.toBeInTheDocument();
  });

  it('says so, and offers Try again, when the access check fails, instead of redirecting', async () => {
    authState.clubsFail = true;
    renderPage();

    expect(
      await screen.findByText('Could not check your access. Check your connection and try again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('Account page')).not.toBeInTheDocument();
  });
});
