/**
 * Bulk Result Entry Component
 *
 * Allows secretaries to quickly enter results for multiple entries:
 * - Grid-based input interface
 * - Auto-tab functionality for quick entry
 * - Batch validation and submission
 * - Import from CSV capability
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useBlocker } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useToastStore } from '@/store/toastStore';

// UI Components
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Types
import type {
  ScentWorkEntry,
  ScentWorkResult,
  QualificationStatus,
} from '@/types/scent-work-types';

// Premium styling
import '@/styles/myk9-show-details.css';

// Extracted modules
import type {
  BulkEntryData,
  BulkResultEntryProps,
  LocalCompetitionData,
} from './bulk-result-entry/types';
import {
  formatSearchTimeFromMs,
  convertTimeToInputFormat,
  timeStringToMs,
  validateEntry,
} from './bulk-result-entry/helpers';
import { SummaryCards } from './bulk-result-entry/SummaryCards';
import { HeaderActions } from './bulk-result-entry/HeaderActions';
import { EntryTableRow } from './bulk-result-entry/EntryTableRow';
import { SubmitActions } from './bulk-result-entry/SubmitActions';

// Re-export types for backward compatibility
export type { BulkResultEntryProps, BulkEntryData } from './bulk-result-entry/types';

// import { validateScentWorkResult, validateMultiAreaScentWorkResult } from '@/types/scent-work-types';

/**
 * Bulk result entry component for efficient data entry
 */
export function BulkResultEntry({
  classId,
  entries,
  classConfig,
  onResultsSubmit,
  className,
}: BulkResultEntryProps) {
  const { user } = useAuthContext();
  const addToast = useToastStore(s => s.addToast);

  const [bulkData, setBulkData] = useState<BulkEntryData[]>(() =>
    entries.map(entry => {
      // Extract existing data from entry if available
      const existingData = entry.judgingState?.currentResult;
      const competitionData: LocalCompetitionData =
        (entry as ScentWorkEntry & { competitionData?: LocalCompetitionData }).competitionData ||
        {};

      // Prioritize competitionData (saved data) over existingData (temp judging state)
      // Convert different time formats to the expected MM:SS.HH format
      let searchTime = '';
      if (competitionData.time) {
        // Handle both MM:SS and MM:SS.HH formats
        searchTime = convertTimeToInputFormat(competitionData.time);
      } else if (existingData?.searchTime) {
        searchTime = formatSearchTimeFromMs(existingData.searchTime);
      }

      // Handle qualification — prioritize saved value, fall back to 'Qualified' default
      // (most entries qualify; secretary only needs to override for NQ/Absent/etc.)
      let qualification: QualificationStatus | '' = 'Qualified';
      if (competitionData.qualification) {
        qualification = competitionData.qualification as QualificationStatus;
      } else if (existingData?.qualification) {
        qualification = existingData.qualification;
      } else if (competitionData.qualified === false) {
        qualification = 'Not Qualified';
      }

      return {
        entryId: entry.id,
        armband: entry.displayInfo.armband,
        dogName: entry.displayInfo.dogName,
        handlerName: entry.displayInfo.handlerName,
        searchTime,
        qualification,
        faults: competitionData.faults?.toString() || existingData?.faults?.toString() || '0',
        notes: competitionData.judgeNotes || existingData?.judgeNotes || '',
        isValid: !!(searchTime && qualification),
        // hasChanges tracks user edits — the default 'Qualified' is a pre-fill, not a change
        hasChanges: !!searchTime,
      };
    })
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update bulkData when entries change (to pick up saved data)
  useEffect(() => {
    logger.debug('BulkResultEntry useEffect triggered - entries changed', 'scoring', {
      entriesCount: entries.length,
    });
    setBulkData(prevData => {
      const newData = entries.map(entry => {
        // Extract existing data from entry if available
        const existingData = entry.judgingState?.currentResult;
        const rawEntry = entry as ScentWorkEntry & { competitionData?: LocalCompetitionData };
        const competitionData: LocalCompetitionData = rawEntry.competitionData || {};

        // Get previously entered data from current state
        const prevEntry = prevData.find(d => d.entryId === entry.id);

        // Prioritize: 1) previous form data if it has unsaved changes, 2) competitionData (saved), 3) existing judging state
        let searchTime = '';
        // Debug only when needed - removed verbose logging

        // After a successful save, always use the saved data from store
        if (
          competitionData.time &&
          typeof competitionData.time === 'string' &&
          competitionData.time.trim()
        ) {
          // Use saved data from store
          searchTime = convertTimeToInputFormat(competitionData.time);
        } else if (prevEntry?.searchTime && prevEntry.hasChanges) {
          // Keep user's unsaved changes only if there's no saved data
          searchTime = prevEntry.searchTime;
        } else if (existingData?.searchTime) {
          // Fall back to judging state data
          searchTime = formatSearchTimeFromMs(existingData.searchTime);
        }

        const savedQualification =
          competitionData.qualification ||
          (competitionData.qualified !== undefined
            ? competitionData.qualified === true
              ? 'Qualified'
              : 'Not Qualified'
            : '');

        // Resolve qualification — saved value wins; fall back to in-progress state;
        // default to 'Qualified' when nothing is saved yet (most entries qualify)
        let qualification: QualificationStatus | '' = 'Qualified';
        if (savedQualification) {
          qualification = savedQualification as QualificationStatus;
        } else if (prevEntry?.qualification && prevEntry.hasChanges) {
          qualification = prevEntry.qualification;
        } else if (existingData?.qualification) {
          qualification = existingData.qualification;
        }

        // Calculate if this entry has unsaved changes
        // Normalize time formats for accurate comparison
        const savedTimeFormatted = competitionData.time
          ? convertTimeToInputFormat(competitionData.time)
          : '';
        const normalizedSearchTime = searchTime ? convertTimeToInputFormat(searchTime) : '';
        const hasTimeChanges = normalizedSearchTime && normalizedSearchTime !== savedTimeFormatted;
        const hasQualificationChanges =
          !!savedQualification && qualification !== savedQualification;
        const hasFaultChanges =
          (prevEntry?.faults || '0') !== (competitionData.faults?.toString() || '0');
        const hasNotesChanges = (prevEntry?.notes || '') !== (competitionData.judgeNotes || '');

        // Enhanced logging for Submit button debugging - only log when there are changes
        if (hasTimeChanges || hasQualificationChanges || hasFaultChanges || hasNotesChanges) {
          logger.debug('Entry change analysis', 'scoring', {
            entryId: entry.id,
            hasTimeChanges: hasTimeChanges
              ? `${normalizedSearchTime} vs ${savedTimeFormatted}`
              : false,
            hasQualificationChanges: hasQualificationChanges
              ? `${qualification} vs ${savedQualification}`
              : false,
            hasFaultChanges: hasFaultChanges
              ? `${prevEntry?.faults || '0'} vs ${competitionData.faults?.toString() || '0'}`
              : false,
            hasNotesChanges: hasNotesChanges
              ? `"${prevEntry?.notes || ''}" vs "${competitionData.judgeNotes || ''}"`
              : false,
          });
        }

        // Removed excessive debugging - Submit button issue resolved

        const bulkEntry = {
          entryId: entry.id,
          armband: entry.displayInfo.armband,
          dogName: entry.displayInfo.dogName,
          handlerName: entry.displayInfo.handlerName,
          searchTime,
          qualification,
          faults:
            competitionData.faults?.toString() ||
            prevEntry?.faults ||
            existingData?.faults?.toString() ||
            '0',
          notes: competitionData.judgeNotes || prevEntry?.notes || existingData?.judgeNotes || '',
          isValid: !!(searchTime && qualification),
          hasChanges:
            hasTimeChanges || hasQualificationChanges || hasFaultChanges || hasNotesChanges,
        };

        // Removed verbose bulk entry logging
        return bulkEntry;
      });

      return newData;
    });
  }, [entries]);

  // Unsaved-changes guard
  const hasUnsavedChanges = useMemo(() => bulkData.some(item => item.hasChanges), [bulkData]);

  // Block in-app navigation when there are unsaved changes
  useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges &&
      currentLocation.pathname !== nextLocation.pathname &&
      !window.confirm('You have unsaved scores. Leave anyway? Your entries will be lost.')
  );

  // Block browser tab close / refresh
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // Calculate summary statistics
  const summary = React.useMemo(() => {
    const totalEntries = bulkData.length;
    const entriesWithData = bulkData.filter(item => item.hasChanges && item.isValid).length; // Only count valid entries with changes
    const validEntries = bulkData.filter(item => item.isValid).length;
    const invalidEntries = bulkData.filter(item => item.hasChanges && !item.isValid).length;

    // Only log summary when Submit button should change state
    const canSubmit = validEntries > 0 && invalidEntries === 0;
    if (entriesWithData > 0 || invalidEntries > 0) {
      logger.debug('Submit button state', 'scoring', {
        entriesWithData,
        validEntries,
        invalidEntries,
        canSubmit,
        buttonText: `Submit ${entriesWithData} Results`,
      });
    }

    return {
      totalEntries,
      entriesWithData,
      validEntries,
      invalidEntries,
      canSubmit,
    };
  }, [bulkData]);

  // Update bulk data and validate
  const updateBulkData = useCallback((index: number, field: keyof BulkEntryData, value: string) => {
    setBulkData(prev => {
      const newData = [...prev];
      const item = { ...newData[index] };

      (item as Record<string, string | boolean>)[field] = value;
      item.hasChanges = !!(
        item.searchTime ||
        item.qualification ||
        item.faults !== '0' ||
        item.notes
      );

      const validation = validateEntry(item);
      item.isValid = validation.isValid;

      newData[index] = item;

      // Enhanced logging for field updates
      logger.debug('Field update on entry', 'scoring', {
        entryId: item.entryId,
        field,
        value,
        hasChanges: item.hasChanges,
        isValid: item.isValid,
      });

      // Update validation errors
      setValidationErrors(prev => {
        const newErrors = new Map(prev);
        if (validation.error) {
          newErrors.set(item.entryId, validation.error);
        } else {
          newErrors.delete(item.entryId);
        }
        return newErrors;
      });

      return newData;
    });
  }, []);

  // Handle CSV import
  const handleCSVImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const csv = e.target?.result as string;
        const lines = csv.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        // Expected headers: armband, time, qualification, faults, notes
        const requiredHeaders = ['armband', 'time', 'qualification'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

        if (missingHeaders.length > 0) {
          setImportError(`Missing required columns: ${missingHeaders.join(', ')}`);
          return;
        }

        // Process data rows
        const importedData = new Map<string, Partial<BulkEntryData>>();

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          const rowData: Record<string, string> = {};

          headers.forEach((header, index) => {
            rowData[header] = values[index] || '';
          });

          importedData.set(rowData.armband, {
            searchTime: rowData.time,
            qualification: rowData.qualification as QualificationStatus,
            faults: rowData.faults || '0',
            notes: rowData.notes || '',
          });
        }

        // Update bulk data with imported values
        setBulkData(prev =>
          prev.map(item => {
            const imported = importedData.get(item.armband);
            if (imported) {
              const updated = { ...item, ...imported };
              updated.hasChanges = true;
              const validation = validateEntry(updated);
              updated.isValid = validation.isValid;
              return updated;
            }
            return item;
          })
        );

        setImportError(null);
      } catch {
        setImportError('Failed to parse CSV file');
      }
    };

    reader.readAsText(file);
    event.target.value = ''; // Reset file input
  }, []);

  // Handle auto-tab on Enter
  const handleKeyDown = useCallback((event: React.KeyboardEvent, index: number, field: string) => {
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();

      // Find next input field
      const nextIndex = field === 'notes' ? index + 1 : index;
      const nextField =
        field === 'searchTime'
          ? 'qualification'
          : field === 'qualification'
            ? 'faults'
            : field === 'faults'
              ? 'notes'
              : 'searchTime';

      const nextInput = document.querySelector(
        `input[data-index="${nextIndex}"][data-field="${nextField}"], select[data-index="${nextIndex}"][data-field="${nextField}"]`
      ) as HTMLElement;

      if (nextInput) {
        nextInput.focus();
      }
    }
  }, []);

  // Submit bulk results
  const handleSubmit = useCallback(async () => {
    const validEntries = bulkData.filter(item => item.isValid);

    if (validEntries.length === 0) {
      setSubmitError('No valid entries to submit');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const results = validEntries.map(item => {
        const timeInMs = timeStringToMs(item.searchTime);

        const baseResult = {
          entryId: item.entryId,
          classId,
          searchTime: timeInMs,
          maxTimeAllowed: classConfig.timeLimit,
          qualification: item.qualification as QualificationStatus,
          faults: parseInt(item.faults),
          judgeNotes: item.notes || undefined,
          recordedBy: user?.id || 'secretary',
          recordedAt: new Date(),
          isProvisional: true,
        };

        return baseResult as ScentWorkResult;
      });

      logger.debug('Submitting results', 'scoring', { resultsCount: results.length });
      await onResultsSubmit(results);

      addToast({
        id: `bulk-submit-${Date.now()}`,
        type: 'results_posted',
        title: 'Scores saved',
        body: `${results.length} result${results.length !== 1 ? 's' : ''} recorded successfully.`,
        priority: 'normal',
        timestamp: Date.now(),
      });

      logger.info('Results submitted, form will refresh automatically from store', 'scoring');
    } catch (error) {
      logger.error('Submit error', 'scoring', {}, error as Error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit results');
    } finally {
      setIsSubmitting(false);
    }
  }, [addToast, bulkData, classId, classConfig, onResultsSubmit, user?.id]);

  // Download CSV template
  const downloadTemplate = useCallback(() => {
    const headers = [
      'armband',
      'dogName',
      'handlerName',
      'time',
      'qualification',
      'faults',
      'notes',
    ];
    const csvContent = [
      headers.join(','),
      ...entries.map(entry =>
        [
          entry.displayInfo.armband,
          entry.displayInfo.dogName,
          entry.displayInfo.handlerName,
          '', // time
          '', // qualification
          '0', // faults
          '', // notes
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-entry-template-${classConfig.element}-${classConfig.level}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries, classConfig]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with actions */}
      <HeaderActions
        onDownloadTemplate={downloadTemplate}
        onImportClick={() => fileInputRef.current?.click()}
        fileInputRef={fileInputRef}
        onCSVImport={handleCSVImport}
      />

      {/* Summary Cards — hidden until secretary starts entering data */}
      {(summary.entriesWithData > 0 || summary.invalidEntries > 0) && (
        <SummaryCards
          totalEntries={summary.totalEntries}
          entriesWithData={summary.entriesWithData}
          validEntries={summary.validEntries}
          invalidEntries={summary.invalidEntries}
        />
      )}

      {/* Error Messages */}
      {importError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{importError}</AlertDescription>
        </Alert>
      )}

      {submitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {/* Data Entry Table */}
      <div className="myk9-show-info-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Armband</TableHead>
              <TableHead>Dog & Handler</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Qualification</TableHead>
              <TableHead>Faults</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bulkData.map((item, index) => (
              <EntryTableRow
                key={item.entryId}
                item={item}
                index={index}
                validationError={validationErrors.get(item.entryId)}
                onFieldChange={updateBulkData}
                onKeyDown={handleKeyDown}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Submit Actions */}
      <SubmitActions
        canSubmit={summary.canSubmit}
        isSubmitting={isSubmitting}
        entriesWithData={summary.entriesWithData}
        totalEntries={summary.totalEntries}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
