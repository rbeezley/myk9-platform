/**
 * exhibitor-ux-remediation (Codex review PR #1217, P1 regression pin).
 *
 * AppHeader hydrates the cart once per session so the badge is discoverable
 * everywhere. That hydration is UNSCOPED (loadActiveCart picks the most-recent
 * active cart across all shows), so it must NOT run on routes that own a
 * SHOW-SCOPED cart load (registration wizard, /cart, /checkout) — otherwise it
 * can resolve last and overwrite the show-specific cart, sending later addItem
 * calls to the wrong cart.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import AppHeader from './AppHeader';

const loadActiveCart = vi.hoisted(() => vi.fn());

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
  useCartItemCount: () => 0,
  // loadInitiated is false so the hydration effect is eligible to fire; the
  // route guard is what should gate it.
  useCartStore: (selector: (s: { loadActiveCart: () => void; loadInitiated: boolean }) => unknown) =>
    selector({ loadActiveCart, loadInitiated: false }),
}));
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({ profile: { id: 'exhibitor-1' } }),
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
vi.mock('@/components/common/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/common/KeyboardShortcutsOverlay', () => ({
  KeyboardShortcutsOverlay: () => null,
}));
vi.mock('@/components/common/AboutDialog', () => ({ AboutDialog: () => null }));
vi.mock('@/components/layout/AccountMenuContent', () => ({ AccountMenuContent: () => null }));

describe('AppHeader cart hydration route scoping', () => {
  beforeEach(() => {
    loadActiveCart.mockClear();
  });

  it('hydrates the cart badge on an ordinary route', () => {
    render(<AppHeader />, { initialRoute: '/exhibitor/entries' });
    expect(loadActiveCart).toHaveBeenCalledWith('exhibitor-1');
  });

  it('does NOT hydrate on the cart page (it owns a scoped load)', () => {
    render(<AppHeader />, { initialRoute: '/cart' });
    expect(loadActiveCart).not.toHaveBeenCalled();
  });

  it('does NOT hydrate on checkout', () => {
    render(<AppHeader />, { initialRoute: '/checkout' });
    expect(loadActiveCart).not.toHaveBeenCalled();
  });

  it('does NOT hydrate inside the registration wizard (show-scoped cart)', () => {
    render(<AppHeader />, { initialRoute: '/shows/show-1/register' });
    expect(loadActiveCart).not.toHaveBeenCalled();
  });
});
