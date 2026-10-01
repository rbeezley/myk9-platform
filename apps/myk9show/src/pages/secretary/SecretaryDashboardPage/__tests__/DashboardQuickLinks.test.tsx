import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DashboardQuickLinks } from '../DashboardQuickLinks';
import { filterEntryEligibleShows } from '../entryEligibleShows';
import { ScopeType, UserRole, type UserWithRoles } from '@/types/auth-types';

function renderLinks(entryShows: Array<{ id: string; name: string }>) {
  return render(
    <MemoryRouter>
      <DashboardQuickLinks entryShows={entryShows} />
    </MemoryRouter>
  );
}

describe('DashboardQuickLinks', () => {
  it('with no eligible show: Add Entry is disabled and says why; Add Show stays', () => {
    renderLinks([]);
    expect(screen.getByRole('link', { name: /Add Show/i })).toHaveAttribute(
      'href',
      '/secretary/create-show/wizard'
    );
    expect(screen.getByRole('button', { name: /Add Entry/i })).toBeDisabled();
    expect(screen.getByText(/published show you run as trial secretary/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Add Dog|Add Person/i })).not.toBeInTheDocument();
  });

  it('with one eligible show: Add Entry links straight to its register route', () => {
    renderLinks([{ id: 'show-1', name: 'Spring Trial' }]);
    expect(screen.getByRole('link', { name: /Add Entry/i })).toHaveAttribute(
      'href',
      '/secretary/register/show-1'
    );
  });

  it('with several eligible shows: Add Entry opens a picker of register links', async () => {
    const user = userEvent.setup();
    renderLinks([
      { id: 'a', name: 'Spring Trial' },
      { id: 'b', name: 'Fall Trial' },
    ]);
    expect(screen.queryByRole('link', { name: /Add Entry/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add Entry/i }));
    const dialog = await screen.findByRole('dialog');
    // Many shows must scroll inside the viewport, not push links off-screen.
    expect(dialog).toHaveClass('max-h-[calc(100dvh-2rem)]', 'overflow-y-auto');
    expect(within(dialog).getByRole('link', { name: 'Spring Trial' })).toHaveAttribute(
      'href',
      '/secretary/register/a'
    );
    expect(within(dialog).getByRole('link', { name: 'Fall Trial' })).toHaveAttribute(
      'href',
      '/secretary/register/b'
    );
  });
});

describe('filterEntryEligibleShows', () => {
  const shows = [
    { id: 'mine', clubId: 'club-1' },
    { id: 'other-club', clubId: 'club-2' },
    { id: 'no-club', clubId: undefined },
  ];
  const scoped = (roleId: UserRole, scopeId: string) =>
    ({ scopes: [{ scopeType: ScopeType.CLUB, scopeId, roleId }] }) as unknown as UserWithRoles;
  const rolesOf =
    (...roles: UserRole[]) =>
    (r: UserRole) =>
      roles.includes(r);

  it('keeps only shows of clubs the secretary is scoped to; a show failing the gate is excluded', () => {
    const out = filterEntryEligibleShows(shows, {
      hasRole: rolesOf(UserRole.SECRETARY),
      userWithRoles: scoped(UserRole.SECRETARY, 'club-1'),
    });
    expect(out.map(s => s.id)).toEqual(['mine']);
  });

  it('excludes a club admin who is not a trial secretary', () => {
    const out = filterEntryEligibleShows(shows, {
      hasRole: rolesOf(UserRole.CLUB_ADMIN),
      userWithRoles: scoped(UserRole.CLUB_ADMIN, 'club-1'),
    });
    expect(out).toEqual([]);
  });

  it('gives a site admin every show', () => {
    const out = filterEntryEligibleShows(shows, {
      hasRole: rolesOf(UserRole.SITE_ADMIN),
      userWithRoles: null,
    });
    expect(out).toHaveLength(3);
  });
});
