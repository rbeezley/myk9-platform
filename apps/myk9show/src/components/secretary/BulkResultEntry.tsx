/**
 * Bulk Result Entry Component
 * 
 * Allows secretaries to quickly enter results for multiple entries:
 * - Grid-based input interface
 * - Auto-tab functionality for quick entry
 * - Batch validation and submission
 * - Import from CSV capability
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Save, AlertCircle, CheckCircle, Download, Users, FileText } from 'lucide-react';
import { logger } from '@/services/LoggingService';
import { cn } from '@/lib/utils';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SimpleTimeFields } from '@/components/ui/simple-time-fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Types
import type { 
  ScentWorkEntry, 
  ScentWorkResult, 
  MultiAreaScentWorkResult,
  ScentWorkClassConfig,
  QualificationStatus 
} from '@/types/scent-work-types';

// Apple-inspired styling
import '@/styles/apple-show-details.css';

// Local type for competition data
interface LocalCompetitionData {
  time?: string;
  qualified?: boolean;
  qualification?: string;
  faults?: number;
  judgeNotes?: string;
}

// import { validateScentWorkResult, validateMultiAreaScentWorkResult } from '@/types/scent-work-types';

// Helper function to format time from milliseconds to MM:SS format
const formatSearchTimeFromMs = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}.00`;
};

// Helper function to convert various time formats to MM:SS.HH format expected by input
const convertTimeToInputFormat = (timeStr: string): string => {
  // If already in MM:SS.HH format, return as-is
  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(timeStr)) {
    return timeStr;
  }
  
  // If in MM:SS format, add .00 for hundredths
  if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
    return `${timeStr}.00`;
  }
  
  // If it's just a number (seconds), convert to MM:SS.HH
  const numericValue = parseFloat(timeStr);
  if (!isNaN(numericValue)) {
    const minutes = Math.floor(numericValue / 60);
    const seconds = Math.floor(numericValue % 60);
    const hundredths = Math.floor((numericValue % 1) * 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  }
  
  return timeStr;
};

export interface BulkResultEntryProps {
  entries: ScentWorkEntry[];
  classConfig: ScentWorkClassConfig;
  onResultsSubmit: (results: (ScentWorkResult | MultiAreaScentWorkResult)[]) => Promise<void>;
  className?: string;
}

interface BulkEntryData {
  entryId: string;
  armband: string;
  dogName: string;
  handlerName: string;
  searchTime: string;
  qualification: QualificationStatus | '';
  faults: string;
  notes: string;
  isValid: boolean;
  hasChanges: boolean;
}

/**
 * Bulk result entry component for efficient data entry
 */
export function BulkResultEntry({
  entries,
  classConfig,
  onResultsSubmit,
  className
}: BulkResultEntryProps) {
  const [bulkData, setBulkData] = useState<BulkEntryData[]>(() =>
    entries.map(entry => {
      // Extract existing data from entry if available
      const existingData = entry.judgingState?.currentResult;
      const competitionData: LocalCompetitionData = (entry as ScentWorkEntry & { competitionData?: LocalCompetitionData }).competitionData || {};
      
      // Prioritize competitionData (saved data) over existingData (temp judging state)
      // Convert different time formats to the expected MM:SS.HH format
      let searchTime = '';
      if (competitionData.time) {
        // Handle both MM:SS and MM:SS.HH formats
        searchTime = convertTimeToInputFormat(competitionData.time);
      } else if (existingData?.searchTime) {
        searchTime = formatSearchTimeFromMs(existingData.searchTime);
      }
      
      // Handle qualification properly - prioritize saved qualification over computed qualified boolean
      let qualification: QualificationStatus | '' = '';
      if (competitionData.qualification) {
        // Use the saved specific qualification status (Absent, Excused, etc.)
        qualification = competitionData.qualification as QualificationStatus;
      } else if (existingData?.qualification) {
        qualification = existingData.qualification;
      } else if (competitionData.qualified === true) {
        qualification = 'Qualified';
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
        hasChanges: !!(searchTime || qualification)
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
    logger.debug('BulkResultEntry useEffect triggered - entries changed', 'scoring', { entriesCount: entries.length });
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
        if (competitionData.time && typeof competitionData.time === 'string' && competitionData.time.trim()) {
          // Use saved data from store
          searchTime = convertTimeToInputFormat(competitionData.time);
        } else if (prevEntry?.searchTime && prevEntry.hasChanges) {
          // Keep user's unsaved changes only if there's no saved data
          searchTime = prevEntry.searchTime;
        } else if (existingData?.searchTime) {
          // Fall back to judging state data
          searchTime = formatSearchTimeFromMs(existingData.searchTime);
        }
        
        let qualification: QualificationStatus | '' = '';
        const savedQualification = competitionData.qualification || 
          (competitionData.qualified !== undefined 
            ? (competitionData.qualified === true ? 'Qualified' : 'Not Qualified') 
            : '');
        
        // After a successful save, always use the saved data from store
        if (savedQualification) {
          // Use saved qualification from store (specific status like Absent, Excused, etc.)
          qualification = savedQualification as QualificationStatus;
        } else if (prevEntry?.qualification && prevEntry.hasChanges) {
          // Keep user's unsaved changes only if there's no saved data
          qualification = prevEntry.qualification;
        } else if (existingData?.qualification) {
          // Fall back to judging state data
          qualification = existingData.qualification;
        }
        
        // Calculate if this entry has unsaved changes
        // Normalize time formats for accurate comparison
        const savedTimeFormatted = competitionData.time ? convertTimeToInputFormat(competitionData.time) : '';
        const normalizedSearchTime = searchTime ? convertTimeToInputFormat(searchTime) : '';
        const hasTimeChanges = normalizedSearchTime && normalizedSearchTime !== savedTimeFormatted;
        const hasQualificationChanges = qualification && qualification !== savedQualification;
        const hasFaultChanges = (prevEntry?.faults || '0') !== (competitionData.faults?.toString() || '0');
        const hasNotesChanges = (prevEntry?.notes || '') !== (competitionData.judgeNotes || '');
        
        // Enhanced logging for Submit button debugging - only log when there are changes
        if (hasTimeChanges || hasQualificationChanges || hasFaultChanges || hasNotesChanges) {
          logger.debug('Entry change analysis', 'scoring', {
            entryId: entry.id,
            hasTimeChanges: hasTimeChanges ? `${normalizedSearchTime} vs ${savedTimeFormatted}` : false,
            hasQualificationChanges: hasQualificationChanges ? `${qualification} vs ${savedQualification}` : false,
            hasFaultChanges: hasFaultChanges ? `${prevEntry?.faults || '0'} vs ${competitionData.faults?.toString() || '0'}` : false,
            hasNotesChanges: hasNotesChanges ? `"${prevEntry?.notes || ''}" vs "${competitionData.judgeNotes || ''}"` : false
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
          faults: competitionData.faults?.toString() || prevEntry?.faults || existingData?.faults?.toString() || '0',
          notes: competitionData.judgeNotes || prevEntry?.notes || existingData?.judgeNotes || '',
          isValid: !!(searchTime && qualification),
          hasChanges: hasTimeChanges || hasQualificationChanges || hasFaultChanges || hasNotesChanges
        };
        
        // Removed verbose bulk entry logging
        return bulkEntry;
      });
      
      return newData;
    });
  }, [entries]);

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
        buttonText: `Submit ${entriesWithData} Results`
      });
    }

    return {
      totalEntries,
      entriesWithData,
      validEntries,
      invalidEntries,
      canSubmit
    };
  }, [bulkData]);

  // Validate individual entry
  const validateEntry = useCallback((data: BulkEntryData): { isValid: boolean; error?: string } => {
    if (!data.hasChanges) {
      return { isValid: false };
    }

    // Check required fields
    if (!data.searchTime || !data.qualification) {
      return { isValid: false, error: 'Time and qualification required' };
    }

    // Validate time format (MM:SS.HH)
    const timePattern = /^(\d{1,2}):([0-5]\d)\.(\d{2})$/;
    if (!timePattern.test(data.searchTime)) {
      return { isValid: false, error: 'Invalid time format (MM:SS.HH)' };
    }
    
    // Additional validation for logical time values
    const match = data.searchTime.match(timePattern);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const hundredths = parseInt(match[3]);
      
      if (minutes > 59 || seconds > 59 || hundredths > 99) {
        return { isValid: false, error: 'Invalid time values' };
      }
    }

    // Validate faults
    const faultCount = parseInt(data.faults);
    if (isNaN(faultCount) || faultCount < 0) {
      return { isValid: false, error: 'Invalid fault count' };
    }

    return { isValid: true };
  }, []);

  // Update bulk data and validate
  const updateBulkData = useCallback((index: number, field: keyof BulkEntryData, value: string) => {
    setBulkData(prev => {
      const newData = [...prev];
      const item = { ...newData[index] };
      
      (item as Record<string, string | boolean>)[field] = value;
      item.hasChanges = !!(item.searchTime || item.qualification || item.faults !== '0' || item.notes);
      
      const validation = validateEntry(item);
      item.isValid = validation.isValid;
      
      newData[index] = item;
      
      // Enhanced logging for field updates
      logger.debug('Field update on entry', 'scoring', {
        entryId: item.entryId,
        field,
        value,
        hasChanges: item.hasChanges,
        isValid: item.isValid
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
  }, [validateEntry]);

  // Convert time string to milliseconds
  const timeStringToMs = useCallback((timeStr: string): number => {
    const match = timeStr.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/);
    if (!match) return 0;
    
    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const hundredths = parseInt(match[3]);
    
    return (minutes * 60 + seconds) * 1000 + hundredths * 10;
  }, []);

  // Handle CSV import
  const handleCSVImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
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
            notes: rowData.notes || ''
          });
        }

        // Update bulk data with imported values
        setBulkData(prev => prev.map(item => {
          const imported = importedData.get(item.armband);
          if (imported) {
            const updated = { ...item, ...imported };
            updated.hasChanges = true;
            const validation = validateEntry(updated);
            updated.isValid = validation.isValid;
            return updated;
          }
          return item;
        }));

        setImportError(null);
      } catch {
        setImportError('Failed to parse CSV file');
      }
    };
    
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
  }, [validateEntry]);

  // Handle auto-tab on Enter
  const handleKeyDown = useCallback((event: React.KeyboardEvent, index: number, field: string) => {
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      
      // Find next input field
      const nextIndex = field === 'notes' ? index + 1 : index;
      const nextField = field === 'searchTime' ? 'qualification' : 
                      field === 'qualification' ? 'faults' : 
                      field === 'faults' ? 'notes' : 'searchTime';
      
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
          classId: 'bulk-entry-class', // TODO: Get from context
          searchTime: timeInMs,
          maxTimeAllowed: classConfig.timeLimit,
          qualification: item.qualification as QualificationStatus,
          faults: parseInt(item.faults),
          judgeNotes: item.notes || undefined,
          recordedBy: 'secretary', // TODO: Get from auth context
          recordedAt: new Date(),
          isProvisional: true
        };

        return baseResult as ScentWorkResult;
      });

      logger.debug('Submitting results', 'scoring', { resultsCount: results.length });
      await onResultsSubmit(results);
      
      // The useEffect will automatically update state when store entries change
      logger.info('Results submitted, form will refresh automatically from store', 'scoring');
      
    } catch (error) {
      logger.error('Submit error', 'scoring', {}, error as Error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit results');
    } finally {
      setIsSubmitting(false);
    }
  }, [bulkData, classConfig, timeStringToMs, onResultsSubmit]);

  // Download CSV template
  const downloadTemplate = useCallback(() => {
    const headers = ['armband', 'dogName', 'handlerName', 'time', 'qualification', 'faults', 'notes'];
    const csvContent = [
      headers.join(','),
      ...entries.map(entry => [
        entry.displayInfo.armband,
        entry.displayInfo.dogName,
        entry.displayInfo.handlerName,
        '', // time
        '', // qualification
        '0', // faults
        '' // notes
      ].join(','))
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
      <div className="apple-show-info-card">
        <div className="apple-show-info-header">
          <div>
            <div className="apple-show-info-title">Bulk Result Entry</div>
            <p className="text-sm text-muted-foreground mt-1">
              Enter results for multiple entries quickly
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={downloadTemplate}
              className="apple-action-button"
            >
              <Download className="h-4 w-4" />
              <span>Download Template</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="apple-action-button"
            >
              <Upload className="h-4 w-4" />
              <span>Import CSV</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCSVImport}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="apple-show-stats-section">
        <div className="apple-show-stats-grid">
          <div className="apple-show-stat-card">
            <div className="apple-show-stat-layout">
              <div className="apple-show-stat-icon entries">
                <Users className="w-5 h-5" />
              </div>
              <div className="apple-show-stat-content">
                <div className="apple-show-stat-header">
                  <div className="apple-show-stat-title">Total Entries</div>
                </div>
                <div className="apple-show-stat-number">{summary.totalEntries}</div>
              </div>
            </div>
            <div className="apple-show-stat-progress">
              <div className="apple-show-stat-progress-bar entries" style={{ width: '100%' }}></div>
            </div>
          </div>

          <div className="apple-show-stat-card">
            <div className="apple-show-stat-layout">
              <div className="apple-show-stat-icon trials">
                <FileText className="w-5 h-5" />
              </div>
              <div className="apple-show-stat-content">
                <div className="apple-show-stat-header">
                  <div className="apple-show-stat-title">With Data</div>
                </div>
                <div className="apple-show-stat-number">{summary.entriesWithData}</div>
              </div>
            </div>
            <div className="apple-show-stat-progress">
              <div className="apple-show-stat-progress-bar trials" style={{ width: `${summary.totalEntries > 0 ? Math.round((summary.entriesWithData / summary.totalEntries) * 100) : 0}%` }}></div>
            </div>
          </div>

          <div className="apple-show-stat-card">
            <div className="apple-show-stat-layout">
              <div className="apple-show-stat-icon qualified">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div className="apple-show-stat-content">
                <div className="apple-show-stat-header">
                  <div className="apple-show-stat-title">Valid</div>
                </div>
                <div className="apple-show-stat-number">{summary.validEntries}</div>
              </div>
            </div>
            <div className="apple-show-stat-progress">
              <div className="apple-show-stat-progress-bar qualified" style={{ width: `${summary.totalEntries > 0 ? Math.round((summary.validEntries / summary.totalEntries) * 100) : 0}%` }}></div>
            </div>
          </div>

          <div className="apple-show-stat-card">
            <div className="apple-show-stat-layout">
              <div className="apple-show-stat-icon classes">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="apple-show-stat-content">
                <div className="apple-show-stat-header">
                  <div className="apple-show-stat-title">Invalid</div>
                </div>
                <div className="apple-show-stat-number">{summary.invalidEntries}</div>
              </div>
            </div>
            <div className="apple-show-stat-progress">
              <div className="apple-show-stat-progress-bar classes" style={{ width: `${summary.totalEntries > 0 ? Math.round((summary.invalidEntries / summary.totalEntries) * 100) : 0}%` }}></div>
            </div>
          </div>
        </div>
      </div>

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
      <div className="apple-show-info-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Armband</TableHead>
              <TableHead>Dog & Handler</TableHead>
              <TableHead>Time (MM:SS.HH)</TableHead>
              <TableHead>Qualification</TableHead>
              <TableHead>Faults</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bulkData.map((item, index) => (
              <TableRow 
                key={item.entryId}
                className={cn(
                  'hover:bg-gray-50 dark:hover:bg-gray-800',
                  item.hasChanges && !item.isValid && 'bg-red-50 dark:bg-red-950/20'
                )}
              >
                <TableCell className="font-medium">
                  #{item.armband}
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{item.dogName}</div>
                    <div className="text-sm text-gray-600">{item.handlerName}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <SimpleTimeFields
                    value={item.searchTime}
                    onChange={(value) => updateBulkData(index, 'searchTime', value)}
                    onKeyDown={(e) => handleKeyDown(e, index, 'searchTime')}
                    data-index={index}
                    data-field="searchTime"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={item.qualification}
                    onValueChange={(value) => updateBulkData(index, 'qualification', value)}
                    data-index={index}
                    data-field="qualification"
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Qualified">Qualified</SelectItem>
                      <SelectItem value="Not Qualified">Not Qualified</SelectItem>
                      <SelectItem value="Absent">Absent</SelectItem>
                      <SelectItem value="Excused">Excused</SelectItem>
                      <SelectItem value="Withdrawn">Withdrawn</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={item.faults}
                    onChange={(e) => updateBulkData(index, 'faults', e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, index, 'faults')}
                    min="0"
                    max="99"
                    className="w-16"
                    data-index={index}
                    data-field="faults"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={item.notes}
                    onChange={(e) => updateBulkData(index, 'notes', e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, index, 'notes')}
                    placeholder="Optional notes"
                    className="w-40"
                    data-index={index}
                    data-field="notes"
                  />
                </TableCell>
                <TableCell>
                  {item.hasChanges ? (
                    item.isValid ? (
                      <Badge variant="default" className="flex items-center space-x-1">
                        <CheckCircle className="h-3 w-3" />
                        <span>Valid</span>
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="flex items-center space-x-1">
                        <AlertCircle className="h-3 w-3" />
                        <span>Invalid</span>
                      </Badge>
                    )
                  ) : (
                    <Badge variant="outline">Empty</Badge>
                  )}
                  {validationErrors.has(item.entryId) && (
                    <div className="text-xs text-red-600 mt-1">
                      {validationErrors.get(item.entryId)}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Submit Actions */}
      <div className="apple-show-info-card">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Press Enter or Tab to move between fields quickly
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!summary.canSubmit || isSubmitting}
            className="apple-action-button apple-action-button-primary"
          >
            <Save className="h-4 w-4" />
            <span>{isSubmitting ? 'Submitting...' : `Submit ${summary.entriesWithData} Results`}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}