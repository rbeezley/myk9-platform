import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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

function renderTab(options: { personId?: string; isSiteAdmin?: boolean } = {}) {
  const { personId = 'person-1', isSiteAdmin = false } = options;
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

  return render(
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

    await waitFor(() => expect(emailInput()).toHaveAttribute('readonly'));
    expect(emailInput()).toHaveValue('ada@example.com');
    expect(screen.getByText(/address they sign in with/i)).toBeInTheDocument();
  });

  it('keeps a signed-in person locked for a site admin too', async () => {
    mockLockFacts({ has_sign_in: true, has_roles: true, has_entries: true });

    renderTab({ isSiteAdmin: true });

    await waitFor(() => expect(emailInput()).toHaveAttribute('readonly'));
  });

  it('locks the email for a secretary editing a mail-in person with entries', async () => {
    mockLockFacts({ has_sign_in: false, has_roles: false, has_entries: true });

    renderTab();

    await waitFor(() => expect(emailInput()).toHaveAttribute('readonly'));
    expect(screen.getByText(SITE_ADMIN_ONLY_NOTE)).toBeInTheDocument();
  });

  it('locks the email for a secretary editing a person who holds roles', async () => {
    mockLockFacts({ has_sign_in: false, has_roles: true, has_entries: false });

    renderTab();

    await waitFor(() => expect(emailInput()).toHaveAttribute('readonly'));
    expect(screen.getByText(SITE_ADMIN_ONLY_NOTE)).toBeInTheDocument();
  });

  it('leaves the email editable for a site admin editing a mail-in person with entries', async () => {
    mockLockFacts({ has_sign_in: false, has_roles: false, has_entries: true });

    renderTab({ isSiteAdmin: true });

    await lockRpcCalled();
    expect(emailInput()).not.toHaveAttribute('readonly');
    expect(screen.queryByText(SITE_ADMIN_ONLY_NOTE)).not.toBeInTheDocument();
  });

  it('leaves the email editable for a mail-in person with no entries or roles', async () => {
    mockLockFacts({ has_sign_in: false, has_roles: false, has_entries: false });

    renderTab();

    await lockRpcCalled();
    expect(emailInput()).not.toHaveAttribute('readonly');
  });

  // Unknown reads as editable, not locked: the database refuses the save and
  // the editor reports the refusal, so an unreadable lock costs a clearer
  // affordance, never a lost edit for someone who is not locked at all.
  it('leaves the email editable when the lock facts cannot be read', async () => {
    mockLockFacts(null, { message: 'boom' });

    renderTab();

    await lockRpcCalled();
    expect(emailInput()).not.toHaveAttribute('readonly');
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
