import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { BasicInfoTab } from './BasicInfoTab';
import { EditPanelContext, type EditPanelContextValue } from './useEditPanel';

/**
 * MYK9-1973: the User Management reference link opens in a new tab, so a person
 * editor opened from another flow stays intact. MYK9-2020: the entry wizard's
 * Add Person leaves the note out altogether.
 */
const context = {
  data: {
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
  },
  updateData: () => {},
  setData: () => {},
  hasChanges: false,
  isValid: true,
  errors: [],
  isLoading: false,
  setIsLoading: () => {},
} as unknown as EditPanelContextValue;

describe('BasicInfoTab User Management link', () => {
  it('opens in a new tab', () => {
    render(
      <EditPanelContext.Provider value={context}>
        <BasicInfoTab
          hasAdminPermission={false}
          canEditAdvancedFields={false}
          onOpenPhotoModal={() => {}}
        />
      </EditPanelContext.Provider>
    );

    const link = screen.getByRole('link', { name: 'User Management' });
    expect(link).toHaveAttribute('href', '/admin/users');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('is left out when the entry flow asks (MYK9-2020)', () => {
    render(
      <EditPanelContext.Provider value={context}>
        <BasicInfoTab
          hasAdminPermission={false}
          canEditAdvancedFields={false}
          onOpenPhotoModal={() => {}}
          hideRoleAssignmentNote
        />
      </EditPanelContext.Provider>
    );

    expect(screen.getByLabelText(/First Name/i)).toBeInTheDocument();
    expect(screen.queryByText(/Role assignments are managed/)).not.toBeInTheDocument();
  });
});
