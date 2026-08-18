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
  BulkEntryEditableField,
  BulkResultEntryProps,
  LocalCompetitionData,
  BulkEntryValues,
} from './bulk-result-entry/types';
import {
  formatSearchTimeFromMs,
  convertTimeToInputFormat,
  timeStringToMs,
  hasBulkEntryChanges,
  resolveBulkEntryValues,
  validateBulkEntry,
} from './bulk-result-entry/helpers';
import { SummaryCards } from './bulk-result-entry/SummaryCards';
import { HeaderActions } from './bulk-result-entry/HeaderActions';
import { EntryTableRow } from './bulk-result-entry/EntryTableRow';
import { SubmitActions } from './bulk-result-entry/SubmitActions';
import { UnsavedChangesRouteGuard } from '@/components/navigation/UnsavedChangesRouteGuard';

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

      const faults = competitionData.faults?.toString() || existingData?.faults?.toString() || '0';
      const notes = competitionData.judgeNotes || existingData?.judgeNotes || '';
      const savedQualification =
        competitionData.qualification ||
        (competitionData.qualified !== undefined
          ? competitionData.qualified === true
            ? 'Qualified'
            : 'Not Qualified'
          : existingData?.qualification || 'Qualified');

      const savedValues: BulkEntryValues = {
        searchTime,
        qualification: savedQualification as QualificationStatus,
        faults,
        notes,
      };
      const initialData: BulkEntryData = {
        entryId: entry.id,
        armband: entry.displayInfo.armband,
        dogName: entry.displayInfo.dogName,
        handlerName: entry.displayInfo.handlerName,
        searchTime,
        qualification,
        faults,
        notes,
        isValid: false,
        hasChanges: hasBulkEntryChanges({ searchTime, qualification, faults, notes }, savedValues),
        savedValues,
      };
      initialData.isValid = validateBulkEntry(initialData).isValid;
      return initialData;
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
    const refreshedValidationErrors = new Map<string, string>();
    setBulkData(prevData => {
      const newData = entries.map(entry => {
        // Extract existing data from entry if available
        const existingData = entry.judgingState?.currentResult;
        const rawEntry = entry as ScentWorkEntry & { competitionData?: LocalCompetitionData };
        const competitionData: LocalCompetitionData = rawEntry.competitionData || {};

        // Get previously entered data from current state
        const prevEntry = prevData.find(d => d.entryId === entry.id);

        const savedQualification =
          competitionData.qualification ||
          (competitionData.qualified !== undefined
            ? competitionData.qualified === true
              ? 'Qualified'
              : 'Not Qualified'
            : '');
        const savedSearchTime = competitionData.time
          ? convertTimeToInputFormat(competitionData.time)
          : existingData?.searchTime
            ? formatSearchTimeFromMs(existingData.searchTime)
            : '';
        const savedQualificationBaseline =
          savedQualification || existingData?.qualification || 'Qualified';
        const savedFaults =
          competitionData.faults?.toString() || existingData?.faults?.toString() || '0';
        const savedNotes = competitionData.judgeNotes || existingData?.judgeNotes || '';
        const refreshedValues = {
          searchTime: savedSearchTime,
          qualification: savedQualificationBaseline as QualificationStatus,
          faults: savedFaults,
          notes: savedNotes,
        };
        const {
          searchTime,
          qualification,
          faults: currentFaults,
          notes: currentNotes,
        } = resolveBulkEntryValues(refreshedValues, prevEntry);

        const hasChanges = hasBulkEntryChanges(
          { searchTime, qualification, faults: currentFaults, notes: currentNotes },
          refreshedValues
        );

        // Enhanced logging for Submit button debugging - only log when there are changes
        if (hasChanges) {
          logger.debug('Entry change analysis', 'scoring', {
            entryId: entry.id,
            hasChanges,
          });
        }

        // Removed excessive debugging - Submit button issue resolved

        const bulkEntry: BulkEntryData = {
          entryId: entry.id,
          armband: entry.displayInfo.armband,
          dogName: entry.displayInfo.dogName,
          handlerName: entry.displayInfo.handlerName,
          searchTime,
          qualification,
          faults: currentFaults,
          notes: currentNotes,
          isValid: false,
          hasChanges,
          savedValues: refreshedValues,
        };
        const validation = validateBulkEntry(bulkEntry);
        bulkEntry.isValid = validation.isValid;
        if (validation.error) {
          refreshedValidationErrors.set(entry.id, validation.error);
        }

        // Removed verbose bulk entry logging
        return bulkEntry;
      });

      return newData;
    });
    setValidationErrors(current => {
      const next = new Map(current);
      entries.forEach(entry => next.delete(entry.id));
      refreshedValidationErrors.forEach((error, entryId) => next.set(entryId, error));
      return next;
    });
  }, [entries]);

  // Unsaved-changes guard
  const hasUnsavedChanges = useMemo(() => bulkData.some(item => item.hasChanges), [bulkData]);

  // Calculate summary statistics
  const summary = React.useMemo(() => {
    const totalEntries = bulkData.length;
    const entriesWithData = bulkData.filter(item => item.hasChanges && item.isValid).length; // Only count valid entries with changes
    const validEntries = bulkData.filter(item => item.isValid).length;
    const invalidEntries = bulkData.filter(item => item.hasChanges && !item.isValid).length;

    // Only log summary when Submit button should change state
    const canSubmit = entriesWithData > 0 && invalidEntries === 0;
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
  const updateBulkData = useCallback(
    (index: number, field: BulkEntryEditableField, value: string) => {
      setBulkData(prev => {
        const newData = [...prev];
        const item = { ...newData[index] };

        if (field === 'searchTime') item.searchTime = value;
        if (field === 'qualification') item.qualification = value as QualificationStatus;
        if (field === 'faults') item.faults = value;
        if (field === 'notes') item.notes = value;
        item.hasChanges = hasBulkEntryChanges(item, item.savedValues);

        const validation = validateBulkEntry(item);
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
    },
    []
  );

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
              updated.hasChanges = hasBulkEntryChanges(updated, item.savedValues);
              const validation = validateBulkEntry(updated);
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
    const validEntries = bulkData.filter(item => item.isValid && item.hasChanges);

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
      <UnsavedChangesRouteGuard isDirty={hasUnsavedChanges} subject="bulk result entries" />

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
