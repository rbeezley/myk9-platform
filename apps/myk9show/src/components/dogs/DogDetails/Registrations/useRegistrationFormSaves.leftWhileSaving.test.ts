import { renderHook } from '@testing-library/react';
import { fromAny } from '@total-typescript/shoehorn';
import { beforeEach, describe, expect, it } from 'vitest';
import { useRegistrationsStore } from '@/store/registrationsStore';
import type { Registration } from '@/types/dog-types';
import { useRegistrationFormSaves, type RegistrationFormData } from './useRegistrationFormSaves';

/**
 * MYK9-1125: a registration save the person left ("Leave anyway") must not
 * reach into the shared dialog state when it lands: by then the person may have
 * opened another registration, and closing or deselecting it would be theirs.
 */
const data: RegistrationFormData = {
  organization: 'AKC',
  registeredName: 'Rex',
  breed: 'Beagle',
  variety: '',
  registrationNumber: 'SR1',
  status: 'active',
  registrationDate: '',
};
const succeed = (_vars: unknown, callbacks: { onSuccess: () => void }) => callbacks.onSuccess();
const other: Registration = fromAny({ id: 'reg-other' });

function saves() {
  return renderHook(() =>
    useRegistrationFormSaves(fromAny({ createRegistration: succeed, updateRegistration: succeed }))
  ).result.current;
}

const context = (current: boolean) => ({ isCurrent: () => current, runSelfNavigation: () => {} });

beforeEach(() => {
  useRegistrationsStore.setState({
    isAddRegistrationDialogOpen: true,
    isEditRegistrationDialogOpen: true,
    selectedRegistration: other,
  });
});

describe('registration saves after leaving the form (MYK9-1125)', () => {
  it('a left Add leaves the open Add dialog alone', async () => {
    await saves().handleAdd(data, context(false));
    expect(useRegistrationsStore.getState().isAddRegistrationDialogOpen).toBe(true);
  });

  it('a left Edit neither closes the Edit dialog nor drops the selection', async () => {
    await saves().handleUpdate({ ...data, id: 'reg-1' }, context(false));
    const state = useRegistrationsStore.getState();
    expect(state.isEditRegistrationDialogOpen).toBe(true);
    expect(state.selectedRegistration).toBe(other);
  });

  it('a save the person waited for still closes its dialog', async () => {
    await saves().handleAdd(data, context(true));
    await saves().handleUpdate({ ...data, id: 'reg-1' }, context(true));
    const state = useRegistrationsStore.getState();
    expect(state.isAddRegistrationDialogOpen).toBe(false);
    expect(state.isEditRegistrationDialogOpen).toBe(false);
    expect(state.selectedRegistration).toBeNull();
  });
});
