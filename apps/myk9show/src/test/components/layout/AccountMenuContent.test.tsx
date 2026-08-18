import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AccountMenuContent } from '@/components/layout/AccountMenuContent';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { resetAllMockData } from '@/utils/debugUtils';
import { clearDevelopmentCache } from '@/utils/clearDevelopmentCache';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { UserRole } from '@/types/auth-types';

const { authState, networkState, syncState, signOutSpy } = vi.hoisted(() => ({
  authState: { roles: [] as string[] },
  networkState: { isOnline: true },
  syncState: {
    status: 'synced' as 'synced' | 'pending' | 'offline' | 'error',
    queueSize: 0,
  },
  signOutSpy: vi.fn(),
}));

vi.mock('@/hooks/useProfileForm', () => ({
  useCurrentUserPerson: () => ({ data: null }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    hasRole: (role: string) => authState.roles.includes(role),
    signOut: signOutSpy,
    userWithRoles: {
      id: 'person-1',
      roles: authState.roles,
      scopes: [],
      user_metadata: {},
    },
    getUserRoles: () => authState.roles,
  }),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => networkState,
}));

vi.mock('@/hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => syncState,
}));

vi.mock('@/utils/debugUtils', () => ({
  resetAllMockData: vi.fn(),
}));

vi.mock('@/utils/clearDevelopmentCache', () => ({
  clearDevelopmentCache: vi.fn().mockResolvedValue(true),
}));

const originalNodeEnv = process.env.NODE_ENV;

function renderOpenAccountMenu() {
  return render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Account menu</DropdownMenuTrigger>
      <AccountMenuContent onAbout={vi.fn()} onGuardedSignOut={vi.fn()} />
    </DropdownMenu>
  );
}

/** Full host render — the guard dialog lives in AccountMenu, above the menu. */
async function renderAccountMenuAndOpen() {
  const view = render(<AccountMenu variant="header" />);
  await view.user.click(screen.getByRole('button', { name: 'Account menu' }));
  await screen.findByRole('menuitem', { name: 'Sign out' });
  return view;
}

beforeEach(() => {
  authState.roles.length = 0;
  networkState.isOnline = true;
  syncState.status = 'synced';
  syncState.queueSize = 0;
  signOutSpy.mockClear();
  useAskQPanelStore.getState().close();
});

describe('AccountMenuContent developer tools', () => {
  beforeEach(() => {
    vi.mocked(resetAllMockData).mockClear();
    vi.mocked(clearDevelopmentCache).mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('nests Reset Data and Clear Cache under Developer in development', async () => {
    process.env.NODE_ENV = 'development';

    const { user } = renderOpenAccountMenu();

    expect(screen.getByRole('menuitem', { name: /developer/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /reset data/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /clear cache/i })).not.toBeInTheDocument();

    await user.hover(screen.getByRole('menuitem', { name: /developer/i }));

    expect(await screen.findByRole('menuitem', { name: /reset data/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /clear cache/i })).toBeInTheDocument();
  });

  it('omits the developer group in production', () => {
    process.env.NODE_ENV = 'production';

    renderOpenAccountMenu();

    expect(screen.queryByRole('menuitem', { name: /developer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /reset data/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /clear cache/i })).not.toBeInTheDocument();
  });

  it('requires confirmation before resetting shared development data', async () => {
    process.env.NODE_ENV = 'development';
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(true);

    const firstRender = renderOpenAccountMenu();
    const { user } = firstRender;
    await user.hover(screen.getByRole('menuitem', { name: /developer/i }));
    const resetData = await screen.findByRole('menuitem', { name: /reset data/i });

    fireEvent.click(resetData);
    expect(resetAllMockData).not.toHaveBeenCalled();
    firstRender.unmount();

    const secondRender = renderOpenAccountMenu();
    await secondRender.user.hover(screen.getByRole('menuitem', { name: /developer/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /reset data/i }));
    expect(resetAllMockData).toHaveBeenCalledTimes(1);
  });

  it('requires confirmation before clearing development cache', async () => {
    process.env.NODE_ENV = 'development';
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(true);

    const firstRender = renderOpenAccountMenu();
    const { user } = firstRender;
    await user.hover(screen.getByRole('menuitem', { name: /developer/i }));
    const clearCache = await screen.findByRole('menuitem', { name: /clear cache/i });

    fireEvent.click(clearCache);
    expect(clearDevelopmentCache).not.toHaveBeenCalled();
    firstRender.unmount();

    const secondRender = renderOpenAccountMenu();
    await secondRender.user.hover(screen.getByRole('menuitem', { name: /developer/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /clear cache/i }));
    expect(clearDevelopmentCache).toHaveBeenCalledTimes(1);
  });
});

describe('AccountMenuContent AskQ item (phone consolidation)', () => {
  it('fires the same AskQ handler as the header icon', async () => {
    const { user } = renderOpenAccountMenu();

    const askQItem = screen.getByRole('menuitem', { name: 'AskQ' });
    expect(askQItem).toBeInTheDocument();
    expect(askQItem.querySelector('[data-icon="askq"]')).toBeInTheDocument();
    await user.click(askQItem);
    expect(useAskQPanelStore.getState().isOpen).toBe(true);
  });
});

describe('AccountMenuContent organization', () => {
  it('renders visible dividers between menu groups', () => {
    renderOpenAccountMenu();

    const dividers = screen.getAllByRole('separator');

    expect(dividers.length).toBeGreaterThanOrEqual(3);
    dividers.forEach(divider => expect(divider).toHaveClass('bg-muted-foreground/40'));
  });

  it.each(Object.values(UserRole))(
    'omits destinations and controls owned by primary navigation for %s',
    role => {
      authState.roles.push(role);

      renderOpenAccountMenu();

      expect(screen.queryByRole('menuitem', { name: 'Plan & billing' })).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Judge Scoring' })).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Analytics' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('menuitem', { name: 'Template Management' })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Dark mode' })).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Light mode' })).not.toBeInTheDocument();
    }
  );

  it('orders assistance, information, and session actions by task', () => {
    renderOpenAccountMenu();

    const itemNames = screen.getAllByRole('menuitem').map(item => item.textContent?.trim());

    expect(itemNames).toEqual(['Account', 'AskQ', 'Help & Guides', 'About', 'Sign out']);
  });

  it('keeps Sign out neutral until focus or highlight', () => {
    renderOpenAccountMenu();

    const signOut = screen.getByRole('menuitem', { name: 'Sign out' });
    expect(signOut).not.toHaveClass('text-destructive');
    expect(signOut).toHaveClass('focus:text-destructive');
  });
});

describe('AccountMenuContent sign-out guard (MYK9-202)', () => {
  it('signs a plain exhibitor out immediately online — no dialog', async () => {
    authState.roles.push(UserRole.EXHIBITOR);

    const { user } = await renderAccountMenuAndOpen();
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('warns a secretary online about the venue lockout before signing out', async () => {
    authState.roles.push(UserRole.SECRETARY);

    const { user } = await renderAccountMenuAndOpen();
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    expect(signOutSpy).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/cannot sign back in/i);
    // The menu must be gone — the dialog is hosted above it, never beneath it.
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /sign out anyway/i }));
    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });

  it('lets a staff member cancel out of the warning without signing out', async () => {
    authState.roles.push(UserRole.JUDGE);

    const { user } = await renderAccountMenuAndOpen();
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await screen.findByRole('alertdialog');

    await user.click(screen.getByRole('button', { name: /stay signed in/i }));

    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it('blocks with the strongest warning when offline, even for an exhibitor', async () => {
    authState.roles.push(UserRole.EXHIBITOR);
    networkState.isOnline = false;
    syncState.status = 'offline';

    const { user } = await renderAccountMenuAndOpen();
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    expect(signOutSpy).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/offline/i);
    expect(dialog).toHaveTextContent(/cannot sign back in until/i);
  });

  it('mentions unsynced changes in the offline warning when sync is pending', async () => {
    networkState.isOnline = false;
    syncState.status = 'pending';

    const { user } = await renderAccountMenuAndOpen();
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/haven't synced/i);
  });

  it('mentions unsynced changes when offline status hides a non-empty queue', async () => {
    // useGlobalSyncStatus reports status 'offline' regardless of queueSize, so
    // the queue count itself must drive the warning line.
    networkState.isOnline = false;
    syncState.status = 'offline';
    syncState.queueSize = 3;

    const { user } = await renderAccountMenuAndOpen();
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/haven't synced/i);
  });
});

describe('AccountMenuContent save status', () => {
  it.each([
    { isOnline: true, status: 'synced' as const, expected: 'All changes saved' },
    { isOnline: true, status: 'pending' as const, expected: 'Saving changes...' },
    { isOnline: true, status: 'error' as const, expected: 'Some changes need attention' },
    { isOnline: false, status: 'offline' as const, expected: 'Offline — changes saved here' },
  ])('shows "$expected" for $status state', ({ isOnline, status, expected }) => {
    networkState.isOnline = isOnline;
    syncState.status = status;

    renderOpenAccountMenu();

    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
    expect(screen.queryByText('Synced')).not.toBeInTheDocument();
  });
});
