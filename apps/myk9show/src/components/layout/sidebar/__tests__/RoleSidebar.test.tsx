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

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/secretary/dashboard'
    );
    expect(screen.getByRole('link', { name: 'Shows' })).toHaveAttribute('href', '/shows');
  });
});
