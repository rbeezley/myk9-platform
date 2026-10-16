import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';
import { useRememberBrowseList } from '../useRememberBrowseList';

const CLUB = { clubId: 'club-1', clubName: 'Heartland Club' };
const LAST_TAB_KEY = 'myk9:browse-last-tab';

// No sidebar at all: the memory must not depend on which presentation (rail or drawer) is showing.
function Remember({ roles }: { roles: UserRole[] }) {
  useRememberBrowseList(buildUnifiedSidebarConfig(roles, CLUB, 'Jordan'));
  return null;
}

describe('useRememberBrowseList', () => {
  it.each([
    ['/dogs/dog-1', 'dogs'],
    ['/people', 'people'],
    ['/clubs/c-9', 'clubs'],
    ['/shows/show-1/entries', 'shows'],
  ])('remembers %s as %s, with no sidebar mounted', async (route, expected) => {
    render(<Remember roles={[UserRole.SECRETARY, UserRole.CLUB_ADMIN]} />, {
      initialRoute: route,
    });

    await waitFor(() => expect(localStorage.getItem(LAST_TAB_KEY)).toBe(expected));
  });

  it("does not remember a club admin's own Club Profile as the Clubs list", async () => {
    localStorage.setItem(LAST_TAB_KEY, 'people');
    render(<Remember roles={[UserRole.SECRETARY, UserRole.CLUB_ADMIN]} />, {
      initialRoute: '/clubs/club-1',
    });

    // Give an effect the chance to run, then check nothing was written.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(localStorage.getItem(LAST_TAB_KEY)).toBe('people');
  });

  it('writes nothing outside the Browse lists', async () => {
    render(<Remember roles={[UserRole.SECRETARY]} />, { initialRoute: '/secretary/dashboard' });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(localStorage.getItem(LAST_TAB_KEY)).toBeNull();
  });
});
