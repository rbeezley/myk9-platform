import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AccountMenuContent } from '@/components/layout/AccountMenuContent';
import { resetAllMockData } from '@/utils/debugUtils';
import { clearDevelopmentCache } from '@/utils/clearDevelopmentCache';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';

const { networkState, syncState, themeState } = vi.hoisted(() => ({
  networkState: { isOnline: true },
  syncState: { status: 'synced' as 'synced' | 'pending' | 'offline' | 'error' },
  themeState: { theme: 'light' as 'light' | 'dark' },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    hasRole: () => false,
    signOut: vi.fn(),
    userWithRoles: { id: 'person-1', roles: ['exhibitor'], scopes: [], user_metadata: {} },
    getUserRoles: () => ['exhibitor'],
  }),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => networkState,
}));

vi.mock('@/hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => syncState,
}));

const toggleTheme = vi.fn();
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: themeState.theme, toggleTheme }),
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
      <AccountMenuContent onAbout={vi.fn()} />
    </DropdownMenu>
  );
}

beforeEach(() => {
  networkState.isOnline = true;
  syncState.status = 'synced';
  themeState.theme = 'light';
  toggleTheme.mockClear();
  useAskQPanelStore.getState().close();
});

describe('AccountMenuContent developer tools', () => {
  beforeEach(() => {
    vi.mocked(resetAllMockData).mockClear();
    vi.mocked(clearDevelopmentCache).mockClear();
    toggleTheme.mockClear();
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

describe('AccountMenuContent theme + AskQ items (phone consolidation)', () => {
  it('exposes concise appearance and AskQ items that fire the same handlers as the header icons', async () => {
    const { user } = renderOpenAccountMenu();

    const themeItem = screen.getByRole('menuitem', { name: 'Dark mode' });
    expect(themeItem).toBeInTheDocument();
    await user.click(themeItem);
    expect(toggleTheme).toHaveBeenCalledTimes(1);

    const askQItem = screen.getByRole('menuitem', { name: 'AskQ' });
    expect(askQItem).toBeInTheDocument();
    expect(askQItem.querySelector('[data-icon="askq"]')).toBeInTheDocument();
    await user.click(askQItem);
    expect(useAskQPanelStore.getState().isOpen).toBe(true);
  });

  it('offers the mode the theme action will activate', () => {
    themeState.theme = 'dark';

    renderOpenAccountMenu();

    expect(screen.getByRole('menuitem', { name: 'Light mode' })).toBeInTheDocument();
  });
});

describe('AccountMenuContent organization', () => {
  it('renders visible dividers between menu groups', () => {
    renderOpenAccountMenu();

    const dividers = screen.getAllByRole('separator');

    expect(dividers.length).toBeGreaterThanOrEqual(3);
    dividers.forEach(divider => expect(divider).toHaveClass('bg-border'));
  });

  it('keeps plan details reachable from every account menu', () => {
    renderOpenAccountMenu();

    expect(screen.getByRole('menuitem', { name: 'Plan & billing' })).toHaveAttribute(
      'href',
      '/subscription'
    );
    expect(screen.queryByRole('menuitem', { name: /view plans/i })).not.toBeInTheDocument();
  });

  it('orders assistance, appearance, information, and session actions by task', () => {
    renderOpenAccountMenu();

    const itemNames = screen.getAllByRole('menuitem').map(item => item.textContent?.trim());

    expect(itemNames).toEqual([
      'Account',
      'Plan & billing',
      'AskQ',
      'Help & Guides',
      'Dark mode',
      'About',
      'Sign out',
    ]);
  });

  it('keeps Sign out neutral until focus or highlight', () => {
    renderOpenAccountMenu();

    const signOut = screen.getByRole('menuitem', { name: 'Sign out' });
    expect(signOut).not.toHaveClass('text-destructive');
    expect(signOut).toHaveClass('focus:text-destructive');
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
