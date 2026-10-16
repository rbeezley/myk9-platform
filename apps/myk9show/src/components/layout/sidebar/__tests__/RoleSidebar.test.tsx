import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { RoleSidebar } from '../RoleSidebar';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';
import { UserRole } from '@/types/auth-types';

vi.mock('@/components/layout/AccountMenuContent', () => ({
  AccountMenuContent: () => null,
}));

describe('RoleSidebar', () => {
  it('combines the user name and primary role in one desktop account control', () => {
    const config = buildUnifiedSidebarConfig(
      [UserRole.SITE_ADMIN, UserRole.EXHIBITOR],
      undefined,
      'Jamie'
    );

    render(<RoleSidebar config={config} />, { initialRoute: '/admin/dashboard' });

    const accountMenu = screen.getByRole('button', {
      name: 'Account menu for Jamie, Site Admin +1',
    });
    expect(accountMenu).toHaveTextContent('Jamie');
    expect(accountMenu).toHaveTextContent('Site Admin +1');
    expect(screen.queryByRole('heading', { name: 'Jamie' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Access level')).not.toBeInTheDocument();
  });

  it('gives every rail link a visible label that is its accessible name', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);

    render(<RoleSidebar config={config} variant="rail" />, {
      initialRoute: '/secretary/dashboard',
    });

    for (const link of screen.getAllByRole('link')) {
      const name = link.getAttribute('aria-label') ?? '';
      expect(name.startsWith(link.textContent ?? '\u0000')).toBe(true);
      expect(link).not.toHaveAttribute('title');
    }

    const manage = screen.getByRole('link', { name: 'Manage: Show Management' });
    expect(manage).toHaveTextContent(/^Manage$/);
    expect(manage).toHaveAttribute('href', '/secretary/dashboard');
    expect(screen.getByRole('link', { name: 'Shows' })).toHaveAttribute('href', '/shows');
  });

  it('keeps the full Show Management title in the mobile drawer', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);

    render(<RoleSidebar config={config} />, { initialRoute: '/secretary/dashboard' });

    expect(screen.getByRole('link', { name: 'Show Management' })).toHaveTextContent(
      'Show Management'
    );
  });

  it('keeps expanded link names concise and renders descriptions in full', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);

    render(<RoleSidebar config={config} />, { initialRoute: '/exhibitor/dashboard' });

    const myShowsLink = screen.getByRole('link', { name: 'My Shows' });
    expect(myShowsLink).toBeInTheDocument();
    const description = screen.getByText('Your entries, dogs, and upcoming shows');
    expect(description).not.toHaveClass('line-clamp-1');
    expect(description).not.toHaveClass('line-clamp-2');
  });

  it('identifies only the current navigation link', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);

    render(<RoleSidebar config={config} />, { initialRoute: '/admin/dashboard' });

    expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /System Health/ })).not.toHaveAttribute('aria-current');
  });

  it('identifies one current link for a club admin with club context', () => {
    const config = buildUnifiedSidebarConfig(
      [UserRole.CLUB_ADMIN],
      { clubId: 'club-1', clubName: 'Heartland Club' },
      'Jamie'
    );

    render(<RoleSidebar config={config} />, { initialRoute: '/club-admin/members' });

    const currentLinks = screen
      .getAllByRole('link')
      .filter(link => link.getAttribute('aria-current') === 'page');
    expect(currentLinks).toHaveLength(1);
    expect(currentLinks[0]).toHaveTextContent('Members');
  });

  it('identifies the filtered club shows link instead of generic Shows', () => {
    const config = buildUnifiedSidebarConfig(
      [UserRole.CLUB_ADMIN],
      { clubId: 'club-1', clubName: 'Heartland Club' },
      'Jamie'
    );

    render(<RoleSidebar config={config} />, { initialRoute: '/shows?club=club-1' });

    expect(screen.getByRole('link', { name: /Our Shows/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /^Shows$/ })).not.toHaveAttribute('aria-current');
  });

  it('does not mark a filtered listing current on a show detail route', () => {
    const config = buildUnifiedSidebarConfig(
      [UserRole.CLUB_ADMIN],
      { clubId: 'club-1', clubName: 'Heartland Club' },
      'Jamie'
    );

    render(<RoleSidebar config={config} />, { initialRoute: '/shows/show-1' });

    expect(screen.getByRole('link', { name: /Our Shows/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /^Shows$/ })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps every expanded navigation target at least 44 pixels tall', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);

    render(<RoleSidebar config={config} />, { initialRoute: '/admin/dashboard' });

    expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveClass('min-h-11');
  });

  it('shows the first name under the avatar in the rail account control', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN], undefined, 'Jamie');

    render(<RoleSidebar config={config} variant="rail" />, { initialRoute: '/admin/dashboard' });

    const account = screen.getByRole('button', { name: 'Account menu for Jamie, Site Admin' });
    expect(account).toHaveTextContent('Jamie');
    expect(account).not.toHaveTextContent('Site Admin');
  });
});
