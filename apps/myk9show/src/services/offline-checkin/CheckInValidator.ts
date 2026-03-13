/**
 * Check-In Validator
 *
 * Provides comprehensive validation for check-in operations,
 * ensuring data integrity and business rule compliance.
 */

import type {
  CheckInEntry,
  CheckInValidationResult,
  CheckInTimeWindow,
  ArmbandAssignment,
} from '@/types/offline-checkin-types';
import type { CheckInStatus } from '@myk9/core';

export interface ValidationContext {
  currentTime: Date;
  allowLateCheckIn: boolean;
  allowEarlyCheckIn: boolean;
  strictValidation: boolean;
  timeWindowMinutes: number;
  maxAdvanceCheckInHours: number;
}

export interface ValidationRule {
  name: string;
  check:
    | 'entry_exists'
    | 'armband_unique'
    | 'time_window'
    | 'handler_eligible'
    | 'dog_eligible'
    | 'class_open'
    | 'duplicate_checkin'
    | 'status_transition'
    | 'special_requirements'
    | 'data_integrity';
  severity: 'error' | 'warning' | 'info';
  validator: (
    entry: CheckInEntry,
    newStatus: CheckInStatus,
    context: ValidationContext,
    data?: {
      allEntries?: CheckInEntry[];
      armbandAssignments?: ArmbandAssignment[];
      timeWindows?: CheckInTimeWindow[];
      handlerChange?: string;
      specialRequests?: string;
    }
  ) => Promise<CheckInValidationResult | null>;
}

const DEFAULT_CONTEXT: ValidationContext = {
  currentTime: new Date(),
  allowLateCheckIn: true,
  allowEarlyCheckIn: true,
  strictValidation: true,
  timeWindowMinutes: 30,
  maxAdvanceCheckInHours: 2,
};

export class CheckInValidator {
  private rules: Map<string, ValidationRule> = new Map();
  private context: ValidationContext;

  constructor(context: Partial<ValidationContext> = {}) {
    this.context = { ...DEFAULT_CONTEXT, ...context };
    this.initializeRules();
  }

  async validateCheckIn(
    entry: CheckInEntry,
    newStatus: CheckInStatus,
    additionalData?: {
      allEntries?: CheckInEntry[];
      armbandAssignments?: ArmbandAssignment[];
      timeWindows?: CheckInTimeWindow[];
      handlerChange?: string;
      specialRequests?: string;
    }
  ): Promise<CheckInValidationResult[]> {
    const results: CheckInValidationResult[] = [];

    for (const rule of this.rules.values()) {
      try {
        const result = await rule.validator(entry, newStatus, this.context, additionalData);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        results.push({
          check: rule.check,
          status: 'error',
          message: `Validation rule ${rule.name} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: { rule: rule.name, error },
        });
      }
    }

    return results;
  }

  async validateBulkCheckIn(
    entries: CheckInEntry[],
    newStatus: CheckInStatus,
    additionalData?: unknown
  ): Promise<Map<string, CheckInValidationResult[]>> {
    const results = new Map<string, CheckInValidationResult[]>();

    for (const entry of entries) {
      const additionalDataTyped =
        (additionalData as {
          allEntries?: CheckInEntry[];
          armbandAssignments?: ArmbandAssignment[];
          timeWindows?: CheckInTimeWindow[];
          handlerChange?: string;
          specialRequests?: string;
        }) || {};
      const entryResults = await this.validateCheckIn(entry, newStatus, {
        ...additionalDataTyped,
        allEntries: entries,
      });
      results.set(entry.id, entryResults);
    }

    return results;
  }

  addRule(rule: ValidationRule): void {
    this.rules.set(rule.name, rule);
  }

  removeRule(name: string): void {
    this.rules.delete(name);
  }

  updateContext(context: Partial<ValidationContext>): void {
    this.context = { ...this.context, ...context };
  }

  getValidationSummary(results: CheckInValidationResult[]): {
    hasErrors: boolean;
    hasWarnings: boolean;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    errors: string[];
    warnings: string[];
  } {
    const errors = results.filter(r => r.status === 'error');
    const warnings = results.filter(r => r.status === 'warning');
    const info = results.filter(r => r.status === 'pass');

    return {
      hasErrors: errors.length > 0,
      hasWarnings: warnings.length > 0,
      errorCount: errors.length,
      warningCount: warnings.length,
      infoCount: info.length,
      errors: errors.map(e => e.message),
      warnings: warnings.map(w => w.message),
    };
  }

  private initializeRules(): void {
    // Entry existence validation
    this.addRule({
      name: 'entry_exists',
      check: 'entry_exists',
      severity: 'error',
      validator: async entry => {
        if (!entry || !entry.id) {
          return {
            check: 'entry_exists',
            status: 'error',
            message: 'Entry does not exist or has invalid ID',
            details: { entryId: entry?.id },
          };
        }
        return {
          check: 'entry_exists',
          status: 'pass',
          message: 'Entry exists and is valid',
        };
      },
    });

    // Armband uniqueness validation
    this.addRule({
      name: 'armband_unique',
      check: 'armband_unique',
      severity: 'error',
      validator: async (entry, newStatus, _context, data) => {
        if (newStatus !== 'checked-in') {
          return null; // Only validate for check-in operations
        }

        const additionalData =
          (data as {
            allEntries?: CheckInEntry[];
            armbandAssignments?: ArmbandAssignment[];
            timeWindows?: CheckInTimeWindow[];
            handlerChange?: string;
            specialRequests?: string;
          }) || {};
        const allEntries = additionalData.allEntries || [];
        const conflictingEntry = allEntries.find(
          e =>
            e.id !== entry.id &&
            e.classId === entry.classId &&
            e.armband === entry.armband &&
            e.checkInStatus === 'checked-in'
        );

        if (conflictingEntry) {
          return {
            check: 'armband_unique',
            status: 'error',
            message: `Armband ${entry.armband} is already checked in for another entry in this class`,
            details: {
              conflictingEntryId: conflictingEntry.id,
              conflictingDogName: conflictingEntry.dogName,
              armband: entry.armband,
              classId: entry.classId,
            },
          };
        }

        return {
          check: 'armband_unique',
          status: 'pass',
          message: 'Armband is unique within class',
        };
      },
    });

    // Time window validation
    this.addRule({
      name: 'time_window',
      check: 'time_window',
      severity: 'warning',
      validator: async (entry, newStatus, context) => {
        if (!entry.estimatedStartTime || newStatus !== 'checked-in') {
          return null;
        }

        const now = context.currentTime;
        const classStart = new Date(entry.estimatedStartTime);
        const timeDiffMs = classStart.getTime() - now.getTime();
        const hoursUntilStart = timeDiffMs / (1000 * 60 * 60);

        // Check if too early
        if (hoursUntilStart > context.maxAdvanceCheckInHours) {
          const severity = context.strictValidation ? 'error' : 'warning';
          return {
            check: 'time_window',
            status: severity,
            message: `Check-in is ${Math.round(hoursUntilStart * 10) / 10} hours before class start (max ${context.maxAdvanceCheckInHours} hours)`,
            details: {
              hoursUntilStart,
              estimatedStartTime: entry.estimatedStartTime,
              maxAdvanceHours: context.maxAdvanceCheckInHours,
            },
          };
        }

        // Check if class has already started
        if (hoursUntilStart < -0.5) {
          if (!context.allowLateCheckIn) {
            return {
              check: 'time_window',
              status: 'error',
              message: 'Class has already started and late check-in is not allowed',
              details: { hoursUntilStart, estimatedStartTime: entry.estimatedStartTime },
            };
          } else {
            return {
              check: 'time_window',
              status: 'warning',
              message: `Late check-in: class started ${Math.abs(Math.round(hoursUntilStart * 60))} minutes ago`,
              details: { hoursUntilStart, estimatedStartTime: entry.estimatedStartTime },
            };
          }
        }

        // Check if within warning window (last 30 minutes)
        if (hoursUntilStart < context.timeWindowMinutes / 60 && hoursUntilStart > 0) {
          return {
            check: 'time_window',
            status: 'warning',
            message: `Check-in close to class start time (${Math.round(hoursUntilStart * 60)} minutes remaining)`,
            details: { hoursUntilStart, estimatedStartTime: entry.estimatedStartTime },
          };
        }

        return {
          check: 'time_window',
          status: 'pass',
          message: 'Check-in timing is appropriate',
        };
      },
    });

    // Duplicate check-in validation
    this.addRule({
      name: 'duplicate_checkin',
      check: 'duplicate_checkin',
      severity: 'warning',
      validator: async (entry, newStatus) => {
        if (entry.checkInStatus === 'checked-in' && newStatus === 'checked-in') {
          return {
            check: 'duplicate_checkin',
            status: 'warning',
            message: 'Entry is already checked in',
            details: {
              currentStatus: entry.checkInStatus,
              checkInTime: entry.checkInTime,
              checkInGate: entry.checkInGate,
            },
          };
        }
        return null;
      },
    });

    // Status transition validation
    this.addRule({
      name: 'status_transition',
      check: 'status_transition',
      severity: 'error',
      validator: async (entry, newStatus) => {
        const validTransitions = this.getValidStatusTransitions(entry.checkInStatus);

        if (!validTransitions.includes(newStatus)) {
          return {
            check: 'status_transition',
            status: 'error',
            message: `Invalid status transition from '${entry.checkInStatus}' to '${newStatus}'`,
            details: {
              currentStatus: entry.checkInStatus,
              requestedStatus: newStatus,
              validTransitions,
            },
          };
        }

        return {
          check: 'status_transition',
          status: 'pass',
          message: 'Status transition is valid',
        };
      },
    });

    // Handler eligibility validation
    this.addRule({
      name: 'handler_eligible',
      check: 'handler_eligible',
      severity: 'warning',
      validator: async (entry, newStatus, _context, data) => {
        if (newStatus !== 'checked-in') {
          return null;
        }

        const additionalData =
          (data as {
            allEntries?: CheckInEntry[];
            armbandAssignments?: ArmbandAssignment[];
            timeWindows?: CheckInTimeWindow[];
            handlerChange?: string;
            specialRequests?: string;
          }) || {};

        // Check for handler changes
        if (additionalData.handlerChange) {
          return {
            check: 'handler_eligible',
            status: 'warning',
            message: 'Handler change requested - verify eligibility',
            details: {
              originalHandler: entry.handlerName,
              newHandler: additionalData.handlerChange,
            },
          };
        }

        // Basic handler validation (placeholder for more complex rules)
        if (!entry.handlerName || entry.handlerName.trim().length === 0) {
          return {
            check: 'handler_eligible',
            status: 'error',
            message: 'Handler name is required',
            details: { handlerId: entry.handlerId },
          };
        }

        return {
          check: 'handler_eligible',
          status: 'pass',
          message: 'Handler is eligible',
        };
      },
    });

    // Dog eligibility validation
    this.addRule({
      name: 'dog_eligible',
      check: 'dog_eligible',
      severity: 'error',
      validator: async (entry, newStatus) => {
        if (newStatus !== 'checked-in') {
          return null;
        }

        // Basic dog validation
        if (!entry.dogName || entry.dogName.trim().length === 0) {
          return {
            check: 'dog_eligible',
            status: 'error',
            message: 'Dog name is required',
            details: { dogId: entry.dogId },
          };
        }

        if (!entry.dogBreed || entry.dogBreed.trim().length === 0) {
          return {
            check: 'dog_eligible',
            status: 'warning',
            message: 'Dog breed is not specified',
            details: { dogId: entry.dogId, dogName: entry.dogName },
          };
        }

        return {
          check: 'dog_eligible',
          status: 'pass',
          message: 'Dog is eligible',
        };
      },
    });

    // Special requirements validation
    this.addRule({
      name: 'special_requirements',
      check: 'special_requirements',
      severity: 'info',
      validator: async (entry, _newStatus, _context, data) => {
        const additionalData =
          (data as {
            allEntries?: CheckInEntry[];
            armbandAssignments?: ArmbandAssignment[];
            timeWindows?: CheckInTimeWindow[];
            handlerChange?: string;
            specialRequests?: string;
          }) || {};
        const hasSpecialRequests = entry.specialRequests || additionalData.specialRequests;

        if (hasSpecialRequests) {
          return {
            check: 'special_requirements',
            status: 'warning',
            message: 'Entry has special requirements - please review',
            details: {
              specialRequests: entry.specialRequests || additionalData.specialRequests,
            },
          };
        }

        return null;
      },
    });

    // Data integrity validation
    this.addRule({
      name: 'data_integrity',
      check: 'data_integrity',
      severity: 'error',
      validator: async entry => {
        const issues: string[] = [];

        if (!entry.showId) issues.push('Missing show ID');
        if (!entry.classId) issues.push('Missing class ID');
        if (!entry.dogId) issues.push('Missing dog ID');
        if (!entry.handlerId) issues.push('Missing handler ID');
        if (!entry.armband) issues.push('Missing armband');
        if (entry.runOrder <= 0) issues.push('Invalid run order');

        if (issues.length > 0) {
          return {
            check: 'data_integrity',
            status: 'error',
            message: `Data integrity issues: ${issues.join(', ')}`,
            details: { issues, entryId: entry.id },
          };
        }

        return {
          check: 'data_integrity',
          status: 'pass',
          message: 'Data integrity is valid',
        };
      },
    });
  }

  private getValidStatusTransitions(currentStatus: CheckInStatus): CheckInStatus[] {
    const transitions: Record<CheckInStatus, CheckInStatus[]> = {
      'no-status': ['checked-in', 'pulled'],
      'checked-in': ['at-gate', 'come-to-gate', 'pulled'],
      conflict: ['checked-in', 'pulled'],
      pulled: [], // Cannot transition from pulled
      'at-gate': ['come-to-gate'],
      'come-to-gate': ['at-gate', 'checked-in'],
      'in-ring': ['completed'],
      completed: ['no-status'],
    };

    return transitions[currentStatus] || [];
  }
}

export const checkInValidator = new CheckInValidator();
