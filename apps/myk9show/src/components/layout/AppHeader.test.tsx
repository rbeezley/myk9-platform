import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import AppHeader from './AppHeader';

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1', email: 'jane@example.com' } }),
}));

vi.mock('@/hooks/useProfileForm', () => ({
  useCurrentUserPerson: () => ({ data: { profileImage: null } }),
}));

vi.mock('./useAppShellMobileNav', () => ({
  useAppShellMobileNav: () => ({ isMobileNavOpen: false, openMobileNav: vi.fn() }),
}));

vi.mock('@/store/cartStore', () => ({
  useCartItemCount: () => 2,
  useCartStore: (selector: (s: { cart: unknown }) => unknown) => selector({ cart: null }),
}));

vi.mock('@/hooks/queries/useActiveCartItemCount', () => ({
  useActiveCartItemCount: () => 0,
}));

vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({ profile: null }),
}));

vi.mock('@/store/useAskQPanelStore', () => ({
  useAskQPanelStore: () => ({ toggle: vi.fn() }),
}));

vi.mock('@/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
  getShortcutDisplays: () => [],
}));

vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => <button type="button">Notifications</button>,
}));

vi.mock('@/components/common/CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('@/components/common/KeyboardShortcutsOverlay', () => ({
  KeyboardShortcutsOverlay: () => null,
}));

vi.mock('@/components/common/AboutDialog', () => ({
  AboutDialog: () => null,
}));

vi.mock('@/components/layout/AccountMenuContent', () => ({
  AccountMenuContent: () => null,
}));

describe('AppHeader onboarding shell', () => {
  it('hides utility actions on onboarding while keeping account access', () => {
    render(<AppHeader />, { initialRoute: '/onboarding' });

    expect(screen.getByText('myK9Show')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /search/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Search...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /shopping cart/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /notifications/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /switch to dark mode/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /askq assistant/i })).not.toBeInTheDocument();
  });
});
