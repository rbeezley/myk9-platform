import type { Registration } from '@/types/dog-types';
import {
  isConformationPuppyClass,
  resolveDogIdentityForOrganization,
} from '@/features/dogs/identity';

interface RegistrationPrerequisiteInput {
  registrations: readonly Registration[] | null | undefined;
  registryId: string | null | undefined;
  trialType: string | null | undefined;
  className: string | null | undefined;
  element: string | null | undefined;
  level: string | null | undefined;
}

export interface RegistrationPrerequisite {
  allowed: boolean;
  puppyException: boolean;
  message: string | null;
}

/**
 * Entry-time registration gate. Missing metadata fails closed: the puppy
 * exception applies only when both the sport and class name prove it applies.
 */
export function getRegistrationPrerequisite({
  registrations,
  registryId,
  trialType,
  className,
  element,
  level,
}: RegistrationPrerequisiteInput): RegistrationPrerequisite {
  if (isConformationPuppyClass({ trialType, className, element, level })) {
    return {
      allowed: true,
      puppyException: true,
      message: 'Puppy conformation classes may be entered before registration is complete.',
    };
  }

  const identity = resolveDogIdentityForOrganization(registrations, registryId);
  if (identity.registrationNumber) {
    return { allowed: true, puppyException: false, message: null };
  }

  const registryName = registryId?.trim() || 'the sanctioning organization';
  return {
    allowed: false,
    puppyException: false,
    message: `Add this dog's ${registryName} registration before selecting this class.`,
  };
}
