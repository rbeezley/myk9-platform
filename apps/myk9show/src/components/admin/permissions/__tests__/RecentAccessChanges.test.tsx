import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ActionType, type AuditLogEntry } from '@/types/rbac-types';
import { RecentAccessChanges } from '../RecentAccessChanges';

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'a1',
    action: ActionType.ROLE_ASSIGNED,
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
      <RecentAccessChanges
        entries={[makeEntry({ action: ActionType.ROLE_REVOKED })]}
        isLoading={false}
      />
    );
    expect(screen.getByText('Role Revoked')).toBeInTheDocument();
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

  it('marks permission_override_removed as destructive', () => {
    render(
      <RecentAccessChanges
        entries={[makeEntry({ action: 'permission_override_removed' })]}
        isLoading={false}
      />
    );
    const listItem = screen.getByRole('listitem');
    const dot = listItem.querySelector('[class*="bg-destructive"]');
    expect(dot).toBeInTheDocument();
  });

  it('says the read failed rather than claiming nothing happened, when the audit fetch failed', () => {
    render(<RecentAccessChanges entries={[]} isLoading={false} auditFailed />);
    expect(screen.getByText(/recent changes couldn't be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/no access changes recorded yet/i)).not.toBeInTheDocument();
  });

  it('prefers the loading state over the failure state while still loading', () => {
    render(<RecentAccessChanges entries={[]} isLoading auditFailed />);
    expect(screen.queryByText(/recent changes couldn't be loaded/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading recent changes/i })).toBeInTheDocument();
  });

  it('gracefully handles malformed created_at timestamps', () => {
    render(
      <RecentAccessChanges
        entries={[makeEntry({ created_at: 'not-a-valid-date' })]}
        isLoading={false}
      />
    );
    // Should render without throwing, and omit the timestamp
    expect(screen.getByText('Role Assigned')).toBeInTheDocument();
    expect(screen.getByText('role')).toBeInTheDocument(); // target_type should still show
  });
});
