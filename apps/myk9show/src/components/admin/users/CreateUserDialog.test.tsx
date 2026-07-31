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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  rbacService: { ensureUserHasRole: vi.fn().mockResolvedValue(undefined) },
}));

const CREATED_USER = { id: 'person-1', first_name: 'Pat', last_name: 'Secretary' };

let mutateAsync: ReturnType<typeof vi.fn>;

function renderDialog(onUserCreated = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const { container } = render(
    <QueryClientProvider client={client}>
      <CreateUserDialog open onOpenChange={onOpenChange} onUserCreated={onUserCreated} />
    </QueryClientProvider>
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
    fireEvent.click(await screen.findByRole('checkbox', { name: /secretary/i }));
    submit();

    await waitFor(() => {
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
        'admin-invite-user',
        expect.objectContaining({
          body: expect.objectContaining({ roleLabels: ['exhibitor', 'secretary'] }),
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
