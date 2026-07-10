import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AccountMenuContent } from '@/components/layout/AccountMenuContent';
import { resetAllMockData } from '@/utils/debugUtils';
import { clearDevelopmentCache } from '@/utils/clearDevelopmentCache';

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
  useNetworkStatus: () => ({ isOnline: true }),
}));

vi.mock('@/hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => ({ status: 'synced' }),
}));

const toggleTheme = vi.fn();
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme }),
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
  it('exposes Theme and AskQ Assistant items that fire the same handlers as the header icons', async () => {
    const { user } = renderOpenAccountMenu();

    const themeItem = screen.getByRole('menuitem', { name: /switch to dark mode/i });
    expect(themeItem).toBeInTheDocument();
    await user.click(themeItem);
    expect(toggleTheme).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('menuitem', { name: /askq assistant/i })).toBeInTheDocument();
  });
});
