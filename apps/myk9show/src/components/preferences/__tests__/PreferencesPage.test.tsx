// apps/myk9show/src/components/preferences/__tests__/PreferencesPage.test.tsx
import { render, screen, within } from '@/test/utils/testUtils';
import PreferencesPage from '@/pages/PreferencesPage';
import { UserRole } from '@/types/auth-types';

// Mock auth context with configurable roles
const mockHasRole = vi.fn();
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'test-user', email: 'test@test.com' },
    loading: false,
    hasRole: mockHasRole,
    hasPermission: () => false,
    getUserRoles: () => [],
    isAdmin: false,
    isSecretary: false,
    isExhibitor: true,
    isJudge: false,
  }),
}));

// Mock useAuthUser
vi.mock('@/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ id: 'test-user', email: 'test@test.com' }),
}));

// Mock useUserPreferences
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    preferences: null,
    loading: false,
    error: null,
    syncState: {
      status: 'idle' as const,
      lastSyncAt: null,
      pendingChanges: false,
      conflictCount: 0,
    },
    devices: [],
    updatePreferences: vi.fn(),
    resetToDefaults: vi.fn(),
    exportPreferences: vi.fn(),
    importPreferences: vi.fn(),
    forceSync: vi.fn(),
  }),
}));

// Mock PWA hook
vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({
    isInstalled: false,
    canInstall: false,
    isIOSSafari: false,
    promptInstall: vi.fn(),
    dismissInstallPrompt: vi.fn(),
    getInstallInstructions: vi.fn(),
  }),
}));

// Mock scoring-ui
vi.mock('@myk9/scoring-ui', () => ({
  useHapticFeedback: () => ({ light: vi.fn(), isSupported: false }),
}));

describe('PreferencesPage', () => {
  beforeEach(() => {
    // Default: exhibitor role — hasRole returns false for all privileged roles
    mockHasRole.mockReturnValue(false);
  });

  it('renders grouped sidebar with category labels', () => {
    render(<PreferencesPage />);

    const sidebar = document.querySelector('aside');
    expect(sidebar).toBeInTheDocument();

    const nav = sidebar!.querySelector('nav');
    expect(nav).toBeInTheDocument();

    expect(within(nav!).getByText('Appearance')).toBeInTheDocument();
    expect(within(nav!).getByText('Alerts & Sound')).toBeInTheDocument();
    expect(within(nav!).getByText('Events')).toBeInTheDocument();
    expect(within(nav!).getByText('Account & Data')).toBeInTheDocument();
  });

  it('renders all non-gated sections in sidebar', () => {
    render(<PreferencesPage />);

    const sidebar = document.querySelector('aside');
    const nav = sidebar!.querySelector('nav')!;

    // Sections that are always visible
    expect(within(nav).getByText('Theme & Display')).toBeInTheDocument();
    expect(within(nav).getByText('General')).toBeInTheDocument();
    expect(within(nav).getByText('Notifications')).toBeInTheDocument();
    expect(within(nav).getByText('Competition')).toBeInTheDocument();
    expect(within(nav).getByText('Privacy')).toBeInTheDocument();
    expect(within(nav).getByText('Security')).toBeInTheDocument();
    expect(within(nav).getByText('Data & Sync')).toBeInTheDocument();
    expect(within(nav).getByText('Devices')).toBeInTheDocument();
    expect(within(nav).getByText('Install App')).toBeInTheDocument();
  });

  it('hides Scoring section for exhibitor role', () => {
    // mockHasRole already returns false in beforeEach
    render(<PreferencesPage />);

    const sidebar = document.querySelector('aside');
    const nav = sidebar!.querySelector('nav')!;

    expect(within(nav).queryByText('Scoring')).not.toBeInTheDocument();
  });

  it('shows Scoring section for judge role', () => {
    mockHasRole.mockImplementation((role: UserRole) => role === UserRole.JUDGE);

    render(<PreferencesPage />);

    const sidebar = document.querySelector('aside');
    const nav = sidebar!.querySelector('nav')!;

    expect(within(nav).getByText('Scoring')).toBeInTheDocument();
  });

  it('defaults to Theme & Display section', () => {
    render(<PreferencesPage />);

    // The active section label is rendered as h1 in the main content area
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Theme & Display');
  });

  it('navigates between sections on click', async () => {
    const { user } = render(<PreferencesPage />);

    const sidebar = document.querySelector('aside');
    const nav = sidebar!.querySelector('nav')!;

    // Click "General" in the sidebar
    const generalButton = within(nav).getByText('General');
    await user.click(generalButton);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('General');

    // Click "Install App" in the sidebar
    const installButton = within(nav).getByText('Install App');
    await user.click(installButton);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Install App');
  });
});
