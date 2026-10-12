import React, { useMemo, type MutableRefObject } from 'react';
import { DogEditPanel } from '@/components/panels/edit/DogEditPanel';
import { UserEditPanel } from '@/components/panels/edit/UserEditPanel';
import { PanelSaveHandledError } from '@/components/panels/edit/panelSaveErrors';
import { convertDogToDogInput } from '@/components/dogs/DogDetailsMain/utils';
import { buildUserEditSavePayload } from '@/components/users/UserDetails/userEditSavePayload';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useUpdateUserMutation } from '@/hooks/queries/useUsersQuery';
import { UserRole } from '@/types/auth-types';
import type { Dog, User } from '@/types/dog-types';
import type { User as PersonRecord } from '@/types/user-types';

interface EditFormProps<T> {
  /** The record as the flow holds it: saved already, with its real id. */
  record: T;
  /** The saved result, to replace the flow's copy (same id). Not called on a refused save. */
  onSaved: (saved: T) => void;
  onClose: () => void;
  closeRequestRef: MutableRefObject<(() => void) | null>;
}

/**
 * Quick Create's Edit on a dog already saved (MYK9-1112): the SAME Edit Dog
 * panel the dog page uses, inline in the one slide-out, saving through the same
 * `updateDog` against the dog's own id. Never the create form: the dog stays in
 * the flow's selection through Cancel and through a refused save.
 */
export const QuickCreateDogEdit: React.FC<EditFormProps<Dog>> = ({
  record: dog,
  onSaved,
  onClose,
  closeRequestRef,
}) => {
  const { updateDog } = useDogStoreCompat();

  const handleSave = async (data: Partial<Dog>) => {
    const saved = await updateDog(dog.id, convertDogToDogInput(data, dog));
    // updateDog has already told the user why (the dog is not on this device yet).
    if (!saved) throw new PanelSaveHandledError();
    // updateDog builds its returned registrations from data already in memory, which
    // for a dog made in this flow is stale or empty, so the flow keeps its own copy
    // unless the form edited them.
    onSaved({ ...dog, ...saved, registrations: data.registrations ?? dog.registrations });
  };

  return (
    <DogEditPanel
      open
      onClose={onClose}
      dogId={dog.id}
      dogName={dog.callName || dog.name}
      initialDogData={dog}
      onSave={handleSave}
      variant="inline"
      closeRequestRef={closeRequestRef}
    />
  );
};

/**
 * Quick Create's Edit Details on a person already saved (MYK9-1112): the same
 * Edit Person panel the People page uses, saving through the same update against
 * the person's own id. Editing an existing person needs a connection (owner
 * decision D6, MYK9-1090): a person whose create is still queued has no server
 * row to update yet, so the save is refused and the panel stays open.
 */
export const QuickCreatePersonEdit: React.FC<EditFormProps<User>> = ({
  record: exhibitor,
  onSaved,
  onClose,
  closeRequestRef,
}) => {
  const updateUser = useUpdateUserMutation();

  // Stable: the panel resets its form whenever this changes.
  const initialUserData = useMemo<Partial<PersonRecord>>(
    () => ({
      firstName: exhibitor.firstName,
      lastName: exhibitor.lastName,
      email: exhibitor.email,
      phone: exhibitor.phone,
      address: exhibitor.streetAddress ?? '',
      city: exhibitor.city ?? '',
      state: exhibitor.state ?? '',
      zipCode: exhibitor.zipCode ?? '',
      roles: [UserRole.EXHIBITOR],
    }),
    [exhibitor]
  );

  const handleSave = async (data: Partial<PersonRecord>) => {
    await updateUser.mutateAsync({ id: exhibitor.id, updates: buildUserEditSavePayload(data) });
    onSaved({
      ...exhibitor,
      firstName: data.firstName ?? exhibitor.firstName,
      lastName: data.lastName ?? exhibitor.lastName,
      email: data.email ?? exhibitor.email,
      phone: data.phone ?? exhibitor.phone,
      streetAddress: data.address || undefined,
      city: data.city || undefined,
      state: data.state || undefined,
      zipCode: data.zipCode || undefined,
    });
  };

  return (
    <UserEditPanel
      open
      onClose={onClose}
      userId={exhibitor.id}
      userName={`${exhibitor.firstName} ${exhibitor.lastName}`}
      initialUserData={initialUserData}
      onSave={handleSave}
      variant="inline"
      closeRequestRef={closeRequestRef}
    />
  );
};
