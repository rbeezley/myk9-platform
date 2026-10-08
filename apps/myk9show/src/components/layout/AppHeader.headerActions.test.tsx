import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import AppHeader from './AppHeader';
import { usePageEditAction, usePageEditTargetStore } from '@/features/actions/pageEditTarget';
import { generatedPremium } from '@/features/premium/__tests__/fixtures/generatedPremium';
import { usePremiumPublishStore } from '@/features/premium/useGenerateAndPublishPremium';
import { resetPremiumPublishCoordinatorForTests } from '@/features/premium/premiumPublishCoordinator';

const viewer = vi.hoisted(() => ({
  canManage: true,
  canOperate: true,
  isStaff: true,
  // An exhibitor: holds dog:create and nothing else.
  dogCreateOnly: false,
}));
const notificationsMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'user-1', email: 'secretary@myk9t.com' },
    hasRole: () => viewer.isStaff,
    hasPermission: (permission: string) =>
      viewer.isStaff || (viewer.dogCreateOnly && permission === 'dog:create'),
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
  generate: vi.fn(async () => generatedPremium()),
  publishExperience: vi.fn(async () => undefined),
  runPremiumPublishOperation: vi.fn(
    async (operation: { createPremium: () => Promise<unknown> }) => {
      await operation.createPremium();
      return undefined;
    }
  ),
  // The publish read the Premium List card renders from. The menu item now
  // reads the SAME one, so these fixtures drive both.
  publishInfo: {
    publishedLocator: null as string | null,
    publishedAt: null as string | null,
    updatedAt: null as string | null,
    experienceIsPublished: true as boolean | null,
  },
  publishFetchStatus: 'idle' as 'idle' | 'fetching' | 'paused',
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

vi.mock('@/features/premium/premiumPublishCoordinator', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/premium/premiumPublishCoordinator')
  >('@/features/premium/premiumPublishCoordinator');
  return {
    ...actual,
    runPremiumPublishOperation: premiumEdges.runPremiumPublishOperation,
  };
});

vi.mock('@/features/premium/usePublishInfo', async () => {
  const actual = await vi.importActual<typeof import('@/features/premium/usePublishInfo')>(
    '@/features/premium/usePublishInfo'
  );
  return {
    ...actual,
    usePublishInfo: () => ({
      data: premiumEdges.publishInfo,
      isError: false,
      fetchStatus: premiumEdges.publishFetchStatus,
    }),
  };
});

vi.mock('@/lib/notifications', () => ({
  notifications: notificationsMock,
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
const SECTION_ROUTE = '/shows/show-1/results';
const ENTRY_MANAGEMENT_ROUTE = '/shows/show-1/entries';

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  viewer.canManage = true;
  viewer.canOperate = true;
  viewer.isStaff = true;
  viewer.dogCreateOnly = false;
  premiumEdges.generate.mockClear();
  premiumEdges.runPremiumPublishOperation.mockClear();
  premiumEdges.publishExperience.mockClear();
  notificationsMock.error.mockClear();
  premiumEdges.publishInfo = {
    publishedLocator: null,
    publishedAt: null,
    updatedAt: null,
    experienceIsPublished: true,
  };
  premiumEdges.publishFetchStatus = 'idle';
  // The publish store is module scope; a leaked in-flight id would latch the
  // next test's click into a silent no-op.
  usePremiumPublishStore.setState({ byShowId: {} });
  resetPremiumPublishCoordinatorForTests();
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

  it('opens on click and lists the decided actions in group order', async () => {
    const user = userEvent.setup();
    render(<AppHeader />, { initialRoute: SHOW_ROUTE });

    const trigger = screen.getByRole('button', { name: /^actions$/i });
    await user.click(trigger);

    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
    const labels = within(menu)
      .getAllByRole('menuitem')
      .map(item => item.textContent?.trim());

    // Item order (MYK9-928): Edit, Add, then navigation, then status; then the Create
    // section, which is on every page (CRUD standard decision 6).
    expect(labels).toEqual([
      'Edit show',
      'Add entry for someone else',
      'Add entry for my dog',
      'Add Trial',
      'Add classes',
      'Open Entry Forms',
      'Generate & publish premium',
      'Close out show',
      'Add Show',
      'Add Dog',
      'Add Person',
      'Add Club',
    ]);
  });

  it('heads each section, divides only between sections, and gives every item an icon', async () => {
    const user = userEvent.setup();
    render(<AppHeader />, { initialRoute: SHOW_ROUTE });

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');

    const show = within(menu).getByTestId('header-action-group-show');
    const create = within(menu).getByTestId('header-action-group-create');
    expect(within(show).getAllByRole('menuitem')[0]).toHaveTextContent('Edit show');
    expect(within(create).getByText('Create')).toBeInTheDocument();
    expect(
      within(create)
        .getAllByRole('menuitem')
        .map(item => item.textContent)
    ).toEqual(['Add Show', 'Add Dog', 'Add Person', 'Add Club']);
    // Two sections, so exactly one divider.
    expect(within(menu).getAllByRole('separator')).toHaveLength(1);
    for (const item of within(menu).getAllByRole('menuitem')) {
      expect(item.querySelector('svg'), item.textContent ?? '').not.toBeNull();
    }
  });

  it('links each item at the canonical route', async () => {
    const user = userEvent.setup();
    render(<AppHeader />, { initialRoute: SHOW_ROUTE });

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');

    expect(within(menu).getByText('Add entry for someone else').closest('a')).toHaveAttribute(
      'href',
      '/secretary/register/show-1'
    );
    expect(within(menu).getByText('Open Entry Forms').closest('a')).toHaveAttribute(
      'href',
      '/shows/show-1/entries'
    );
    expect(within(menu).getByText('Add Trial').closest('a')).toHaveAttribute(
      'href',
      '/secretary/create-show/wizard?showId=show-1&mode=add-trials'
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
  it('hides the button for an exhibitor whose only item would be Add Dog (owner, 2026-10-08)', () => {
    viewer.canManage = false;
    viewer.canOperate = false;
    viewer.isStaff = false;
    viewer.dogCreateOnly = true;

    render(<AppHeader />, { initialRoute: '/exhibitor/entries' });

    expect(screen.queryByTestId('header-actions-trigger')).toBeNull();
  });

  it('shows it to that exhibitor on their own dog page, where Edit dog joins Add Dog', async () => {
    viewer.canManage = false;
    viewer.canOperate = false;
    viewer.isStaff = false;
    viewer.dogCreateOnly = true;
    usePageEditTargetStore.setState({
      target: { kind: 'dog', canEdit: true, run: vi.fn(), title: 'Ruby', extras: [] },
      owner: Symbol('dog'),
    });
    const user = userEvent.setup();

    render(<AppHeader />, { initialRoute: '/dogs/d1' });
    await user.click(screen.getByTestId('header-actions-trigger'));
    const menu = await screen.findByRole('menu');

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent)
    ).toEqual(['Edit dog', 'Add Dog']);
    usePageEditTargetStore.setState({ target: null, owner: null });
  });

  it("runs a page's other action from the menu, and greys one with its reason", async () => {
    const changePhoto = vi.fn();
    usePageEditTargetStore.setState({
      target: {
        kind: 'person',
        canEdit: true,
        run: vi.fn(),
        title: 'Alex Whitfield',
        extras: [
          { id: 'photo', label: 'Change Photo', icon: 'photo', run: changePhoto },
          {
            id: 'status',
            label: 'Suspend account',
            icon: 'status',
            disabledReason: 'You cannot suspend your own account',
            run: vi.fn(),
          },
        ],
      },
      owner: Symbol('person'),
    });
    const user = userEvent.setup();

    render(<AppHeader />, { initialRoute: '/people/p1' });
    await user.click(screen.getByTestId('header-actions-trigger'));
    const menu = await screen.findByRole('menu');
    const page = within(menu).getByTestId('header-action-group-page');

    expect(within(page).getByText('Alex Whitfield')).toBeInTheDocument();
    expect(within(page).getByTestId('header-action-person-status')).toHaveAttribute(
      'data-disabled'
    );
    expect(within(page).getByTestId('header-action-person-status')).toHaveTextContent(
      'You cannot suspend your own account'
    );
    await user.click(within(page).getByRole('menuitem', { name: 'Change Photo' }));
    expect(changePhoto).toHaveBeenCalledTimes(1);
    usePageEditTargetStore.setState({ target: null, owner: null });
  });

  it('hides the button entirely rather than offering a disabled one', () => {
    viewer.canManage = false;
    viewer.canOperate = false;
    viewer.isStaff = false;

    render(<AppHeader />, { initialRoute: SHOW_ROUTE });

    expect(screen.queryByRole('button', { name: /^actions$/i })).toBeNull();
    expect(screen.queryByText('Add entry for someone else')).toBeNull();
    expect(screen.queryByText('Open Show Day')).toBeNull();
  });
});

describe('AppHeader Actions menu — off a show route', () => {
  it('offers a secretary the Create section, and no Show Management link', async () => {
    const user = userEvent.setup();
    render(<AppHeader />, { initialRoute: '/dogs' });

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');

    expect(within(menu).getByText('Create')).toBeInTheDocument();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent?.trim())
    ).toEqual(['Add Show', 'Add Dog', 'Add Person', 'Add Club']);
    expect(within(menu).getByText('Add Club').closest('a')).toHaveAttribute(
      'href',
      '/clubs?create=true'
    );
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
    // MYK9-932: the standard "more" glyph, not the lightning bolt.
    const icon = trigger.querySelector('svg');
    expect(icon).toHaveClass('lucide-ellipsis');
    expect(icon).not.toHaveClass('lucide-zap');
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
      expect(premiumEdges.runPremiumPublishOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          showId: 'show-1',
          mode: 'generated',
          intentKey: 'generated-current-sources',
          inkSaver: false,
          createPremium: expect.any(Function),
        })
      )
    );
    // And it did NOT move the secretary off the section they were working on.
    expect(screen.getByTestId('probe-pathname')).toHaveTextContent(SECTION_ROUTE);
  });

  it('shows the actionable correction when publishing from the header fails', async () => {
    premiumEdges.generate.mockRejectedValueOnce(
      new Error('Premium generation is only supported for AKC and UKC shows (got: null)')
    );
    const user = userEvent.setup();
    render(<AppHeader />, { initialRoute: SECTION_ROUTE });

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByTestId('header-action-show-generate-publish-premium'));

    await waitFor(() =>
      expect(notificationsMock.error).toHaveBeenCalledWith(
        "Set this show's organization to AKC or UKC in Show settings, then try again."
      )
    );
  });

  it('is not a link at all, so there is no hash for the router to drop', async () => {
    const user = userEvent.setup();
    render(<AppHeader />, { initialRoute: SECTION_ROUTE });

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');
    const item = within(menu).getByTestId('header-action-show-generate-publish-premium');
    expect(item.closest('a')).toBeNull();
  });

  it('opens the edit panel over the current section, without leaving it (MYK9-736)', async () => {
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
    const editLink = within(menu).getByTestId('header-action-show-settings');
    expect(editLink).toHaveTextContent('Edit show');
    expect(editLink).toHaveAttribute('href', '/shows/show-1/entries?edit=true');
    await user.click(editLink);

    await waitFor(() => expect(screen.getByTestId('probe-search')).toHaveTextContent('?edit=true'));
    expect(screen.getByTestId('probe-pathname')).toHaveTextContent('/shows/show-1/entries');
  });

  it("keeps the section's own filters when it opens the edit panel", async () => {
    // Entry Management keeps its queue, search and selection in the query
    // string. A bare `?edit=true` link replaced all of it, so closing the panel
    // put the secretary back on an unfiltered list (Codex review, MYK9-736).
    const user = userEvent.setup();
    render(
      <>
        <AppHeader />
        <LocationProbe />
      </>,
      { initialRoute: `${ENTRY_MANAGEMENT_ROUTE}?queue=needs-review&q=rex` }
    );

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');
    const editLink = within(menu).getByTestId('header-action-show-settings');
    expect(editLink).toHaveAttribute(
      'href',
      '/shows/show-1/entries?queue=needs-review&q=rex&edit=true'
    );
    await user.click(editLink);

    await waitFor(() =>
      expect(screen.getByTestId('probe-search')).toHaveTextContent(
        '?queue=needs-review&q=rex&edit=true'
      )
    );
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
      publishedLocator: 'https://example.test/premium.pdf',
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

  it('shows the offline reason in the paused publish menu item', async () => {
    premiumEdges.publishInfo = undefined as never;
    premiumEdges.publishFetchStatus = 'paused';

    const { item } = await openMenu();
    expect(item).toHaveAttribute('data-disabled');
    expect(item).toHaveTextContent("You're offline — publishing needs a connection");
  });

  it('is enabled and says "Republish premium" when the show data moved on', async () => {
    premiumEdges.publishInfo = {
      publishedLocator: 'https://example.test/premium.pdf',
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

/**
 * A detail page registering its Edit (MYK9-928), end to end through the REAL header menu:
 * the page is what the old Edit button was, and the menu is where its item now lives.
 */
function TrialPageStub({ run, enabled = true }: { run: () => void; enabled?: boolean }) {
  usePageEditAction({
    kind: 'trial',
    enabled,
    run,
    addClassesHref: '/secretary/create-show/wizard?showId=show-1&mode=add-classes&trialId=t1',
  });
  return <p>Trial page</p>;
}

describe('AppHeader Actions menu — a detail page registers its Edit (MYK9-928)', () => {
  const TRIAL_ROUTE = '/shows/show-1/trials/t1';

  beforeEach(() => {
    usePageEditTargetStore.setState({ target: null, owner: null });
  });

  it('lists the trial section first, then the show section, then Create', async () => {
    const user = userEvent.setup();
    render(
      <>
        <AppHeader />
        <TrialPageStub run={vi.fn()} />
      </>,
      { initialRoute: TRIAL_ROUTE }
    );

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');
    const labels = within(menu)
      .getAllByRole('menuitem')
      .map(item => item.textContent?.trim());

    expect(labels.slice(0, 3)).toEqual(['Edit trial', 'Add classes', 'Edit show']);
    expect(
      within(within(menu).getByTestId('header-action-group-page')).getAllByRole('menuitem')
    ).toHaveLength(2);
    // Three sections (trial, show, Create), so two dividers.
    expect(within(menu).getAllByRole('separator')).toHaveLength(2);
  });

  it('runs the page Edit when the item is chosen', async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(
      <>
        <AppHeader />
        <TrialPageStub run={run} />
      </>,
      { initialRoute: TRIAL_ROUTE }
    );

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit trial' }));

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('hides the page Edit from a viewer the page did not register it for', async () => {
    const user = userEvent.setup();
    render(
      <>
        <AppHeader />
        <TrialPageStub run={vi.fn()} enabled={false} />
      </>,
      { initialRoute: TRIAL_ROUTE }
    );

    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    const menu = await screen.findByRole('menu');

    expect(within(menu).queryByRole('menuitem', { name: 'Edit trial' })).not.toBeInTheDocument();
    // Positive control: the show's own list is still there.
    expect(within(menu).getByRole('menuitem', { name: 'Edit show' })).toBeInTheDocument();
  });
});
