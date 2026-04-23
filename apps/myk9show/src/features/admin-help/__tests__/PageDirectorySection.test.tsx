import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';
import { getAdminHelpSectionKey } from '@/constants/storageKeys';
import { PageDirectorySection } from '../components/PageDirectorySection';
import { UserRole } from '@/types/auth-types';
import type { PageEntry } from '../types';

const e = (path: string, title: string): PageEntry => ({
  path,
  title,
  description: `desc ${title}`,
  roles: [UserRole.SITE_ADMIN],
  classification: 'critical-path',
  category: 'Admin',
  status: 'working',
});

describe('PageDirectorySection', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the role title and entry count', () => {
    render(
      <PageDirectorySection
        roleKey="site-admin"
        title="Site Admin"
        entries={[e('/admin/dashboard', 'Dashboard'), e('/admin/users', 'Users')]}
        resolvePath={p => p}
        loading={false}
      />
    );
    expect(screen.getByText(/site admin/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders all entries when expanded', () => {
    render(
      <PageDirectorySection
        roleKey="site-admin"
        title="Site Admin"
        entries={[e('/admin/dashboard', 'Dashboard'), e('/admin/users', 'Users')]}
        resolvePath={p => p}
        loading={false}
      />
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('collapses and persists state to localStorage', async () => {
    const user = userEvent.setup();
    render(
      <PageDirectorySection
        roleKey="site-admin"
        title="Site Admin"
        entries={[e('/admin/dashboard', 'Dashboard')]}
        resolvePath={p => p}
        loading={false}
      />
    );
    await user.click(screen.getByRole('button', { name: /site admin/i }));
    expect(window.localStorage.getItem(getAdminHelpSectionKey('site-admin'))).toBe('closed');
  });

  it('reads saved collapsed state on mount', () => {
    window.localStorage.setItem(getAdminHelpSectionKey('site-admin'), 'closed');
    render(
      <PageDirectorySection
        roleKey="site-admin"
        title="Site Admin"
        entries={[e('/admin/dashboard', 'Dashboard')]}
        resolvePath={p => p}
        loading={false}
      />
    );
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });
});
