/**
 * useClassResults - Custom hook for ClassResultsTable state management
 *
 * Encapsulates bulk entry data state, validation, placement calculation,
 * keyboard navigation, Ctrl+S shortcut, and submit logic.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { logger } from '@/services/LoggingService';
import type {
  ScentWorkEntry,
  ScentWorkClassConfig,
  ScentWorkResult,
  MultiAreaScentWorkResult,
  QualificationStatus,
} from '@/types/scent-work-types';
import type { UserPermissions } from '@/types/user-permissions';
import type { BulkEntryData, ResultsSummary } from './types';
import { STATUSES_REQUIRING_REASON, NAVIGABLE_FIELDS } from './constants';
import {
  timeStringToMs,
  convertTimeToInputFormat,
  calculatePlacements,
  validateEntry,
} from './utils';

interface UseClassResultsParams {
  entries: ScentWorkEntry[];
  classConfig: ScentWorkClassConfig;
  userPermissions: UserPermissions;
  onResultsSubmit: (
    results: (ScentWorkResult | MultiAreaScentWorkResult)[],
    clearedEntryIds?: string[]
  ) => Promise<void>;
}

export function useClassResults({
  entries,
  classConfig,
  userPermissions,
  onResultsSubmit,
}: UseClassResultsParams) {
  const [bulkData, setBulkData] = useState<BulkEntryData[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors] = useState<Map<string, string>>(new Map());

  // ---------------------------------------------------------------------------
  // Initialize bulk data from entries
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setBulkData(() => {
      const newData = entries.map(entry => {
        const existingData = entry.judgingState?.currentResult;
        const competitionData = entry.competitionData;

        logger.debug('ClassResultsTable - Processing entry:', 'classes', {
          data: {
            entryId: entry.id,
            competitionData,
            existingData,
            armband: entry.displayInfo.armband,
          },
        });

        // Determine search time - prefer normalized input format.
        // Only fall back to judgingState if competitionData doesn't exist at all
        // (not when it exists but time is empty — that means it was cleared).
        let searchTime = '';
        if (competitionData?.time) {
          searchTime = convertTimeToInputFormat(competitionData.time);
        } else if (!competitionData && existingData?.searchTime) {
          searchTime = convertTimeToInputFormat((existingData.searchTime / 1000).toString());
        }

        // Determine qualification status
        let qualification: QualificationStatus | '' = '';

        // First priority: check for explicit qualification string in competitionData
        if ((competitionData as Record<string, unknown>)?.qualification) {
          qualification = (competitionData as Record<string, unknown>)
            .qualification as QualificationStatus;
        }
        // Second priority: fall back to judgingState ONLY if competitionData doesn't exist.
        // If competitionData exists but qualification is empty, the entry was cleared — don't
        // restore old qualification from judgingState.
        else if (!competitionData && existingData?.qualification) {
          qualification = existingData.qualification;
        }
        // Third priority: fall back to boolean qualified field (legacy) — only set if explicitly qualified
        else if (competitionData?.qualified === true) {
          qualification = 'Qualified';
        }

        const hadExistingData = !!(searchTime || qualification);

        const bulkEntry: BulkEntryData = {
          entryId: entry.id,
          armband: entry.displayInfo.armband,
          dogName: entry.displayInfo.dogName,
          handlerName: entry.displayInfo.handlerName,
          searchTime,
          qualification,
          qualificationReason:
            (competitionData as Record<string, unknown>)?.qualificationReason?.toString() || '',
          faults:
            (competitionData as Record<string, unknown>)?.faults?.toString() ||
            (!competitionData && existingData?.faults?.toString()) ||
            '0',
          notes:
            competitionData?.judgeNotes || (!competitionData && existingData?.judgeNotes) || '',
          placement: null, // Will be calculated
          isValid: !!(searchTime && qualification),
          hasChanges: false,
          hadExistingData,
          isCleared: false,
          modifiedFields: new Set<keyof BulkEntryData>(),
          lastEditedBy: competitionData?.recordedBy || existingData?.recordedBy,
          lastEditedAt: existingData?.recordedAt,
        };

        return bulkEntry;
      });

      // Calculate placements for the initial data
      return calculatePlacements(newData);
    });
  }, [entries]);

  // ---------------------------------------------------------------------------
  // Summary statistics
  // ---------------------------------------------------------------------------
  const summary: ResultsSummary = useMemo(() => {
    let clearedEntries = 0;
    let entriesWithData = 0;
    let validEntries = 0;
    let invalidEntries = 0;
    for (const item of bulkData) {
      if (item.isCleared) clearedEntries++;
      else if (item.hasChanges && item.isValid) entriesWithData++;
      if (item.isValid) validEntries++;
      if (item.hasChanges && !item.isValid) invalidEntries++;
    }
    const hasSubmittableWork = (entriesWithData > 0 || clearedEntries > 0) && invalidEntries === 0;

    return {
      totalEntries: bulkData.length,
      entriesWithData,
      validEntries,
      invalidEntries,
      clearedEntries,
      canSubmit: hasSubmittableWork && userPermissions.canEditEntries,
    };
  }, [bulkData, userPermissions.canEditEntries]);

  // ---------------------------------------------------------------------------
  // Update bulk data and validate
  // ---------------------------------------------------------------------------
  const updateBulkData = useCallback(
    (entryId: string, field: keyof BulkEntryData, value: string) => {
      if (!userPermissions.canEditEntries) {
        return;
      }

      setBulkData(prev => {
        const index = prev.findIndex(d => d.entryId === entryId);
        if (index === -1) return prev;
        const newData = [...prev];
        const item = { ...newData[index] };

        // Track field modification
        if (!item.modifiedFields) {
          item.modifiedFields = new Set<keyof BulkEntryData>();
        }

        // Check if value actually changed
        const oldValue = (item as Record<string, unknown>)[field];
        if (oldValue !== value) {
          item.modifiedFields.add(field);
        }

        (item as Record<string, unknown>)[field] = value;

        // Check if entry has meaningful changes (not just empty or default values)
        const hasTime = item.searchTime && item.searchTime.trim() !== '';
        const hasQualification = item.qualification && item.qualification.length > 0;
        const hasQualificationReason =
          item.qualificationReason && item.qualificationReason.trim() !== '';
        const hasFaults = item.faults !== '0';
        const hasNotes = item.notes && item.notes.trim() !== '';
        item.hasChanges = !!(
          hasTime ||
          hasQualification ||
          hasQualificationReason ||
          hasFaults ||
          hasNotes
        );

        if (
          item.hadExistingData &&
          !hasTime &&
          !hasQualification &&
          !hasQualificationReason &&
          !hasFaults &&
          !hasNotes
        ) {
          item.isCleared = true;
          item.hasChanges = true;
        } else {
          item.isCleared = false;
        }

        const validation = validateEntry(item);
        item.isValid = validation.isValid;

        newData[index] = item;

        // Clear qualification reason if qualification changes to one that doesn't need a reason
        if (field === 'qualification') {
          const needsReason = STATUSES_REQUIRING_REASON.includes(value);
          if (!needsReason) {
            item.qualificationReason = '';
          }
        }

        // Recalculate placements when relevant fields change
        if (field === 'searchTime' || field === 'qualification' || field === 'faults') {
          return calculatePlacements(newData);
        }

        return newData;
      });
    },
    [userPermissions.canEditEntries]
  );

  // ---------------------------------------------------------------------------
  // Keyboard navigation (Enter / Tab between fields)
  // ---------------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number, field: string) => {
      if (!userPermissions.canEditEntries) return;

      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();

        const fields = NAVIGABLE_FIELDS;
        const currentFieldIndex = fields.indexOf(field as (typeof fields)[number]);

        let nextIndex = index;
        let nextFieldIndex = currentFieldIndex;

        if (e.shiftKey) {
          // Move backwards
          if (currentFieldIndex > 0) {
            nextFieldIndex = currentFieldIndex - 1;
          } else if (index > 0) {
            nextIndex = index - 1;
            nextFieldIndex = fields.length - 1;
          }
        } else {
          // Move forwards
          if (currentFieldIndex < fields.length - 1) {
            nextFieldIndex = currentFieldIndex + 1;
          } else if (index < bulkData.length - 1) {
            nextIndex = index + 1;
            nextFieldIndex = 0;
          }
        }

        const nextField = fields[nextFieldIndex];
        const nextElement = document.querySelector(
          `[data-index="${nextIndex}"][data-field="${nextField}"]`
        ) as HTMLElement;
        if (nextElement) {
          nextElement.focus();
        }
      }
    },
    [userPermissions.canEditEntries, bulkData.length]
  );

  // ---------------------------------------------------------------------------
  // Submit results
  // ---------------------------------------------------------------------------
  const handleSubmit = useCallback(async () => {
    if (!userPermissions.canEditEntries) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const clearedEntryIds = bulkData.filter(item => item.isCleared).map(item => item.entryId);

      const validResults = bulkData
        .filter(item => item.hasChanges && item.isValid && !item.isCleared)
        .map(item => {
          const searchTime = item.searchTime ? timeStringToMs(item.searchTime) : 0;
          const result: ScentWorkResult = {
            entryId: item.entryId,
            classId: entries.find(e => e.id === item.entryId)?.classId || '',
            searchTime,
            maxTimeAllowed: classConfig.timeLimit,
            qualification: item.qualification as QualificationStatus,
            faults: parseInt(item.faults) || 0,
            judgeNotes: item.notes,
            recordedBy: userPermissions.displayName || 'Unknown User',
            recordedAt: new Date(),
            placementCalculated: item.placement || undefined,
            qualificationReason: item.qualificationReason || undefined,
          };
          return result;
        });

      if (validResults.length === 0 && clearedEntryIds.length === 0) {
        setSubmitError('No valid results to submit');
        return;
      }

      await onResultsSubmit(validResults, clearedEntryIds.length > 0 ? clearedEntryIds : undefined);

      // Clear modified fields after successful submission
      setBulkData(prev =>
        prev.map(item => ({
          ...item,
          modifiedFields: new Set<keyof BulkEntryData>(),
          lastEditedBy: userPermissions.displayName || 'Unknown User',
          lastEditedAt: new Date(),
        }))
      );
    } catch (error) {
      logger.error('Submit error:', 'classes', {}, error as Error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit results');
    } finally {
      setIsSubmitting(false);
    }
  }, [bulkData, classConfig, onResultsSubmit, userPermissions, entries]);

  // ---------------------------------------------------------------------------
  // Ctrl+S / Cmd+S keyboard shortcut
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyboardShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (summary.canSubmit && !isSubmitting) {
          handleSubmit();
        }
      }
    };

    document.addEventListener('keydown', handleKeyboardShortcut);
    return () => {
      document.removeEventListener('keydown', handleKeyboardShortcut);
    };
  }, [summary.canSubmit, isSubmitting, handleSubmit]);

  return {
    bulkData,
    isSubmitting,
    submitError,
    validationErrors,
    summary,
    updateBulkData,
    handleKeyDown,
    handleSubmit,
  };
}
