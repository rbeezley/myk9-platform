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
  judgeQualifications: [],
  roles: [],
};

/**
 * The tab reads two tables: `user_roles` for the role chips and `people` for
 * the sign-in linkage. Route by table so a change to one query cannot silently
 * satisfy the other's assertion.
 */
function mockPerson(person: Record<string, unknown> | null) {
  mockSupabase.from.mockImplementation((table: string) =>
    createChainableQuery(
      table === 'people' ? { data: person, error: null } : { data: [], error: null }
    )
  );
}

function renderTab(personId: string | undefined = 'person-1') {
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
        hasAdminPermission={false}
        canEditAdvancedFields={false}
        onOpenPhotoModal={() => {}}
      />
    </EditPanelContext.Provider>
  );
}

// MYK9-136: the contact email and the sign-in email are the same value, and
// nothing in this panel can change the latter, so offering to edit it here
// only ever produces two addresses that disagree. The self-service profile and
// account pages have always shown the sign-in address read-only; this brings
// the admin panel in line with them.
//
// The linkage is read here rather than passed in because the admin roster's
// `get_admin_user_list` RPC does not return `auth_user_id` — a passed-down
// flag would be false for every linked user on the main user-management page.
describe('BasicInfoTab sign-in email', () => {
  beforeEach(() => {
    mockSupabase.from.mockClear();
  });

  it('locks the email field for a person who can sign in', async () => {
    mockPerson({ auth_user_id: 'auth-1', email: 'ada@example.com' });

    renderTab();

    await waitFor(() =>
      expect(screen.getByLabelText(/email address/i)).toHaveAttribute('readonly')
    );
    expect(screen.getByLabelText(/email address/i)).toHaveValue('ada@example.com');
  });

  it('explains why the field is locked', async () => {
    mockPerson({ auth_user_id: 'auth-1', email: 'ada@example.com' });

    renderTab();

    expect(await screen.findByText(/address they sign in with/i)).toBeInTheDocument();
  });

  it('leaves the email editable for a person with no sign-in account', async () => {
    mockPerson({ auth_user_id: null, email: 'ada@example.com' });

    renderTab();

    await waitFor(() => expect(mockSupabase.from).toHaveBeenCalledWith('people'));
    expect(screen.getByLabelText(/email address/i)).not.toHaveAttribute('readonly');
  });

  // Unknown must read as editable, not locked: the refusal lives in
  // `updateUser`, which fails closed, so an unreadable linkage costs a clearer
  // affordance — never a lost edit for someone who has no account at all.
  it('leaves the email editable when the linkage cannot be read', async () => {
    mockPerson(null);

    renderTab();

    await waitFor(() => expect(mockSupabase.from).toHaveBeenCalledWith('people'));
    expect(screen.getByLabelText(/email address/i)).not.toHaveAttribute('readonly');
  });

  // Create mode has no person to look up, and an email must be typeable — the
  // linked mock below would lock the field if the lookup ran regardless of
  // there being no id to look up. (A `from('people')` call-spy could not prove
  // this: the shared render wrapper's auth provider queries that table too, so
  // the call is not attributable to this component.)
  it('leaves the email editable in create mode', async () => {
    mockPerson({ auth_user_id: 'auth-1', email: 'ada@example.com' });

    renderTab(undefined);

    await waitFor(() => expect(screen.getByLabelText(/email address/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/email address/i)).not.toHaveAttribute('readonly');
  });
});
