import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { AuditLogEntry } from '@/types/rbac-types';
import { RecentAccessChanges } from '../RecentAccessChanges';

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'a1',
    action: 'assign_role',
    user_id: 'u1',
    target_id: 'r1',
    target_type: 'role',
    old_value: null,
    new_value: null,
    ip_address: null,
    user_agent: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('RecentAccessChanges', () => {
  it('renders each change with a readable action label', () => {
    render(
      <RecentAccessChanges entries={[makeEntry({ action: 'revoke_role' })]} isLoading={false} />
    );
    expect(screen.getByText('Revoke Role')).toBeInTheDocument();
  });

  it('shows at most five entries', () => {
    const entries = Array.from({ length: 8 }, (_, index) => makeEntry({ id: `a${index}` }));
    render(<RecentAccessChanges entries={entries} isLoading={false} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('always offers the full audit log', () => {
    render(<RecentAccessChanges entries={[]} isLoading={false} />);
    expect(screen.getByRole('link', { name: /view full audit/i })).toHaveAttribute(
      'href',
      '/admin/permissions?tab=audit'
    );
  });

  it('states plainly when there is no recent activity', () => {
    render(<RecentAccessChanges entries={[]} isLoading={false} />);
    expect(screen.getByText(/no access changes recorded yet/i)).toBeInTheDocument();
  });

  it('does not claim emptiness while still loading', () => {
    render(<RecentAccessChanges entries={[]} isLoading />);
    expect(screen.queryByText(/no access changes recorded yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading recent changes/i })).toBeInTheDocument();
  });
});
