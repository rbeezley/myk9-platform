import type { Owner } from '@/types/dog-types';
import { getTrialRegistry } from '@/features/registries';
import { formatPartList, ownerAddressMissingParts } from '@/features/registration/ownerAddress';
import type { RegistrationPrerequisite } from './registrationPrerequisite';

interface OwnerAddressPrerequisiteInput {
  /** The dog's owner as read with the roster; undefined when it was not read. */
  owner: Owner | null | undefined;
  /** The trial's raw `registry_id`; blank means AKC (`getTrialRegistry`). */
  registryId: string | null | undefined;
  /** The exhibitor is entering their own dog, so the address is theirs. */
  isOwnAddress: boolean;
  /**
   * Staff taking a late entry at the desk: warn, never block. That entry is
   * written on the device and synced later, so a refusal at the ring is worse
   * than an address the catalog flags (MYK9-1009).
   */
  warnOnly: boolean;
}

export interface OwnerAddressPrerequisite {
  allowed: boolean;
  message: string | null;
}

const ALLOWED: OwnerAddressPrerequisite = { allowed: true, message: null };

/**
 * MYK9-1010, a sibling of `getRegistrationPrerequisite`: an AKC class needs the
 * owner's full address, because AKC prints it in the marked catalog. Only AKC
 * trials ask, and an owner the read did not return is unknown, never "missing"
 * (the server refuses the submission if it really is).
 */
export function getOwnerAddressPrerequisite({
  owner,
  registryId,
  isOwnAddress,
  warnOnly,
}: OwnerAddressPrerequisiteInput): OwnerAddressPrerequisite {
  if (!owner || getTrialRegistry({ registryId }).id !== 'AKC') return ALLOWED;
  const missing = ownerAddressMissingParts(owner);
  if (missing.length === 0) return ALLOWED;

  const parts = formatPartList(missing);
  if (warnOnly) {
    return {
      allowed: true,
      message: `The owner's address is missing its ${parts}. AKC prints it in the catalog, so add it when you can.`,
    };
  }
  const whose = isOwnAddress ? 'your' : "the owner's";
  return {
    allowed: false,
    message: `Add ${whose} ${parts} to enter AKC classes. AKC prints the owner's address in the catalog.`,
  };
}

/** Which fix the class card offers for its block. */
export type RegistrationFix = 'registration' | 'owner-address';

/**
 * The level fields for both prerequisites. A missing registration is fixed
 * first (it blocks every registry), then the address.
 */
export function prerequisiteLevelFields(
  registration: RegistrationPrerequisite,
  address: OwnerAddressPrerequisite
): {
  isRegistrationBlocked: boolean;
  registrationGuidance: string | null;
  registrationFix: RegistrationFix;
} {
  if (!registration.allowed) {
    return {
      isRegistrationBlocked: true,
      registrationGuidance: registration.message,
      registrationFix: 'registration',
    };
  }
  return {
    isRegistrationBlocked: !address.allowed,
    registrationGuidance: address.message ?? registration.message,
    registrationFix: 'owner-address',
  };
}
