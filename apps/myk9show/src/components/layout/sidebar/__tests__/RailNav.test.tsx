import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { RoleSidebar } from '../RoleSidebar';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';

vi.mock('@/components/layout/AccountMenuContent', () => ({
  AccountMenuContent: () => null,
}));

const CLUB = { clubId: 'club-1', clubName: 'Heartland Club' };

function renderClubAdminRail(initialRoute = '/dogs') {
  const config = buildUnifiedSidebarConfig(
    [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.EXHIBITOR],
    CLUB,
    'Jordan'
  );
  return render(<RoleSidebar config={config} variant="rail" />, { initialRoute });
}

describe('RailNav', () => {
  it('folds the My Club pages into one labeled rail button', () => {
    renderClubAdminRail();

    expect(screen.getByRole('button', { name: 'My Club' })).toHaveTextContent('My Club');
    expect(screen.queryByRole('link', { name: /Members/ })).not.toBeInTheDocument();
  });

  it('opens a panel listing every My Club page with its description', async () => {
    const user = userEvent.setup();
    renderClubAdminRail();

    await user.click(screen.getByRole('button', { name: 'My Club' }));

    const panel = await screen.findByRole('dialog', { name: 'My Club' });
    for (const title of ['Our Shows', 'Members', 'Payments', 'Club Profile']) {
      expect(panel).toHaveTextContent(title);
    }
    expect(panel).toHaveTextContent('Bank account and show payouts');
  });

  it('closes the panel when a page in it is chosen', async () => {
    const user = userEvent.setup();
    renderClubAdminRail();

    await user.click(screen.getByRole('button', { name: 'My Club' }));
    await user.click(await screen.findByRole('link', { name: /Members/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('marks the My Club button current while one of its pages is open', () => {
    renderClubAdminRail('/club-admin/members');

    const myClub = screen.getByRole('button', { name: 'My Club' });
    expect(myClub).toHaveAttribute('aria-current', 'true');
    expect(myClub).toHaveClass('bg-primary/10');
    expect(screen.getByRole('link', { name: 'Browse' })).not.toHaveAttribute('aria-current');
  });

  it('does not mark the My Club button current on a page outside it', () => {
    renderClubAdminRail('/dogs');

    expect(screen.getByRole('button', { name: 'My Club' })).not.toHaveAttribute('aria-current');
  });

  it('puts the admin pages and Resources in one Admin panel with section headings', async () => {
    const user = userEvent.setup();
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN], undefined, 'Jamie');
    render(<RoleSidebar config={config} variant="rail" />, { initialRoute: '/admin/dashboard' });

    await user.click(screen.getByRole('button', { name: 'Admin' }));

    const panel = await screen.findByRole('dialog', { name: 'Admin' });
    expect(panel).toHaveTextContent('Resources');
    expect(panel).toHaveTextContent('System Health');
    expect(panel).toHaveTextContent('Help');
    expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('aria-current', 'page');
  });
});
