import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { Role } from '@/types/rbac-types';
import { RolesOverviewTable } from '../RolesOverviewTable';

const roles: Role[] = [
  {
    id: 'r1',
    name: 'show_secretary',
    description: 'Runs entries, classes, and results',
    is_system: true,
    permissions: null,
    created_at: null,
    display_name: 'Show Secretary',
    permission_count: 37,
    user_count: 14,
  },
  {
    id: 'r2',
    name: 'ring_helper',
    description: 'Custom club role',
    is_system: false,
    permissions: null,
    created_at: null,
    permission_count: 4,
    user_count: 0,
  },
];

function renderTable(overrides: Partial<React.ComponentProps<typeof RolesOverviewTable>> = {}) {
  return render(
    <RolesOverviewTable
      roles={roles}
      lastChanged={new Map([['r1', '2026-08-18T10:00:00Z']])}
      isLoading={false}
      error={null}
      onRetry={vi.fn()}
      {...overrides}
    />
  );
}

describe('RolesOverviewTable', () => {
  it('renders one row per role with its member and permission counts', () => {
    renderTable();
    const secretaryRow = screen.getByRole('row', { name: /Show Secretary/ });
    expect(secretaryRow).toHaveTextContent('37');
    expect(secretaryRow).toHaveTextContent('14');
  });

  it('links each role to its existing editor rather than editing in place', () => {
    renderTable();
    expect(screen.getByRole('link', { name: /Show Secretary/ })).toHaveAttribute(
      'href',
      '/admin/permissions/roles/r1'
    );
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('marks system roles and custom roles distinctly', () => {
    renderTable();
    expect(screen.getByRole('row', { name: /Show Secretary/ })).toHaveTextContent('System');
    expect(screen.getByRole('row', { name: /Ring Helper/ })).toHaveTextContent('Custom');
  });

  it('shows an em-dash when a role has no recorded change', () => {
    renderTable();
    expect(screen.getByRole('row', { name: /Ring Helper/ })).toHaveTextContent('—');
  });

  it('filters rows as the admin types', async () => {
    const { user } = renderTable();
    await user.type(screen.getByRole('searchbox', { name: /search roles/i }), 'ring');
    expect(screen.queryByText('Show Secretary')).not.toBeInTheDocument();
    expect(screen.getByText('Ring Helper')).toBeInTheDocument();
  });

  it('tells the admin when a search matches nothing, and offers a way back', async () => {
    const { user } = renderTable();
    await user.type(screen.getByRole('searchbox', { name: /search roles/i }), 'zzzz');
    expect(screen.getByText(/no roles match/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear search/i }));
    expect(screen.getByText('Show Secretary')).toBeInTheDocument();
  });

  it('shows a loading state instead of a false empty state', () => {
    renderTable({ roles: [], isLoading: true });
    expect(screen.getByRole('status', { name: /loading roles/i })).toBeInTheDocument();
    expect(screen.queryByText(/no roles/i)).not.toBeInTheDocument();
  });

  // Zero roles and zero *matching* roles are different states with different
  // exits — a search-clear button is nonsense when there is no search.
  it('shows an empty-system state with no search and a link to create the first role', () => {
    renderTable({ roles: [] });
    expect(screen.getByText(/no roles defined yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear search/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create the first role/i })).toHaveAttribute(
      'href',
      '/admin/permissions/roles/new'
    );
  });

  it('shows an empty-search-result state distinct from the empty-system state', async () => {
    const { user } = renderTable();
    await user.type(screen.getByRole('searchbox', { name: /search roles/i }), 'zzzz');
    expect(screen.getByText(/no roles match/i)).toBeInTheDocument();
  });

  it('surfaces an error with a retry that calls back', async () => {
    const onRetry = vi.fn();
    const { user } = renderTable({ roles: [], error: "We couldn't load roles.", onRetry });
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
