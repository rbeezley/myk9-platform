import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { RoleSidebar } from '../RoleSidebar';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';
import { UserRole } from '@/types/auth-types';

describe('RoleSidebar', () => {
  it('shows the user first name without a role icon in the header', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN], undefined, undefined, 'Jamie');

    render(<RoleSidebar config={config} />, { initialRoute: '/admin/dashboard' });

    const heading = screen.getByRole('heading', { name: 'Jamie' });
    expect(heading.closest('.h-16')?.querySelector('svg')).toBeNull();
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

  it('renders the access level as quiet status text instead of a card', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);

    render(<RoleSidebar config={config} />, { initialRoute: '/admin/dashboard' });

    const accessLevel = screen.getByLabelText('Access level');
    expect(accessLevel).toHaveTextContent('Admin Access');
    expect(accessLevel).not.toHaveClass('rounded-lg', 'bg-muted/30');
    expect(screen.queryByText('Full system administration')).not.toBeInTheDocument();
  });

  it('keeps the collapsed access-level text available to assistive technology', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);

    render(<RoleSidebar config={config} isCollapsed />, { initialRoute: '/admin/dashboard' });

    expect(screen.getByLabelText('Access level')).toHaveTextContent('Admin Access');
  });
});
