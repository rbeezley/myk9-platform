/**
 * Class Results Table Component
 * 
 * Enhanced version of BulkResultEntry with:
 * - Role-based access control
 * - Automatic placement calculation
 * - Placement column display
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Save, AlertCircle, CheckCircle, Trophy, History, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SimpleTimeFields } from '@/components/ui/simple-time-fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
import { logger } from '@/services/LoggingService';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip/tooltip';

// Types
import type { 
  ScentWorkEntry, 
  ScentWorkResult, 
  MultiAreaScentWorkResult,
  ScentWorkClassConfig,
  QualificationStatus 
} from '@/types/scent-work-types';
import { UserPermissions } from '@/types/user-permissions';

// Apple-inspired styling
import '@/styles/apple-show-details.css';

export interface ClassResultsTableProps {
  entries: ScentWorkEntry[];
  classConfig: ScentWorkClassConfig;
  userPermissions: UserPermissions;
  onResultsSubmit: (results: (ScentWorkResult | MultiAreaScentWorkResult)[]) => Promise<void>;
  onDeleteEntry?: (entryId: string) => void;
  onAddEntry?: () => void;
  className?: string;
}

interface BulkEntryData {
  entryId: string;
  armband: string;
  dogName: string;
  handlerName: string;
  searchTime: string;
  qualification: QualificationStatus | '';
  qualificationReason: string;
  faults: string;
  notes: string;
  placement: number | null;
  isValid: boolean;
  hasChanges: boolean;
  modifiedFields?: Set<keyof BulkEntryData>; // Track which fields were modified
  lastEditedBy?: string; // Who last edited this result
  lastEditedAt?: Date; // When it was last edited
}

// Reason lists for different qualification statuses
const QUALIFICATION_REASONS = {
  'Not Qualified': [
    'Incorrect Call',
    'Max Time', 
    'Unable to Point to Hide',
    'Harsh Correction',
    'Significant Disruption of Search Area'
  ],
  'Excused': [
    'Dog Eliminated in Area',
    'Handler Request',
    'Out of Control', 
    'Overly Stressed',
    'Other'
  ],
  'Withdrawn': [
    'In Season',
    'Judge Change'
  ]
} as const;

export const ClassResultsTable: React.FC<ClassResultsTableProps> = ({
  entries,
  classConfig,
  userPermissions,
  onResultsSubmit,
  onDeleteEntry,
  onAddEntry,
  className
}) => {
  const [bulkData, setBulkData] = useState<BulkEntryData[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors] = useState<Map<string, string>>(new Map());

  // Helper function to convert time string to milliseconds
  const timeStringToMs = useCallback((timeStr: string): number => {
    const match = timeStr.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/);
    if (!match) return 0;
    
    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const hundredths = parseInt(match[3]);
    
    return (minutes * 60 + seconds) * 1000 + hundredths * 10;
  }, []);

  // Helper function to get AKC ribbon CSS classes for placements
  const getPlacementBadgeClass = useCallback((placement: number | null) => {
    if (!placement) return "";
    
    switch (placement) {
      case 1:
        return "akc-placement-badge akc-placement-1st";
      case 2:
        return "akc-placement-badge akc-placement-2nd";
      case 3:
        return "akc-placement-badge akc-placement-3rd";
      case 4:
        return "akc-placement-badge akc-placement-4th";
      default:
        return "akc-placement-badge akc-placement-other";
    }
  }, []);

  // Helper function to convert time to input format (MM:SS.HH)
  const convertTimeToInputFormat = useCallback((timeStr: string): string => {
    if (!timeStr) return '';
    
    // Handle various time formats
    if (timeStr.match(/^\d{1,2}:\d{2}\.\d{2}$/)) {
      return timeStr; // Already in MM:SS.HH format
    }
    
    if (timeStr.match(/^\d{1,2}:\d{2}$/)) {
      return `${timeStr}.00`; // Convert MM:SS to MM:SS.HH
    }
    
    // Try to parse as seconds
    const seconds = parseFloat(timeStr);
    if (!isNaN(seconds)) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      const hundredths = Math.round((seconds % 1) * 100);
      return `${mins}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
    }
    
    return timeStr;
  }, []);

  // Calculate placements based on faults first, then time
  const calculatePlacements = useCallback((data: BulkEntryData[]): BulkEntryData[] => {
    // Only calculate placements for qualified entries with valid data
    const qualifiedEntries = data
      .map((entry, index) => ({ ...entry, originalIndex: index }))
      .filter(entry => 
        entry.qualification === 'Qualified' && 
        entry.searchTime && 
        entry.faults !== undefined
      );

    // Sort by faults (ascending), then by time (ascending)
    const sortedEntries = qualifiedEntries.sort((a, b) => {
      const faultsA = parseInt(a.faults) || 0;
      const faultsB = parseInt(b.faults) || 0;
      
      if (faultsA !== faultsB) {
        return faultsA - faultsB; // Fewer faults = better placement
      }
      
      // If faults are equal, sort by time
      const timeA = timeStringToMs(a.searchTime);
      const timeB = timeStringToMs(b.searchTime);
      return timeA - timeB; // Faster time = better placement
    });

    // Assign placements
    const updatedData = [...data];
    sortedEntries.forEach((entry, index) => {
      const placement = index + 1;
      updatedData[entry.originalIndex].placement = placement;
    });

    // Clear placements for non-qualified entries
    updatedData.forEach(entry => {
      if (entry.qualification !== 'Qualified') {
        entry.placement = null;
      }
    });

    return updatedData;
  }, [timeStringToMs]);

  // Initialize bulk data from entries
  useEffect(() => {
    setBulkData(() => {
      const newData = entries.map(entry => {
        const existingData = entry.judgingState?.currentResult;
        const competitionData = entry.competitionData;
        
        // Debug logging
        logger.debug('🔍 ClassResultsTable - Processing entry:', 'classes', { data: {
          entryId: entry.id,
          competitionData,
          existingData,
          armband: entry.displayInfo.armband
        } });
        
        // Determine search time - prefer normalized input format
        let searchTime = '';
        if (competitionData?.time) {
          searchTime = convertTimeToInputFormat(competitionData.time);
        } else if (existingData?.searchTime) {
          searchTime = convertTimeToInputFormat((existingData.searchTime / 1000).toString());
        }
        
        // Determine qualification status
        let qualification: QualificationStatus | '' = '';
        
        // First priority: check for explicit qualification string
        if ((competitionData as Record<string, unknown>)?.qualification) {
          qualification = (competitionData as Record<string, unknown>).qualification as QualificationStatus;
        }
        // Second priority: check existing data
        else if (existingData?.qualification) {
          qualification = existingData.qualification;
        }
        // Third priority: fall back to boolean qualified field (legacy)
        else if (competitionData?.qualified !== undefined) {
          qualification = competitionData.qualified === true ? 'Qualified' : 'Not Qualified';
        }
        
        const bulkEntry: BulkEntryData = {
          entryId: entry.id,
          armband: entry.displayInfo.armband,
          dogName: entry.displayInfo.dogName,
          handlerName: entry.displayInfo.handlerName,
          searchTime,
          qualification,
          qualificationReason: (competitionData as Record<string, unknown>)?.qualificationReason?.toString() || '',
          faults: (competitionData as Record<string, unknown>)?.faults?.toString() || existingData?.faults?.toString() || '0',
          notes: competitionData?.judgeNotes || existingData?.judgeNotes || '',
          placement: null, // Will be calculated
          isValid: !!(searchTime && qualification),
          hasChanges: false,
          modifiedFields: new Set<keyof BulkEntryData>(),
          lastEditedBy: competitionData?.recordedBy || existingData?.recordedBy,
          lastEditedAt: existingData?.recordedAt
        };
        
        return bulkEntry;
      });
      
      // Calculate placements for the initial data
      return calculatePlacements(newData);
    });
  }, [entries, convertTimeToInputFormat, calculatePlacements]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const totalEntries = bulkData.length;
    const entriesWithData = bulkData.filter(item => item.hasChanges && item.isValid).length;
    const validEntries = bulkData.filter(item => item.isValid).length;
    const invalidEntries = bulkData.filter(item => item.hasChanges && !item.isValid).length;

    return {
      totalEntries,
      entriesWithData,
      validEntries,
      invalidEntries,
      canSubmit: validEntries > 0 && invalidEntries === 0 && userPermissions.canEditEntries
    };
  }, [bulkData, userPermissions.canEditEntries]);

  // Validate individual entry
  const validateEntry = useCallback((data: BulkEntryData): { isValid: boolean; error?: string } => {
    if (!data.hasChanges) {
      return { isValid: true }; // Empty fields are valid (not invalid)
    }

    // Check if qualification reason is required
    const needsReason = ['Not Qualified', 'Excused', 'Withdrawn'].includes(data.qualification);
    if (needsReason && !data.qualificationReason) {
      return { isValid: false, error: 'Reason required for NQ, Excused, or Withdrawn' };
    }
    
    // Special handling for different qualification types
    if (data.qualification === 'Qualified') {
      // Qualified entries require time
      if (!data.searchTime) {
        return { isValid: false, error: 'Time required for Qualified entries' };
      }
    } else if (data.qualification === 'Not Qualified') {
      // NQ entries require time (they competed but didn't qualify)
      if (!data.searchTime) {
        return { isValid: false, error: 'Time required for NQ entries' };
      }
    } else if (['Excused', 'Withdrawn', 'Absent'].includes(data.qualification)) {
      // Excused/Withdrawn/Absent entries don't require time (they didn't compete)
      // But they do need a reason (already checked above for Excused/Withdrawn)
    }
    
    // If time is provided without qualification, require qualification
    if (!data.qualification && data.searchTime) {
      return { isValid: false, error: 'Qualification required when time is set' };
    }
    
    // If only notes, faults, or qualification reason are set without time/qualification, that's valid
    if (!data.searchTime && !data.qualification) {
      return { isValid: true };
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
    if (!userPermissions.canEditEntries) {
      return; // Prevent editing for users without permissions
    }

    setBulkData(prev => {
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
      const hasQualificationReason = item.qualificationReason && item.qualificationReason.trim() !== '';
      const hasFaults = item.faults !== '0';
      const hasNotes = item.notes && item.notes.trim() !== '';
      item.hasChanges = !!(hasTime || hasQualification || hasQualificationReason || hasFaults || hasNotes);
      
      const validation = validateEntry(item);
      item.isValid = validation.isValid;
      
      newData[index] = item;
      
      // Clear qualification reason if qualification changes to one that doesn't need a reason
      if (field === 'qualification') {
        const needsReason = ['Not Qualified', 'Excused', 'Withdrawn'].includes(value);
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
  }, [userPermissions.canEditEntries, validateEntry, calculatePlacements]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number, field: string) => {
    if (!userPermissions.canEditEntries) return;

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      
      const fields = ['qualification', 'qualificationReason', 'searchTime', 'faults', 'notes'];
      const currentFieldIndex = fields.indexOf(field);
      
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
      const nextElement = document.querySelector(`[data-index="${nextIndex}"][data-field="${nextField}"]`) as HTMLElement;
      if (nextElement) {
        nextElement.focus();
      }
    }
  }, [userPermissions.canEditEntries, bulkData.length]);


  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (!userPermissions.canEditEntries) return;

    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      const validResults = bulkData
        .filter(item => item.hasChanges && item.isValid)
        .map(item => {
          // Handle search time - some qualifications (Excused, Withdrawn, Absent) may not have times
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
            qualificationReason: item.qualificationReason || undefined
          };
          return result;
        });
      
      if (validResults.length === 0) {
        setSubmitError('No valid results to submit');
        return;
      }
      
      await onResultsSubmit(validResults);
      
      // Clear modified fields after successful submission
      setBulkData(prev => prev.map(item => ({
        ...item,
        modifiedFields: new Set<keyof BulkEntryData>(),
        lastEditedBy: userPermissions.displayName || 'Unknown User',
        lastEditedAt: new Date()
      })));
      
    } catch (error) {
      logger.error('❌ Submit error:', 'classes', {}, error as Error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit results');
    } finally {
      setIsSubmitting(false);
    }
  }, [bulkData, classConfig, timeStringToMs, onResultsSubmit, userPermissions, entries]);

  // Handle Ctrl+S/Cmd+S keyboard shortcut
  useEffect(() => {
    const handleKeyboardShortcut = (e: KeyboardEvent) => {
      // Check for Ctrl+S (Windows/Linux) or Cmd+S (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault(); // Prevent browser save dialog
        
        // Only submit if we can submit
        if (summary.canSubmit && !isSubmitting) {
          handleSubmit();
        }
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyboardShortcut);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyboardShortcut);
    };
  }, [summary.canSubmit, isSubmitting, handleSubmit]);


  return (
    <TooltipProvider>
      <div className={cn('space-y-6', className)}>
        {/* Header with actions */}
        <div className="apple-show-info-card">
          <div className="apple-show-info-header">
            <div>
              <div className="apple-show-info-title">Class Entries and Results</div>
              <p className="text-sm text-muted-foreground mt-1">
                {userPermissions.canEditEntries 
                  ? 'Enter results and view calculated placements • Press Ctrl+S (or Cmd+S) to save'
                  : 'View results and placements (read-only)'}
              </p>
            </div>
            {/* Add Entry Button - only for secretaries and admins */}
            {onAddEntry && userPermissions.canEditEntries && (
              <Button 
                onClick={onAddEntry}
                className="apple-action-button apple-action-button-primary"
                size="sm"
              >
                + Add Entry
              </Button>
            )}
          </div>
        </div>


      {/* Error Messages */}

      {submitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {!userPermissions.canEditEntries && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have read-only access. Contact a secretary or administrator to edit results.
          </AlertDescription>
        </Alert>
      )}

      {/* Data Entry Table */}
      <div className="apple-show-info-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Armband</TableHead>
              <TableHead>Dog & Handler</TableHead>
              <TableHead>Placement</TableHead>
              <TableHead>Qualification</TableHead>
              <TableHead className="text-center">Time (MM:SS.HH)</TableHead>
              <TableHead>Faults</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Status</TableHead>
              {userPermissions.canEditEntries && onDeleteEntry && (
                <TableHead className="w-12"></TableHead>
              )}
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="font-medium cursor-pointer hover:text-blue-600">{item.dogName}</div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-sm">
                          {(() => {
                            const entry = entries.find(e => e.id === item.entryId);
                            // Scent Work is typically AKC, so prefer AKC registration if available
                            const dogRegistration = entry?.registrations?.find(reg => 
                              reg.organization === 'AKC'
                            ) || entry?.registrations?.[0]; // fallback to first registration
                            
                            if (dogRegistration) {
                              return (
                                <div className="space-y-1">
                                  <div><strong>Registered Name:</strong> {dogRegistration.registeredName}</div>
                                  <div><strong>Registration #:</strong> {dogRegistration.registrationNumber}</div>
                                  <div><strong>Breed:</strong> {dogRegistration.breed}</div>
                                  {dogRegistration.variety && (
                                    <div><strong>Variety:</strong> {dogRegistration.variety}</div>
                                  )}
                                  <div><strong>Organization:</strong> {dogRegistration.organization}</div>
                                </div>
                              );
                            } else {
                              // If no match with organization, try showing any AKC registration
                              const akcRegistration = entry?.registrations?.find(reg => 
                                reg.organization === 'AKC'
                              );
                              
                              if (akcRegistration) {
                                return (
                                  <div className="space-y-1">
                                    <div><strong>Registered Name:</strong> {akcRegistration.registeredName}</div>
                                    <div><strong>Registration #:</strong> {akcRegistration.registrationNumber}</div>
                                    <div><strong>Breed:</strong> {akcRegistration.breed}</div>
                                    {akcRegistration.variety && (
                                      <div><strong>Variety:</strong> {akcRegistration.variety}</div>
                                    )}
                                    <div><strong>Organization:</strong> {akcRegistration.organization}</div>
                                  </div>
                                );
                              }
                              
                              return (
                                <div className="space-y-1">
                                  <div><strong>Dog Name:</strong> {item.dogName}</div>
                                  <div className="text-muted-foreground">
                                    No AKC registration found
                                  </div>
                                </div>
                              );
                            }
                          })()}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                    <div className="text-sm text-gray-600">{item.handlerName}</div>
                  </div>
                </TableCell>
                <TableCell>
                  {item.placement ? (
                    <Badge 
                      variant="default" 
                      className={getPlacementBadgeClass(item.placement)}
                    >
                      <Trophy className="h-4 w-4" />
                      {item.placement === 1 ? '1st' : 
                       item.placement === 2 ? '2nd' : 
                       item.placement === 3 ? '3rd' : 
                       `${item.placement}th`}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">--</span>
                  )}
                </TableCell>
                <TableCell>
                  {userPermissions.canEditEntries ? (
                    <div className="space-y-1">
                      <Select
                        value={item.qualification}
                        onValueChange={(value) => updateBulkData(index, 'qualification', value)}
                        data-index={index}
                        data-field="qualification"
                      >
                        <SelectTrigger className={cn(
                          "w-32",
                          item.modifiedFields?.has('qualification') && "ring-2 ring-blue-500/30 border-blue-500"
                        )}>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Qualified">Qualified</SelectItem>
                          <SelectItem value="Not Qualified">NQ</SelectItem>
                          <SelectItem value="Absent">Absent</SelectItem>
                          <SelectItem value="Excused">Excused</SelectItem>
                          <SelectItem value="Withdrawn">Withdrawn</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {/* Conditional Reason Dropdown - Stacked Below */}
                      {['Not Qualified', 'Excused', 'Withdrawn'].includes(item.qualification) && (
                        <Select
                          value={item.qualificationReason}
                          onValueChange={(value) => updateBulkData(index, 'qualificationReason', value)}
                          data-index={index}
                          data-field="qualificationReason"
                        >
                          <SelectTrigger className={cn(
                            "w-32 h-7 text-xs",
                            item.modifiedFields?.has('qualificationReason') && "ring-2 ring-blue-500/30 border-blue-500"
                          )}>
                            <SelectValue placeholder="Reason" />
                          </SelectTrigger>
                          <SelectContent>
                            {QUALIFICATION_REASONS[item.qualification as keyof typeof QUALIFICATION_REASONS]?.map((reason) => (
                              <SelectItem key={reason} value={reason}>
                                {reason}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div>
                        <Badge variant={item.qualification === 'Qualified' ? 'default' : 'secondary'}>
                          {item.qualification === 'Not Qualified' ? 'NQ' : item.qualification || 'Not Set'}
                        </Badge>
                      </div>
                      {item.qualificationReason && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {item.qualificationReason}
                        </div>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {userPermissions.canEditEntries ? (
                    <div className="flex justify-center">
                      <div className={cn(
                        "inline-block rounded-md",
                        item.modifiedFields?.has('searchTime') && "ring-2 ring-blue-500/30"
                      )}>
                        <SimpleTimeFields
                          value={item.searchTime}
                          onChange={(value) => updateBulkData(index, 'searchTime', value)}
                          onKeyDown={(e) => handleKeyDown(e, index, 'searchTime')}
                          disabled={!userPermissions.canEditEntries}
                          hideLabels={true}
                          data-index={index}
                          data-field="searchTime"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <span className="text-sm font-mono">{item.searchTime || '--'}</span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {userPermissions.canEditEntries ? (
                    <Input
                      type="number"
                      value={item.faults}
                      onChange={(e) => updateBulkData(index, 'faults', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'faults')}
                      min="0"
                      max="99"
                      className={cn(
                        "w-16",
                        item.modifiedFields?.has('faults') && "ring-2 ring-blue-500/30 border-blue-500"
                      )}
                      data-index={index}
                      data-field="faults"
                    />
                  ) : (
                    <span className="text-sm">{item.faults}</span>
                  )}
                </TableCell>
                <TableCell>
                  {userPermissions.canEditEntries ? (
                    <Input
                      value={item.notes}
                      onChange={(e) => updateBulkData(index, 'notes', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'notes')}
                      placeholder="Optional notes"
                      className={cn(
                        "w-40",
                        item.modifiedFields?.has('notes') && "ring-2 ring-blue-500/30 border-blue-500"
                      )}
                      data-index={index}
                      data-field="notes"
                    />
                  ) : (
                    <span className="text-sm">{item.notes || '--'}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-flex items-center gap-2">
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
                          <Badge variant="outline" className="flex items-center space-x-1">
                            {item.searchTime && item.qualification ? (
                              <>
                                <span>Complete</span>
                                {item.lastEditedBy && (
                                  <History className="h-3 w-3 ml-1 text-muted-foreground" />
                                )}
                              </>
                            ) : (
                              <span>Empty</span>
                            )}
                          </Badge>
                        )}
                      </div>
                    </TooltipTrigger>
                    {item.lastEditedBy && (
                      <TooltipContent>
                        <div className="text-xs">
                          <div className="font-medium">Last edited by: {item.lastEditedBy}</div>
                          {item.lastEditedAt && (
                            <div className="text-muted-foreground">
                              {new Date(item.lastEditedAt).toLocaleDateString()} at{' '}
                              {new Date(item.lastEditedAt).toLocaleTimeString()}
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    )}
                  </Tooltip>
                  {validationErrors.has(item.entryId) && (
                    <div className="text-xs text-red-600 mt-1">
                      {validationErrors.get(item.entryId)}
                    </div>
                  )}
                </TableCell>
                {userPermissions.canEditEntries && onDeleteEntry && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteEntry(item.entryId)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      title="Delete entry"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Submit Actions */}
      {userPermissions.canEditEntries && (
        <div className="apple-show-info-card">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Press Enter or Tab to move between fields quickly • Placements calculated automatically
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
      )}
    </div>
    </TooltipProvider>
  );
};

// React.memo optimization for ClassResultsTable performance
export const MemoizedClassResultsTable = React.memo(ClassResultsTable, (prevProps, nextProps) => {
  // Compare critical props that affect rendering
  if (prevProps.entries.length !== nextProps.entries.length) return false;
  if (prevProps.classConfig?.element !== nextProps.classConfig?.element) return false;
  if (prevProps.classConfig?.level !== nextProps.classConfig?.level) return false;
  if (prevProps.userPermissions?.role !== nextProps.userPermissions?.role) return false;
  
  // Compare entries array for result changes
  for (let i = 0; i < prevProps.entries.length; i++) {
    const prevEntry = prevProps.entries[i];
    const nextEntry = nextProps.entries[i];
    
    // Check key fields that affect result calculations
    if (prevEntry.id !== nextEntry.id ||
        prevEntry.status !== nextEntry.status ||
        prevEntry.displayInfo?.armband !== nextEntry.displayInfo?.armband ||
        prevEntry.displayInfo?.dogName !== nextEntry.displayInfo?.dogName ||
        prevEntry.displayInfo?.handlerName !== nextEntry.displayInfo?.handlerName ||
        prevEntry.judgingState?.currentResult !== nextEntry.judgingState?.currentResult) {
      return false;
    }
  }
  
  return true;
});

// Export memoized version as default for performance
export default MemoizedClassResultsTable;