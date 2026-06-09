import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { RoleSidebar } from '../RoleSidebar';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';
import { UserRole } from '@/types/auth-types';

describe('RoleSidebar', () => {
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
