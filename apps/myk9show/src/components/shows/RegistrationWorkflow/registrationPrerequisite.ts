import type { Registration } from '@/types/dog-types';
import { resolveDogIdentityForOrganization } from '@/features/dogs/identity';

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

function isProvenConformationPuppyClass(
  trialType: string | null | undefined,
  className: string | null | undefined,
  element: string | null | undefined,
  level: string | null | undefined
): boolean {
  const normalizedTrialType = trialType?.trim().toLowerCase() ?? '';
  if (!normalizedTrialType.includes('conformation')) return false;

  const classMetadata = [className, element, level]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return classMetadata.includes('puppy');
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
  if (isProvenConformationPuppyClass(trialType, className, element, level)) {
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
