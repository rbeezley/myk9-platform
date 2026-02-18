/**
 * EntryLimitChecker - Validates entry limits and prevents duplicates offline
 * Uses local data to check class capacity, duplicate entries, and show limits
 */

import type { ShowEntry, ShowEntryInput } from '@/store/entryStore';
import { EntryStatus as RegistrationEntryStatus } from '@/types/show-registration-types';
import type { Dog } from '@/types/dog-types';
import type { Show, Trial, Class } from '@/types/show-types';

export interface EntryLimitError {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  details?: Record<string, unknown> | undefined;
}

export interface EntryLimitCheckResult {
  isAllowed: boolean;
  errors: EntryLimitError[];
  warnings: EntryLimitError[];
  currentCount?: number | undefined;
  maxAllowed?: number | undefined;
  waitlistPosition?: number | undefined;
}

export interface LimitCheckContext {
  show: Show;
  trial: Trial;
  class: Class;
  dog: Dog;
  existingEntries: ShowEntry[];
  pendingEntries?: ShowEntryInput[] | undefined; // Entries being created in the same batch
}

export class EntryLimitChecker {
  /**
   * Check all entry limits for a new entry
   */
  static checkEntryLimits(
    entryData: ShowEntryInput,
    context: LimitCheckContext
  ): EntryLimitCheckResult {
    const errors: EntryLimitError[] = [];
    const warnings: EntryLimitError[] = [];

    // Check for duplicate entries
    const duplicateCheck = this.checkDuplicateEntry(entryData, context);
    errors.push(...duplicateCheck.errors);
    warnings.push(...duplicateCheck.warnings);

    // Check class capacity limits
    const capacityCheck = this.checkClassCapacity(entryData, context);
    errors.push(...capacityCheck.errors);
    warnings.push(...capacityCheck.warnings);

    // Check per-dog entry limits
    const dogLimitCheck = this.checkDogEntryLimits(entryData, context);
    errors.push(...dogLimitCheck.errors);
    warnings.push(...dogLimitCheck.warnings);

    // Check trial-level limits
    const trialLimitCheck = this.checkTrialLimits(entryData, context);
    errors.push(...trialLimitCheck.errors);
    warnings.push(...trialLimitCheck.warnings);

    // Check show-level limits
    const showLimitCheck = this.checkShowLimits(entryData, context);
    errors.push(...showLimitCheck.errors);
    warnings.push(...showLimitCheck.warnings);

    // Check handler limits (if applicable)
    const handlerLimitCheck = this.checkHandlerLimits(entryData, context);
    errors.push(...handlerLimitCheck.errors);
    warnings.push(...handlerLimitCheck.warnings);

    return {
      isAllowed: errors.length === 0,
      errors,
      warnings,
      currentCount: capacityCheck.currentCount,
      maxAllowed: capacityCheck.maxAllowed,
      waitlistPosition: capacityCheck.waitlistPosition,
    };
  }

  /**
   * Check for duplicate entries (same dog in same class)
   */
  private static checkDuplicateEntry(
    entryData: ShowEntryInput,
    context: LimitCheckContext
  ): { errors: EntryLimitError[]; warnings: EntryLimitError[] } {
    const errors: EntryLimitError[] = [];
    const warnings: EntryLimitError[] = [];

    // Check existing entries
    const existingEntry = context.existingEntries.find(
      entry =>
        entry.dogId === entryData.dogId &&
        entry.classId === entryData.classId &&
        entry.status !== 'withdrawn' &&
        entry.status !== 'scratched'
    );

    if (existingEntry) {
      errors.push({
        code: 'DUPLICATE_ENTRY',
        message: `${context.dog.name} is already entered in ${context.class.name}`,
        severity: 'error',
        details: {
          existingEntryId: existingEntry.id,
          existingStatus: existingEntry.status,
        },
      });
    }

    // Check pending entries in the same batch
    if (context.pendingEntries) {
      const pendingDuplicate = context.pendingEntries.find(
        entry => entry.dogId === entryData.dogId && entry.classId === entryData.classId
      );

      if (pendingDuplicate) {
        errors.push({
          code: 'DUPLICATE_PENDING_ENTRY',
          message: `${context.dog.name} is already being entered in ${context.class.name} in this batch`,
          severity: 'error',
        });
      }
    }

    // Check for conflicting classes in the same time slot
    const conflictingEntries = context.existingEntries.filter(
      entry =>
        entry.dogId === entryData.dogId &&
        entry.status !== 'withdrawn' &&
        entry.status !== 'scratched'
    );

    for (const conflictEntry of conflictingEntries) {
      if (this.hasTimeConflict(context.class, this.getClassById(conflictEntry.classId, context))) {
        warnings.push({
          code: 'TIME_CONFLICT',
          message: `Potential scheduling conflict with another class`,
          severity: 'warning',
          details: {
            conflictingClassId: conflictEntry.classId,
          },
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Check class capacity limits
   */
  private static checkClassCapacity(
    entryData: ShowEntryInput,
    context: LimitCheckContext
  ): {
    errors: EntryLimitError[];
    warnings: EntryLimitError[];
    currentCount?: number;
    maxAllowed?: number;
    waitlistPosition?: number;
  } {
    const errors: EntryLimitError[] = [];
    const warnings: EntryLimitError[] = [];

    const maxCapacity = context.class.maxEntries;
    if (!maxCapacity) {
      return { errors, warnings }; // No limit set
    }

    // Count current active entries
    const currentEntries = context.existingEntries.filter(
      entry =>
        entry.classId === entryData.classId &&
        entry.status !== 'withdrawn' &&
        entry.status !== 'scratched'
    );

    // Count pending entries in this batch
    const pendingCount =
      context.pendingEntries?.filter(entry => entry.classId === entryData.classId).length || 0;

    const currentCount = currentEntries.length;
    const totalWithPending = currentCount + pendingCount;

    // Check if class is at capacity
    if (totalWithPending >= maxCapacity) {
      if (context.class.allowWaitlist) {
        // Calculate waitlist position
        const waitlistEntries = context.existingEntries.filter(
          entry =>
            entry.classId === entryData.classId &&
            ((entry.status as string) === 'waitlist' ||
              (entry.status as string) === RegistrationEntryStatus.WAITLIST)
        );
        const waitlistPosition = waitlistEntries.length + 1;

        warnings.push({
          code: 'CLASS_FULL_WAITLIST',
          message: `Class is full but entry can be waitlisted (position #${waitlistPosition})`,
          severity: 'warning',
          details: {
            currentCount,
            maxCapacity,
            waitlistPosition,
          },
        });

        return {
          errors,
          warnings,
          currentCount,
          maxAllowed: maxCapacity,
          waitlistPosition,
        };
      } else {
        errors.push({
          code: 'CLASS_FULL',
          message: `Class is full (${currentCount}/${maxCapacity} entries)`,
          severity: 'error',
          details: {
            currentCount,
            maxCapacity,
          },
        });
      }
    }

    // Warning when class is nearly full
    const warningThreshold = Math.floor(maxCapacity * 0.9);
    if (totalWithPending >= warningThreshold && totalWithPending < maxCapacity) {
      warnings.push({
        code: 'CLASS_NEARLY_FULL',
        message: `Class is nearly full (${totalWithPending}/${maxCapacity} entries)`,
        severity: 'warning',
        details: {
          currentCount: totalWithPending,
          maxCapacity,
        },
      });
    }

    return {
      errors,
      warnings,
      currentCount: totalWithPending,
      maxAllowed: maxCapacity,
    };
  }

  /**
   * Check per-dog entry limits
   */
  private static checkDogEntryLimits(
    entryData: ShowEntryInput,
    context: LimitCheckContext
  ): { errors: EntryLimitError[]; warnings: EntryLimitError[] } {
    const errors: EntryLimitError[] = [];
    const warnings: EntryLimitError[] = [];

    // Check maximum entries per dog per trial
    if (context.trial.maxEntriesPerDog) {
      const dogTrialEntries = context.existingEntries.filter(
        entry =>
          entry.dogId === entryData.dogId &&
          this.isEntryInTrial(entry, context.trial) &&
          entry.status !== 'withdrawn' &&
          entry.status !== 'scratched'
      );

      const pendingTrialEntries =
        context.pendingEntries?.filter(
          entry => entry.dogId === entryData.dogId && this.isEntryDataInTrial(entry, context.trial)
        ).length || 0;

      const totalTrialEntries = dogTrialEntries.length + pendingTrialEntries;

      if (totalTrialEntries >= context.trial.maxEntriesPerDog) {
        errors.push({
          code: 'DOG_TRIAL_LIMIT_EXCEEDED',
          message: `${context.dog.name} has reached the maximum entries per trial (${context.trial.maxEntriesPerDog})`,
          severity: 'error',
          details: {
            currentEntries: totalTrialEntries,
            maxAllowed: context.trial.maxEntriesPerDog,
          },
        });
      }
    }

    // Check maximum entries per dog per show
    if (context.show.maxEntriesPerDog) {
      const dogShowEntries = context.existingEntries.filter(
        entry =>
          entry.dogId === entryData.dogId &&
          entry.showId === entryData.showId &&
          entry.status !== 'withdrawn' &&
          entry.status !== 'scratched'
      );

      const pendingShowEntries =
        context.pendingEntries?.filter(
          entry => entry.dogId === entryData.dogId && entry.showId === entryData.showId
        ).length || 0;

      const totalShowEntries = dogShowEntries.length + pendingShowEntries;

      if (totalShowEntries >= context.show.maxEntriesPerDog) {
        errors.push({
          code: 'DOG_SHOW_LIMIT_EXCEEDED',
          message: `${context.dog.name} has reached the maximum entries per show (${context.show.maxEntriesPerDog})`,
          severity: 'error',
          details: {
            currentEntries: totalShowEntries,
            maxAllowed: context.show.maxEntriesPerDog,
          },
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Check trial-level limits
   */
  private static checkTrialLimits(
    _entryData: ShowEntryInput,
    context: LimitCheckContext
  ): { errors: EntryLimitError[]; warnings: EntryLimitError[] } {
    const errors: EntryLimitError[] = [];
    const warnings: EntryLimitError[] = [];

    if (context.trial.maxTotalEntries) {
      const trialEntries = context.existingEntries.filter(
        entry =>
          this.isEntryInTrial(entry, context.trial) &&
          entry.status !== 'withdrawn' &&
          entry.status !== 'scratched'
      );

      const pendingTrialEntries =
        context.pendingEntries?.filter(entry => this.isEntryDataInTrial(entry, context.trial))
          .length || 0;

      const totalTrialEntries = trialEntries.length + pendingTrialEntries;

      if (totalTrialEntries >= context.trial.maxTotalEntries) {
        errors.push({
          code: 'TRIAL_FULL',
          message: `Trial is full (${totalTrialEntries}/${context.trial.maxTotalEntries} entries)`,
          severity: 'error',
          details: {
            currentEntries: totalTrialEntries,
            maxAllowed: context.trial.maxTotalEntries,
          },
        });
      }

      // Warning when trial is nearly full
      const warningThreshold = Math.floor(context.trial.maxTotalEntries * 0.9);
      if (
        totalTrialEntries >= warningThreshold &&
        totalTrialEntries < context.trial.maxTotalEntries
      ) {
        warnings.push({
          code: 'TRIAL_NEARLY_FULL',
          message: `Trial is nearly full (${totalTrialEntries}/${context.trial.maxTotalEntries} entries)`,
          severity: 'warning',
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Check show-level limits
   */
  private static checkShowLimits(
    entryData: ShowEntryInput,
    context: LimitCheckContext
  ): { errors: EntryLimitError[]; warnings: EntryLimitError[] } {
    const errors: EntryLimitError[] = [];
    const warnings: EntryLimitError[] = [];

    if (context.show.maxTotalEntries) {
      const showEntries = context.existingEntries.filter(
        entry =>
          entry.showId === entryData.showId &&
          entry.status !== 'withdrawn' &&
          entry.status !== 'scratched'
      );

      const pendingShowEntries =
        context.pendingEntries?.filter(entry => entry.showId === entryData.showId).length || 0;

      const totalShowEntries = showEntries.length + pendingShowEntries;

      if (totalShowEntries >= context.show.maxTotalEntries) {
        errors.push({
          code: 'SHOW_FULL',
          message: `Show is full (${totalShowEntries}/${context.show.maxTotalEntries} entries)`,
          severity: 'error',
          details: {
            currentEntries: totalShowEntries,
            maxAllowed: context.show.maxTotalEntries,
          },
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Check handler-specific limits
   */
  private static checkHandlerLimits(
    entryData: ShowEntryInput,
    context: LimitCheckContext
  ): { errors: EntryLimitError[]; warnings: EntryLimitError[] } {
    const errors: EntryLimitError[] = [];
    const warnings: EntryLimitError[] = [];

    const handlerId = entryData.registrationData.handlerId;
    if (!handlerId) return { errors, warnings };

    // Check maximum dogs per handler per class (if applicable)
    if (context.class.maxDogsPerHandler) {
      const handlerClassEntries = context.existingEntries.filter(
        entry =>
          entry.classId === entryData.classId &&
          entry.registrationData.handlerId === handlerId &&
          entry.status !== 'withdrawn' &&
          entry.status !== 'scratched'
      );

      const pendingHandlerEntries =
        context.pendingEntries?.filter(
          entry =>
            entry.classId === entryData.classId && entry.registrationData.handlerId === handlerId
        ).length || 0;

      const totalHandlerEntries = handlerClassEntries.length + pendingHandlerEntries;

      if (totalHandlerEntries >= context.class.maxDogsPerHandler) {
        errors.push({
          code: 'HANDLER_CLASS_LIMIT_EXCEEDED',
          message: `Handler has reached maximum dogs per class (${context.class.maxDogsPerHandler})`,
          severity: 'error',
          details: {
            handlerId,
            currentEntries: totalHandlerEntries,
            maxAllowed: context.class.maxDogsPerHandler,
          },
        });
      }
    }

    // Check maximum entries per handler per trial
    if (context.trial.maxEntriesPerHandler) {
      const handlerTrialEntries = context.existingEntries.filter(
        entry =>
          this.isEntryInTrial(entry, context.trial) &&
          entry.registrationData.handlerId === handlerId &&
          entry.status !== 'withdrawn' &&
          entry.status !== 'scratched'
      );

      const pendingHandlerTrialEntries =
        context.pendingEntries?.filter(
          entry =>
            this.isEntryDataInTrial(entry, context.trial) &&
            entry.registrationData.handlerId === handlerId
        ).length || 0;

      const totalHandlerTrialEntries = handlerTrialEntries.length + pendingHandlerTrialEntries;

      if (totalHandlerTrialEntries >= context.trial.maxEntriesPerHandler) {
        warnings.push({
          code: 'HANDLER_TRIAL_LIMIT_APPROACHING',
          message: `Handler is approaching maximum entries per trial (${totalHandlerTrialEntries}/${context.trial.maxEntriesPerHandler})`,
          severity: 'warning',
          details: {
            handlerId,
            currentEntries: totalHandlerTrialEntries,
            maxAllowed: context.trial.maxEntriesPerHandler,
          },
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Check if an entry can be moved from waitlist to confirmed
   */
  static checkWaitlistPromotion(
    classId: string,
    existingEntries: ShowEntry[],
    classData: Class
  ): { canPromote: boolean; spotsAvailable: number } {
    if (!classData.maxEntries) {
      return { canPromote: true, spotsAvailable: Infinity };
    }

    const confirmedEntries = existingEntries.filter(
      entry =>
        entry.classId === classId && (entry.status === 'confirmed' || entry.status === 'paid')
    );

    const spotsAvailable = classData.maxEntries - confirmedEntries.length;
    const canPromote = spotsAvailable > 0;

    return { canPromote, spotsAvailable };
  }

  /**
   * Get entry statistics for a class
   */
  static getClassEntryStats(
    classId: string,
    existingEntries: ShowEntry[],
    classData: Class
  ): {
    confirmed: number;
    waitlisted: number;
    total: number;
    capacity: number | null;
    availableSpots: number | null;
    isFull: boolean;
  } {
    const classEntries = existingEntries.filter(entry => entry.classId === classId);

    const confirmed = classEntries.filter(
      entry => entry.status === 'confirmed' || entry.status === 'paid'
    ).length;

    const waitlisted = classEntries.filter(
      entry =>
        (entry.status as string) === 'waitlist' ||
        (entry.status as string) === RegistrationEntryStatus.WAITLIST
    ).length;

    const total = confirmed + waitlisted;
    const capacity = classData.maxEntries || null;
    const availableSpots = capacity ? Math.max(0, capacity - confirmed) : null;
    const isFull = capacity ? confirmed >= capacity : false;

    return {
      confirmed,
      waitlisted,
      total,
      capacity,
      availableSpots,
      isFull,
    };
  }

  /**
   * Helper methods
   */
  private static hasTimeConflict(class1: Class, class2: Class | null): boolean {
    if (!class1.startTime || !class2?.startTime) return false;

    // Simple time overlap check - could be enhanced with more sophisticated scheduling logic
    const start1 = new Date(class1.startTime);
    const end1 = new Date(start1.getTime() + (class1.estimatedDuration || 60) * 60000);
    const start2 = new Date(class2.startTime);
    const end2 = new Date(start2.getTime() + (class2.estimatedDuration || 60) * 60000);

    return start1 < end2 && start2 < end1;
  }

  private static getClassById(_classId: string, _context: LimitCheckContext): Class | null {
    // In a real implementation, this would fetch class data from the store
    // For now, return null to avoid conflicts
    return null;
  }

  private static isEntryInTrial(entry: ShowEntry, trial: Trial): boolean {
    if (!trial.classes) return false;
    return trial.classes.some(c => c.id === entry.classId);
  }

  private static isEntryDataInTrial(entryData: ShowEntryInput, trial: Trial): boolean {
    if (!trial.classes) return false;
    return trial.classes.some(c => c.id === entryData.classId);
  }
}
