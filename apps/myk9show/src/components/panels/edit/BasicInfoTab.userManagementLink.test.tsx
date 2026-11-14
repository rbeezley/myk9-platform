import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { BasicInfoTab } from './BasicInfoTab';
import { EditPanelContext, type EditPanelContextValue } from './useEditPanel';

/**
 * MYK9-1973: this tab renders inside the entry wizard's person editor, so the
 * User Management reference link opens in a new tab and leaves the wizard intact.
 */
describe('BasicInfoTab User Management link', () => {
  it('opens in a new tab', () => {
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
});
