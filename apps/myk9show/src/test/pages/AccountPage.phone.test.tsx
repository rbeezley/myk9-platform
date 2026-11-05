// MYK9-1717: on a phone the Account page is a list of sections with a Back
// control, instead of a sideways-scrolling tab strip that hid sections.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render as renderWithProviders } from '@/test/utils/testUtils';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import AccountPage from '@/pages/AccountPage';

vi.mock('@/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ id: 'u-1', email: 'jane@example.com' }),
}));
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    preferences: null,
    loading: false,
    updatePreferences: vi.fn().mockResolvedValue(undefined),
    resetToDefaults: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('@/lib/networkUtils', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/networkUtils')>()),
  useOnlineStatus: () => true,
}));
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ mode: 'light', setThemeMode: vi.fn() }),
}));
vi.mock('@/components/notifications/NotificationSettings', () => ({
  NotificationSettings: () => <div data-testid="notification-settings" />,
}));
vi.mock('@/components/preferences/SecuritySettings', () => ({
  SecuritySettings: () => <div data-testid="security-settings" />,
}));

const SECTION_LABELS = [
  'Profile',
  'Plan & billing',
  'Appearance',
  'Notifications',
  'Security',
  'Storage',
  'Install app',
  'Delete account',
];

const render = (initialRoute = '/account') =>
  renderWithProviders(<AccountPage />, { initialRoute });

describe('AccountPage on a phone (MYK9-1717)', () => {
  beforeEach(() => {
    mockViewportWidth(375);
  });

  it('lists every section as a row, with no section open and no Back control', () => {
    render();
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    for (const label of SECTION_LABELS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Back to Account' })).not.toBeInTheDocument();
    expect(screen.queryByText('Personal information')).not.toBeInTheDocument();
  });

  it('opens a tapped section, and Back returns to the list', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(screen.getByTestId('notification-settings')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Security' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Account' }));

    expect(screen.queryByTestId('notification-settings')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Security' })).toBeInTheDocument();
  });

  it('a deep link opens its section directly, and Back goes to the list', () => {
    render('/account?section=security');
    expect(screen.getByTestId('security-settings')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Security' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Account' }));

    expect(screen.queryByTestId('security-settings')).not.toBeInTheDocument();
    for (const label of SECTION_LABELS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });
});

describe('AccountPage on a tablet keeps the sidebar (MYK9-1717)', () => {
  it('shows the section nav beside the open section with no Back control', () => {
    mockViewportWidth(768);
    render('/account?section=notifications');
    expect(screen.getByTestId('notification-settings')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('button', { name: 'Security' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to Account' })).not.toBeInTheDocument();
  });
});
