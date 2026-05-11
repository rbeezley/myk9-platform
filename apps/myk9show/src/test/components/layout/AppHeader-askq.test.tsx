import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import AppHeader from '@/components/layout/AppHeader';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    hasRole: () => false,
    signOut: vi.fn(),
    userWithRoles: null,
    getUserRoles: () => [],
  }),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true }),
}));

vi.mock('@/hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => ({ status: 'synced' }),
}));

vi.mock('@/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
  getShortcutDisplays: () => [],
}));

vi.mock('@/stores/cartStore', () => ({
  useCartItemCount: () => 0,
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

vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}));

describe('AppHeader AskQ integration', () => {
  beforeEach(() => {
    useAskQPanelStore.getState().close();
  });

  it('renders the AskQ button in the header', () => {
    render(<AppHeader />);
    expect(screen.getByLabelText('AskQ Assistant')).toBeInTheDocument();
  });

  it('does not emit the Base UI native button warning for the account menu trigger', () => {
    render(<AppHeader />);

    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining('A component that acts as a button was rendered as a native <button>')
    );
  });

  it('opens the panel when the AskQ button is clicked', async () => {
    const { user } = render(<AppHeader />);

    await user.click(screen.getByLabelText('AskQ Assistant'));

    expect(useAskQPanelStore.getState().isOpen).toBe(true);
  });
});
