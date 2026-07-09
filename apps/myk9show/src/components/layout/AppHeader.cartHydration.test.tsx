/**
 * exhibitor-ux-remediation (Codex review PR #1217).
 *
 * The header cart badge must be driven by a READ-ONLY count query, never by a
 * write to the shared cart store — an earlier `loadActiveCart`-based version
 * could overwrite a show-scoped registration cart and route entries to the
 * wrong cart. Here we assert the badge reflects the read-only count and that
 * the header never calls the store's cart-loading actions.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import AppHeader from './AppHeader';

const loadActiveCart = vi.hoisted(() => vi.fn());
const loadCart = vi.hoisted(() => vi.fn());
const activeCartItemCount = vi.hoisted(() => ({ value: 0 }));
const storeState = vi.hoisted(() => ({ cart: null as unknown, itemCount: 0 }));

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
  useCartItemCount: () => storeState.itemCount,
  useCartStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ cart: storeState.cart, loadActiveCart, loadCart, loadInitiated: false }),
}));
vi.mock('@/hooks/queries/useActiveCartItemCount', () => ({
  useActiveCartItemCount: () => activeCartItemCount.value,
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

describe('AppHeader cart badge', () => {
  beforeEach(() => {
    loadActiveCart.mockClear();
    loadCart.mockClear();
    storeState.cart = null;
    storeState.itemCount = 0;
    activeCartItemCount.value = 0;
  });

  it('shows the read-only count and never writes the cart store', () => {
    activeCartItemCount.value = 3;
    render(<AppHeader />, { initialRoute: '/exhibitor/entries' });

    expect(screen.getByRole('button', { name: /shopping cart/i })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(loadActiveCart).not.toHaveBeenCalled();
    expect(loadCart).not.toHaveBeenCalled();
  });

  it('hides the badge when the active cart is empty', () => {
    activeCartItemCount.value = 0;
    render(<AppHeader />, { initialRoute: '/exhibitor/entries' });

    expect(screen.queryByRole('button', { name: /shopping cart/i })).not.toBeInTheDocument();
  });

  it('prefers the store count when the store owns a loaded cart (e.g. /cart)', () => {
    storeState.cart = { id: 'c1' };
    storeState.itemCount = 2;
    activeCartItemCount.value = 99; // stale query value must be ignored
    render(<AppHeader />, { initialRoute: '/cart' });

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });
});
