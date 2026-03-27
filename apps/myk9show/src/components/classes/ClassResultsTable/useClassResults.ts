/**
 * useClassResults - Custom hook for ClassResultsTable state management
 *
 * Encapsulates bulk entry data state, validation, placement calculation,
 * keyboard navigation, Ctrl+S shortcut, and submit logic.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { logger } from '@/services/LoggingService';
import type { ScentWorkEntry, ScentWorkClassConfig } from '@/types/scent-work-types';
import type { UserPermissions } from '@/types/user-permissions';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import {
  mapResultStatusToQualification,
  mapQualificationToResultStatus,
  dbSecondsToInputFormat,
  inputFormatToDbSeconds,
} from '@/utils/scoringMappings';
import type { BulkEntryData, ResultsSummary } from './types';
import { STATUSES_REQUIRING_REASON, NAVIGABLE_FIELDS } from './constants';
import { calculatePlacements, validateEntry } from './utils';

interface UseClassResultsParams {
  entries: ScentWorkEntry[];
  rawEntries: RawEntryRow[];
  classConfig: ScentWorkClassConfig;
  userPermissions: UserPermissions;
  classId: string;
}

export function useClassResults({
  entries,
  rawEntries,
  classConfig: _classConfig,
  userPermissions,
  classId,
}: UseClassResultsParams) {
  const [bulkData, setBulkData] = useState<BulkEntryData[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors] = useState<Map<string, string>>(new Map());

  // ---------------------------------------------------------------------------
  // Initialize bulk data from raw DB entries
  // ---------------------------------------------------------------------------
  const rawEntryMap = useMemo(() => new Map(rawEntries.map(r => [r.id, r])), [rawEntries]);

  useEffect(() => {
    setBulkData(() => {
      const newData = entries.map(entry => {
        const raw = rawEntryMap.get(entry.id);

        // Read scoring fields directly from DB columns
        const qualification = mapResultStatusToQualification(raw?.result_status);
        const searchTime = dbSecondsToInputFormat(raw?.search_time_seconds);

        const hadExistingData = !!(searchTime || qualification);

        const bulkEntry: BulkEntryData = {
          entryId: entry.id,
          armband: entry.displayInfo.armband,
          dogName: entry.displayInfo.dogName,
          handlerName: entry.displayInfo.handlerName,
          searchTime,
          qualification,
          qualificationReason: raw?.disqualification_reason ?? '',
          faults: String(raw?.total_faults ?? 0),
          notes: raw?.judge_notes ?? '',
          placement: raw?.final_placement ?? null,
          isValid: !!(searchTime && qualification),
          hasChanges: false,
          hadExistingData,
          isCleared: false,
          modifiedFields: new Set<keyof BulkEntryData>(),
        };

        return bulkEntry;
      });

      return calculatePlacements(newData);
    });
  }, [entries, rawEntryMap]);

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
      const scoredItems = bulkData.filter(
        item => item.hasChanges && item.isValid && !item.isCleared
      );
      const clearedItems = bulkData.filter(item => item.isCleared);

      if (scoredItems.length === 0 && clearedItems.length === 0) {
        setSubmitError('No valid results to submit');
        return;
      }

      // Write scored entries directly to DB columns via replication
      for (const item of scoredItems) {
        await replicatedEntriesTable.updateEntry(item.entryId, {
          resultStatus: mapQualificationToResultStatus(item.qualification),
          searchTimeSeconds: inputFormatToDbSeconds(item.searchTime),
          totalFaults: parseInt(item.faults) || 0,
          judgeNotes: item.notes || null,
          finalPlacement: item.placement != null ? String(item.placement) : undefined,
          isScored: true,
          scoringCompletedAt: new Date().toISOString(),
        });
      }

      // Clear entries — reset all scoring columns to defaults
      for (const item of clearedItems) {
        await replicatedEntriesTable.updateEntry(item.entryId, {
          resultStatus: 'pending',
          isScored: false,
          searchTimeSeconds: 0,
          totalFaults: 0,
          judgeNotes: null,
          finalPlacement: undefined,
          scoringCompletedAt: null,
          disqualification_reason: null,
        });
      }

      // Reset local change tracking. Don't invalidate React Query here — the
      // replication layer syncs to Supabase asynchronously and fires a
      // replication:upload-complete event that triggers cache invalidation.
      // Invalidating now would refetch stale data before the mutation arrives.
      setBulkData(prev =>
        prev.map(item => {
          if (!item.hasChanges && !item.isCleared) return item;
          return {
            ...item,
            hasChanges: false,
            isCleared: false,
            hadExistingData: item.isCleared ? false : !!(item.searchTime || item.qualification),
            modifiedFields: new Set<keyof BulkEntryData>(),
          };
        })
      );
    } catch (error) {
      logger.error('Submit error:', 'classes', {}, error as Error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit results');
    } finally {
      setIsSubmitting(false);
    }
  }, [bulkData, classId, userPermissions]);

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
