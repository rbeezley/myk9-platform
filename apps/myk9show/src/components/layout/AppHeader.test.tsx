import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import AppHeader from './AppHeader';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { APP_SHORTCUTS } from '@/components/layout/appShortcuts';

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1', email: 'jane@example.com' } }),
}));

vi.mock('@/hooks/useProfileForm', () => ({
  useCurrentUserPerson: () => ({ data: { profileImage: null } }),
}));

const appShellNavMock = vi.hoisted(() => ({
  openMobileNav: vi.fn() as (() => void) | null,
}));

vi.mock('./useAppShellMobileNav', () => ({
  useAppShellMobileNav: () => ({
    isMobileNavOpen: false,
    openMobileNav: appShellNavMock.openMobileNav,
  }),
}));

vi.mock('@/store/cartStore', () => ({
  useCartItemCount: () => 2,
  useCartStore: (selector: (s: { cart: unknown }) => unknown) =>
    selector({ cart: { id: 'cart-1' } }),
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
  CommandPalette: ({ open }: { open: boolean }) => (open ? <div>Palette open</div> : null),
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

beforeEach(() => {
  appShellNavMock.openMobileNav = vi.fn();
});

describe('AppHeader phone-width header consolidation', () => {
  it('keeps theme access in the header while consolidating AskQ into the account menu below md', () => {
    render(<AppHeader />);

    const themeButton = screen.getByRole('button', { name: /switch to dark mode/i });
    expect(themeButton).not.toHaveClass('hidden');

    const askQButton = screen.getByRole('button', { name: /askq assistant/i });
    expect(askQButton).toHaveClass('hidden', 'md:flex');
  });

  it('keeps the account trigger in the header on mobile but hides it on desktop', () => {
    render(<AppHeader />);

    expect(screen.getByRole('button', { name: /account menu/i })).toHaveClass('md:hidden');
  });

  it('keeps desktop account access on authenticated routes without a sidebar', () => {
    appShellNavMock.openMobileNav = null;

    render(<AppHeader />, { initialRoute: '/pricing-page' });

    expect(screen.getByRole('button', { name: /account menu/i })).not.toHaveClass('md:hidden');
  });
});

describe('AppHeader branding', () => {
  it('pairs the transparent brand mark with a compact responsive wordmark', () => {
    render(<AppHeader />);

    const homeLink = screen.getByRole('link', { name: 'myK9Show home' });
    const mark = homeLink.querySelector('img');
    const wordmark = screen.getByText('myK9Show');

    expect(homeLink).toHaveAttribute('href', '/');
    expect(homeLink).toHaveClass('max-[359px]:hidden');
    expect(mark).toHaveAttribute('src', '/brand-mark-64.png');
    expect(mark).toHaveAttribute('width', '28');
    expect(mark).toHaveAttribute('height', '28');
    expect(mark).toHaveAttribute('alt', '');
    expect(wordmark).toHaveClass('max-[359px]:hidden');
  });
});

describe('AppHeader onboarding shell', () => {
  it('hides utility actions on onboarding while keeping account access', () => {
    appShellNavMock.openMobileNav = null;

    render(<AppHeader />, { initialRoute: '/onboarding' });

    expect(screen.getByText('myK9Show')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /account menu/i })).not.toHaveClass('md:hidden');
    expect(screen.queryByRole('button', { name: /search/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Search...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /shopping cart/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /notifications/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /switch to dark mode/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /askq assistant/i })).not.toBeInTheDocument();
  });
});

describe('AppHeader command palette pointer opening (task 3.2)', () => {
  it('opens the command palette on a pointer click of the desktop search trigger', () => {
    render(<AppHeader />);

    expect(screen.queryByText('Palette open')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Search...'));

    expect(screen.getByText('Palette open')).toBeInTheDocument();
  });

  it('opens the command palette on a pointer click of the mobile search button', () => {
    render(<AppHeader />);

    fireEvent.click(screen.getByLabelText('Search', { exact: true }));

    expect(screen.getByText('Palette open')).toBeInTheDocument();
  });
});

describe('AppHeader keyboard shortcut registration (task 3.1)', () => {
  it('registers exactly the canonical shortcut table with useKeyboardShortcuts', () => {
    render(<AppHeader />);

    const lastCall = vi.mocked(useKeyboardShortcuts).mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const registered = lastCall![0];

    expect(registered.map(s => s.id).sort()).toEqual(APP_SHORTCUTS.map(s => s.id).sort());
    // Every registered shortcut is bound to a real, callable action — no
    // display-only entries.
    for (const shortcut of registered) {
      expect(typeof shortcut.action).toBe('function');
    }
  });

  it('registers no shortcuts on the onboarding route', () => {
    render(<AppHeader />, { initialRoute: '/onboarding' });

    const lastCall = vi.mocked(useKeyboardShortcuts).mock.calls.at(-1);
    expect(lastCall![0]).toEqual([]);
  });
});
