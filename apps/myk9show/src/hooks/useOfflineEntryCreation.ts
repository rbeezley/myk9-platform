/**
 * useOfflineEntryCreation - React hook for offline entry creation with validation
 * Provides an easy interface for components to create entries with full offline support
 */

import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  OfflineEntryCreator,
  type EntryCreationOptions,
  type EntryCreationResult,
  type BatchEntryCreationResult,
} from '@/services/entries/OfflineEntryCreator';
import {
  EntryLimitChecker,
  type EntryLimitCheckResult,
} from '@/services/entries/EntryLimitChecker';
import { useEntryStore, type ShowEntryInput } from '@/store/entryStore';
import { useDogStore } from '@/store/dogStore';
import { useShowStore } from '@/store/showStore';
import { useAuthContext } from '@/hooks/useAuthContext';

export interface OfflineEntryCreationState {
  isCreating: boolean;
  isValidating: boolean;
  hasUnsavedChanges: boolean;
  lastValidation?: {
    isValid: boolean;
    errors: Array<{ code: string; message: string; severity: 'error' | 'warning' | 'info' }>;
    warnings: Array<{ code: string; message: string; severity: 'error' | 'warning' | 'info' }>;
  };
  lastCreationResult?: EntryCreationResult;
}

export interface OfflineEntryCreationActions {
  createEntry: (
    entryData: ShowEntryInput,
    options?: EntryCreationOptions
  ) => Promise<EntryCreationResult>;
  createBatchEntries: (
    entriesData: ShowEntryInput[],
    options?: EntryCreationOptions
  ) => Promise<BatchEntryCreationResult>;
  validateEntry: (entryData: ShowEntryInput) => Promise<EntryCreationResult>;
  checkLimits: (entryData: ShowEntryInput) => Promise<EntryLimitCheckResult>;
  scratchEntry: (entryId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  promoteFromWaitlist: (entryId: string) => Promise<{ success: boolean; error?: string }>;
  getClassStats: (classId: string) => {
    confirmed: number;
    waitlisted: number;
    total: number;
    capacity: number | null;
    availableSpots: number | null;
    isFull: boolean;
  };
  clearValidation: () => void;
  reset: () => void;
}

export interface UseOfflineEntryCreationResult
  extends OfflineEntryCreationState, OfflineEntryCreationActions {}

/**
 * Hook for offline entry creation with comprehensive validation and limit checking
 */
export function useOfflineEntryCreation(): UseOfflineEntryCreationResult {
  const [state, setState] = useState<OfflineEntryCreationState>({
    isCreating: false,
    isValidating: false,
    hasUnsavedChanges: false,
  });

  const { entries } = useEntryStore();
  const { dogs } = useDogStore();
  const { shows } = useShowStore();
  const { user } = useAuthContext();

  const userId = user?.id || 'current-user';

  /**
   * Create a single entry with full validation
   */
  const createEntry = useCallback(
    async (
      entryData: ShowEntryInput,
      options: EntryCreationOptions = {}
    ): Promise<EntryCreationResult> => {
      setState(prev => ({ ...prev, isCreating: true, hasUnsavedChanges: false }));

      try {
        const result = await OfflineEntryCreator.createEntry(entryData, {
          userId,
          ...options,
        });

        setState(prev => ({
          ...prev,
          isCreating: false,
          lastCreationResult: result,
          lastValidation: {
            isValid: result.success,
            errors: result.errors,
            warnings: result.warnings,
          },
        }));

        // Show user feedback
        if (result.success) {
          if (result.isWaitlisted) {
            toast.success('Entry added to waitlist', {
              description: 'You will be notified if a spot becomes available',
            });
          } else {
            toast.success('Entry created successfully', {
              description: 'Your entry has been submitted and is pending payment',
            });
          }
        } else {
          const errorMessage = result.errors[0]?.message || 'Failed to create entry';
          toast.error('Entry creation failed', {
            description: errorMessage,
          });
        }

        return result;
      } catch (error) {
        setState(prev => ({ ...prev, isCreating: false }));

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error('Entry creation failed', {
          description: errorMessage,
        });

        return {
          success: false,
          errors: [
            {
              code: 'CREATION_ERROR',
              message: errorMessage,
              severity: 'error',
            },
          ],
          warnings: [],
        };
      }
    },
    [userId]
  );

  /**
   * Create multiple entries in a batch
   */
  const createBatchEntries = useCallback(
    async (
      entriesData: ShowEntryInput[],
      options: EntryCreationOptions = {}
    ): Promise<BatchEntryCreationResult> => {
      setState(prev => ({ ...prev, isCreating: true, hasUnsavedChanges: false }));

      try {
        const result = await OfflineEntryCreator.createBatchEntries(entriesData, {
          userId,
          ...options,
        });

        setState(prev => ({ ...prev, isCreating: false }));

        // Show user feedback
        if (result.overallSuccess) {
          toast.success('Batch entries created', {
            description: `${result.totalCreated} entries created, ${result.totalWaitlisted} waitlisted`,
          });
        } else {
          toast.error('Some entries failed', {
            description: `${result.totalCreated} created, ${result.totalFailed} failed`,
          });
        }

        return result;
      } catch (error) {
        setState(prev => ({ ...prev, isCreating: false }));

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error('Batch creation failed', {
          description: errorMessage,
        });

        return {
          overallSuccess: false,
          totalRequested: entriesData.length,
          totalCreated: 0,
          totalWaitlisted: 0,
          totalFailed: entriesData.length,
          results: [],
          summaryErrors: [
            {
              code: 'BATCH_ERROR',
              message: errorMessage,
              count: 1,
            },
          ],
        };
      }
    },
    [userId]
  );

  /**
   * Validate an entry without creating it
   */
  const validateEntry = useCallback(
    async (entryData: ShowEntryInput): Promise<EntryCreationResult> => {
      setState(prev => ({ ...prev, isValidating: true }));

      try {
        const result = await OfflineEntryCreator.createEntry(entryData, {
          skipValidation: false,
          ignoreWarnings: false,
          userId,
          // Dry run - don't actually create
          dryRun: true,
        });

        setState(prev => ({
          ...prev,
          isValidating: false,
          lastValidation: {
            isValid: result.success,
            errors: result.errors,
            warnings: result.warnings,
          },
        }));

        return result;
      } catch (error) {
        setState(prev => ({ ...prev, isValidating: false }));

        const errorMessage = error instanceof Error ? error.message : 'Validation failed';
        return {
          success: false,
          errors: [
            {
              code: 'VALIDATION_ERROR',
              message: errorMessage,
              severity: 'error',
            },
          ],
          warnings: [],
        };
      }
    },
    [userId]
  );

  /**
   * Check entry limits for a potential entry
   */
  const checkLimits = useCallback(
    async (entryData: ShowEntryInput): Promise<EntryLimitCheckResult> => {
      const show = shows.find(s => s.id === entryData.showId);
      const dog = dogs.find(d => d.id === entryData.dogId);

      if (!show || !dog) {
        return {
          isAllowed: false,
          isWaitlisted: false,
          errors: [
            {
              code: 'DATA_NOT_FOUND',
              message: 'Show or dog data not found',
              severity: 'error',
            },
          ],
          warnings: [],
        };
      }

      // Find trial and class data
      const trial = show.trials?.find(t => t.classes?.some(c => c.id === entryData.classId));

      const classData = trial?.classes?.find(c => c.id === entryData.classId);

      if (!trial || !classData) {
        return {
          isAllowed: false,
          isWaitlisted: false,
          errors: [
            {
              code: 'CLASS_NOT_FOUND',
              message: 'Trial or class data not found',
              severity: 'error',
            },
          ],
          warnings: [],
        };
      }

      return EntryLimitChecker.checkEntryLimits(entryData, {
        show,
        trial,
        class: classData,
        dog,
        existingEntries: entries,
      });
    },
    [shows, dogs, entries]
  );

  /**
   * Scratch an existing entry
   */
  const scratchEntry = useCallback(
    async (entryId: string, reason: string): Promise<{ success: boolean; error?: string }> => {
      const result = await OfflineEntryCreator.scratchEntry(entryId, reason, userId);

      if (result.success) {
        toast.success('Entry scratched', {
          description: 'Entry has been scratched and refund processing queued',
        });
      } else {
        toast.error('Failed to scratch entry', {
          description: result.error,
        });
      }

      return result;
    },
    [userId]
  );

  /**
   * Promote entry from waitlist
   */
  const promoteFromWaitlist = useCallback(
    async (entryId: string): Promise<{ success: boolean; error?: string }> => {
      const result = await OfflineEntryCreator.promoteFromWaitlist(entryId, userId);

      if (result.success) {
        toast.success('Entry promoted from waitlist', {
          description: 'Entry is now confirmed',
        });
      } else {
        toast.error('Failed to promote entry', {
          description: result.error,
        });
      }

      return result;
    },
    [userId]
  );

  /**
   * Get statistics for a class
   */
  const getClassStats = useCallback(
    (classId: string) => {
      const show = shows.find(s => s.trials?.some(t => t.classes?.some(c => c.id === classId)));

      const trial = show?.trials?.find(t => t.classes?.some(c => c.id === classId));

      const classData = trial?.classes?.find(c => c.id === classId);

      if (!classData) {
        return {
          confirmed: 0,
          waitlisted: 0,
          total: 0,
          capacity: null,
          availableSpots: null,
          isFull: false,
        };
      }

      return EntryLimitChecker.getClassEntryStats(classId, entries, classData);
    },
    [shows, entries]
  );

  /**
   * Clear validation state
   */
  const clearValidation = useCallback(() => {
    setState(prev => {
      const { lastValidation: _lv, lastCreationResult: _lcr, ...rest } = prev;
      return rest;
    });
  }, []);

  /**
   * Reset all state
   */
  const reset = useCallback(() => {
    setState({
      isCreating: false,
      isValidating: false,
      hasUnsavedChanges: false,
    });
  }, []);

  /**
   * Track unsaved changes based on local state
   */
  const hasUnsavedChanges = useMemo(() => {
    // This would be implemented based on your form state management
    return state.hasUnsavedChanges;
  }, [state.hasUnsavedChanges]);

  return {
    ...state,
    hasUnsavedChanges,
    createEntry,
    createBatchEntries,
    validateEntry,
    checkLimits,
    scratchEntry,
    promoteFromWaitlist,
    getClassStats,
    clearValidation,
    reset,
  };
}
