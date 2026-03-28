/**
 * useClassResults — Simple edit-buffer-over-raw-DB-rows hook.
 *
 * Raw DB rows are the source of truth. User edits go into a Map.
 * Display merges raw + edits. Submit writes to the replication layer.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import type { ScentWorkEntry, ScentWorkClassConfig } from '@/types/scent-work-types';
import type { UserPermissions } from '@/types/user-permissions';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import type { CheckInStatus } from '@myk9/core';
import { CHECKIN_STATUS } from '@myk9/core';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import {
  mapResultStatusToQualification,
  mapQualificationToResultStatus,
  dbSecondsToInputFormat,
  inputFormatToDbSeconds,
} from '@/utils/scoringMappings';
import type { ScoringEdit, ScoringRow } from './types';
import { STATUSES_REQUIRING_REASON, NAVIGABLE_FIELDS } from './constants';

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
  classId: _classId,
}: UseClassResultsParams) {
  const [edits, setEdits] = useState<Map<string, ScoringEdit>>(new Map());
  const [submittedEdits, setSubmittedEdits] = useState<Map<string, ScoringEdit>>(new Map());
  const [justScoredIds, setJustScoredIds] = useState<Set<string>>(new Set());
  const [justClearedIds, setJustClearedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const rawMap = useMemo(() => new Map(rawEntries.map(r => [r.id, r])), [rawEntries]);

  // Build display rows by merging: pending edits > submitted edits > raw DB
  const rows: ScoringRow[] = useMemo(() => {
    return entries.map(entry => {
      const raw = rawMap.get(entry.id);
      const edit = edits.get(entry.id);
      const submitted = submittedEdits.get(entry.id);

      const qualification =
        edit?.qualification ??
        submitted?.qualification ??
        mapResultStatusToQualification(raw?.result_status);
      const searchTime =
        edit?.searchTime ??
        submitted?.searchTime ??
        dbSecondsToInputFormat(raw?.search_time_seconds);
      const faults = edit?.faults ?? submitted?.faults ?? String(raw?.total_faults ?? 0);
      const notes = edit?.notes ?? submitted?.notes ?? raw?.judge_notes ?? '';
      const qualificationReason =
        edit?.qualificationReason ??
        submitted?.qualificationReason ??
        raw?.disqualification_reason ??
        '';

      const isScored =
        justScoredIds.has(entry.id) ||
        raw?.is_scored === true ||
        (!!raw?.result_status && raw.result_status !== 'pending');

      return {
        entryId: entry.id,
        armband: (raw?.armband as string) || entry.displayInfo?.armband || '',
        dogName:
          raw?.dog?.call_name || raw?.dog?.name || entry.displayInfo?.dogName || 'Unknown Dog',
        dogBreed: raw?.dog?.breed || entry.displayInfo?.dogBreed || '',
        handlerName: (raw?.handler as string) || entry.displayInfo?.handlerName || '',
        qualification,
        qualificationReason,
        searchTime,
        faults,
        notes,
        placement:
          justClearedIds.has(entry.id) || (submitted && qualification !== 'Qualified')
            ? null
            : (raw?.final_placement ?? null),
        checkInStatus: (raw?.check_in_status as CheckInStatus) ?? 'no-status',
        isScored,
        hasEdits: edits.has(entry.id),
      };
    });
  }, [entries, rawMap, edits, submittedEdits, justScoredIds, justClearedIds]);

  // Refs for clearEntry to avoid recreating it on every rows/justScoredIds change
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const justScoredIdsRef = useRef(justScoredIds);
  justScoredIdsRef.current = justScoredIds;

  // Edit a field
  const onFieldChange = useCallback(
    (entryId: string, field: keyof ScoringEdit, value: string) => {
      if (!userPermissions.canEditEntries) return;

      setEdits(prev => {
        const next = new Map(prev);
        const existing = next.get(entryId) ?? {};
        const updated = { ...existing, [field]: value };

        if (field === 'qualification') {
          const needsReason = STATUSES_REQUIRING_REASON.includes(value);
          if (!needsReason) {
            updated.qualificationReason = '';
          }
        }

        next.set(entryId, updated);
        return next;
      });
    },
    [userPermissions.canEditEntries]
  );

  // Clear a single entry
  const clearEntry = useCallback(
    async (entryId: string) => {
      if (!userPermissions.canEditEntries) return;

      try {
        await replicatedEntriesTable.updateEntry(entryId, {
          resultStatus: 'pending',
          isScored: false,
          searchTimeSeconds: 0,
          totalFaults: 0,
          judgeNotes: null,
          finalPlacement: null,
          scoringCompletedAt: null,
          disqualification_reason: null,
        });

        setEdits(prev => {
          const next = new Map(prev);
          next.delete(entryId);
          return next;
        });
        setSubmittedEdits(prev => {
          const next = new Map(prev);
          next.delete(entryId);
          return next;
        });
        setJustScoredIds(prev => {
          const next = new Set(prev);
          next.delete(entryId);
          return next;
        });
        setJustClearedIds(prev => new Set([...prev, entryId]));

        // Recalculate placements for remaining scored entries (use refs for stable callback)
        const currentRows = rowsRef.current;
        const currentJustScored = justScoredIdsRef.current;
        const remainingRows = currentRows.filter(
          r => r.entryId !== entryId && (r.isScored || currentJustScored.has(r.entryId))
        );
        const placements = calculatePlacements(remainingRows);
        for (const row of remainingRows) {
          const newPlacement = placements.get(row.entryId);
          const oldPlacement = row.placement;
          if (newPlacement !== oldPlacement) {
            replicatedEntriesTable
              .updateEntry(row.entryId, {
                finalPlacement: newPlacement != null ? String(newPlacement) : null,
              })
              .catch(() => {}); // Best-effort placement update
          }
        }
      } catch (error) {
        logger.error('Failed to clear entry', 'classes', { entryId }, error as Error);
        notifications.error('Failed to clear entry');
      }
    },
    [userPermissions.canEditEntries]
  );

  // Validate before submit
  function validate(editedRows: ScoringRow[]): string | null {
    for (const row of editedRows) {
      if (row.qualification === 'Qualified' && !row.searchTime) {
        return `${row.dogName}: Qualified entries require a time`;
      }
      if (STATUSES_REQUIRING_REASON.includes(row.qualification) && !row.qualificationReason) {
        return `${row.dogName}: ${row.qualification} requires a reason`;
      }
      if (row.searchTime && !row.qualification) {
        return `${row.dogName}: Time entered without qualification`;
      }
      if (row.searchTime && !/^\d{1,2}:[0-5]\d\.\d{2}$/.test(row.searchTime)) {
        return `${row.dogName}: Invalid time format (use M:SS.HH)`;
      }
    }
    return null;
  }

  // Calculate placements for Qualified entries
  function calculatePlacements(allRows: ScoringRow[]): Map<string, number> {
    const qualified = allRows
      .filter(r => r.qualification === 'Qualified' && r.searchTime)
      .map(r => ({
        entryId: r.entryId,
        faults: parseInt(r.faults) || 0,
        time: inputFormatToDbSeconds(r.searchTime),
      }))
      .sort((a, b) => a.faults - b.faults || a.time - b.time);

    const placements = new Map<string, number>();
    qualified.forEach((q, i) => placements.set(q.entryId, i + 1));
    return placements;
  }

  // Submit
  const handleSubmit = useCallback(async () => {
    if (!userPermissions.canEditEntries) return;

    const editedRows = rows.filter(r => edits.has(r.entryId));
    if (editedRows.length === 0) {
      setSubmitError('No changes to submit');
      return;
    }

    const error = validate(editedRows);
    if (error) {
      setSubmitError(error);
      notifications.error(error);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const placements = calculatePlacements(rows);

      // Write edited entries
      const succeededIds: string[] = [];
      for (const row of editedRows) {
        if (!row.qualification && !row.searchTime) continue;

        try {
          const placement = placements.get(row.entryId);
          await replicatedEntriesTable.updateEntry(row.entryId, {
            resultStatus: mapQualificationToResultStatus(row.qualification),
            searchTimeSeconds: inputFormatToDbSeconds(row.searchTime),
            totalFaults: parseInt(row.faults) || 0,
            judgeNotes: row.notes || null,
            finalPlacement: placement != null ? String(placement) : null,
            disqualification_reason: row.qualificationReason || null,
            isScored: true,
            scoringCompletedAt: new Date().toISOString(),
            checkInStatus: CHECKIN_STATUS.COMPLETED.value,
            ring_exit_time: new Date().toISOString(),
          });
          succeededIds.push(row.entryId);
        } catch (entryErr) {
          logger.error(
            'Failed to write entry',
            'classes',
            { entryId: row.entryId },
            entryErr as Error
          );
        }
      }

      // Update placements for previously-scored entries that weren't in this batch
      // (their placement may have changed due to new entries)
      for (const row of rows) {
        if (edits.has(row.entryId)) continue; // Already written above
        const newPlacement = placements.get(row.entryId);
        const oldPlacement = row.placement;
        if (newPlacement !== oldPlacement && (newPlacement != null || oldPlacement != null)) {
          try {
            await replicatedEntriesTable.updateEntry(row.entryId, {
              finalPlacement: newPlacement != null ? String(newPlacement) : null,
            });
          } catch {
            // Non-critical — placement update for existing entry
          }
        }
      }

      if (succeededIds.length === 0) throw new Error('All entries failed to save');

      // Move succeeded edits to submittedEdits (display values persist until
      // raw data refreshes) and remove from pending edits (so editCount drops).
      setJustScoredIds(prev => new Set([...prev, ...succeededIds]));
      setJustClearedIds(prev => {
        const next = new Set(prev);
        for (const id of succeededIds) next.delete(id);
        return next;
      });
      setSubmittedEdits(prev => {
        const next = new Map(prev);
        for (const id of succeededIds) {
          const edit = edits.get(id);
          if (edit) next.set(id, edit);
        }
        return next;
      });
      setEdits(prev => {
        const next = new Map(prev);
        for (const id of succeededIds) next.delete(id);
        return next;
      });

      notifications.success(
        `${succeededIds.length} result${succeededIds.length !== 1 ? 's' : ''} submitted`
      );
    } catch (err) {
      logger.error('Submit error:', 'classes', {}, err as Error);
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit results');
      notifications.error('Failed to submit results');
    } finally {
      setIsSubmitting(false);
    }
  }, [rows, edits, userPermissions]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number, field: string) => {
      if (!userPermissions.canEditEntries) return;
      if (e.key !== 'Enter' && e.key !== 'Tab') return;

      e.preventDefault();
      const fields = NAVIGABLE_FIELDS;
      const currentFieldIndex = fields.indexOf(field as (typeof fields)[number]);

      let nextIndex = index;
      let nextFieldIndex = currentFieldIndex;

      if (e.shiftKey) {
        if (currentFieldIndex > 0) nextFieldIndex = currentFieldIndex - 1;
        else if (index > 0) {
          nextIndex = index - 1;
          nextFieldIndex = fields.length - 1;
        }
      } else {
        if (currentFieldIndex < fields.length - 1) nextFieldIndex = currentFieldIndex + 1;
        else if (index < rows.length - 1) {
          nextIndex = index + 1;
          nextFieldIndex = 0;
        }
      }

      const nextElement = document.querySelector(
        `[data-index="${nextIndex}"][data-field="${fields[nextFieldIndex]}"]`
      ) as HTMLElement;
      nextElement?.focus();
    },
    [userPermissions.canEditEntries, rows.length]
  );

  // Ctrl+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (edits.size > 0 && !isSubmitting) handleSubmit();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [edits.size, isSubmitting, handleSubmit]);

  const editCount = edits.size;
  const canSubmit = editCount > 0 && userPermissions.canEditEntries && !isSubmitting;

  return {
    rows,
    isSubmitting,
    submitError,
    editCount,
    canSubmit,
    onFieldChange,
    clearEntry,
    handleKeyDown,
    handleSubmit,
    isEntryScored: useCallback(
      (entryId: string) =>
        justScoredIds.has(entryId) ||
        rawMap.get(entryId)?.is_scored === true ||
        (!!rawMap.get(entryId)?.result_status && rawMap.get(entryId)?.result_status !== 'pending'),
      [justScoredIds, rawMap]
    ),
  };
}
