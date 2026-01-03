/**
 * EntryValidator - Comprehensive offline validation for dog show entries
 * Handles all validation logic without requiring server connectivity
 */

import { 
  validateTimeFormat, 
  validateScore, 
  validatePlacement, 
  validateStatus
} from '@/utils/entryValidation';
import type { 
  ShowEntry, 
  ShowEntryInput, 
  RegistrationData 
} from '@/store/entryStore';
import type { Dog } from '@/types/dog-types';
import type { Show, Trial, Class } from '@/types/show-types';
import type { User } from '@/types/user-types';

export interface EntryValidationContext {
  show: Show;
  trial: Trial;
  class: Class;
  dog: Dog;
  handler?: User;
  existingEntries: ShowEntry[];
}

export interface EntryValidationError {
  field: string;
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface EntryValidationResult {
  isValid: boolean;
  errors: EntryValidationError[];
  warnings: EntryValidationError[];
  normalizedData?: Partial<ShowEntryInput>;
}

export class EntryValidator {
  /**
   * Validate a complete entry submission offline
   */
  static async validateEntry(
    entryData: ShowEntryInput,
    context: EntryValidationContext
  ): Promise<EntryValidationResult> {
    const errors: EntryValidationError[] = [];
    const warnings: EntryValidationError[] = [];
    const normalizedData: Partial<ShowEntryInput> = { ...entryData };

    // Basic required field validation
    const basicValidation = this.validateBasicRequirements(entryData);
    errors.push(...basicValidation.errors);

    // Registration data validation
    const registrationValidation = this.validateRegistrationData(
      entryData.registrationData,
      context
    );
    errors.push(...registrationValidation.errors);
    warnings.push(...registrationValidation.warnings);

    // Show/trial/class eligibility validation
    const eligibilityValidation = this.validateEligibility(entryData, context);
    errors.push(...eligibilityValidation.errors);
    warnings.push(...eligibilityValidation.warnings);

    // Age and size restrictions
    const restrictionValidation = this.validateRestrictions(entryData, context);
    errors.push(...restrictionValidation.errors);
    warnings.push(...restrictionValidation.warnings);

    // Entry deadline validation
    const deadlineValidation = this.validateDeadlines(entryData, context);
    errors.push(...deadlineValidation.errors);
    warnings.push(...deadlineValidation.warnings);

    // Handler validation
    if (entryData.registrationData.handlerId) {
      const handlerValidation = this.validateHandler(entryData, context);
      errors.push(...handlerValidation.errors);
      warnings.push(...handlerValidation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      normalizedData: errors.length === 0 ? normalizedData : undefined
    };
  }

  /**
   * Validate basic required fields
   */
  private static validateBasicRequirements(
    _entryData: ShowEntryInput
  ): { errors: EntryValidationError[] } {
    const entryData = _entryData;
    const errors: EntryValidationError[] = [];

    if (!entryData.showId?.trim()) {
      errors.push({
        field: 'showId',
        code: 'REQUIRED_FIELD',
        message: 'Show ID is required',
        severity: 'error'
      });
    }

    if (!entryData.classId?.trim()) {
      errors.push({
        field: 'classId',
        code: 'REQUIRED_FIELD',
        message: 'Class ID is required',
        severity: 'error'
      });
    }

    if (!entryData.dogId?.trim()) {
      errors.push({
        field: 'dogId',
        code: 'REQUIRED_FIELD',
        message: 'Dog ID is required',
        severity: 'error'
      });
    }

    if (!entryData.registrationData.handler?.trim()) {
      errors.push({
        field: 'handler',
        code: 'REQUIRED_FIELD',
        message: 'Handler name is required',
        severity: 'error'
      });
    }

    if (entryData.registrationData.entryFee < 0) {
      errors.push({
        field: 'entryFee',
        code: 'INVALID_VALUE',
        message: 'Entry fee cannot be negative',
        severity: 'error'
      });
    }

    return { errors };
  }

  /**
   * Validate registration data
   */
  private static validateRegistrationData(
    _registrationData: RegistrationData,
    _context: EntryValidationContext
  ): { errors: EntryValidationError[]; warnings: EntryValidationError[] } {
    const registrationData = _registrationData;
    const context = _context;
    const errors: EntryValidationError[] = [];
    const warnings: EntryValidationError[] = [];

    // Jump height validation
    if (registrationData.jumpHeight) {
      const validHeights = context.class.jumpHeights || [];
      if (validHeights.length > 0 && !validHeights.includes(registrationData.jumpHeight)) {
        errors.push({
          field: 'jumpHeight',
          code: 'INVALID_JUMP_HEIGHT',
          message: `Invalid jump height. Valid options: ${validHeights.join(', ')}`,
          severity: 'error'
        });
      }
    }

    // Entry fee validation against class fee
    if (context.class.entryFee && registrationData.entryFee !== context.class.entryFee) {
      warnings.push({
        field: 'entryFee',
        code: 'FEE_MISMATCH',
        message: `Entry fee (${registrationData.entryFee}) differs from class fee (${context.class.entryFee})`,
        severity: 'warning'
      });
    }

    // Special requests validation
    if (registrationData.specialRequests && registrationData.specialRequests.length > 500) {
      warnings.push({
        field: 'specialRequests',
        code: 'TEXT_TOO_LONG',
        message: 'Special requests are quite long. Consider shortening for readability.',
        severity: 'warning'
      });
    }

    return { errors, warnings };
  }

  /**
   * Validate show/trial/class eligibility
   */
  private static validateEligibility(
    _entryData: ShowEntryInput,
    _context: EntryValidationContext
  ): { errors: EntryValidationError[]; warnings: EntryValidationError[] } {
    const context = _context;
    const errors: EntryValidationError[] = [];
    const warnings: EntryValidationError[] = [];

    // Check if show is still accepting entries
    if (context.show.status === 'closed') {
      errors.push({
        field: 'show',
        code: 'SHOW_CLOSED',
        message: 'This show is no longer accepting entries',
        severity: 'error'
      });
    }

    if (context.show.status === 'cancelled') {
      errors.push({
        field: 'show',
        code: 'SHOW_CANCELLED',
        message: 'This show has been cancelled',
        severity: 'error'
      });
    }

    // Check if trial allows this dog's level/division
    if (context.class.level) {
      const dogLevel = this.getDogCompetitionLevel(context.dog);
      if (dogLevel && !this.isLevelEligible(dogLevel, context.class.level)) {
        warnings.push({
          field: 'class',
          code: 'LEVEL_MISMATCH',
          message: `Dog's current level (${dogLevel}) may not be eligible for ${context.class.level} class`,
          severity: 'warning'
        });
      }
    }

    // Check breed restrictions
    if (context.class.breedRestrictions && context.class.breedRestrictions.length > 0) {
      if (!context.class.breedRestrictions.includes(context.dog.breed)) {
        errors.push({
          field: 'breed',
          code: 'BREED_RESTRICTION',
          message: `${context.dog.breed} is not eligible for this class`,
          severity: 'error'
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate age and size restrictions
   */
  private static validateRestrictions(
    _entryData: ShowEntryInput,
    _context: EntryValidationContext
  ): { errors: EntryValidationError[]; warnings: EntryValidationError[] } {
    const context = _context;
    const errors: EntryValidationError[] = [];
    const warnings: EntryValidationError[] = [];

    // Age restrictions
    if (context.class.ageRestrictions) {
      const dogAge = this.calculateDogAge(context.dog.birthDate || context.dog.dateOfBirth || '', context.show.startDate);
      
      if (context.class.ageRestrictions.min && dogAge < context.class.ageRestrictions.min) {
        errors.push({
          field: 'age',
          code: 'AGE_TOO_YOUNG',
          message: `Dog must be at least ${context.class.ageRestrictions.min} months old`,
          severity: 'error'
        });
      }

      if (context.class.ageRestrictions.max && dogAge > context.class.ageRestrictions.max) {
        errors.push({
          field: 'age',
          code: 'AGE_TOO_OLD',
          message: `Dog cannot be older than ${context.class.ageRestrictions.max} months`,
          severity: 'error'
        });
      }
    }

    // Size restrictions (if height/weight data available)
    if (context.dog.measurements) {
      if (context.class.heightRestrictions) {
        const dogHeight = context.dog.measurements.height;
        if (dogHeight) {
          if (context.class.heightRestrictions.min && dogHeight < context.class.heightRestrictions.min) {
            errors.push({
              field: 'height',
              code: 'HEIGHT_TOO_SHORT',
              message: `Dog height (${dogHeight}") below minimum (${context.class.heightRestrictions.min}")`,
              severity: 'error'
            });
          }
          if (context.class.heightRestrictions.max && dogHeight > context.class.heightRestrictions.max) {
            errors.push({
              field: 'height',
              code: 'HEIGHT_TOO_TALL',
              message: `Dog height (${dogHeight}") above maximum (${context.class.heightRestrictions.max}")`,
              severity: 'error'
            });
          }
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate entry deadlines
   */
  private static validateDeadlines(
    _entryData: ShowEntryInput,
    _context: EntryValidationContext
  ): { errors: EntryValidationError[]; warnings: EntryValidationError[] } {
    const context = _context;
    const errors: EntryValidationError[] = [];
    const warnings: EntryValidationError[] = [];

    const now = new Date();

    // Entry closing deadline
    if (context.show.entryDeadline) {
      const deadline = new Date(context.show.entryDeadline);
      if (now > deadline) {
        errors.push({
          field: 'deadline',
          code: 'DEADLINE_PASSED',
          message: `Entry deadline has passed (${deadline.toLocaleDateString()})`,
          severity: 'error'
        });
      }

      // Warning for entries close to deadline
      const daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilDeadline <= 3 && daysUntilDeadline > 0) {
        warnings.push({
          field: 'deadline',
          code: 'DEADLINE_APPROACHING',
          message: `Entry deadline is in ${daysUntilDeadline} day(s)`,
          severity: 'warning'
        });
      }
    }

    // Late entry fees
    if (context.show.lateEntryDeadline) {
      const lateDeadline = new Date(context.show.lateEntryDeadline);
      if (now > new Date(context.show.entryDeadline!) && now <= lateDeadline) {
        warnings.push({
          field: 'lateFee',
          code: 'LATE_ENTRY_PERIOD',
          message: 'Late entry fees may apply',
          severity: 'warning'
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate handler assignment
   */
  private static validateHandler(
    _entryData: ShowEntryInput,
    _context: EntryValidationContext
  ): { errors: EntryValidationError[]; warnings: EntryValidationError[] } {
    const context = _context;
    const errors: EntryValidationError[] = [];
    const warnings: EntryValidationError[] = [];

    if (!context.handler) {
      errors.push({
        field: 'handler',
        code: 'HANDLER_NOT_FOUND',
        message: 'Handler information not found',
        severity: 'error'
      });
      return { errors, warnings };
    }

    // Age restrictions for handlers
    if (context.handler.birthDate) {
      const handlerAge = this.calculateAge(context.handler.birthDate, context.show.startDate);
      
      if (context.class.handlerAgeRestrictions?.min && handlerAge < context.class.handlerAgeRestrictions.min) {
        errors.push({
          field: 'handlerAge',
          code: 'HANDLER_TOO_YOUNG',
          message: `Handler must be at least ${context.class.handlerAgeRestrictions.min} years old`,
          severity: 'error'
        });
      }

      if (context.class.handlerAgeRestrictions?.max && handlerAge > context.class.handlerAgeRestrictions.max) {
        errors.push({
          field: 'handlerAge',
          code: 'HANDLER_TOO_OLD',
          message: `Handler cannot be older than ${context.class.handlerAgeRestrictions.max} years`,
          severity: 'error'
        });
      }
    }

    // Non-owner handler validation
    if (context.handler.id !== context.dog.ownerId) {
      if (!context.show.allowNonOwnerHandlers) {
        errors.push({
          field: 'handler',
          code: 'NON_OWNER_NOT_ALLOWED',
          message: 'This show does not allow non-owner handlers',
          severity: 'error'
        });
      } else {
        warnings.push({
          field: 'handler',
          code: 'NON_OWNER_HANDLER',
          message: 'Handler is not the dog owner - additional documentation may be required',
          severity: 'warning'
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate competition data (for results entry)
   */
  static validateCompetitionData(data: {
    time?: string;
    score?: string;
    placement?: string;
    status?: string;
    faults?: number;
  }): EntryValidationResult {
    const errors: EntryValidationError[] = [];
    const warnings: EntryValidationError[] = [];

    // Time validation
    if (data.time) {
      const timeValidation = validateTimeFormat(data.time);
      if (!timeValidation.isValid) {
        errors.push({
          field: 'time',
          code: 'INVALID_TIME_FORMAT',
          message: timeValidation.error || 'Invalid time format',
          severity: 'error'
        });
      }
    }

    // Score validation
    if (data.score) {
      const scoreValidation = validateScore(data.score);
      if (!scoreValidation.isValid) {
        errors.push({
          field: 'score',
          code: 'INVALID_SCORE',
          message: scoreValidation.error || 'Invalid score',
          severity: 'error'
        });
      }
    }

    // Placement validation
    if (data.placement) {
      const placementValidation = validatePlacement(data.placement);
      if (!placementValidation.isValid) {
        errors.push({
          field: 'placement',
          code: 'INVALID_PLACEMENT',
          message: placementValidation.error || 'Invalid placement',
          severity: 'error'
        });
      }
    }

    // Status validation
    if (data.status) {
      const statusValidation = validateStatus(data.status);
      if (!statusValidation.isValid) {
        errors.push({
          field: 'status',
          code: 'INVALID_STATUS',
          message: statusValidation.error || 'Invalid status',
          severity: 'error'
        });
      }
    }

    // Faults validation
    if (data.faults !== undefined) {
      if (data.faults < 0) {
        errors.push({
          field: 'faults',
          code: 'INVALID_FAULTS',
          message: 'Faults cannot be negative',
          severity: 'error'
        });
      }
      if (data.faults > 100) {
        warnings.push({
          field: 'faults',
          code: 'HIGH_FAULTS',
          message: 'Unusually high number of faults',
          severity: 'warning'
        });
      }
    }

    // Cross-field validation
    if (data.status === 'Qualified' && !data.time) {
      errors.push({
        field: 'time',
        code: 'TIME_REQUIRED_FOR_Q',
        message: 'Time is required for qualified runs',
        severity: 'error'
      });
    }

    if (data.placement && !data.time) {
      errors.push({
        field: 'time',
        code: 'TIME_REQUIRED_FOR_PLACEMENT',
        message: 'Time is required when placement is specified',
        severity: 'error'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Helper methods
   */
  private static getDogCompetitionLevel(dog: Dog): string | null {
    // Extract current competition level from dog's titles or training records
    // This would integrate with the dog's competition history
    return dog.currentLevel || null;
  }

  private static isLevelEligible(dogLevel: string, classLevel: string): boolean {
    // Define level eligibility rules (e.g., Novice dogs can enter Novice or higher)
    const levelHierarchy = ['Novice', 'Open', 'Excellent', 'Master'];
    const dogIndex = levelHierarchy.indexOf(dogLevel);
    const classIndex = levelHierarchy.indexOf(classLevel);
    
    return dogIndex >= 0 && classIndex >= 0 && dogIndex <= classIndex;
  }

  private static calculateDogAge(birthDate: string, eventDate: string): number {
    const birth = new Date(birthDate);
    const event = new Date(eventDate);
    
    // Calculate age in months
    const years = event.getFullYear() - birth.getFullYear();
    const months = event.getMonth() - birth.getMonth();
    
    return years * 12 + months;
  }

  private static calculateAge(birthDate: string, eventDate: string): number {
    const birth = new Date(birthDate);
    const event = new Date(eventDate);
    
    let age = event.getFullYear() - birth.getFullYear();
    const monthDiff = event.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && event.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  }
}