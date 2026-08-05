import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
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

function renderTab(hasSignInAccount: boolean) {
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
        personId="person-1"
        hasSignInAccount={hasSignInAccount}
        hasAdminPermission={false}
        canEditAdvancedFields={false}
        onOpenPhotoModal={() => {}}
      />
    </EditPanelContext.Provider>
  );
}

// MYK9-136: the contact email and the sign-in email are the same value, and
// nothing in this panel can change the latter — so offering to edit it here
// only ever produces two addresses that disagree. The self-service profile and
// account pages have always shown the sign-in address read-only; this brings
// the admin panel in line with them.
describe('BasicInfoTab sign-in email', () => {
  it('locks the email field for a person who can sign in', () => {
    renderTab(true);

    const email = screen.getByLabelText(/email address/i);
    expect(email).toHaveAttribute('readonly');
    expect(email).toHaveValue('ada@example.com');
  });

  it('explains why the field is locked', () => {
    renderTab(true);

    expect(screen.getByText(/address they sign in with/i)).toBeInTheDocument();
  });

  it('leaves the email editable for a person with no sign-in account', () => {
    renderTab(false);

    const email = screen.getByLabelText(/email address/i);
    expect(email).not.toHaveAttribute('readonly');
  });

  it('defaults to editable when the caller does not say', () => {
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

    render(
      <EditPanelContext.Provider value={context}>
        <BasicInfoTab
          personId="person-1"
          hasAdminPermission={false}
          canEditAdvancedFields={false}
          onOpenPhotoModal={() => {}}
        />
      </EditPanelContext.Provider>
    );

    expect(screen.getByLabelText(/email address/i)).not.toHaveAttribute('readonly');
  });
});
