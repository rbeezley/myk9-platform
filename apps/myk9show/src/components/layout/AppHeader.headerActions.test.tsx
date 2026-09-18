import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import AppHeader from './AppHeader';
import { usePremiumPublishStore } from '@/features/premium/useGenerateAndPublishPremium';

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

// The premium flow's two edges, so the REAL `useGenerateAndPublishPremium` runs
// and the test measures the binding rather than a stub of it.
const premiumEdges = vi.hoisted(() => ({
  generate: vi.fn(async (showId: string) => ({ showId, pdfUrl: 'blob:premium' })),
  publishExperience: vi.fn(async () => undefined),
  // The publish read the Premium List card renders from. The menu item now
  // reads the SAME one, so these fixtures drive both.
  publishInfo: {
    publishedUrl: null as string | null,
    publishedAt: null as string | null,
    updatedAt: null as string | null,
    experienceIsPublished: true as boolean | null,
  },
}));

vi.mock('@/features/premium/useGeneratePremium', () => ({
  useGeneratePremium: () => ({
    generate: premiumEdges.generate,
    isLoading: false,
    error: null,
    reset: vi.fn(),
  }),
}));

vi.mock('@/features/experience/publishExperience', () => ({
  publishExperience: premiumEdges.publishExperience,
}));

vi.mock('@/features/premium/usePublishInfo', async () => {
  const actual = await vi.importActual<typeof import('@/features/premium/usePublishInfo')>(
    '@/features/premium/usePublishInfo'
  );
  return {
    ...actual,
    usePublishInfo: () => ({ data: premiumEdges.publishInfo, isError: false }),
  };
});

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <span data-testid="probe-pathname">{location.pathname}</span>
      <span data-testid="probe-search">{location.search}</span>
    </>
  );
}

const SHOW_ROUTE = '/shows/show-1';
// A NON-Overview section: both round-3 findings only show up away from Overview.
const SECTION_ROUTE = '/shows/show-1/results-control';
const ENTRY_MANAGEMENT_ROUTE = '/shows/show-1/entry-management';

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  viewer.canManage = true;
  viewer.canOperate = true;
  viewer.isStaff = true;
  premiumEdges.generate.mockClear();
  premiumEdges.publishExperience.mockClear();
  premiumEdges.publishInfo = {
    publishedUrl: null,
    publishedAt: null,
    updatedAt: null,
    experienceIsPublished: true,
  };
  // The publish store is module scope; a leaked in-flight id would latch the
  // next test's click into a silent no-op.
  usePremiumPublishStore.setState({ byShowId: {} });
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

describe('AppHeader Actions menu — the two items that are not plain destinations', () => {
  it('runs the premium flow from a non-Overview section, without navigating', async () => {
    // Round-3 review: this was a link to `/shows/:id#setup-publish-premium`.
    // The router pushes a hash without fragment navigation, so at 375x812
    // nothing scrolled (scrollY stayed 159 with the card at top 924) and from
    // another section the card arrived unhighlighted. It runs the card's own
    // flow now, from wherever the secretary is standing.
    const user = userEvent.setup();
    render(
      <>
        <AppHeader />
        <LocationProbe />
      </>,
      { initialRoute: SECTION_ROUTE }
    );

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByTestId('header-action-show-generate-publish-premium'));

    await waitFor(() => expect(premiumEdges.generate).toHaveBeenCalledWith('show-1'));
    await waitFor(() =>
      expect(premiumEdges.publishExperience).toHaveBeenCalledWith(
        expect.objectContaining({ showId: 'show-1' })
      )
    );
    // And it did NOT move the secretary off the section they were working on.
    expect(screen.getByTestId('probe-pathname')).toHaveTextContent(SECTION_ROUTE);
  });

  it('is not a link at all, so there is no hash for the router to drop', async () => {
    const user = userEvent.setup();
    render(<AppHeader />, { initialRoute: SECTION_ROUTE });

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');
    const item = within(menu).getByTestId('header-action-show-generate-publish-premium');
    expect(item.closest('a')).toBeNull();
  });

  it('opens Show settings on the CURRENT section, not on Overview', async () => {
    // Round-3 review: an absolute `/shows/:id?edit=true` walked a secretary off
    // Entry Management to Overview, and closing the panel stranded them there.
    // The deleted `...` menu opened the panel in place on every section.
    const user = userEvent.setup();
    render(
      <>
        <AppHeader />
        <LocationProbe />
      </>,
      { initialRoute: ENTRY_MANAGEMENT_ROUTE }
    );

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByTestId('header-action-show-settings'));

    await waitFor(() => expect(screen.getByTestId('probe-search')).toHaveTextContent('?edit=true'));
    expect(screen.getByTestId('probe-pathname')).toHaveTextContent(ENTRY_MANAGEMENT_ROUTE);
  });
});

describe('the premium item says what the Premium List card says', () => {
  async function openMenu() {
    const user = userEvent.setup();
    render(<AppHeader />, { initialRoute: SECTION_ROUTE });
    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');
    return {
      user,
      item: within(menu).getByTestId('header-action-show-generate-publish-premium'),
    };
  }

  it('is GREYED when the premium is published and up to date', async () => {
    // The card renders no publish button at all in this state. The menu used to
    // offer an enabled item that would regenerate a live PDF.
    premiumEdges.publishInfo = {
      publishedUrl: 'https://example.test/premium.pdf',
      publishedAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
      experienceIsPublished: true,
    };

    const { item } = await openMenu();
    expect(item).toHaveAttribute('data-disabled');
    expect(item).toHaveTextContent('Premium is published and up to date');
  });

  it('is GREYED while the publish read has not resolved', async () => {
    premiumEdges.publishInfo = undefined as never;

    const { item } = await openMenu();
    expect(item).toHaveAttribute('data-disabled');
    expect(item).toHaveTextContent('Checking the premium');
  });

  it('is enabled and says "Republish premium" when the show data moved on', async () => {
    premiumEdges.publishInfo = {
      publishedUrl: 'https://example.test/premium.pdf',
      publishedAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-02T10:00:00Z',
      experienceIsPublished: true,
    };

    const { user, item } = await openMenu();
    expect(item).not.toHaveAttribute('data-disabled');
    expect(item).toHaveTextContent('Republish premium');

    await user.click(item);
    await waitFor(() => expect(premiumEdges.generate).toHaveBeenCalledWith('show-1'));
  });
});
