import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { RoleSidebar } from '../RoleSidebar';
import { buildUnifiedSidebarConfig, type ClubContext } from '../unifiedSidebarConfig';

vi.mock('@/components/layout/AccountMenuContent', () => ({
  AccountMenuContent: () => null,
}));

const CLUB = { clubId: 'club-1', clubName: 'Heartland Club' };
const ROLES = [UserRole.SECRETARY, UserRole.CLUB_ADMIN];

function renderRail(initialRoute: string, clubContext?: ClubContext) {
  const config = buildUnifiedSidebarConfig(ROLES, clubContext, 'Jordan');
  return render(<RoleSidebar config={config} variant="rail" />, { initialRoute });
}

const myClubLink = () => screen.getByRole('link', { name: 'My Club' });

describe('My Club rail item (MYK9-1293)', () => {
  it('is a link to the club page, not a popover trigger', () => {
    renderRail('/secretary/dashboard', CLUB);

    expect(myClubLink()).toHaveAttribute('href', '/clubs/club-1');
    expect(myClubLink()).toHaveTextContent(/^My Club$/);
    expect(screen.queryByRole('button', { name: 'My Club' })).not.toBeInTheDocument();
  });

  it.each(['/clubs/club-1', '/club-admin/members', '/club-admin/payments', '/shows?club=club-1'])(
    'is the current page on %s',
    route => {
      renderRail(route, CLUB);

      expect(myClubLink()).toHaveAttribute('aria-current', 'page');
      expect(myClubLink()).toHaveClass('bg-primary/10');
    }
  );

  it('is not current outside the club pages', () => {
    renderRail('/secretary/dashboard', CLUB);

    expect(myClubLink()).not.toHaveAttribute('aria-current');
  });

  it.each(['/clubs/club-1', '/shows?club=club-1'])(
    "keeps Browse from claiming the admin's own club on %s",
    route => {
      renderRail(route, CLUB);

      expect(screen.getByRole('link', { name: 'Browse' })).not.toHaveAttribute('aria-current');
    }
  );

  it('lists Our Shows, Members, Payments and Club Profile by name in the drawer', () => {
    const config = buildUnifiedSidebarConfig(ROLES, CLUB, 'Jordan');
    render(<RoleSidebar config={config} variant="drawer" />, {
      initialRoute: '/secretary/dashboard',
    });

    for (const name of ['Our Shows', 'Members', 'Payments', 'Club Profile']) {
      expect(screen.getByRole('link', { name: new RegExp(name) })).toBeInTheDocument();
    }
  });

  it('stays the popover trigger while the club context is unresolved', () => {
    renderRail('/secretary/dashboard');

    expect(screen.getByRole('button', { name: 'My Club' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My Club' })).not.toBeInTheDocument();
  });
});
