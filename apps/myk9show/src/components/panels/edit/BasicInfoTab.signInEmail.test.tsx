import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { render } from '@/test/utils/testUtils';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';
import { BasicInfoTab } from './BasicInfoTab';
import { EditPanelContext, type EditPanelContextValue } from './useEditPanel';
import type { UserFormData } from './UserEditPanel.types';

const formData: UserFormData = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  dateOfBirth: '',
  juniorHandlerNumbers: {},
  juniorHandlerFieldsLoaded: true,
  judgeQualifications: [],
  roles: [],
};

const SITE_ADMIN_ONLY_NOTE =
  /only a site admin can change this email once the person has entries or a sign-in account/i;

/**
 * The editor reads the lock facts through one RPC, `person_email_lock_facts`,
 * which returns the database's own snake_case payload (or NULL). Route by
 * function name so an unrelated RPC cannot satisfy the assertion.
 */
function mockLockFacts(facts: Record<string, boolean> | null, error: unknown = null) {
  mockSupabase.rpc.mockImplementation((fn: string) =>
    fn === 'person_email_lock_facts'
      ? (Promise.resolve({ data: facts, error }) as unknown as ReturnType<
          typeof createChainableQuery
        >)
      : createChainableQuery()
  );
}

function tabUi(personId: string, isSiteAdmin: boolean) {
  const context = {
    data: formData,
    updateData: () => {},
    setData: () => {},
    hasChanges: false,
    isValid: true,
    errors: [],
    isLoading: false,
    setIsLoading: () => {},
  } as unknown as EditPanelContextValue;

  return (
    <EditPanelContext.Provider value={context}>
      <BasicInfoTab
        personId={personId}
        hasAdminPermission={isSiteAdmin}
        canEditAdvancedFields={false}
        onOpenPhotoModal={() => {}}
      />
    </EditPanelContext.Provider>
  );
}

function renderTab(
  options: { personId?: string; isSiteAdmin?: boolean; queryClient?: QueryClient } = {}
) {
  const { personId = 'person-1', isSiteAdmin = false, queryClient } = options;
  return render(tabUi(personId, isSiteAdmin), queryClient ? { queryClient } : undefined);
}

/**
 * The app's real query defaults that matter here (lib/queryClient.ts): a
 * five-minute staleTime, refetch-on-mount only when stale, and the global
 * `placeholderData: prev => prev` that hands a query its previous key's data
 * (MYK9-709). The shared test client disables all of that, so it could not
 * show a stale lock.
 */
function appLikeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 5 * 60 * 1000,
        refetchOnMount: true,
        refetchOnWindowFocus: false,
        placeholderData: (previous: unknown) => previous,
      },
    },
  });
}

/** Facts per person id; a value of `'pending'` never resolves. */
function mockLockFactsByPerson(byPerson: Record<string, Record<string, boolean> | 'pending'>) {
  mockSupabase.rpc.mockImplementation((fn: string, args?: Record<string, unknown>) => {
    if (fn !== 'person_email_lock_facts') return createChainableQuery();
    const facts = byPerson[String(args?.p_person_id)];
    const result =
      facts === 'pending'
        ? new Promise(() => {})
        : Promise.resolve({ data: facts ?? null, error: null });
    return result as unknown as ReturnType<typeof createChainableQuery>;
  });
}

const emailInput = () => screen.getByLabelText(/email address/i);

const lockRpcCalled = () =>
  waitFor(() =>
    expect(mockSupabase.rpc).toHaveBeenCalledWith('person_email_lock_facts', {
      p_person_id: 'person-1',
    })
  );

// MYK9-136: a signed-in person's contact email IS their sign-in address, and
// nothing in this panel can change the latter, so it is read-only for everyone.
// MYK9-710: once a person has entries or roles, the database refuses any
// non-site-admin email change, so the editor must not offer one.
describe('BasicInfoTab email lock', () => {
  beforeEach(() => {
    mockSupabase.rpc.mockClear();
  });

  it('locks the email field for a person who can sign in', async () => {
    mockLockFacts({ has_sign_in: true, has_roles: true, has_entries: false });

    renderTab();

    expect(await screen.findByText(/address they sign in with/i)).toBeInTheDocument();
    expect(emailInput()).toHaveAttribute('readonly');
    expect(emailInput()).toHaveValue('ada@example.com');
  });

  it('keeps a signed-in person locked for a site admin too', async () => {
    mockLockFacts({ has_sign_in: true, has_roles: true, has_entries: true });

    renderTab({ isSiteAdmin: true });

    expect(await screen.findByText(/address they sign in with/i)).toBeInTheDocument();
    expect(emailInput()).toHaveAttribute('readonly');
  });

  it('locks the email for a secretary editing a mail-in person with entries', async () => {
    mockLockFacts({ has_sign_in: false, has_roles: false, has_entries: true });

    renderTab();

    expect(await screen.findByText(SITE_ADMIN_ONLY_NOTE)).toBeInTheDocument();
    expect(emailInput()).toHaveAttribute('readonly');
  });

  it('locks the email for a secretary editing a person who holds roles', async () => {
    mockLockFacts({ has_sign_in: false, has_roles: true, has_entries: false });

    renderTab();

    expect(await screen.findByText(SITE_ADMIN_ONLY_NOTE)).toBeInTheDocument();
    expect(emailInput()).toHaveAttribute('readonly');
  });

  it('leaves the email editable for a site admin editing a mail-in person with entries', async () => {
    mockLockFacts({ has_sign_in: false, has_roles: false, has_entries: true });

    renderTab({ isSiteAdmin: true });

    await lockRpcCalled();
    await waitFor(() => expect(emailInput()).not.toHaveAttribute('readonly'));
    expect(screen.queryByText(SITE_ADMIN_ONLY_NOTE)).not.toBeInTheDocument();
  });

  it('leaves the email editable for a mail-in person with no entries or roles', async () => {
    mockLockFacts({ has_sign_in: false, has_roles: false, has_entries: false });

    renderTab();

    await lockRpcCalled();
    await waitFor(() => expect(emailInput()).not.toHaveAttribute('readonly'));
  });

  // Unknown reads as editable, not locked: the database refuses the save and
  // the editor reports the refusal, so an unreadable lock costs a clearer
  // affordance, never a lost edit for someone who is not locked at all.
  it('leaves the email editable when the lock facts cannot be read', async () => {
    mockLockFacts(null, { message: 'boom' });

    renderTab();

    await lockRpcCalled();
    await waitFor(() => expect(emailInput()).not.toHaveAttribute('readonly'));
  });

  // Codex P2 on #2402: the lock facts were cached for 30s, so an entry or role
  // added between two opens of the editor left the email editable, and the
  // database refused the save. Every open must read fresh, and must not show
  // the cached answer while it does.
  it("re-reads the lock on every open, never showing the previous open's facts", async () => {
    const queryClient = appLikeQueryClient();
    mockLockFacts({ has_sign_in: false, has_roles: false, has_entries: false });

    const first = renderTab({ queryClient });
    await lockRpcCalled();
    await waitFor(() => expect(emailInput()).not.toHaveAttribute('readonly'));
    first.unmount();

    // An entry is added for this person, then the editor is reopened at once.
    mockLockFacts({ has_sign_in: false, has_roles: false, has_entries: true });
    renderTab({ queryClient });

    expect(emailInput()).toHaveAttribute('readonly');
    await waitFor(() => expect(screen.getByText(SITE_ADMIN_ONLY_NOTE)).toBeInTheDocument());
    expect(emailInput()).toHaveAttribute('readonly');
  });

  it("never renders one person's lock facts for the next person", async () => {
    const queryClient = appLikeQueryClient();
    mockLockFactsByPerson({
      'person-a': { has_sign_in: false, has_roles: false, has_entries: false },
      'person-b': 'pending',
    });

    const view = renderTab({ personId: 'person-a', queryClient });
    await waitFor(() =>
      expect(mockSupabase.rpc).toHaveBeenCalledWith('person_email_lock_facts', {
        p_person_id: 'person-a',
      })
    );
    await waitFor(() => expect(emailInput()).not.toHaveAttribute('readonly'));

    // Person B's facts are still in flight: A's "editable" must not show for B.
    view.rerender(tabUi('person-b', false));
    await waitFor(() =>
      expect(mockSupabase.rpc).toHaveBeenCalledWith('person_email_lock_facts', {
        p_person_id: 'person-b',
      })
    );
    expect(emailInput()).toHaveAttribute('readonly');
    expect(screen.queryByText(SITE_ADMIN_ONLY_NOTE)).not.toBeInTheDocument();
  });

  // Create mode has no person to look up, and an email must be typeable.
  it('leaves the email editable in create mode', async () => {
    mockLockFacts({ has_sign_in: true, has_roles: true, has_entries: true });

    renderTab({ personId: '' });

    await waitFor(() => expect(emailInput()).toBeInTheDocument());
    expect(emailInput()).not.toHaveAttribute('readonly');
    expect(mockSupabase.rpc).not.toHaveBeenCalledWith('person_email_lock_facts', expect.anything());
  });
});
