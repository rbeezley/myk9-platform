import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { RoleSidebar } from '../RoleSidebar';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';
import { browseHref, browseTabForPath, browseTabsForRoles } from '../browseTabs';
import { useRememberBrowseList } from '../useRememberBrowseList';

vi.mock('@/components/layout/AccountMenuContent', () => ({
  AccountMenuContent: () => null,
}));

const LAST_TAB_KEY = 'myk9:browse-last-tab';

function renderRail(initialRoute: string) {
  const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR], undefined, 'Jordan');
  return render(<RoleSidebar config={config} variant="rail" />, { initialRoute });
}

function Remember() {
  useRememberBrowseList(buildUnifiedSidebarConfig([UserRole.EXHIBITOR], undefined, 'Jordan'));
  return null;
}

const myShowsLink = () => screen.getByRole('link', { name: 'My Shows' });

describe('My Shows rail item (exhibitor-only account)', () => {
  it('replaces the My Shows, My Dogs and Find Shows items; Payments and Ringside stay', () => {
    renderRail('/exhibitor/payments');

    expect(myShowsLink()).toHaveTextContent(/^My Shows$/);
    for (const name of ['My Dogs', 'Find Shows']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'My Payments' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Ringside/ })).toBeInTheDocument();
  });

  it.each(['/exhibitor/entries', '/dogs', '/dogs/dog-1'])('is the current page on %s', route => {
    renderRail(route);

    expect(myShowsLink()).toHaveAttribute('aria-current', 'page');
  });

  it('is not current on My Payments', () => {
    renderRail('/exhibitor/payments');

    expect(myShowsLink()).not.toHaveAttribute('aria-current');
  });

  it('opens My Shows the first time, then the tab used last', () => {
    const { unmount } = renderRail('/exhibitor/payments');
    expect(myShowsLink()).toHaveAttribute('href', '/exhibitor/entries');
    unmount();

    localStorage.setItem(LAST_TAB_KEY, 'dogs');
    renderRail('/exhibitor/payments');
    expect(myShowsLink()).toHaveAttribute('href', '/dogs');
  });

  it('opens My Shows when the remembered tab is one an exhibitor cannot see', () => {
    localStorage.setItem(LAST_TAB_KEY, 'people');
    renderRail('/exhibitor/payments');

    expect(myShowsLink()).toHaveAttribute('href', '/exhibitor/entries');
  });

  it('opens My Shows when storage cannot be read', () => {
    const getItem = vi.mocked(localStorage.getItem);
    const realGet = getItem.getMockImplementation();
    getItem.mockImplementation(key => {
      if (key === LAST_TAB_KEY) throw new Error('SecurityError: storage blocked');
      return realGet ? realGet(key) : null;
    });
    try {
      renderRail('/exhibitor/payments');
      expect(myShowsLink()).toHaveAttribute('href', '/exhibitor/entries');
    } finally {
      if (realGet) getItem.mockImplementation(realGet);
    }
  });

  it('keeps My Shows and My Dogs by name in the mobile drawer', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    render(<RoleSidebar config={config} />, { initialRoute: '/dogs' });

    expect(screen.getByRole('link', { name: 'My Shows' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Dogs' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('remembering the exhibitor tab', () => {
  it.each([
    ['/exhibitor/entries', 'my-shows'],
    ['/dogs/dog-1', 'dogs'],
  ])('remembers %s as %s', async (route, expected) => {
    render(<Remember />, { initialRoute: route });

    await waitFor(() => expect(localStorage.getItem(LAST_TAB_KEY)).toBe(expected));
  });

  it('writes nothing on My Payments', async () => {
    render(<Remember />, { initialRoute: '/exhibitor/payments' });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(localStorage.getItem(LAST_TAB_KEY)).toBeNull();
  });
});

describe('exhibitor tabs', () => {
  const exhibitor = browseTabsForRoles([UserRole.EXHIBITOR]);

  it('are My Shows and My Dogs, at their own URLs', () => {
    expect(exhibitor.map(tab => [tab.title, tab.href])).toEqual([
      ['My Shows', '/exhibitor/entries'],
      ['My Dogs', '/dogs'],
    ]);
  });

  it('resolve their paths', () => {
    expect(browseTabForPath('/exhibitor/entries')).toBe('my-shows');
    expect(browseTabForPath('/exhibitor/entries/anything')).toBe('my-shows');
    expect(browseTabForPath('/exhibitor/payments')).toBeNull();
    expect(browseTabForPath('/my-shows')).toBeNull();
  });

  it('open My Shows first, then the tab used last, ignoring lists an exhibitor cannot browse', () => {
    expect(browseHref(exhibitor, null, null)).toBe('/exhibitor/entries');
    expect(browseHref(exhibitor, null, 'dogs')).toBe('/dogs');
    expect(browseHref(exhibitor, 'my-shows', 'dogs')).toBe('/exhibitor/entries');
    expect(browseHref(exhibitor, null, 'clubs')).toBe('/exhibitor/entries');
  });
});
