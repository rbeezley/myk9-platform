import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Plus } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { UserEditPanel } from '@/components/panels/edit/UserEditPanel';
import { useUpdateUserMutation, useUserQuery } from '@/hooks/queries/useUsersQuery';
import { buildUserEditSavePayload } from '@/components/users/UserDetails/userEditSavePayload';
import type { User as UserType } from '@/types/user-types';
import { cn } from '@/lib/utils';
import type { RegistrationFix } from './ownerAddressPrerequisite';

/** The profile section where an exhibitor edits their own address. */
export const OWN_ADDRESS_HREF = '/account?section=profile';

/**
 * The fix offered under a blocked class card (MYK9-1010): add the missing
 * registration, or add the owner's address. The address fix is built by the
 * step (a profile link for the exhibitor, the owner's edit panel for staff).
 */
export const RegistrationFixAction: React.FC<{
  fix: RegistrationFix | undefined;
  onAddRegistration?: (() => void) | undefined;
  ownerAddressAction?: React.ReactNode;
}> = ({ fix, onAddRegistration, ownerAddressAction }) => {
  if (fix === 'owner-address') return <>{ownerAddressAction ?? null}</>;
  if (!onAddRegistration) return null;
  return (
    <Button type="button" variant="outline" size="touch" onClick={onAddRegistration}>
      <Plus className="mr-2 h-4 w-4" />
      Add required registration
    </Button>
  );
};

/**
 * Exhibitor: a link to their own profile (the dog list refreshes after the
 * profile saves). Staff: opens the owner's person editor in place, as on
 * `/people/:id`.
 */
export const OwnerAddressAction: React.FC<{
  isOwnAddress: boolean;
  onEditOwner: () => void;
}> = ({ isOwnAddress, onEditOwner }) =>
  isOwnAddress ? (
    <Link
      to={OWN_ADDRESS_HREF}
      className={cn(buttonVariants({ variant: 'outline', size: 'touch' }), 'gap-2')}
    >
      <MapPin className="h-4 w-4" aria-hidden="true" />
      Add your address
    </Link>
  ) : (
    <Button type="button" variant="outline" size="touch" onClick={onEditOwner}>
      <MapPin className="mr-2 h-4 w-4" aria-hidden="true" />
      Add the owner&apos;s address
    </Button>
  );

/**
 * The owner's person editor, opened from the class step. Saves through the
 * same person update and payload as `/people/:id`, then lets the step refetch
 * the dogs so the class unblocks.
 */
export const OwnerAddressEditPanel: React.FC<{
  ownerId: string | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ ownerId, onClose, onSaved }) => {
  const { data: person } = useUserQuery(ownerId ?? '');
  const updateUser = useUpdateUserMutation();
  if (!ownerId || !person) return null;

  // EditPanelWrapper keeps the panel open and reports the error when this
  // throws, so a refused save propagates rather than closing silently.
  const save = async (userData: Partial<UserType>) => {
    await updateUser.mutateAsync({ id: ownerId, updates: buildUserEditSavePayload(userData) });
    onSaved();
  };

  return (
    <UserEditPanel
      open
      onClose={onClose}
      userId={ownerId}
      userName={`${person.firstName} ${person.lastName}`.trim()}
      initialUserData={person}
      onSave={save}
      enableAutoSave={false}
    />
  );
};
