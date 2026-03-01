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
  breed: string;
  heightInches: number | null;
  dateOfBirth: string | null;
  titles: string[];
  registrationNumber: string | null;
  registrationOrganization: string | null;
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
          age_max
        `
        )
        .in('id', classIds);

      if (error) {
        logger.error('Failed to fetch class requirements', 'hooks', { error });
        return [];
      }

      return (data || []).map(
        (c): ClassRequirements => ({
          classId: c.id,
          className: c.name || 'Unknown',
          level: c.level,
          breedRestrictions: c.breed_restrictions || [],
          minHeightInches: c.height_min,
          maxHeightInches: c.height_max,
          requiredTitles: [], // Not stored in classes table
          minAgeMonths: c.age_min,
          maxAgeMonths: c.age_max,
          requiresHandler: false, // Not stored in classes table
        })
      );
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
          breed,
          height,
          date_of_birth,
          akc_number,
          ukc_number
        `
        )
        .in('id', dogIds);

      if (error) {
        logger.error('Failed to fetch dog data for eligibility', 'hooks', { error });
        return [];
      }

      return (data || []).map(
        (d): DogData => ({
          id: d.id,
          name: d.name || 'Unknown',
          callName: d.call_name,
          breed: d.breed || 'Unknown',
          heightInches: d.height ? parseFloat(d.height) : null,
          dateOfBirth: d.date_of_birth,
          titles: [], // Not stored in dogs table
          registrationNumber: d.akc_number || d.ukc_number,
          registrationOrganization: d.akc_number ? 'AKC' : d.ukc_number ? 'UKC' : null,
        })
      );
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

  // Check breed restrictions
  if (classReq.breedRestrictions.length > 0) {
    const isBreedAllowed = classReq.breedRestrictions.some(br =>
      dog.breed.toLowerCase().includes(br.toLowerCase())
    );
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

  // Warn if no registration number on file (informational only)
  if (!dog.registrationNumber) {
    warnings.push({
      code: 'MISSING_REGISTRATION_NUMBER',
      message: 'No registration number on file',
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

// Helper function to calculate age in months
function getAgeInMonths(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  const months = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
  return Math.floor(months);
}

export default useEntryEligibility;
