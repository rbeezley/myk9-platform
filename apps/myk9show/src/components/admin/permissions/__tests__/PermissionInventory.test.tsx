import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@/test/utils/testUtils';
import type { Permission } from '@/types/rbac-types';
import { PermissionInventory } from '../PermissionInventory';

function makePermission(overrides: Partial<Permission>): Permission {
  return {
    id: Math.random().toString(36).slice(2),
    code: 'show:manage',
    name: 'Manage Shows',
    description: null,
    category: null,
    created_at: null,
    ...overrides,
  };
}

const permissions: Permission[] = [
  makePermission({ id: 'a', code: 'show:manage', name: 'Manage Shows' }),
  makePermission({ id: 'b', code: 'show:view', name: 'View Shows' }),
  makePermission({ id: 'c', code: 'entry:create', name: 'Create Entries' }),
];

describe('PermissionInventory', () => {
  it('groups permissions by resource', () => {
    render(<PermissionInventory permissions={permissions} />);
    expect(screen.getByText('Show')).toBeInTheDocument();
    expect(screen.getByText('Entry')).toBeInTheDocument();
  });

  it('renders the code for each permission', async () => {
    const { user } = render(<PermissionInventory permissions={permissions} />);
    await user.click(screen.getByRole('button', { name: /show 2 permissions/i }));
    await user.click(screen.getByRole('button', { name: /entry 1 permission/i }));
    expect(screen.getByText('show:manage')).toBeInTheDocument();
    expect(screen.getByText('entry:create')).toBeInTheDocument();
  });

  it('collapses resource details until the administrator opens them', async () => {
    const { user } = render(<PermissionInventory permissions={permissions} />);
    const entryTrigger = screen.getByRole('button', { name: /entry 1 permission/i });
    expect(entryTrigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(entryTrigger);
    expect(entryTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('entry:create')).toBeVisible();
  });

  it('shows the match-count badge', () => {
    render(<PermissionInventory permissions={permissions} />);
    expect(screen.getByText('3 of 3 permissions')).toBeInTheDocument();
  });

  it('filters by search term across name, code, and resource', () => {
    render(<PermissionInventory permissions={permissions} />);
    fireEvent.change(screen.getByLabelText('Search permissions'), {
      target: { value: 'entry' },
    });
    expect(screen.getByText('Create Entries')).toBeInTheDocument();
    expect(screen.queryByText('Manage Shows')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3 permissions')).toBeInTheDocument();
  });

  it('shows an empty state when no permission matches the search', () => {
    render(<PermissionInventory permissions={permissions} />);
    fireEvent.change(screen.getByLabelText('Search permissions'), {
      target: { value: 'nonexistent-xyz' },
    });
    expect(screen.getByText('No permissions found')).toBeInTheDocument();
  });

  it('shows an empty state when the system has no permissions', () => {
    render(<PermissionInventory permissions={[]} />);
    expect(screen.getByText('No permissions are defined in the system')).toBeInTheDocument();
  });

  it('shows a loading skeleton instead of the empty state while fetching', () => {
    render(<PermissionInventory permissions={[]} isLoading />);
    expect(screen.getByLabelText('Loading permissions')).toBeInTheDocument();
    // The false "no permissions" message must NOT appear during loading.
    expect(screen.queryByText('No permissions are defined in the system')).not.toBeInTheDocument();
  });

  it('shows the error instead of the empty state when the fetch fails', () => {
    render(<PermissionInventory permissions={[]} error="Boom" />);
    expect(screen.getByText('Boom')).toBeInTheDocument();
    expect(screen.queryByText('No permissions are defined in the system')).not.toBeInTheDocument();
  });

  it('sorts permissions within a resource group by code', async () => {
    const { user } = render(<PermissionInventory permissions={permissions} />);
    await user.click(screen.getByRole('button', { name: /show 2 permissions/i }));
    // show:manage sorts before show:view alphabetically by code
    const codes = screen.getAllByText(/^show:/);
    expect(codes[0]).toHaveTextContent('show:manage');
    expect(codes[1]).toHaveTextContent('show:view');
  });
});
