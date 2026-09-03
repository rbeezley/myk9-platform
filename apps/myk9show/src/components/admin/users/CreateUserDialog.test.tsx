/**
 * Tests for CreateUserDialog — MYK9-131 / PRA-2026-07-31-01.
 *
 * WHY THIS FILE EXISTS. The bug shipped because
 * `UserManagementPage.test.tsx` mocks this component to `null`, so the page
 * suite passed 8/8 while "Create User" produced an account nobody could log in
 * to. Every test below renders the REAL dialog; a mock here would recreate the
 * exact blind spot the finding is about.
 *
 * The load-bearing assertion is not "invite succeeds" but that the operator is
 * never told something happened that did not.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { CreateUserDialog } from './CreateUserDialog';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';
import { useCreateUserMutation } from '@/hooks/queries/useUsersQuery';
import { rbacService } from '@/services/rbac/RBACService';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useCreateUserMutation: vi.fn(),
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: { clearAllCache: vi.fn(), ensureUserHasRole: vi.fn().mockResolvedValue(true) },
}));

const CREATED_USER = { id: 'person-1', first_name: 'Pat', last_name: 'Secretary' };

let mutateAsync: ReturnType<typeof vi.fn>;

function renderDialog(onUserCreated = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const { container } = render(
    <CreateUserDialog open onOpenChange={onOpenChange} onUserCreated={onUserCreated} />,
    { queryClient: client }
  );
  return { onOpenChange, onUserCreated, container };
}

/** Fill the minimum required fields: first, last, email (roles default to exhibitor). */
function fillRequired(email = 'new.secretary@example.test') {
  fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Pat' } });
  fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Secretary' } });
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: email } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /create/i }));
}

/** The one control with this label is the switch; the visible text repeats it. */
function inviteToggle() {
  return screen.getByRole('switch', { name: /send invitation email/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rbacService.ensureUserHasRole).mockReset().mockResolvedValue(true);
  mutateAsync = vi.fn().mockResolvedValue(CREATED_USER);
  vi.mocked(useCreateUserMutation).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateUserMutation>);

  // The dialog reads the role list from the DB; without this the checkboxes
  // never render and a role-selection test would pass vacuously.
  mockSupabase.from.mockImplementation(() =>
    createChainableQuery({
      data: [
        { id: 'r1', name: 'exhibitor', description: 'Enters dogs in shows' },
        { id: 'r2', name: 'secretary', description: 'Runs the show' },
        { id: 'r3', name: 'judge', description: 'Judges dogs' },
        { id: 'r4', name: 'club_admin', description: null },
        { id: 'r5', name: 'trial_secretary', description: null },
        { id: 'r6', name: 'unknown_role', description: null },
      ],
      error: null,
    })
  );

  mockSupabase.functions.invoke.mockReset();
  mockSupabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('CreateUserDialog — the invitation actually happens', () => {
  it('invokes admin-invite-user after creating the person', async () => {
    renderDialog();
    fillRequired();
    submit();

    await waitFor(() => {
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('admin-invite-user', {
        body: {
          email: 'new.secretary@example.test',
          firstName: 'Pat',
          roleLabels: ['exhibitor'],
        },
      });
    });
  });

  it('creates the person before inviting, so handle_new_user can adopt the row', async () => {
    // Ordering is the correctness property: the people row must exist when the
    // auth user is created, or the trigger inserts a second, unlinked person.
    const order: string[] = [];
    mutateAsync.mockImplementation(async () => {
      order.push('create-person');
      return CREATED_USER;
    });
    mockSupabase.functions.invoke.mockImplementation(async () => {
      order.push('invite');
      return { data: { ok: true }, error: null };
    });

    renderDialog();
    fillRequired();
    submit();

    await waitFor(() => expect(order).toEqual(['create-person', 'invite']));
  });

  it('passes the selected roles so the invitation explains itself', async () => {
    renderDialog();
    fillRequired();
    fireEvent.click(await screen.findByRole('checkbox', { name: /^judge$/i }));
    submit();

    await waitFor(() => {
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
        'admin-invite-user',
        expect.objectContaining({
          body: expect.objectContaining({ roleLabels: ['exhibitor', 'judge'] }),
        })
      );
    });
  });

  it('assigns roles even though the auth identity does not exist yet', async () => {
    renderDialog();
    fillRequired();
    submit();

    await waitFor(() => {
      expect(rbacService.ensureUserHasRole).toHaveBeenCalledWith('person-1', 'exhibitor');
    });
  });

  it('reports success naming the invited address', async () => {
    renderDialog();
    fillRequired();
    submit();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('new.secretary@example.test')
      );
    });
  });

  it('distinguishes an address that already had an account', async () => {
    mockSupabase.functions.invoke.mockResolvedValue({
      data: { ok: true, outcome: 'reinvited' },
      error: null,
    });

    renderDialog();
    fillRequired();
    submit();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/already had an account/i));
    });
  });
});

describe('CreateUserDialog — never reports what did not happen', () => {
  it('does not invite when the operator turns the toggle off', async () => {
    const { onUserCreated } = renderDialog();
    fillRequired();
    fireEvent.click(inviteToggle());
    submit();

    await waitFor(() => expect(onUserCreated).toHaveBeenCalled());
    expect(mockSupabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('says plainly that a non-invited person cannot sign in', async () => {
    renderDialog();
    fillRequired();
    fireEvent.click(inviteToggle());
    submit();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/cannot sign in/i));
    });
  });

  it('warns in the form itself once the invitation is declined', () => {
    renderDialog();
    fireEvent.click(inviteToggle());

    expect(screen.getByText(/contact record only/i)).toBeInTheDocument();
  });

  it('reports a failed invitation as a failure, not a success', async () => {
    mockSupabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'email send failed' },
    });

    renderDialog();
    fillRequired();
    submit();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/could not be sent/i));
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('still reports the person was created when only delivery failed', async () => {
    // The operator must not re-create them — that would hit the unique index
    // and look like a different bug.
    mockSupabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });

    const { onUserCreated } = renderDialog();
    fillRequired();
    submit();

    await waitFor(() => expect(onUserCreated).toHaveBeenCalledWith(CREATED_USER));
  });

  it('does not invite when the person could not be created', async () => {
    mutateAsync.mockRejectedValue(new Error('insert failed'));

    renderDialog();
    fillRequired();
    submit();

    await waitFor(() => expect(screen.getByText(/failed to create user/i)).toBeInTheDocument());
    expect(mockSupabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('explains a duplicate email instead of a generic failure', async () => {
    mutateAsync.mockRejectedValue(new Error('duplicate key value violates unique constraint'));

    renderDialog();
    fillRequired();
    submit();

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });
  });
});

describe('CreateUserDialog — no dead inputs remain', () => {
  // Each of these was collected, validated, and silently discarded. They are
  // deleted rather than implemented; asserting their absence stops them being
  // reintroduced by a well-meaning revert.
  it('renders no password input at all', () => {
    const { container } = renderDialog();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByText(/auto-generate password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/custom password/i)).not.toBeInTheDocument();
  });

  it.each([/membership/i, /club affiliation/i])('does not render a %s control', pattern => {
    renderDialog();
    expect(screen.queryByText(pattern)).not.toBeInTheDocument();
  });

  it('persists street address and country, which the old handler dropped', async () => {
    renderDialog();
    fillRequired();
    fireEvent.change(screen.getByLabelText(/street address/i), {
      target: { value: '1 Ring Road' },
    });
    fireEvent.change(screen.getByLabelText(/country/i), { target: { value: 'USA' } });
    submit();

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ street_address: '1 Ring Road', country: 'USA' })
      );
    });
  });
});

// First reproduced against the original Secretary checkbox (both invite modes red).
// Secretary is now unavailable; Judge exercises the same rejection path.
describe('CreateUserDialog — role grant failures', () => {
  it.each([true, false])('reports rejected grants with invite=%s', async sendInvite => {
    vi.mocked(rbacService.ensureUserHasRole).mockImplementation(async (_id, role) => {
      if (role === 'judge') throw new Error('role grant failed');
      return true;
    });
    const { onUserCreated } = renderDialog();
    fillRequired();
    fireEvent.click(await screen.findByRole('checkbox', { name: /^judge$/i }));
    if (!sendInvite) fireEvent.click(inviteToggle());
    submit();

    await waitFor(() => expect(onUserCreated).toHaveBeenCalledWith(CREATED_USER));
    expect(rbacService.ensureUserHasRole).toHaveBeenCalledWith('person-1', 'judge');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/could not assign.*Judge.*Manage Roles/i)
    );
    if (sendInvite) {
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('admin-invite-user', {
        body: { email: 'new.secretary@example.test', firstName: 'Pat', roleLabels: ['exhibitor'] },
      });
    } else {
      expect(mockSupabase.functions.invoke).not.toHaveBeenCalled();
    }
  });
});

describe('CreateUserDialog — role checklist', () => {
  it('offers only manageable roles that do not require a club', async () => {
    renderDialog();
    await screen.findByRole('checkbox', { name: /^judge$/i });
    expect(
      screen.queryByRole('checkbox', { name: /secretary|club admin|unknown/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Assign Secretary and Club Admin roles/)).toBeInTheDocument();
  });

  it('never invents invitation roles when all grants fail', async () => {
    vi.mocked(rbacService.ensureUserHasRole).mockRejectedValue(new Error('grant failed'));
    const { onUserCreated } = renderDialog();
    fillRequired();
    submit();
    await waitFor(() => expect(onUserCreated).toHaveBeenCalled());
    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('admin-invite-user', {
      body: { email: 'new.secretary@example.test', firstName: 'Pat', roleLabels: [] },
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/could not assign.*Exhibitor/i));
  });
});

describe('CreateUserDialog — recovery', () => {
  it('reports both role and invitation failures without recreating the person', async () => {
    vi.mocked(rbacService.ensureUserHasRole).mockRejectedValue(new Error('grant failed'));
    mockSupabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'mail failed' },
    });
    const { onUserCreated } = renderDialog();
    fillRequired();
    submit();
    await waitFor(() => expect(onUserCreated).toHaveBeenCalledWith(CREATED_USER));
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(
        /could not assign.*Exhibitor.*invitation could not be sent.*Resend access.*Manage Roles/i
      )
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('disables submission until pending role grants finish', async () => {
    let finishGrant!: (granted: boolean) => void;
    vi.mocked(rbacService.ensureUserHasRole).mockReturnValue(
      new Promise(resolve => {
        finishGrant = resolve;
      })
    );
    const { onUserCreated } = renderDialog();
    fillRequired();
    submit();
    await waitFor(() => expect(rbacService.ensureUserHasRole).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled();
    submit();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    finishGrant(true);
    await waitFor(() => expect(onUserCreated).toHaveBeenCalled());
  });
});
