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
      undefined,
      'Jamie'
    );

    render(<RoleSidebar config={config} />, { initialRoute: '/admin/dashboard' });

    const accountMenu = screen.getByRole('button', { name: 'Account menu for Jamie, Site Admin +1' });
    expect(accountMenu).toHaveTextContent('Jamie');
    expect(accountMenu).toHaveTextContent('Site Admin +1');
    expect(screen.queryByRole('heading', { name: 'Jamie' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Access level')).not.toBeInTheDocument();
  });

  it('gives collapsed icon-only links accessible names', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);

    render(<RoleSidebar config={config} isCollapsed />, { initialRoute: '/secretary/dashboard' });

    expect(screen.getByRole('link', { name: 'Show Management' })).toHaveAttribute(
      'href',
      '/secretary/dashboard'
    );
    expect(screen.getByRole('link', { name: 'Shows' })).toHaveAttribute('href', '/shows');
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
      undefined,
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
      undefined,
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
      undefined,
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

  it('keeps the collapsed account control available to assistive technology', () => {
    const config = buildUnifiedSidebarConfig(
      [UserRole.SITE_ADMIN],
      undefined,
      undefined,
      'Jamie'
    );

    render(<RoleSidebar config={config} isCollapsed />, { initialRoute: '/admin/dashboard' });

    expect(
      screen.getByRole('button', { name: 'Account menu for Jamie, Site Admin' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Jamie')).not.toBeInTheDocument();
  });
});
