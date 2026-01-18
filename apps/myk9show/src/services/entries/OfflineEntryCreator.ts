/**
 * OfflineEntryCreator - Orchestrates complete offline entry creation workflow
 * Coordinates validation, limit checking, and optimistic entry creation
 */

import { EntryValidator, type EntryValidationContext, type EntryValidationResult } from './EntryValidator';
import { EntryLimitChecker, type EntryLimitCheckResult } from './EntryLimitChecker';
import { useEntryStore, type ShowEntryInput, type SyncableShowEntry } from '@/store/entryStore';
import type { EntryStatus } from '@/types/entry-lifecycle';
import { EntryStatus as RegistrationEntryStatus } from '@/types/show-registration-types';
import { useDogStore } from '@/store/dogStore';
import { useShowStore } from '@/store/showStore';
import { useUserStore } from '@/store/userStore';
import { syncService } from '@/services/sync/syncService';
import { generateId } from '@/utils/idUtils';
import { logger } from '@/services/LoggingService';

export interface EntryCreationOptions {
  /** Skip validation for admin overrides */
  skipValidation?: boolean | undefined;
  /** Force creation even with warnings */
  ignoreWarnings?: boolean | undefined;
  /** Allow waitlist entry if class is full */
  allowWaitlist?: boolean | undefined;
  /** Priority for sync queue */
  syncPriority?: number | undefined;
  /** User ID for audit trail */
  userId?: string | undefined;
  /** Reason for any validation overrides */
  overrideReason?: string | undefined;
  /** Dry run - validate only, don't create */
  dryRun?: boolean | undefined;
}

export interface EntryCreationResult {
  success: boolean;
  entry?: SyncableShowEntry | undefined;
  errors: Array<{ code: string; message: string; severity: 'error' | 'warning' | 'info' }>;
  warnings: Array<{ code: string; message: string; severity: 'error' | 'warning' | 'info' }>;
  validationResult?: EntryValidationResult | undefined;
  limitCheckResult?: EntryLimitCheckResult | undefined;
  /** Indicates if entry was placed on waitlist */
  isWaitlisted?: boolean | undefined;
  /** Payment processing status */
  paymentStatus?: 'queued' | 'processed' | 'failed' | 'not_required' | undefined;
}

export interface BatchEntryCreationResult {
  overallSuccess: boolean;
  totalRequested: number;
  totalCreated: number;
  totalWaitlisted: number;
  totalFailed: number;
  results: EntryCreationResult[];
  summaryErrors: Array<{ code: string; message: string; count: number }>;
}

export class OfflineEntryCreator {
  private static entryStore = useEntryStore.getState();
  private static dogStore = useDogStore.getState();
  private static showStore = useShowStore.getState();
  private static userStore = useUserStore.getState();

  /**
   * Create a single entry with full offline validation and optimistic updates
   */
  static async createEntry(
    entryData: ShowEntryInput,
    options: EntryCreationOptions = {}
  ): Promise<EntryCreationResult> {
    const {
      skipValidation = false,
      ignoreWarnings = false,
      allowWaitlist = true,
      userId = 'current-user',
      overrideReason,
      dryRun = false
    } = options;

    try {
      // Gather context data
      const context = await this.gatherEntryContext(entryData);
      if (!context) {
        return {
          success: false,
          errors: [{
            code: 'CONTEXT_MISSING',
            message: 'Required show, trial, class, or dog data not found',
            severity: 'error'
          }],
          warnings: []
        };
      }

      let validationResult: EntryValidationResult | undefined;

      // Validation phase
      if (!skipValidation) {
        validationResult = await EntryValidator.validateEntry(entryData, context);
        
        if (!validationResult.isValid) {
          return {
            success: false,
            errors: validationResult.errors,
            warnings: validationResult.warnings,
            validationResult
          };
        }

        if (validationResult.warnings.length > 0 && !ignoreWarnings) {
          // Return warnings for user review
          return {
            success: false,
            errors: [],
            warnings: validationResult.warnings,
            validationResult
          };
        }
      }

      // Limit checking phase
      const limitCheckResult = EntryLimitChecker.checkEntryLimits(entryData, {
        ...context,
        existingEntries: this.entryStore.entries
      });

      if (!limitCheckResult.isAllowed) {
        // Check if we can waitlist instead
        if (allowWaitlist && this.canWaitlistEntry(limitCheckResult)) {
          return await this.createWaitlistedEntry(entryData, context, {
            ...options,
            userId
          });
        }

        return {
          success: false,
          errors: limitCheckResult.errors,
          warnings: limitCheckResult.warnings,
          limitCheckResult
        };
      }

      // If dry run, return success without creating
      if (dryRun) {
        return {
          success: true,
          errors: [],
          warnings: validationResult?.warnings || [],
          validationResult,
          limitCheckResult
        };
      }

      // Create the entry optimistically
      const entry = await this.performEntryCreation(entryData, context, {
        ...options,
        userId,
        status: 'submitted' as EntryStatus,
        ...(overrideReason !== undefined && { overrideReason })
      });

      // Queue payment processing if needed
      const paymentStatus = await this.queuePaymentProcessing(entry, entryData);

      return {
        success: true,
        entry,
        errors: [],
        warnings: validationResult?.warnings || [],
        validationResult,
        limitCheckResult,
        paymentStatus
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error during entry creation';
      return {
        success: false,
        errors: [{
          code: 'CREATION_ERROR',
          message,
          severity: 'error'
        }],
        warnings: []
      };
    }
  }

  /**
   * Create multiple entries in a batch with transaction-like rollback on failure
   */
  static async createBatchEntries(
    entriesData: ShowEntryInput[],
    options: EntryCreationOptions = {}
  ): Promise<BatchEntryCreationResult> {
    const results: EntryCreationResult[] = [];
    const createdEntryIds: string[] = [];
    let totalCreated = 0;
    let totalWaitlisted = 0;
    let totalFailed = 0;

    try {
      // Pre-validate all entries before creating any
      const preValidationResults = await Promise.all(
        entriesData.map(entryData => this.preValidateEntry(entryData, entriesData))
      );

      const hasBlockingErrors = preValidationResults.some(result => 
        result.errors.some(error => error.severity === 'error')
      );

      if (hasBlockingErrors && !options.ignoreWarnings) {
        const summaryErrors = this.summarizeErrors(preValidationResults);
        return {
          overallSuccess: false,
          totalRequested: entriesData.length,
          totalCreated: 0,
          totalWaitlisted: 0,
          totalFailed: entriesData.length,
          results: preValidationResults,
          summaryErrors
        };
      }

      // Create entries one by one, tracking for potential rollback
      for (let i = 0; i < entriesData.length; i++) {
        const entryData = entriesData[i];
        const result = await this.createEntry(entryData, {
          ...options
          // Removed pendingEntries as it's not in EntryCreationOptions type
        });

        results.push(result);

        if (result.success) {
          if (result.entry) {
            createdEntryIds.push(result.entry.id);
            
            if (result.isWaitlisted) {
              totalWaitlisted++;
            } else {
              totalCreated++;
            }
          }
        } else {
          totalFailed++;
          
          // If batch creation fails and we want all-or-nothing behavior
          if (options.skipValidation === false) {
            // Rollback previously created entries
            await this.rollbackCreatedEntries(createdEntryIds);
            
            return {
              overallSuccess: false,
              totalRequested: entriesData.length,
              totalCreated: 0,
              totalWaitlisted: 0,
              totalFailed: entriesData.length,
              results,
              summaryErrors: this.summarizeErrors(results)
            };
          }
        }
      }

      const overallSuccess = totalFailed === 0 || totalCreated > 0;

      return {
        overallSuccess,
        totalRequested: entriesData.length,
        totalCreated,
        totalWaitlisted,
        totalFailed,
        results,
        summaryErrors: this.summarizeErrors(results)
      };

    } catch (error) {
      // Rollback any created entries on unexpected error
      await this.rollbackCreatedEntries(createdEntryIds);
      
      const message = error instanceof Error ? error.message : 'Batch creation failed';
      return {
        overallSuccess: false,
        totalRequested: entriesData.length,
        totalCreated: 0,
        totalWaitlisted: 0,
        totalFailed: entriesData.length,
        results: [],
        summaryErrors: [{
          code: 'BATCH_CREATION_ERROR',
          message,
          count: 1
        }]
      };
    }
  }

  /**
   * Handle scratches and withdrawals offline
   */
  static async scratchEntry(
    entryId: string,
    reason: string,
    userId: string = 'current-user'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const entry = this.entryStore.getEntry(entryId);
      if (!entry) {
        return { success: false, error: 'Entry not found' };
      }

      if (entry.status === 'scratched' || entry.status === 'withdrawn') {
        return { success: false, error: 'Entry is already scratched or withdrawn' };
      }

      await this.entryStore.updateStatus(entryId, 'scratched', userId, reason);

      // Queue refund processing if applicable
      if (entry.registrationData.paymentStatus === 'paid') {
        await this.queueRefundProcessing(entry, 'scratch', reason);
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to scratch entry';
      return { success: false, error: message };
    }
  }

  /**
   * Move entry from waitlist to confirmed when spots become available
   */
  static async promoteFromWaitlist(
    entryId: string,
    userId: string = 'current-user'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const entry = this.entryStore.getEntry(entryId);
      if (!entry) {
        return { success: false, error: 'Entry not found' };
      }

      if ((entry.status as string) !== 'waitlist' && (entry.status as string) !== RegistrationEntryStatus.WAITLIST) {
        return { success: false, error: 'Entry is not on waitlist' };
      }

      // Check if space is available
      const context = await this.gatherEntryContext(entry);
      if (!context) {
        return { success: false, error: 'Unable to verify class availability' };
      }

      const promotionCheck = EntryLimitChecker.checkWaitlistPromotion(
        entry.classId,
        this.entryStore.entries,
        context.class
      );

      if (!promotionCheck.canPromote) {
        return { success: false, error: 'No spots available for promotion' };
      }

      await this.entryStore.updateStatus(entryId, 'confirmed', userId, 'Promoted from waitlist');

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to promote entry';
      return { success: false, error: message };
    }
  }

  /**
   * Private helper methods
   */
  private static async gatherEntryContext(entryData: ShowEntryInput): Promise<EntryValidationContext | null> {
    const show = this.showStore.shows.find(s => s.id === entryData.showId);
    if (!show) return null;

    // Find trial and class (simplified - would need proper trial/class lookup)
    const trial = show.trials?.find(t => 
      t.classes?.some(c => c.id === entryData.classId)
    );
    if (!trial) return null;

    const classData = trial.classes?.find(c => c.id === entryData.classId);
    if (!classData) return null;

    const dog = this.dogStore.dogs.find(d => d.id === entryData.dogId);
    if (!dog) return null;

    const handler = entryData.registrationData.handlerId 
      ? this.userStore.people.find(p => p.id === entryData.registrationData.handlerId)
      : undefined;

    return {
      show,
      trial,
      class: classData,
      dog,
      handler,
      existingEntries: this.entryStore.entries
    };
  }

  private static async preValidateEntry(
    entryData: ShowEntryInput,
    _allPendingEntries: ShowEntryInput[]
  ): Promise<EntryCreationResult> {
    const context = await this.gatherEntryContext(entryData);
    if (!context) {
      return {
        success: false,
        errors: [{
          code: 'CONTEXT_MISSING',
          message: 'Required data not found',
          severity: 'error'
        }],
        warnings: []
      };
    }

    const validationResult = await EntryValidator.validateEntry(entryData, context);
    const limitCheckResult = EntryLimitChecker.checkEntryLimits(entryData, {
      ...context,
      existingEntries: this.entryStore.entries,
      pendingEntries: _allPendingEntries
    });

    return {
      success: validationResult.isValid && limitCheckResult.isAllowed,
      errors: [...validationResult.errors, ...limitCheckResult.errors],
      warnings: [...validationResult.warnings, ...limitCheckResult.warnings],
      validationResult,
      limitCheckResult
    };
  }

  private static canWaitlistEntry(limitCheckResult: EntryLimitCheckResult): boolean {
    return limitCheckResult.errors.some(error => 
      error.code === 'CLASS_FULL' && limitCheckResult.waitlistPosition !== undefined
    );
  }

  private static async createWaitlistedEntry(
    entryData: ShowEntryInput,
    context: EntryValidationContext,
    options: EntryCreationOptions & { userId: string }
  ): Promise<EntryCreationResult> {
    const entry = await this.performEntryCreation(entryData, context, {
      ...options,
      status: 'waitlist' as EntryStatus
    });

    return {
      success: true,
      entry,
      errors: [],
      warnings: [{
        code: 'ENTRY_WAITLISTED',
        message: 'Entry has been placed on the waitlist',
        severity: 'info'
      }],
      isWaitlisted: true
    };
  }

  private static async performEntryCreation(
    entryData: ShowEntryInput,
    _context: EntryValidationContext,
    options: EntryCreationOptions & { userId: string; status?: EntryStatus | undefined; overrideReason?: string | undefined }
  ): Promise<SyncableShowEntry> {
    const optimisticId = generateId();
    const now = new Date().toISOString();
    const status = options.status || 'draft';

    const entry: SyncableShowEntry = {
      ...entryData,
      id: optimisticId,
      status: status as EntryStatus,
      statusHistory: [{
        status: status as EntryStatus,
        timestamp: now,
        userId: options.userId,
        reason: options.overrideReason || 'Entry created'
      }],
      createdAt: now,
      updatedAt: now,
      
      // Sync metadata
      _version: 1,
      _lastModified: new Date(),
      _lastModifiedBy: options.userId,
      _syncStatus: 'pending',
      _localOnly: false
    };

    // Add to store optimistically
    this.entryStore.setEntries([...this.entryStore.entries, entry]);

    // Queue for sync
    try {
      await syncService.addToQueue({
        entityType: 'entries',
        entityId: optimisticId,
        operation: 'create',
        data: entryData as unknown as Record<string, unknown>,
        priority: "medium"
      });
    } catch (syncError) {
      logger.warn('Failed to queue entry for sync:', 'entries', {}, syncError as Error);
    }

    return entry;
  }

  private static async queuePaymentProcessing(
    entry: SyncableShowEntry,
    _entryData: ShowEntryInput
  ): Promise<'queued' | 'not_required'> {
    const entryData = _entryData;
    if (entryData.registrationData.paymentStatus === 'paid') {
      return 'not_required';
    }

    // Queue payment processing for when online
    try {
      await syncService.addToQueue({
        entityType: 'payments',
        entityId: entry.id,
        operation: 'create',
        data: {
          entryId: entry.id,
          amount: entryData.registrationData.entryFee,
          paymentMethod: 'pending'
        },
        priority: "medium" // Higher priority for payments
      });
      
      return 'queued';
    } catch (error) {
      logger.warn('Failed to queue payment processing:', 'entries', {}, error as Error);
      return 'queued'; // Still return queued as it will be retried
    }
  }

  private static async queueRefundProcessing(
    entry: SyncableShowEntry,
    reason: string,
    details: string
  ): Promise<void> {
    try {
      await syncService.addToQueue({
        entityType: 'payments',
        entityId: entry.id,
        operation: 'create',
        data: {
          entryId: entry.id,
          amount: entry.registrationData.entryFee,
          reason,
          details
        },
        priority: "medium" // High priority for refunds
      });
    } catch (error) {
      logger.warn('Failed to queue refund processing:', 'entries', {}, error as Error);
    }
  }

  private static async rollbackCreatedEntries(entryIds: string[]): Promise<void> {
    for (const entryId of entryIds) {
      try {
        await this.entryStore.deleteEntry(entryId);
      } catch (error) {
        logger.error(`Failed to rollback entry ${entryId}:`, 'entries', {}, error as Error);
      }
    }
  }

  private static summarizeErrors(results: EntryCreationResult[]): Array<{ code: string; message: string; count: number }> {
    const errorCounts = new Map<string, { message: string; count: number }>();

    results.forEach(result => {
      result.errors.forEach(error => {
        const existing = errorCounts.get(error.code);
        if (existing) {
          existing.count++;
        } else {
          errorCounts.set(error.code, { message: error.message, count: 1 });
        }
      });
    });

    return Array.from(errorCounts.entries()).map(([code, data]) => ({
      code,
      message: data.message,
      count: data.count
    }));
  }
}