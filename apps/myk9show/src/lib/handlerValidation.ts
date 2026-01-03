import { User } from '@/types/user-types';
import { Show } from '@/types/show-types';

interface Trial {
  id: string;
  name: string;
  trialDate: string;
  trialNumber?: string;
}

import { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';

export interface HandlerValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  eligibility: {
    canHandleAtShow: boolean;
    hasRequiredPermissions: boolean;
    hasConflicts: boolean;
    isRegistered: boolean;
  };
}

export interface HandlerConflict {
  type: 'time_overlap' | 'ring_conflict' | 'judge_conflict' | 'travel_distance' | 'multiple_dogs';
  severity: 'warning' | 'error' | 'info';
  description: string;
  affectedClassIds?: string[];
  affectedDogIds?: string[];
  suggestedResolution?: string;
}

export interface HandlerAvailability {
  handlerId: string;
  showId: string;
  trialId?: string;
  isAvailable: boolean;
  conflicts: HandlerConflict[];
  currentAssignments: {
    dogId: string;
    dogName: string;
    classCount: number;
    estimatedTime: string;
  }[];
}

/**
 * Validate if a person can handle dogs at a specific show
 */
export function validateHandlerEligibility(
  handler: User,
  show: Show
): HandlerValidationResult {
  const result: HandlerValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    eligibility: {
      canHandleAtShow: true,
      hasRequiredPermissions: true,
      hasConflicts: false,
      isRegistered: true
    }
  };

  // Check if handler is registered in the system
  if (!handler.id || !handler.email) {
    result.isValid = false;
    result.errors.push('Handler must be a registered user in the system');
    result.eligibility.isRegistered = false;
  }

  // Check show-specific eligibility rules
  const handlerRestrictions = (show as unknown as Record<string, unknown>).handlerRestrictions as Record<string, unknown> | undefined;
  if (handlerRestrictions) {
    // Check age requirements
    if (handlerRestrictions.minimumAge && typeof handlerRestrictions.minimumAge === 'number') {
      const handlerAge = calculateAge((handler as unknown as Record<string, unknown>).dateOfBirth as string | undefined);
      if (handlerAge < handlerRestrictions.minimumAge) {
        result.isValid = false;
        result.errors.push(
          `Handler must be at least ${handlerRestrictions.minimumAge} years old`
        );
        result.eligibility.canHandleAtShow = false;
      }
    }

    // Check license requirements
    if (handlerRestrictions.requiresProfessionalLicense) {
      // This would check against a professional handler registry
      // For now, we'll assume this is stored in user profile
      if (!(handler as unknown as Record<string, unknown>).isProfessionalHandler) {
        result.warnings.push(
          'This show may require a professional handler license'
        );
      }
    }

    // Check insurance requirements
    if (handlerRestrictions.requiresInsurance) {
      // Check if handler has valid insurance
      result.warnings.push(
        'Please ensure handler has valid liability insurance'
      );
    }

    // Check club membership requirements
    if (handlerRestrictions.requiresClubMembership) {
      result.warnings.push(
        'Handler may need to be a member of the hosting club'
      );
    }
  }

  // Check handler permissions
  if (!checkHandlerPermissions(handler)) {
    result.warnings.push(
      'Handler may not have required permissions for this show type'
    );
    result.eligibility.hasRequiredPermissions = false;
  }

  return result;
}

/**
 * Check for conflicts between handler assignments
 */
export function checkHandlerConflicts(
  handlerId: string,
  showId: string,
  dogId: string,
  classSelections: ClassSelectionData[],
  existingAssignments: Record<string, HandlerInfo>,
  trials?: Trial[]
): HandlerConflict[] {
  const conflicts: HandlerConflict[] = [];

  // Get all dogs currently assigned to this handler
  const handlerDogs = Object.entries(existingAssignments)
    .filter(([, assignment]) => assignment.handlerId === handlerId)
    .map(([dogId, assignment]) => ({ dogId, assignment }));

  // Check for excessive number of dogs
  if (handlerDogs.length >= 5) { // Configurable limit
    conflicts.push({
      type: 'multiple_dogs',
      severity: 'warning',
      description: `Handler is already assigned to ${handlerDogs.length} dogs. Consider limiting assignments to ensure quality handling.`,
      affectedDogIds: handlerDogs.map(h => h.dogId),
      suggestedResolution: 'Consider assigning additional handlers or reducing class entries.'
    });
  }

  // Check for time conflicts within the same trial/day
  if (trials && classSelections.length > 0) {
    const timeConflicts = checkTimeConflicts(handlerId, classSelections);
    conflicts.push(...timeConflicts);
  }

  // Check for ring conflicts (handler can't be in two rings at once)
  const ringConflicts = checkRingConflicts();
  conflicts.push(...ringConflicts);

  // Check for judge conflicts (some handlers may not be allowed with certain judges)
  const judgeConflicts = checkJudgeConflicts();
  conflicts.push(...judgeConflicts);

  return conflicts;
}

/**
 * Get handler availability for a specific show
 */
export function getHandlerAvailability(
  handlerId: string,
  showId: string,
  existingAssignments: Record<string, HandlerInfo>,
  allClassSelections: ClassSelectionData[],
  trials?: Trial[]
): HandlerAvailability {
  // Get current assignments for this handler
  const currentAssignments = Object.entries(existingAssignments)
    .filter(([, assignment]) => assignment.handlerId === handlerId)
    .map(([dogId, assignment]) => {
      const dogClasses = allClassSelections.filter(c => c.dogId === dogId);
      return {
        dogId,
        dogName: assignment.handlerName, // This should be dog name, not handler name
        classCount: dogClasses.reduce((sum, c) => sum + c.selectedClasses.length, 0),
        estimatedTime: calculateEstimatedHandlingTime(dogClasses)
      };
    });

  // Check for conflicts across all assignments
  const allConflicts: HandlerConflict[] = [];
  currentAssignments.forEach(assignment => {
    const dogClassSelections = allClassSelections.filter(c => c.dogId === assignment.dogId);
    const conflicts = checkHandlerConflicts(
      handlerId,
      showId,
      assignment.dogId,
      dogClassSelections,
      existingAssignments,
      trials
    );
    allConflicts.push(...conflicts);
  });

  return {
    handlerId,
    showId,
    isAvailable: allConflicts.filter(c => c.severity === 'error').length === 0,
    conflicts: allConflicts,
    currentAssignments
  };
}

/**
 * Suggest optimal handler assignments
 */
export function suggestHandlerAssignments(
  dogSelections: Array<{
    dogId: string;
    ownerId: string;
    classSelections: ClassSelectionData[];
  }>,
  availableHandlers: User[],
  showId: string,
  trials?: Trial[]
): Record<string, HandlerInfo> {
  const suggestions: Record<string, HandlerInfo> = {};

  dogSelections.forEach(({ dogId, ownerId, classSelections }) => {
    // Default to owner
    const owner = availableHandlers.find(h => h.id === ownerId);
    if (owner) {
      suggestions[dogId] = {
        handlerId: owner.id,
        handlerName: `${owner.firstName} ${owner.lastName}`,
        isOwner: true
      };
    } else {
      // Find best alternative handler
      const bestHandler = findBestHandlerForDog(
        dogId,
        classSelections,
        availableHandlers,
        suggestions,
        trials
      );
      
      if (bestHandler) {
        suggestions[dogId] = {
          handlerId: bestHandler.id,
          handlerName: `${bestHandler.firstName} ${bestHandler.lastName}`,
          isOwner: false
        };
      }
    }
  });

  return suggestions;
}

/**
 * Helper functions
 */

function calculateAge(dateOfBirth?: string): number {
  if (!dateOfBirth) return 0;
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

function checkHandlerPermissions(handler: User): boolean {
  // This would check against actual permission system
  // For now, return true for all registered users
  return !!handler.id;
}

function checkTimeConflicts(
  handlerId: string,
  classSelections: ClassSelectionData[]
): HandlerConflict[] {
  const conflicts: HandlerConflict[] = [];
  
  // Group classes by trial and check for overlaps
  const classesByTrial = classSelections.reduce((acc, selection) => {
    if (!acc[selection.trialId]) {
      acc[selection.trialId] = [];
    }
    acc[selection.trialId].push(...selection.selectedClasses);
    return acc;
  }, {} as Record<string, Array<Record<string, unknown>>>);

  // This is simplified - in reality you'd check actual class schedules
  Object.entries(classesByTrial).forEach(([trialId, classesInTrial]) => {
    if (Array.isArray(classesInTrial) && classesInTrial.length > 3) { // Arbitrary limit for demo
      conflicts.push({
        type: 'time_overlap',
        severity: 'warning',
        description: `Handler may be handling too many classes in trial ${trialId}`,
        affectedClassIds: classesInTrial.map((c: Record<string, unknown>) => c.classId as string),
        suggestedResolution: 'Consider spacing out class entries or using multiple handlers'
      });
    }
  });

  return conflicts;
}

function checkRingConflicts(): HandlerConflict[] {
  // This would check for simultaneous ring assignments
  // Implementation depends on your ring/scheduling system
  return [];
}

function checkJudgeConflicts(): HandlerConflict[] {
  // This would check for judge-handler conflicts
  // (e.g., family members, business relationships)
  return [];
}

function calculateEstimatedHandlingTime(classSelections: ClassSelectionData[]): string {
  // Simple estimation - in reality this would be based on actual class schedules
  const totalClasses = classSelections.reduce((sum, c) => sum + c.selectedClasses.length, 0);
  const estimatedMinutes = totalClasses * 10; // 10 minutes per class average
  
  const hours = Math.floor(estimatedMinutes / 60);
  const minutes = estimatedMinutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function findBestHandlerForDog(
  dogId: string,
  classSelections: ClassSelectionData[],
  availableHandlers: User[],
  existingAssignments: Record<string, HandlerInfo>,
  trials?: Trial[]
): User | null {
  // Score handlers based on availability, experience, conflicts, etc.
  const scoredHandlers = availableHandlers.map(handler => {
    const conflicts = checkHandlerConflicts(
      handler.id,
      '', // showId not needed for this check
      dogId,
      classSelections,
      existingAssignments,
      trials
    );
    
    const errorCount = conflicts.filter(c => c.severity === 'error').length;
    const warningCount = conflicts.filter(c => c.severity === 'warning').length;
    const currentAssignments = Object.values(existingAssignments)
      .filter(a => a.handlerId === handler.id).length;

    // Lower score is better
    const score = errorCount * 100 + warningCount * 10 + currentAssignments;
    
    return { handler, score, conflicts };
  });

  // Sort by score and return the best option
  scoredHandlers.sort((a, b) => a.score - b.score);
  
  // Don't suggest handlers with errors
  const bestOption = scoredHandlers.find(s => 
    s.conflicts.filter(c => c.severity === 'error').length === 0
  );
  
  return bestOption?.handler || null;
}

/**
 * Validate a complete set of handler assignments
 */
export function validateAllHandlerAssignments(
  assignments: Record<string, HandlerInfo>,
  allClassSelections: ClassSelectionData[],
  availableHandlers: User[],
  show: Show,
  trials?: Trial[]
): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  handlerDetails: Record<string, HandlerAvailability>;
} {
  const result = {
    isValid: true,
    errors: [] as string[],
    warnings: [] as string[],
    handlerDetails: {} as Record<string, HandlerAvailability>
  };

  // Get unique handler IDs
  const handlerIds = Array.from(new Set(Object.values(assignments).map(a => a.handlerId)));

  // Check each handler
  handlerIds.forEach(handlerId => {
    const handler = availableHandlers.find(h => h.id === handlerId);
    if (!handler) {
      result.isValid = false;
      result.errors.push(`Handler with ID ${handlerId} not found`);
      return;
    }

    // Validate eligibility
    const eligibility = validateHandlerEligibility(handler, show);
    if (!eligibility.isValid) {
      result.isValid = false;
      result.errors.push(...eligibility.errors);
    }
    result.warnings.push(...eligibility.warnings);

    // Check availability and conflicts
    const availability = getHandlerAvailability(
      handlerId,
      show.id,
      assignments,
      allClassSelections,
      trials
    );
    
    result.handlerDetails[handlerId] = availability;
    
    // Add conflicts to warnings/errors
    availability.conflicts.forEach(conflict => {
      if (conflict.severity === 'error') {
        result.isValid = false;
        result.errors.push(conflict.description);
      } else if (conflict.severity === 'warning') {
        result.warnings.push(conflict.description);
      }
    });
  });

  return result;
}