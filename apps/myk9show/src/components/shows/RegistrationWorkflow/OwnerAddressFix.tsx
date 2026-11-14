import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Plus } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RegistrationFix } from './ownerAddressPrerequisite';

/** The profile section where an exhibitor edits their own address. */
export const OWN_ADDRESS_HREF = '/account?section=profile';

/**
 * The fix offered under a blocked class card (MYK9-1010): add the missing
 * registration, or add the owner's address. The address fix is built by the
 * step (a profile link for the exhibitor, the fill-blanks dialog for staff).
 */
export const RegistrationFixAction: React.FC<{
  fix: RegistrationFix | undefined;
  onAddRegistration?: (() => void) | undefined;
  ownerAddressAction?: React.ReactNode;
  /** MYK9-1963: the way on when the dog has no number yet; rides under the registration fix. */
  registrationHelp?: React.ReactNode;
}> = ({ fix, onAddRegistration, ownerAddressAction, registrationHelp }) => {
  if (fix === 'owner-address') return <>{ownerAddressAction ?? null}</>;
  if (!onAddRegistration) return null;
  return (
    <>
      <Button type="button" variant="outline" size="touch" onClick={onAddRegistration}>
        <Plus className="mr-2 h-4 w-4" />
        Add required registration
      </Button>
      {registrationHelp && (
        <div className="basis-full text-sm text-foreground">{registrationHelp}</div>
      )}
    </>
  );
};

/**
 * Exhibitor: a link to their own profile (the dog list refreshes after the
 * profile saves). Staff: opens `OwnerAddressFillDialog`, which fills only the
 * missing parts through the show-scoped RPC.
 */
export const OwnerAddressAction: React.FC<{
  isOwnAddress: boolean;
  onEditOwner: () => void;
}> = ({ isOwnAddress, onEditOwner }) =>
  isOwnAddress ? (
    <Link
      to={OWN_ADDRESS_HREF}
      target="_blank"
      rel="noopener noreferrer"
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
