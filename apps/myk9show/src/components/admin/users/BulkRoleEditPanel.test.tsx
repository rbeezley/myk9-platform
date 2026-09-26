import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, userEvent, waitFor } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import { BulkRoleEditPanel } from './BulkRoleEditPanel';

// Daniel is Secretary for another club; Sam for Golden Gate.
const grantRows = [
  {
    user_id: '1',
    club_id: 'club-2',
    show_id: null,
    expires_at: null,
    roles: { name: 'secretary' },
  },
  {
    user_id: '2',
    club_id: 'club-1',
    show_id: null,
    expires_at: null,
    roles: { name: 'secretary' },
  },
];
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn((table: string) =>
      table === 'user_roles'
        ? {
            select: () => ({
              in: () => ({ eq: () => Promise.resolve({ data: grantRows, error: null }) }),
            }),
          }
        : {
            select: () => ({
              is: () => ({
                order: () =>
                  Promise.resolve({
                    data: [
                      { id: 'club-1', name: 'Golden Gate SWC' },
                      { id: 'club-2', name: 'Gold Coast KC' },
                    ],
                    error: null,
                  }),
              }),
            }),
          }
    ),
  },
}));

function person(id: string, name: string, roles: UserRole[]): SelectedUser {
  const [firstName, lastName] = name.split(' ');
  return {
    id,
    user: { id, firstName, lastName, roles, createdAt: new Date(), updatedAt: new Date() },
  } as SelectedUser;
}

const selection = [
  person('1', 'Daniel Reyes', [UserRole.JUDGE, UserRole.EXHIBITOR]),
  person('2', 'Sam Whitfield', [UserRole.EXHIBITOR]),
];

function renderPanel(onSubmit = vi.fn()) {
  render(
    <BulkRoleEditPanel
      open
      onClose={vi.fn()}
      selectedUsers={selection}
      isProcessing={false}
      error={null}
      onSubmit={onSubmit}
    />
  );
  return onSubmit;
}

function choice(role: string, label: 'Add' | 'Keep' | 'Remove') {
  const group = screen.getByRole('group', { name: `${role}: add, keep or remove` });
  return within(group).getByRole('button', { name: label });
}

describe('BulkRoleEditPanel', () => {
  // Codex P2: a club-scoped removal names only people who hold the role for a
  // chosen club — the runner leaves other clubs' grants alone.
  it('names only holders for the chosen club in a club-scoped removal', async () => {
    render(
      <BulkRoleEditPanel
        open
        onClose={vi.fn()}
        selectedUsers={[
          person('1', 'Daniel Reyes', [UserRole.SECRETARY]),
          person('2', 'Sam Whitfield', [UserRole.SECRETARY]),
        ]}
        isProcessing={false}
        error={null}
        onSubmit={vi.fn()}
      />
    );
    await userEvent.click(choice('Secretary', 'Remove'));
    await userEvent.click(await screen.findByRole('combobox', { name: 'Add a club' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Golden Gate SWC' }));

    const summary = screen.getByRole('region', { name: 'What will happen' });
    await waitFor(() =>
      expect(summary).toHaveTextContent('Remove Secretary for 1 club from Sam Whitfield')
    );
    expect(summary).not.toHaveTextContent('Daniel');
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeEnabled();
  });

  it('shows who holds each role and starts every role on Keep with Apply off', () => {
    renderPanel();
    expect(screen.getByText('Change roles for 2 people')).toBeInTheDocument();
    expect(choice('Judge', 'Keep')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    // Exhibitor is locked: no controls at all.
    expect(screen.queryByRole('group', { name: /Exhibitor/ })).not.toBeInTheDocument();
    expect(screen.getByText('Always assigned')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
  });

  it('disables choices that cannot change anything', () => {
    renderPanel();
    // Nobody is a Steward, so there is nothing to remove.
    expect(choice('Steward', 'Remove')).toBeDisabled();
    expect(choice('Steward', 'Add')).toBeEnabled();
  });

  it('states the plan and submits remove-then-add steps', async () => {
    const onSubmit = renderPanel();
    await userEvent.click(choice('Judge', 'Remove'));
    await userEvent.click(choice('Steward', 'Add'));

    const summary = screen.getByRole('region', { name: 'What will happen' });
    expect(summary).toHaveTextContent('Remove Judge from Daniel Reyes');
    expect(summary).toHaveTextContent('Add Steward to 2 people');

    await userEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(onSubmit).toHaveBeenCalledWith([
      { mode: 'remove', roleNames: ['judge'], clubIds: [] },
      { mode: 'add', roleNames: ['steward'], clubIds: [] },
    ]);
  });

  it('asks for a club before a club-scoped change can apply', async () => {
    renderPanel();
    await userEvent.click(choice('Secretary', 'Add'));
    expect(screen.getByText('Choose at least one club to continue.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
    expect(await screen.findByRole('combobox', { name: 'Add a club' })).toBeInTheDocument();
  });
});
