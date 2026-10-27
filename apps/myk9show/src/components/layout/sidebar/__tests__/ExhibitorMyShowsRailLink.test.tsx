import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { RoleSidebar } from '../RoleSidebar';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';
import { browseTabForPath, browseTabsForRoles } from '../browseTabs';

vi.mock('@/components/layout/AccountMenuContent', () => ({
  AccountMenuContent: () => null,
}));

const LAST_TAB_KEY = 'myk9:browse-last-tab';

function renderRail(initialRoute: string, roles: UserRole[] = [UserRole.EXHIBITOR]) {
  const config = buildUnifiedSidebarConfig(roles, undefined, 'Jordan');
  return render(<RoleSidebar config={config} variant="rail" />, { initialRoute });
}

const myShows = () => screen.getByRole('link', { name: 'My Shows' });
const myDogs = () => screen.getByRole('link', { name: 'My Dogs' });

// Owner decision 2026-10-27 (MYK9-1287): an exhibitor-only account has My Shows and My Dogs as two
// plain rail items. It replaced the MYK9-1245 single "My Shows" item with a remembered tab.
describe('exhibitor-only rail (MYK9-1287)', () => {
  it('lists My Shows, My Dogs, My Payments and Ringside as separate items', () => {
    renderRail('/exhibitor/payments');

    expect(myShows()).toHaveAttribute('href', '/exhibitor/entries');
    expect(myDogs()).toHaveAttribute('href', '/dogs');
    expect(screen.getByRole('link', { name: 'My Payments' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Ringside/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Browse' })).not.toBeInTheDocument();
  });

  it.each(['/dogs', '/dogs/dog-1'])('highlights only My Dogs on %s', route => {
    renderRail(route);

    expect(myDogs()).toHaveAttribute('aria-current', 'page');
    expect(myShows()).not.toHaveAttribute('aria-current');
    expect(myShows()).toHaveAttribute('href', '/exhibitor/entries');
  });

  it('highlights only My Shows on /exhibitor/entries', () => {
    renderRail('/exhibitor/entries');

    expect(myShows()).toHaveAttribute('aria-current', 'page');
    expect(myDogs()).not.toHaveAttribute('aria-current');
  });

  it('highlights neither on My Payments', () => {
    renderRail('/exhibitor/payments');

    expect(myShows()).not.toHaveAttribute('aria-current');
    expect(myDogs()).not.toHaveAttribute('aria-current');
  });

  it('never follows a remembered tab', () => {
    localStorage.setItem(LAST_TAB_KEY, 'dogs');
    renderRail('/exhibitor/payments');

    expect(myShows()).toHaveAttribute('href', '/exhibitor/entries');
  });

  it('lists My Dogs as its own item in the mobile drawer', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    render(<RoleSidebar config={config} />, { initialRoute: '/dogs' });

    expect(myShows()).toHaveAttribute('href', '/exhibitor/entries');
    expect(myDogs()).toHaveAttribute('aria-current', 'page');
  });

  it('browses no tabs and resolves no tab for the exhibitor paths', () => {
    expect(browseTabsForRoles([UserRole.EXHIBITOR])).toEqual([]);
    expect(browseTabForPath('/exhibitor/entries')).toBeNull();
  });
});

describe('staff who also exhibit keep one Browse rail item', () => {
  it('shows Browse and neither My Shows nor a My Dogs item for secretary + exhibitor', () => {
    renderRail('/dogs', [UserRole.SECRETARY, UserRole.EXHIBITOR]);

    expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'My Dogs' })).not.toBeInTheDocument();
    expect(browseTabsForRoles([UserRole.SECRETARY, UserRole.EXHIBITOR]).map(t => t.id)).toEqual([
      'shows',
      'dogs',
      'people',
      'clubs',
    ]);
  });
});
