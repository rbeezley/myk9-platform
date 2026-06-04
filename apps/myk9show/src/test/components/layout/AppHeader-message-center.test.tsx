import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import AppHeader from '@/components/layout/AppHeader';
import { useNotificationStore } from '@/store/notificationStore';

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

let roles: string[] = ['exhibitor'];

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    hasRole: (role: string) => roles.includes(role),
    signOut: vi.fn(),
    userWithRoles: { id: 'person-1', roles, scopes: [], user_metadata: {} },
    getUserRoles: () => roles,
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

vi.mock('@/store/cartStore', () => ({
  useCartItemCount: () => 0,
}));

vi.mock('@/store/announcementStore', async () => {
  const { create } = await import('zustand');
  const useAnnouncementStore = create<Record<string, unknown>>()(() => ({
    unreadCount: 0,
  }));
  return { useAnnouncementStore };
});

vi.mock('@/store/messageStore', async () => {
  const { create } = await import('zustand');
  const useMessageStore = create<Record<string, unknown>>()(() => ({
    unreadCount: 0,
  }));
  return { useMessageStore };
});

vi.mock('@/components/common/CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('@/components/common/KeyboardShortcutsOverlay', () => ({
  KeyboardShortcutsOverlay: () => null,
}));

vi.mock('@/components/common/AboutDialog', () => ({
  AboutDialog: () => null,
}));

describe('AppHeader Message Center integration', () => {
  beforeEach(() => {
    roles = ['exhibitor'];
    useNotificationStore.setState({ isCenterOpen: false });
  });

  it('opens the global Message Center for exhibitor-only users', async () => {
    const { user } = render(<AppHeader />);
    await user.click(screen.getByRole('button', { name: /message center/i }));
    expect(useNotificationStore.getState().isCenterOpen).toBe(true);
  });

  it('opens the same global Message Center for secretary users', async () => {
    roles = ['secretary'];
    const { user } = render(<AppHeader />);
    await user.click(screen.getByRole('button', { name: /message center/i }));
    expect(useNotificationStore.getState().isCenterOpen).toBe(true);
  });
});
