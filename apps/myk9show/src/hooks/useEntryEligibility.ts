/**
 * Entry Eligibility Hook
 *
 * Validates whether a dog is eligible to enter a specific class.
 * Checks breed restrictions, height requirements, title requirements, and handler requirements.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import {
  resolveDogIdentityForOrganization,
  type DogRegistrationLike,
} from '@/features/dogs/identity';
import { getTrialRegistry } from '@/features/registries';

// Eligibility result for a single dog/class combination
export interface EligibilityResult {
  dogId: string;
  classId: string;
  isEligible: boolean;
  reasons: EligibilityReason[];
  warnings: EligibilityWarning[];
}

export interface EligibilityReason {
  code: EligibilityReasonCode;
  message: string;
  details?: string;
}

export interface EligibilityWarning {
  code: EligibilityWarningCode;
  message: string;
  details?: string;
}

export type EligibilityReasonCode =
  | 'BREED_RESTRICTED'
  | 'HEIGHT_INELIGIBLE'
  | 'TITLE_REQUIRED'
  | 'LEVEL_INELIGIBLE'
  | 'AGE_RESTRICTED'
  | 'HANDLER_REQUIRED'
  | 'ALREADY_ENTERED';

export type EligibilityWarningCode =
  | 'JUMP_HEIGHT_MISMATCH'
  | 'TITLE_EXPIRING'
  | 'HANDLER_NOT_ASSIGNED'
  | 'MISSING_REGISTRATION_NUMBER';

// Class requirements from database
interface ClassRequirements {
  classId: string;
  className: string;
  level: string | null;
  /** Sanctioning organization of this class's trial registry. */
  organization: string;
  breedRestrictions: string[];
  minHeightInches: number | null;
  maxHeightInches: number | null;
  requiredTitles: string[];
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  requiresHandler: boolean;
}

// Dog data for eligibility checking
interface DogData {
  id: string;
  name: string;
  callName: string | null;
  heightInches: number | null;
  dateOfBirth: string | null;
  titles: string[];
  /**
   * Raw registrations, NOT a pre-resolved breed/number. Eligibility is judged
   * per class against that class's sanctioning organization, so resolution has
   * to happen where the class is known.
   */
  registrations: DogRegistrationLike[];
}

interface UseEntryEligibilityOptions {
  showId: string;
  dogIds: string[];
  classIds: string[];
}

interface UseEntryEligibilityReturn {
  eligibility: Map<string, EligibilityResult>;
  isLoading: boolean;
  error: string | null;
  checkEligibility: (dogId: string, classId: string) => EligibilityResult | null;
  getEligibleClasses: (dogId: string) => string[];
  getIneligibleClasses: (dogId: string) => { classId: string; reasons: EligibilityReason[] }[];
}

export function useEntryEligibility({
  showId,
  dogIds,
  classIds,
}: UseEntryEligibilityOptions): UseEntryEligibilityReturn {
  // Fetch class requirements
  const { data: classRequirements, isLoading: loadingClasses } = useQuery({
    queryKey: ['class-requirements', showId, classIds],
    queryFn: async () => {
      if (!classIds.length) return [];

      const { data, error } = await supabase
        .from('classes')
        .select(
          `
          id,
          name,
          level,
          breed_restrictions,
          height_min,
          height_max,
          age_min,
          age_max,
          trial_id,
          trials(registry_id)
        `
        )
        .in('id', classIds);

      if (error) {
        logger.error('Failed to fetch class requirements', 'hooks', { error });
        return [];
      }

      return (data || []).map((c): ClassRequirements => ({
        classId: c.id,
        className: c.name || 'Unknown',
        level: c.level,
        // A show can mix registries across trials. Eligibility must be judged
        // against THIS class's sanctioning organization, not the dog's primary
        // registration — otherwise a dog whose primary is UKC gets its UKC breed
        // checked against an AKC class's restrictions (MYK9-90 review round 2).
        organization: getTrialRegistry((c.trials as { registry_id?: string | null } | null) ?? null)
          .id,
        breedRestrictions: c.breed_restrictions || [],
        minHeightInches: c.height_min,
        maxHeightInches: c.height_max,
        requiredTitles: [], // Not stored in classes table
        minAgeMonths: c.age_min,
        maxAgeMonths: c.age_max,
        requiresHandler: false, // Not stored in classes table
      }));
    },
    enabled: classIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch dog data
  const { data: dogsData, isLoading: loadingDogs } = useQuery({
    queryKey: ['dog-eligibility-data', dogIds],
    queryFn: async () => {
      if (!dogIds.length) return [];

      const { data, error } = await supabase
        .from('dogs')
        .select(
          `
          id,
          name,
          call_name,
          height,
          date_of_birth,
          registrations:dog_registrations(id, created_at, registration_number, organization, breed)
        `
        )
        .in('id', dogIds);

      if (error) {
        logger.error('Failed to fetch dog data for eligibility', 'hooks', { error });
        return [];
      }

      return (data || []).map((d): DogData => ({
        id: d.id,
        // MYK9-90 §5.2 — `dogs.name` is a nullable legacy alias; the call name
        // is the required identifier, so it leads here.
        name: d.call_name || d.name || 'Unknown',
        callName: d.call_name,
        heightInches: d.height ? parseFloat(d.height) : null,
        dateOfBirth: d.date_of_birth,
        titles: [], // Not stored in dogs table
        // Raw registrations, NOT a pre-resolved breed/number: eligibility is
        // judged per class against that class's registry, so resolution has to
        // happen where the class is known. The `registrations[0]` pick this
        // replaces had no ordering and no organization scoping, and `breed` was
        // read off `dogs.breed`, which this select no longer fetches.
        registrations: (d.registrations ?? []) as DogRegistrationLike[],
      }));
    },
    enabled: dogIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Calculate eligibility for all dog/class combinations
  const eligibility = useMemo(() => {
    const results = new Map<string, EligibilityResult>();

    if (!classRequirements?.length || !dogsData?.length) {
      return results;
    }

    for (const dog of dogsData) {
      for (const classReq of classRequirements) {
        const key = `${dog.id}-${classReq.classId}`;
        const result = validateEligibility(dog, classReq);
        results.set(key, result);
      }
    }

    return results;
  }, [classRequirements, dogsData]);

  const checkEligibility = (dogId: string, classId: string): EligibilityResult | null => {
    const key = `${dogId}-${classId}`;
    return eligibility.get(key) || null;
  };

  const getEligibleClasses = (dogId: string): string[] => {
    const eligible: string[] = [];
    eligibility.forEach((result, key) => {
      if (key.startsWith(`${dogId}-`) && result.isEligible) {
        eligible.push(result.classId);
      }
    });
    return eligible;
  };

  const getIneligibleClasses = (
    dogId: string
  ): { classId: string; reasons: EligibilityReason[] }[] => {
    const ineligible: { classId: string; reasons: EligibilityReason[] }[] = [];
    eligibility.forEach((result, key) => {
      if (key.startsWith(`${dogId}-`) && !result.isEligible) {
        ineligible.push({
          classId: result.classId,
          reasons: result.reasons,
        });
      }
    });
    return ineligible;
  };

  return {
    eligibility,
    isLoading: loadingClasses || loadingDogs,
    error: null,
    checkEligibility,
    getEligibleClasses,
    getIneligibleClasses,
  };
}

// Validate a single dog against a class's requirements
function validateEligibility(dog: DogData, classReq: ClassRequirements): EligibilityResult {
  const reasons: EligibilityReason[] = [];
  const warnings: EligibilityWarning[] = [];

  // Resolve the dog's identity against THIS class's sanctioning organization.
  // No cross-organization fallback: a UKC breed must not be judged against an
  // AKC class's restrictions, and holding a registration with some OTHER
  // organization must not suppress the missing-registration warning for this one.
  const identity = resolveDogIdentityForOrganization(dog.registrations, classReq.organization);

  // Check breed restrictions
  if (classReq.breedRestrictions.length > 0) {
    // A dog with no registration for this organization has no breed here, so it
    // cannot be shown to satisfy a restriction. Fail closed — the same outcome
    // the old `'Unknown'` placeholder produced, but without asserting a breed
    // the dog never had.
    const dogBreed = identity.breed;
    const isBreedAllowed =
      dogBreed != null &&
      classReq.breedRestrictions.some(br => dogBreed.toLowerCase().includes(br.toLowerCase()));
    if (!isBreedAllowed) {
      reasons.push({
        code: 'BREED_RESTRICTED',
        message: 'Breed not allowed in this class',
        details: `This class is restricted to: ${classReq.breedRestrictions.join(', ')}`,
      });
    }
  }

  // Check height requirements
  if (dog.heightInches !== null) {
    if (classReq.minHeightInches !== null && dog.heightInches < classReq.minHeightInches) {
      reasons.push({
        code: 'HEIGHT_INELIGIBLE',
        message: 'Dog does not meet minimum height requirement',
        details: `Minimum height: ${classReq.minHeightInches}" (Dog: ${dog.heightInches}")`,
      });
    }
    if (classReq.maxHeightInches !== null && dog.heightInches > classReq.maxHeightInches) {
      reasons.push({
        code: 'HEIGHT_INELIGIBLE',
        message: 'Dog exceeds maximum height requirement',
        details: `Maximum height: ${classReq.maxHeightInches}" (Dog: ${dog.heightInches}")`,
      });
    }
  } else if (classReq.minHeightInches !== null || classReq.maxHeightInches !== null) {
    warnings.push({
      code: 'JUMP_HEIGHT_MISMATCH',
      message: 'Dog height not recorded',
      details: 'Please update dog profile with height measurement',
    });
  }

  // Check title requirements
  if (classReq.requiredTitles.length > 0) {
    const hasTitles = classReq.requiredTitles.every(reqTitle =>
      dog.titles.some(dogTitle => dogTitle.toLowerCase().includes(reqTitle.toLowerCase()))
    );
    if (!hasTitles) {
      reasons.push({
        code: 'TITLE_REQUIRED',
        message: 'Required title(s) not found',
        details: `Required: ${classReq.requiredTitles.join(', ')}`,
      });
    }
  }

  // Check age requirements
  if (dog.dateOfBirth) {
    const ageInMonths = getAgeInMonths(dog.dateOfBirth);

    if (classReq.minAgeMonths !== null && ageInMonths < classReq.minAgeMonths) {
      reasons.push({
        code: 'AGE_RESTRICTED',
        message: 'Dog does not meet minimum age requirement',
        details: `Minimum age: ${classReq.minAgeMonths} months (Dog: ${ageInMonths} months)`,
      });
    }
    if (classReq.maxAgeMonths !== null && ageInMonths > classReq.maxAgeMonths) {
      reasons.push({
        code: 'AGE_RESTRICTED',
        message: 'Dog exceeds maximum age requirement',
        details: `Maximum age: ${classReq.maxAgeMonths} months (Dog: ${ageInMonths} months)`,
      });
    }
  }

  // Warn if no registration number on file WITH THIS ORGANIZATION (informational
  // only). Scoped deliberately: a dog registered only with UKC still needs an
  // AKC number before it can appear on AKC paperwork, so holding some other
  // organization's registration must not silence this.
  if (!identity.registrationNumber) {
    warnings.push({
      code: 'MISSING_REGISTRATION_NUMBER',
      message: `No ${classReq.organization} registration number on file`,
      details: 'Consider adding registration for official records',
    });
  }

  return {
    dogId: dog.id,
    classId: classReq.classId,
    isEligible: reasons.length === 0,
    reasons,
    warnings,
  };
}

export function getAgeInMonths(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  const months = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
  return Math.floor(months);
}

export default useEntryEligibility;
