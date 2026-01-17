import { Pencil, Clock, Trash2, Plus, Eye, MoreVertical, Save, AlertCircle, CheckCircle, Download, Keyboard } from "lucide-react";
import { logger } from '@/services/LoggingService';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { EntryData } from './types/classTypes';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ShowType, ClassTemplate } from '@/types/template.types';
import { UnifiedEntryData } from '@/types/unified-entry-types';
import { useTableConfiguration } from '@/hooks/useTableConfiguration';
import { cn } from '@/lib/utils';

// Enhanced validation utilities
import {
  validateEntryData,
  convertTimeToStandardFormat,
  FieldValidationError
} from '@/utils/entryValidation';

// Role-based access control
import { UserPermissions } from '@/types/user-permissions';

// Statistics panel
import { EntriesStatisticsPanel } from './EntriesStatisticsPanel';

// Apple styles
import '@/styles/apple-show-details.css';

interface ClassEntriesTableProps {
  entries: EntryData[];
  showType: ShowType;
  template?: ClassTemplate;
  onViewEntry?: (id: string) => void;
  onEditEntry: (id: string) => void;
  onEnterResults?: (id: string) => void;
  onDeleteEntry: (id: string) => void;
  onAddEntry: () => void;
  enableInlineEditing?: boolean;
  onResultUpdate?: (entryId: string, result: Partial<EntryData>) => Promise<void>;
  onToggleInlineEditing?: () => void;
  userPermissions?: UserPermissions;
  className?: string;
}

interface InlineEditData {
  [entryId: string]: {
    time: string;
    status: string;
    score: string;
    placement: string;
    isValid: boolean;
    hasChanges: boolean;
    errors: FieldValidationError[];
    originalData: {
      time: string;
      status: string;
      score: string;
      placement: string;
    };
  };
}

interface ErrorState {
  type: 'validation' | 'submission' | 'import' | 'export';
  message: string;
  details?: Record<string, string>;
  timestamp: Date;
}

const ClassEntriesTable: React.FC<ClassEntriesTableProps> = ({ 
  entries, 
  showType,
  template,
  onViewEntry, 
  onEditEntry, 
  onEnterResults, 
  onDeleteEntry, 
  onAddEntry,
  enableInlineEditing = false,
  onResultUpdate,
  onToggleInlineEditing,
  userPermissions,
  className
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<EntryData | null>(null);
  const [inlineEditData, setInlineEditData] = useState<InlineEditData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Enhanced error handling
  const [errors, setErrors] = useState<ErrorState[]>([]);
  
  // Auto-save functionality
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Default permissions if none provided
  const permissions = userPermissions || {
    canViewEntries: true,
    canEditEntries: true,
    canDeleteEntries: true,
    canAddEntries: true,
    canEditResults: true,
    canViewResults: true,
    canSubmitResults: true,
    canBulkEdit: true,
    canImportData: false,
    canExportData: false,
    canAccessAdvancedFeatures: true,
    canManageClass: true,
    canViewStatistics: true,
    role: 'admin' as const
  };

  // Get table configuration based on show type and template
  const { columns, transformEntry } = useTableConfiguration({
    showType,
    template
  });

  // Transform entries to unified format for consistent display
  const unifiedEntries = useMemo(() => {
    return entries.map(entry => {
      // Convert EntryData to UnifiedEntryData format
      const unified: UnifiedEntryData = {
        id: entry.id,
        classId: entry.classId,
        armband: entry.armband,
        handler: entry.handler,
        dog: entry.dog,
        status: entry.status,
        time: entry.time,
        score: entry.score,
        placement: entry.placement,
        showType
      };
      return unified;
    });
  }, [entries, showType]);

  const handleDeleteClick = (entry: EntryData) => {
    setEntryToDelete(entry);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (entryToDelete) {
      onDeleteEntry(entryToDelete.id);
    }
    setDeleteDialogOpen(false);
    setEntryToDelete(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Qualified':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'Not Qualified':
      case 'Eliminated':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'Withdrawn':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
      case 'Absent':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    }
  };

  const getPlacementStyle = (placement: string) => {
    if (placement === '1') return 'text-yellow-600 font-bold';
    if (placement === '2') return 'text-gray-500 font-bold';
    if (placement === '3') return 'text-amber-600 font-bold';
    return 'text-muted-foreground';
  };

  // Enhanced initialize inline edit data for an entry
  const initializeEditData = useCallback((entry: EntryData) => {
    if (!inlineEditData[entry.id]) {
      setInlineEditData(prev => ({
        ...prev,
        [entry.id]: {
          time: entry.time || '',
          status: entry.status || '',
          score: entry.score || '',
          placement: entry.placement || '',
          isValid: true,
          hasChanges: false,
          errors: [],
          originalData: {
            time: entry.time || '',
            status: entry.status || '',
            score: entry.score || '',
            placement: entry.placement || ''
          }
        }
      }));
    }
  }, [inlineEditData]);

  // Enhanced update inline edit data with validation
  const updateInlineEditData = useCallback((entryId: string, field: string, value: string) => {
    setInlineEditData(prev => {
      const originalEntry = entries.find(e => e.id === entryId);
      if (!originalEntry) return prev;
      
      const current = prev[entryId] || {
        time: originalEntry.time || '',
        status: originalEntry.status || '',
        score: originalEntry.score || '',
        placement: originalEntry.placement || '',
        isValid: true,
        hasChanges: false,
        errors: [],
        originalData: {
          time: originalEntry.time || '',
          status: originalEntry.status || '',
          score: originalEntry.score || '',
          placement: originalEntry.placement || ''
        }
      };

      // Update the specific field
      const updated = { ...current, [field]: value };
      
      // Normalize time format if it's a time field
      if (field === 'time' && value.trim()) {
        updated.time = convertTimeToStandardFormat(value);
      }
      
      // Check if data has changed from original
      const hasChanges = (
        updated.time !== current.originalData.time ||
        updated.status !== current.originalData.status ||
        updated.score !== current.originalData.score ||
        updated.placement !== current.originalData.placement
      );

      // Enhanced validation
      const validationErrors = validateEntryData({
        time: updated.time,
        status: updated.status,
        score: updated.score,
        placement: updated.placement
      });
      
      const isValid = validationErrors.length === 0;

      updated.hasChanges = hasChanges;
      updated.isValid = isValid;
      updated.errors = validationErrors;
      
      // Note: Field errors are now displayed inline in the table cells

      return {
        ...prev,
        [entryId]: updated
      };
    });
    
    // Note: Auto-save will be triggered via separate useEffect to avoid dependency issues
  }, [entries]);

  // Enhanced get edit data for an entry (with fallback to original data)
  const getEditData = useCallback((entry: EntryData) => {
    return inlineEditData[entry.id] || {
      time: entry.time || '',
      status: entry.status || '',
      score: entry.score || '',
      placement: entry.placement || '',
      isValid: true,
      hasChanges: false,
      errors: [],
      originalData: {
        time: entry.time || '',
        status: entry.status || '',
        score: entry.score || '',
        placement: entry.placement || ''
      }
    };
  }, [inlineEditData]);

  // Enhanced submit all changes
  const handleSubmitChanges = useCallback(async () => {
    if (!onResultUpdate || !permissions.canSubmitResults) return;

    const changedEntries = Object.entries(inlineEditData)
      .filter(([, data]) => data.hasChanges && data.isValid)
      .map(([entryId, data]) => ({ entryId, data }));

    if (changedEntries.length === 0) {
      const errorMsg = 'No valid changes to submit';
      setSubmitError(errorMsg);
      setErrors(prev => [...prev, {
        type: 'validation',
        message: errorMsg,
        timestamp: new Date()
      }]);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      logger.debug('Starting to submit changes', 'classes', { entriesCount: changedEntries.length });
      
      for (const { entryId, data } of changedEntries) {
        const updateData = {
          time: data.time,
          status: data.status as EntryData['status'],
          score: data.score,
          placement: data.placement
        };
        
        logger.debug('Updating entry', 'classes', { entryId, updateData });
        
        await onResultUpdate(entryId, updateData);
        
        logger.debug('Entry updated successfully', 'classes', { entryId });
      }

      // Clear edit data and errors after successful submission
      setInlineEditData({});
      setErrors([]);
      
      // Show success message
      logger.info('Successfully submitted changes', 'classes', { changesCount: changedEntries.length });
    } catch (error) {
      logger.error('Failed to submit changes', 'classes', { entriesCount: changedEntries.length }, error as Error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to submit changes';
      setSubmitError(errorMsg);
      setErrors(prev => [...prev, {
        type: 'submission',
        message: errorMsg,
        timestamp: new Date()
      }]);
    } finally {
      setIsSubmitting(false);
      
      // Clear auto-save timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    }
  }, [inlineEditData, onResultUpdate, permissions.canSubmitResults]);
  
  // Auto-save effect (placed after handleSubmitChanges declaration)
  React.useEffect(() => {
    if (autoSaveEnabled && Object.values(inlineEditData).some(data => data.hasChanges && data.isValid)) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        handleSubmitChanges();
      }, 3000);
    }
    
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [inlineEditData, autoSaveEnabled, handleSubmitChanges]);

  // Enhanced keyboard navigation with advanced features
  const handleKeyDown = useCallback((event: React.KeyboardEvent, _entryId: string, field: string, rowIndex: number) => {
    const { key, shiftKey, ctrlKey, metaKey } = event;
    
    // Handle Ctrl/Cmd + S to save
    if ((ctrlKey || metaKey) && key === 's') {
      event.preventDefault();
      handleSubmitChanges();
      return;
    }
    
    // Handle Escape to cancel editing
    if (key === 'Escape') {
      event.preventDefault();
      setInlineEditData({});
      return;
    }
    
    // Handle Tab and Enter navigation
    if (key === 'Enter' || key === 'Tab') {
      event.preventDefault();
      
      const fieldOrder = ['time', 'status', 'score', 'placement'];
      const currentFieldIndex = fieldOrder.indexOf(field);
      
      let nextField: string;
      let nextRowIndex = rowIndex;
      
      if (shiftKey) {
        // Navigate backwards
        if (currentFieldIndex > 0) {
          nextField = fieldOrder[currentFieldIndex - 1];
        } else if (rowIndex > 0) {
          nextRowIndex = rowIndex - 1;
          nextField = fieldOrder[fieldOrder.length - 1];
        } else {
          return; // Already at first field of first row
        }
      } else {
        // Navigate forwards
        if (currentFieldIndex < fieldOrder.length - 1) {
          nextField = fieldOrder[currentFieldIndex + 1];
        } else if (rowIndex < entries.length - 1) {
          nextRowIndex = rowIndex + 1;
          nextField = fieldOrder[0];
        } else {
          return; // Already at last field of last row
        }
      }
      
      // Find and focus next input
      const nextEntryId = entries[nextRowIndex]?.id;
      if (nextEntryId) {
        const nextInput = document.querySelector(
          `input[data-entry-id="${nextEntryId}"][data-field="${nextField}"], select[data-entry-id="${nextEntryId}][data-field="${nextField}"]`
        ) as HTMLElement;
        
        if (nextInput) {
          nextInput.focus();
        }
      }
    }
  }, [entries, handleSubmitChanges]);

  // Note: Enhanced error handling utilities removed for now to avoid unused variable warnings

  // CSV export functionality (if permissions allow)
  const downloadCSVTemplate = useCallback(() => {
    if (!permissions.canExportData) return;
    
    const headers = ['armband', 'handler', 'dog', 'time', 'status', 'score', 'placement'];
    const csvContent = [
      headers.join(','),
      ...entries.map(entry => [
        entry.armband,
        `"${entry.handler}"`,
        `"${entry.dog}"`,
        entry.time || '',
        entry.status || '',
        entry.score || '',
        entry.placement || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `class-entries-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries, permissions.canExportData]);

  // Enhanced summary with more detailed statistics
  const changesSummary = useMemo(() => {
    const changedEntries = Object.values(inlineEditData).filter(data => data.hasChanges);
    const validChanges = changedEntries.filter(data => data.isValid).length;
    const invalidChanges = changedEntries.filter(data => !data.isValid).length;
    
    return {
      total: changedEntries.length,
      valid: validChanges,
      invalid: invalidChanges,
      canSubmit: validChanges > 0 && invalidChanges === 0 && permissions.canSubmitResults
    };
  }, [inlineEditData, permissions.canSubmitResults]);

  // Auto-save effect cleanup
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  if (entries.length === 0) {
    return (
      <div className={cn('space-y-6', className)}>
        {permissions.canViewStatistics && (
          <EntriesStatisticsPanel 
            entries={entries} 
            editData={inlineEditData}
          />
        )}
        
        <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed border-muted-foreground/20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2">No entries yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add the first entry to get started with this class.
              </p>
              {permissions.canAddEntries && (
                <Button onClick={onAddEntry} className="apple-action-button apple-action-button-primary">
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Entry
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Statistics Panel */}
      {permissions.canViewStatistics && (
        <EntriesStatisticsPanel 
          entries={entries} 
          editData={inlineEditData}
        />
      )}
      
      {/* Error Display */}
      {errors.length > 0 && (
        <div className="space-y-2">
          {errors.map((error, index) => (
            <Alert key={index} variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium">{error.message}</div>
                {error.details && (
                  <div className="text-sm mt-1 space-y-1">
                    {Object.entries(error.details).map(([key, value]) => (
                      <div key={key}>{key}: {value}</div>
                    ))}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}
      
      {/* Enhanced Header with Apple Styling */}
      <div className="apple-show-info-card">
        <div className="apple-show-info-header">
          <div>
            <div className="apple-show-info-title">Class Entries</div>
            <p className="text-sm text-muted-foreground mt-1">
              {enableInlineEditing ? 'Edit results directly in the table' : 'Manage competition entries and results'}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {permissions.canExportData && (
              <Button
                variant="outline"
                onClick={downloadCSVTemplate}
                className="apple-action-button"
              >
                <Download className="h-4 w-4" />
                <span>Export CSV</span>
              </Button>
            )}
            
            {permissions.canAddEntries && (
              <Button
                onClick={onAddEntry}
                className="apple-action-button apple-action-button-primary"
              >
                <Plus className="h-4 w-4" />
                <span>Add Entry</span>
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {/* Inline Editing Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          {onResultUpdate && permissions.canEditResults && (
            <>
              <Button
                variant={enableInlineEditing ? "default" : "outline"}
                size="sm"
                onClick={onToggleInlineEditing}
                className="apple-action-button"
                disabled={!permissions.canBulkEdit}
              >
                <Pencil className="h-4 w-4 mr-2" />
                {enableInlineEditing ? 'Exit Edit Mode' : 'Enable Inline Editing'}
              </Button>
              {enableInlineEditing && (
                <div className="flex items-center space-x-4">
                  <div className="text-sm text-muted-foreground">
                    Click fields to edit • Tab/Enter to navigate • Ctrl+S to save
                  </div>
                  {permissions.canAccessAdvancedFeatures && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
                      className={cn(
                        'apple-action-button',
                        autoSaveEnabled && 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                      )}
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Auto-save {autoSaveEnabled ? 'ON' : 'OFF'}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
          
          {enableInlineEditing && changesSummary.total > 0 && (
            <div className="flex items-center space-x-2 text-sm">
              <Badge variant="outline" className="flex items-center space-x-1">
                <Keyboard className="h-3 w-3" />
                <span>Editing Mode</span>
              </Badge>
              {changesSummary.valid > 0 && (
                <span className="text-green-600">
                  {changesSummary.valid} valid
                </span>
              )}
              {changesSummary.invalid > 0 && (
                <span className="text-red-600">
                  {changesSummary.invalid} invalid
                </span>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {permissions.role && (
            <Badge variant="secondary" className="text-xs">
              {permissions.role.charAt(0).toUpperCase() + permissions.role.slice(1)}
            </Badge>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              {columns.map((column) => (
                <TableHead 
                  key={column.id}
                  className={`font-semibold ${column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : ''}`}
                  style={{ width: column.width }}
                >
                  {column.id === 'time' ? (
                    <div className="flex justify-center gap-1">
                      <span className="w-12 text-center">Min</span>
                      <span className="w-4 text-center">:</span>
                      <span className="w-12 text-center">Sec</span>
                      <span className="w-4 text-center">.</span>
                      <span className="w-12 text-center">1/100</span>
                    </div>
                  ) : column.label}
                </TableHead>
              ))}
              <TableHead className="font-semibold text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {unifiedEntries.map((entry, index) => {
              const transformedEntry = transformEntry(entry);
              const originalEntry = entries[index]; // Keep reference to original for actions
              const editData = getEditData(originalEntry);
              
              // Initialize edit data if inline editing is enabled
              if (enableInlineEditing) {
                initializeEditData(originalEntry);
              }
              
              return (
                <TableRow 
                  key={entry.id}
                  className={cn(
                    "hover:bg-muted/50 transition-colors border-b border-border/50",
                    enableInlineEditing && editData.hasChanges && !editData.isValid && "bg-red-50 dark:bg-red-950/20"
                  )}
                >
                  {columns.map((column) => {
                    const cellData = transformedEntry[column.id] as Record<string, unknown>;
                    const rawValue = cellData?.raw;
                    const formattedValue = cellData?.formatted || '--';
                    const cellClassName = cellData?.className || '';
                    
                    // Check if this column should be editable
                    const isEditableColumn = enableInlineEditing && ['time', 'status', 'score', 'placement'].includes(column.id);
                    
                    return (
                      <TableCell 
                        key={column.id}
                        className={`${column.className || ''} ${cellClassName} ${column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : ''} ${column.id === 'time' && isEditableColumn ? 'align-top' : ''}`}
                      >
                        {isEditableColumn ? (
                          // Render editable field
                          column.id === 'status' ? (
                            <div className="space-y-1">
                              <Select
                                value={editData.status}
                                onValueChange={(value) => updateInlineEditData(originalEntry.id, 'status', value)}
                                data-entry-id={originalEntry.id}
                                data-field="status"
                              >
                                <SelectTrigger className={cn(
                                  "w-32 h-8",
                                  editData.errors.some(err => err.field === 'status') && "border-red-500"
                                )}>
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Qualified">Qualified</SelectItem>
                                  <SelectItem value="Not Qualified">Not Qualified</SelectItem>
                                  <SelectItem value="Absent">Absent</SelectItem>
                                  <SelectItem value="Withdrawn">Withdrawn</SelectItem>
                                  <SelectItem value="Eliminated">Eliminated</SelectItem>
                                </SelectContent>
                              </Select>
                              {editData.errors.filter(err => err.field === 'status').map((error, errIndex) => (
                                <div key={errIndex} className="text-xs text-red-600">
                                  {error.message}
                                </div>
                              ))}
                            </div>
                          ) : column.id === 'time' ? (
                            <div className="space-y-1">
                              <div className="flex justify-center gap-1">
                                {(() => {
                                  const timeMatch = editData.time.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/) || ['', '', '', ''];
                                  const minutes = timeMatch[1] || '';
                                  const seconds = timeMatch[2] || '';
                                  const hundredths = timeMatch[3] || '';
                                  
                                  const updateTimeComponent = (component: 'minutes' | 'seconds' | 'hundredths', value: string) => {
                                    const currentMatch = editData.time.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/) || ['', '', '', ''];
                                    let newMinutes = currentMatch[1] || '';
                                    let newSeconds = currentMatch[2] || '';
                                    let newHundredths = currentMatch[3] || '';
                                    
                                    if (component === 'minutes') newMinutes = value;
                                    if (component === 'seconds') newSeconds = value;
                                    if (component === 'hundredths') newHundredths = value;
                                    
                                    const formattedTime = newMinutes && newSeconds && newHundredths 
                                      ? `${newMinutes.padStart(1, '0')}:${newSeconds.padStart(2, '0')}.${newHundredths.padStart(2, '0')}`
                                      : '';
                                    
                                    updateInlineEditData(originalEntry.id, 'time', formattedTime);
                                  };
                                  
                                  return (
                                    <>
                                      <Input
                                        value={minutes}
                                        onChange={(e) => updateTimeComponent('minutes', e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, originalEntry.id, 'time', index)}
                                        placeholder=""
                                        className={cn(
                                          "w-12 h-8 text-center font-mono",
                                          editData.errors.some(err => err.field === 'time') && "border-red-500"
                                        )}
                                        data-entry-id={originalEntry.id}
                                        data-field="time"
                                        maxLength={2}
                                      />
                                      <span className="text-lg px-1 font-mono self-center">:</span>
                                      <Input
                                        value={seconds}
                                        onChange={(e) => updateTimeComponent('seconds', e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, originalEntry.id, 'time', index)}
                                        placeholder=""
                                        className={cn(
                                          "w-12 h-8 text-center font-mono",
                                          editData.errors.some(err => err.field === 'time') && "border-red-500"
                                        )}
                                        data-entry-id={originalEntry.id}
                                        data-field="time"
                                        maxLength={2}
                                      />
                                      <span className="text-lg px-1 font-mono self-center">.</span>
                                      <Input
                                        value={hundredths}
                                        onChange={(e) => updateTimeComponent('hundredths', e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, originalEntry.id, 'time', index)}
                                        placeholder=""
                                        className={cn(
                                          "w-12 h-8 text-center font-mono",
                                          editData.errors.some(err => err.field === 'time') && "border-red-500"
                                        )}
                                        data-entry-id={originalEntry.id}
                                        data-field="time"
                                        maxLength={2}
                                      />
                                    </>
                                  );
                                })()}
                              </div>
                              {editData.errors.filter(err => err.field === 'time').map((error, errIndex) => (
                                <div key={errIndex} className="text-xs text-red-600">
                                  {error.message}
                                </div>
                              ))}
                            </div>
                          ) : column.id === 'score' ? (
                            <div className="space-y-1">
                              <Input
                                value={editData.score}
                                onChange={(e) => updateInlineEditData(originalEntry.id, 'score', e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, originalEntry.id, 'score', index)}
                                placeholder="0"
                                className={cn(
                                  "w-16 h-8",
                                  editData.errors.some(err => err.field === 'score') && "border-red-500"
                                )}
                                data-entry-id={originalEntry.id}
                                data-field="score"
                              />
                              {editData.errors.filter(err => err.field === 'score').map((error, errIndex) => (
                                <div key={errIndex} className="text-xs text-red-600">
                                  {error.message}
                                </div>
                              ))}
                            </div>
                          ) : column.id === 'placement' ? (
                            <div className="space-y-1">
                              <Input
                                value={editData.placement}
                                onChange={(e) => updateInlineEditData(originalEntry.id, 'placement', e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, originalEntry.id, 'placement', index)}
                                placeholder="1"
                                className={cn(
                                  "w-12 h-8",
                                  editData.errors.some(err => err.field === 'placement') && "border-red-500"
                                )}
                                data-entry-id={originalEntry.id}
                                data-field="placement"
                              />
                              {editData.errors.filter(err => err.field === 'placement').map((error, errIndex) => (
                                <div key={errIndex} className="text-xs text-red-600">
                                  {error.message}
                                </div>
                              ))}
                            </div>
                          ) : (
                            String(formattedValue || '')
                          )
                        ) : (
                          // Render readonly field
                          column.dataType === 'status' ? (
                            <Badge 
                              variant="secondary" 
                              className={`${getStatusColor(String(formattedValue || ''))} border-0`}
                            >
                              {String(formattedValue || '')}
                            </Badge>
                          ) : column.dataType === 'placement' ? (
                            <span className={getPlacementStyle(String(rawValue || ''))}>
                              {String(formattedValue || '')}
                            </span>
                          ) : (
                            String(formattedValue || '')
                          )
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center">
                    {enableInlineEditing ? (
                      // Show edit status for inline editing mode
                      <div className="flex items-center justify-center space-x-1">
                        {editData.hasChanges ? (
                          editData.isValid ? (
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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-8 w-8 p-0 hover:bg-muted"
                              >
                                <span className="sr-only">Open menu</span>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem 
                                onClick={() => onViewEntry ? onViewEntry(originalEntry.id) : onEditEntry(originalEntry.id)}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                <span>View Details</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onEditEntry(originalEntry.id)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                <span>Edit Entry</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleDeleteClick(originalEntry)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Delete Entry</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    ) : (
                      // Original dropdown menu for non-inline editing mode
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-8 w-8 p-0 hover:bg-muted"
                          >
                            <span className="sr-only">Open menu</span>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem 
                            onClick={() => onViewEntry ? onViewEntry(originalEntry.id) : onEditEntry(originalEntry.id)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            <span>View Details</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onEditEntry(originalEntry.id)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            <span>Edit Entry</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => onEnterResults ? onEnterResults(originalEntry.id) : onEditEntry(originalEntry.id)}
                            className="text-amber-600 focus:text-amber-600"
                          >
                            <Clock className="mr-2 h-4 w-4" />
                            <span>Enter Results</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDeleteClick(originalEntry)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>Delete Entry</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Inline Editing Controls */}
      {enableInlineEditing && changesSummary.total > 0 && (
        <div className="bg-muted/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-sm text-muted-foreground">
                {changesSummary.valid > 0 && (
                  <span className="text-green-600">
                    {changesSummary.valid} valid change{changesSummary.valid !== 1 ? 's' : ''}
                  </span>
                )}
                {changesSummary.valid > 0 && changesSummary.invalid > 0 && (
                  <span className="mx-2">•</span>
                )}
                {changesSummary.invalid > 0 && (
                  <span className="text-red-600">
                    {changesSummary.invalid} invalid change{changesSummary.invalid !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Press Enter or Tab to move between fields
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {submitError && (
                <div className="text-sm text-red-600">{submitError}</div>
              )}
              <Button
                onClick={handleSubmitChanges}
                disabled={!changesSummary.canSubmit || isSubmitting}
                className="apple-action-button apple-action-button-primary"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Saving...' : `Save ${changesSummary.valid} Change${changesSummary.valid !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Footer */}
      <div className="flex justify-between items-center text-sm text-muted-foreground bg-muted/30 rounded-lg p-4">
        <span>Total entries: {entries.length}</span>
        <span>
          Qualified: {entries.filter(e => e.status === 'Qualified').length} | 
          NQ: {entries.filter(e => e.status === 'Not Qualified').length}
        </span>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this entry?
              {entryToDelete && (
                <span className="block mt-2 font-medium text-foreground">
                  #{entryToDelete.armband} - {entryToDelete.handler} with {entryToDelete.dog}
                </span>
              )}
              <span className="block mt-2 text-destructive">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// React.memo optimization with custom comparison for performance
export default React.memo(ClassEntriesTable, (prevProps, nextProps) => {
  // Compare critical props that affect rendering
  if (prevProps.entries.length !== nextProps.entries.length) return false;
  if (prevProps.showType !== nextProps.showType) return false;
  if (prevProps.enableInlineEditing !== nextProps.enableInlineEditing) return false;
  
  // Compare template if provided
  if (prevProps.template?.id !== nextProps.template?.id) return false;
  
  // Compare entries array for changes (shallow comparison for performance)
  for (let i = 0; i < prevProps.entries.length; i++) {
    const prevEntry = prevProps.entries[i];
    const nextEntry = nextProps.entries[i];
    
    // Check key fields that would require re-render
    if (prevEntry.id !== nextEntry.id ||
        prevEntry.armband !== nextEntry.armband ||
        prevEntry.handler !== nextEntry.handler ||
        prevEntry.dog !== nextEntry.dog ||
        prevEntry.status !== nextEntry.status ||
        prevEntry.score !== nextEntry.score ||
        prevEntry.time !== nextEntry.time ||
        prevEntry.placement !== nextEntry.placement) {
      return false;
    }
  }
  
  // All callback props are considered stable (should be wrapped in useCallback)
  return true;
});
