/**
 * MYK9-664, owner decision (a)+(b): a show manager can SET a mail-in junior
 * handler's date of birth and junior numbers from the person editor, but never
 * sees the stored value. Rendered from a person that DOES carry values, through
 * the real `userToFormData`, so a regression that seeds the form from the
 * person shows up as a filled input here (LESSON last-hop-drop).
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';
import { BasicInfoTab } from './BasicInfoTab';
import { EditPanelContext, type EditPanelContextValue } from './useEditPanel';
import { userToFormData } from './UserEditPanel.helpers';

function renderEditorFor(person: Parameters<typeof userToFormData>[0]) {
  const context = {
    data: userToFormData(person),
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

describe('person editor: junior handler fields are write-only', () => {
  beforeEach(() => {
    mockSupabase.rpc.mockImplementation(
      () => createChainableQuery() as unknown as ReturnType<typeof createChainableQuery>
    );
  });

  it('shows a date of birth input with no current value, even when one is stored', () => {
    renderEditorFor({
      id: 'person-1',
      firstName: 'Chris',
      lastName: 'Kid',
      roles: [],
      dateOfBirth: '2012-04-02',
      juniorHandlerNumbers: { AKC: 'KID-NUMBER' },
    });

    const dob = screen.getByLabelText('Date of birth') as HTMLInputElement;
    expect(dob.value).toBe('');
    expect(screen.queryByDisplayValue('2012-04-02')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('KID-NUMBER')).not.toBeInTheDocument();
  });

  it('says in plain words that the saved date is hidden and blank keeps it', () => {
    renderEditorFor({ id: 'person-1', firstName: 'Chris', lastName: 'Kid', roles: [] });

    const dob = screen.getByLabelText('Date of birth');
    const hint = document.getElementById(dob.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toMatch(/a saved date of birth is never shown here/i);
    expect(hint?.textContent).toMatch(/leave it blank to keep what's on file/i);
    expect(screen.getByLabelText('AKC junior handler number')).toHaveAttribute(
      'placeholder',
      "Leave blank to keep what's on file"
    );
  });
});
