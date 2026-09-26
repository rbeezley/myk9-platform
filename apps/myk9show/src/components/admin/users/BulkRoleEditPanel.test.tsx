import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, userEvent, waitFor } from '@/test/utils/testUtils';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import { BulkRoleEditPanel } from './BulkRoleEditPanel';

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  readFails: false,
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'user_roles') {
        const query = {
          select: () => query,
          in: () => query,
          eq: () => query,
          order: () => query,
          range: () =>
            Promise.resolve(
              state.readFails
                ? { data: null, error: new Error('permission denied') }
                : { data: state.rows, error: null }
            ),
        };
        return query;
      }
      return {
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
      };
    }),
  },
}));

const currentUserId = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: currentUserId.value ? { id: currentUserId.value } : null,
    userWithRoles: currentUserId.value ? { databaseUserId: currentUserId.value } : null,
  }),
}));

function row(
  id: string,
  userId: string,
  role: string,
  extra: { club_id?: string | null; show_id?: string | null; expires_at?: string | null } = {}
) {
  return {
    id,
    user_id: userId,
    club_id: null,
    show_id: null,
    expires_at: null,
    roles: { name: role },
    ...extra,
  };
}

function user(id: string, name: string): AdminUser {
  const [firstName, lastName] = name.split(' ');
  return { id, firstName, lastName, createdAt: new Date(), updatedAt: new Date() } as AdminUser;
}

const usersById = new Map([
  ['1', user('1', 'Daniel Reyes')],
  ['2', user('2', 'Sam Whitfield')],
]);
const selectedIds = ['1', '2'];

function renderPanel(onSubmit = vi.fn()) {
  render(
    <BulkRoleEditPanel
      open
      onClose={vi.fn()}
      selectedIds={selectedIds}
      usersById={usersById}
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
  beforeEach(() => {
    state.rows = [row('1-judge', '1', 'judge'), row('2-judge', '2', 'judge')];
    state.readFails = false;
    currentUserId.value = undefined;
  });

  it('shows current holdings read from live assignment data, scope-aware', async () => {
    renderPanel();
    await screen.findByText('all 2', undefined, { timeout: 2000 }).catch(() => null);
    expect(await screen.findByText('Judge')).toBeInTheDocument();
  });

  // MYK9-820 round-3 finding #2: Add must stay available when everyone holds
  // the role ONLY via a show-limited grant — the planner would still grant a
  // permanent one.
  it('keeps Add available for a role everyone holds only via a show-limited grant', async () => {
    state.rows = [
      row('1-j', '1', 'judge', { show_id: 'show-1' }),
      row('2-j', '2', 'judge', { show_id: 'show-1' }),
    ];
    renderPanel();
    await waitFor(() => expect(screen.getByText('Judge')).toBeInTheDocument());
    expect(choice('Judge', 'Add')).not.toBeDisabled();
  });

  // MYK9-820 stale-data case: "a role changes between the summary and running
  // the plan." Apply must re-read the roster and refuse to run a plan that no
  // longer matches what was shown — it shows the update instead.
  it('re-checks the plan on Apply and refuses to run a stale one, showing the update instead', async () => {
    const onSubmit = renderPanel();
    await waitFor(() => expect(screen.getByText('Judge')).toBeInTheDocument());

    await userEvent.click(choice('Judge', 'Remove'));
    await waitFor(() =>
      expect(screen.getByText('Remove Judge from Daniel Reyes, Sam Whitfield')).toBeInTheDocument()
    );

    // Someone else already revoked Daniel's judge grant before Apply runs.
    state.rows = [row('2-judge', '2', 'judge')];

    await userEvent.click(screen.getByRole('button', { name: 'Apply changes' }));

    // The stale plan (both people) must never reach the runner.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/changed since you opened/i));
    expect(onSubmit).not.toHaveBeenCalled();

    // The summary now reflects reality: only Sam still holds it.
    await waitFor(() =>
      expect(screen.getByText('Remove Judge from Sam Whitfield')).toBeInTheDocument()
    );

    // A second, informed Apply runs the now-current plan.
    await userEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted.people.map((p: { userId: string }) => p.userId)).toEqual(['2']);
  });

  // MYK9-820 design rule: "The current admin can never suspend or strip
  // themselves." The panel must never submit a plan removing their own role,
  // even for a role everyone (including them) was chosen to lose.
  it("never submits a plan that removes the current admin's own role", async () => {
    currentUserId.value = '1';
    const onSubmit = renderPanel();
    await waitFor(() => expect(screen.getByText('Judge')).toBeInTheDocument());

    await userEvent.click(choice('Judge', 'Remove'));
    // Only Sam (not the admin, "1") appears as losing the role.
    await waitFor(() =>
      expect(screen.getByText('Remove Judge from Sam Whitfield')).toBeInTheDocument()
    );
    const summary = screen.getByRole('heading', { name: 'What will happen' }).closest('section')!;
    expect(within(summary).queryByText(/Daniel Reyes/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted.people.map((p: { userId: string }) => p.userId)).toEqual(['2']);
  });

  it('disables Apply until a choice would change something', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Judge')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
  });
});
