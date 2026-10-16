import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { RoleSidebar } from '../RoleSidebar';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';

vi.mock('@/components/layout/AccountMenuContent', () => ({
  AccountMenuContent: () => null,
}));

const CLUB = { clubId: 'club-1', clubName: 'Heartland Club' };
const LAST_TAB_KEY = 'myk9:browse-last-tab';

function renderRail(roles: UserRole[], initialRoute: string) {
  const config = buildUnifiedSidebarConfig(roles, CLUB, 'Jordan');
  return render(<RoleSidebar config={config} variant="rail" />, { initialRoute });
}

const browseLink = () => screen.getByRole('link', { name: 'Browse' });

describe('Browse rail item', () => {
  it('replaces the Shows, Dogs, People and Clubs rail items', () => {
    renderRail([UserRole.SECRETARY], '/secretary/dashboard');

    expect(browseLink()).toHaveTextContent(/^Browse$/);
    for (const name of ['Shows', 'Dogs', 'People', 'Clubs']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });

  it.each([
    '/shows',
    '/shows/show-1',
    '/dogs',
    '/dogs/dog-1',
    '/people/p-1',
    '/clubs',
    '/clubs/c-9',
  ])('is the current page on %s', route => {
    renderRail([UserRole.SECRETARY, UserRole.CLUB_ADMIN], route);

    expect(browseLink()).toHaveAttribute('aria-current', 'page');
    expect(browseLink()).toHaveClass('bg-primary/10');
  });

  it("is not current on a club admin's own club pages, which belong to My Club", () => {
    renderRail([UserRole.SECRETARY, UserRole.CLUB_ADMIN], '/clubs/club-1');

    expect(browseLink()).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'My Club' })).toHaveAttribute('aria-current', 'true');
  });

  it('opens Shows the first time', () => {
    renderRail([UserRole.SECRETARY], '/secretary/dashboard');

    expect(browseLink()).toHaveAttribute('href', '/shows');
  });

  it('opens the list used last on this device', () => {
    localStorage.setItem(LAST_TAB_KEY, 'people');
    renderRail([UserRole.SECRETARY], '/secretary/dashboard');

    expect(browseLink()).toHaveAttribute('href', '/people');
  });

  it('points at the list open now, however the viewer reached it', () => {
    renderRail([UserRole.SECRETARY], '/dogs/dog-1');

    expect(browseLink()).toHaveAttribute('href', '/dogs');
  });

  it('opens Shows when the remembered list is one this role cannot see', () => {
    localStorage.setItem(LAST_TAB_KEY, 'people');
    renderRail([UserRole.JUDGE], '/at-show');

    expect(browseLink()).toHaveAttribute('href', '/shows');
  });

  it('opens Shows when the remembered value is not a list', () => {
    localStorage.setItem(LAST_TAB_KEY, 'admin');
    renderRail([UserRole.SECRETARY], '/secretary/dashboard');

    expect(browseLink()).toHaveAttribute('href', '/shows');
  });

  it('opens Shows when storage cannot be read, and still renders and navigates', () => {
    // A remembered value exists, but reading and writing it throw (a blocked or private window).
    // Only this key throws: the rest of the app's storage keeps working around it.
    localStorage.setItem(LAST_TAB_KEY, 'people');
    const getItem = vi.mocked(localStorage.getItem);
    const setItem = vi.mocked(localStorage.setItem);
    const realGet = getItem.getMockImplementation();
    const realSet = setItem.getMockImplementation();
    const blockedKey = (key: string) => {
      if (key === LAST_TAB_KEY) throw new Error('SecurityError: storage blocked');
    };
    getItem.mockImplementation(key => (blockedKey(key), realGet ? realGet(key) : null));
    setItem.mockImplementation((key, value) => (blockedKey(key), realSet?.(key, value)));
    try {
      const { unmount } = renderRail([UserRole.SECRETARY], '/secretary/dashboard');
      expect(browseLink()).toHaveAttribute('href', '/shows');
      unmount();

      // On a list, the failed write is swallowed and the link still points at the open list.
      renderRail([UserRole.SECRETARY], '/clubs');
      expect(browseLink()).toHaveAttribute('href', '/clubs');
    } finally {
      if (realGet) getItem.mockImplementation(realGet);
      if (realSet) setItem.mockImplementation(realSet);
    }
  });

  it('keeps the four lists by name in the mobile drawer', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    render(<RoleSidebar config={config} />, { initialRoute: '/dogs' });

    for (const name of ['Shows', 'Dogs', 'People', 'Clubs']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Browse' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dogs' })).toHaveAttribute('aria-current', 'page');
  });
});
