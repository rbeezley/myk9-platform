import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import AppHeader from './AppHeader';

const viewer = vi.hoisted(() => ({
  canManage: true,
  canOperate: true,
  isStaff: true,
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'user-1', email: 'secretary@myk9t.com' },
    hasRole: () => viewer.isStaff,
    hasPermission: () => viewer.isStaff,
    userWithRoles: null,
  }),
}));

vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({
    status: 'resolved',
    canManage: viewer.canManage,
    canOperate: viewer.canOperate,
    hasOperationalStaffRole: viewer.isStaff,
    clubId: 'club-1',
  }),
}));

vi.mock('@/hooks/useProfileForm', () => ({
  useCurrentUserPerson: () => ({ data: { profileImage: null } }),
}));

vi.mock('./useAppShellMobileNav', () => ({
  useAppShellMobileNav: () => ({ isMobileNavOpen: false, openMobileNav: vi.fn() }),
}));

vi.mock('@/store/cartStore', () => ({
  useCartItemCount: () => 0,
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

vi.mock('@/components/layout/AccountMenuContent', () => ({
  AccountMenuContent: () => null,
}));

const SHOW_ROUTE = '/shows/show-1';

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  viewer.canManage = true;
  viewer.canOperate = true;
  viewer.isStaff = true;
});

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
});

describe('AppHeader Actions menu — secretary on a show route', () => {
  it('renders one labelled Actions button immediately left of the notifications bell', () => {
    render(<AppHeader />, { initialRoute: SHOW_ROUTE });

    const trigger = screen.getByRole('button', { name: /^actions$/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    const bell = screen.getByRole('button', { name: /notifications/i });
    // Node.DOCUMENT_POSITION_FOLLOWING: the bell comes after the trigger.
    expect(trigger.compareDocumentPosition(bell) & 4).toBeTruthy();
  });

  it('opens on click and lists the six decided actions in order', async () => {
    const user = userEvent.setup();
    render(<AppHeader />, { initialRoute: SHOW_ROUTE });

    const trigger = screen.getByRole('button', { name: /^actions$/i });
    await user.click(trigger);

    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
    const labels = within(menu)
      .getAllByRole('menuitem')
      .map(item => item.textContent?.trim());

    expect(labels).toEqual([
      'Add mail-in entry',
      'Enter my own dogs',
      'Open Entry Management',
      'Open Show Desk',
      'Generate & publish premium',
      'Show settings…',
    ]);
  });

  it('links each item at the canonical route', async () => {
    const user = userEvent.setup();
    render(<AppHeader />, { initialRoute: SHOW_ROUTE });

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');

    expect(within(menu).getByText('Add mail-in entry').closest('a')).toHaveAttribute(
      'href',
      '/secretary/register/show-1'
    );
    expect(within(menu).getByText('Open Entry Management').closest('a')).toHaveAttribute(
      'href',
      '/shows/show-1/entry-management'
    );
  });
});

describe('AppHeader Actions menu — a club admin who cannot add mail-in entries', () => {
  it('greys mail-in entry and names the reason in the row', async () => {
    viewer.canOperate = false;
    const user = userEvent.setup();
    render(<AppHeader />, { initialRoute: SHOW_ROUTE });

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');

    const item = within(menu).getByTestId('header-action-show-add-mail-in-entry');
    expect(item).toHaveAttribute('data-disabled');
    expect(item).toHaveTextContent('Trial secretary access only');
  });
});

describe('AppHeader Actions menu — exhibitor on the same route', () => {
  it('hides the button entirely rather than offering a disabled one', () => {
    viewer.canManage = false;
    viewer.canOperate = false;
    viewer.isStaff = false;

    render(<AppHeader />, { initialRoute: SHOW_ROUTE });

    expect(screen.queryByRole('button', { name: /^actions$/i })).toBeNull();
    expect(screen.queryByText('Add mail-in entry')).toBeNull();
    expect(screen.queryByText('Open Show Desk')).toBeNull();
  });
});

describe('AppHeader Actions menu — off a show route', () => {
  it('falls back to the role-wide list for a secretary', async () => {
    const user = userEvent.setup();
    render(<AppHeader />, { initialRoute: '/dogs' });

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent?.trim())
    ).toEqual(['Create a show', 'Open Show Management']);
  });
});

/**
 * Visible text = what a sighted viewer reads. An `sr-only` span stays in the
 * DOM and in `textContent`, so `textContent` cannot answer "is this trigger
 * icon-only?"; jsdom applies no stylesheet, so neither can `getComputedStyle`.
 * This walks the tree and drops the `sr-only` subtrees, which is the one class
 * that decides it here — and the control test below proves the walk responds to
 * both branches rather than always returning the same thing.
 */
function visibleText(element: HTMLElement): string {
  let out = '';
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      continue;
    }
    if (node instanceof HTMLElement && !node.classList.contains('sr-only')) {
      out += visibleText(node);
    }
  }
  return out.trim();
}

function mockLabelBreakpoint(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 640px)' ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('AppHeader Actions trigger — the wordmark has to fit beside it', () => {
  it('measures visible text correctly on a known fixture (harness control)', () => {
    const fixture = document.createElement('div');
    fixture.innerHTML = '<span class="sr-only">Actions</span><span>Visible</span>';
    expect(visibleText(fixture)).toBe('Visible');

    const bothVisible = document.createElement('div');
    bothVisible.innerHTML = '<span>Actions</span><span>Visible</span>';
    expect(visibleText(bothVisible)).toBe('ActionsVisible');
  });

  it('renders icon-only below the sm breakpoint, keeping the name for assistive tech', () => {
    mockLabelBreakpoint(false);
    render(<AppHeader />, { initialRoute: SHOW_ROUTE });

    const trigger = screen.getByTestId('header-actions-trigger');
    expect(visibleText(trigger)).toBe('');
    // The control is still a named, expandable button — only its label is visual-free.
    expect(screen.getByRole('button', { name: /^actions$/i })).toBe(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the written label from sm up, where the header has the room', () => {
    mockLabelBreakpoint(true);
    render(<AppHeader />, { initialRoute: SHOW_ROUTE });

    const trigger = screen.getByTestId('header-actions-trigger');
    expect(visibleText(trigger)).toBe('Actions');
    expect(screen.getByRole('button', { name: /^actions$/i })).toBe(trigger);
  });
});
