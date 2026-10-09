import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { NetworkStatusContext } from '@/hooks/useNetworkStatus';
import { BasicInfoTab } from './BasicInfoTab';
import { EditPanelContext, type EditPanelContextValue } from './useEditPanel';
import type { UserFormData } from './UserEditPanel.types';

/**
 * MYK9-1071 (D2): offline, the person editor still saves everything through the
 * queue except the email, which only changes online. The field says so and is
 * read-only, so nobody types a change that would be refused on save.
 */
const formData = {
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
  judgeQualifications: [],
  roles: [],
} as UserFormData;

function renderTab(isOnline: boolean) {
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
    <NetworkStatusContext.Provider
      value={{ isOnline, quality: null, showOfflineMessage: !isOnline, retryConnection: () => {} }}
    >
      <EditPanelContext.Provider value={context}>
        <BasicInfoTab
          personId="person-1"
          hasAdminPermission
          canEditAdvancedFields={false}
          onOpenPhotoModal={() => {}}
        />
      </EditPanelContext.Provider>
    </NetworkStatusContext.Provider>
  );
}

describe('BasicInfoTab email while offline (MYK9-1071)', () => {
  it('makes the email read-only and says it changes only online', () => {
    renderTab(false);
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('readonly');
    expect(screen.getByText(/can only be changed while online/i)).toBeInTheDocument();
    // The rest of the form stays editable.
    expect(screen.getByLabelText(/first name/i)).not.toHaveAttribute('readonly');
  });

  it('says nothing about connectivity while online', () => {
    renderTab(true);
    expect(screen.queryByText(/can only be changed while online/i)).not.toBeInTheDocument();
  });
});
