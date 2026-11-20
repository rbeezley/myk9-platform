import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { BasicInfoTab } from './BasicInfoTab';
import { EditPanelContext, type EditPanelContextValue } from './useEditPanel';
import type { UserFormData } from './UserEditPanel.types';

const base: UserFormData = {
  firstName: 'Wiz',
  lastName: 'Judge',
  email: 'wiz@example.com',
  phone: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  dateOfBirth: '',
  juniorHandlerNumbers: {},
  judgeAffiliation: '',
  judgeQualifications: [],
  roles: [],
};

function renderTab(data: UserFormData) {
  const context = {
    data,
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
        hasAdminPermission={false}
        canEditAdvancedFields={false}
        onOpenPhotoModal={() => {}}
      />
    </EditPanelContext.Provider>
  );
}

describe('BasicInfoTab judge affiliation field (MYK9-2292)', () => {
  it('shows the field for a judge role', () => {
    renderTab({ ...base, roles: ['judge'] });
    expect(screen.getByLabelText(/affiliation/i)).toBeInTheDocument();
  });

  it('shows the field for a judge qualification without a judge role', () => {
    renderTab({
      ...base,
      judgeQualifications: [{ judgeNumber: '1' } as UserFormData['judgeQualifications'][number]],
    });
    expect(screen.getByLabelText(/affiliation/i)).toBeInTheDocument();
  });

  it('hides the field for a person with neither', () => {
    renderTab(base);
    expect(screen.queryByLabelText(/affiliation/i)).not.toBeInTheDocument();
  });
});
