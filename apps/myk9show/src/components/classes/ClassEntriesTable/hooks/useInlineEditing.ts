/**
 * Hook for managing inline editing state and logic
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { logger } from '@/services/LoggingService';
import { EntryData } from '../../types/classTypes';
import { InlineEditData, InlineEditEntry, ErrorState } from '../types';
import { validateEntryData, convertTimeToStandardFormat } from '@/utils/entryValidation';
import { calculateChangesSummary } from '../utils';

interface UseInlineEditingOptions {
  entries: EntryData[];
  onResultUpdate?: ((entryId: string, result: Partial<EntryData>) => Promise<void>) | undefined;
  canSubmitResults: boolean;
}

interface UseInlineEditingResult {
  inlineEditData: InlineEditData;
  errors: ErrorState[];
  isSubmitting: boolean;
  submitError: string | null;
  autoSaveEnabled: boolean;
  changesSummary: ReturnType<typeof calculateChangesSummary>;
  initializeEditData: (entry: EntryData) => void;
  updateInlineEditData: (entryId: string, field: string, value: string) => void;
  getEditData: (entry: EntryData) => InlineEditEntry;
  handleSubmitChanges: () => Promise<void>;
  setAutoSaveEnabled: (enabled: boolean) => void;
  clearEditData: () => void;
  clearErrors: () => void;
}

/**
 * Create default edit entry from entry data
 */
function createDefaultEditEntry(entry: EntryData): InlineEditEntry {
  return {
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
}

export function useInlineEditing({
  entries,
  onResultUpdate,
  canSubmitResults
}: UseInlineEditingOptions): UseInlineEditingResult {
  const [inlineEditData, setInlineEditData] = useState<InlineEditData>({});
  const [errors, setErrors] = useState<ErrorState[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate changes summary
  const changesSummary = calculateChangesSummary(inlineEditData, canSubmitResults);

  // Initialize edit data for an entry
  const initializeEditData = useCallback((entry: EntryData) => {
    if (!inlineEditData[entry.id]) {
      setInlineEditData(prev => ({
        ...prev,
        [entry.id]: createDefaultEditEntry(entry)
      }));
    }
  }, [inlineEditData]);

  // Update inline edit data with validation
  const updateInlineEditData = useCallback((entryId: string, field: string, value: string) => {
    setInlineEditData(prev => {
      const originalEntry = entries.find(e => e.id === entryId);
      if (!originalEntry) return prev;

      const current = prev[entryId] || createDefaultEditEntry(originalEntry);

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

      updated.hasChanges = hasChanges;
      updated.isValid = validationErrors.length === 0;
      updated.errors = validationErrors;

      return {
        ...prev,
        [entryId]: updated
      };
    });
  }, [entries]);

  // Get edit data for an entry (with fallback to original data)
  const getEditData = useCallback((entry: EntryData): InlineEditEntry => {
    return inlineEditData[entry.id] || createDefaultEditEntry(entry);
  }, [inlineEditData]);

  // Submit all changes
  const handleSubmitChanges = useCallback(async () => {
    if (!onResultUpdate || !canSubmitResults) return;

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
  }, [inlineEditData, onResultUpdate, canSubmitResults]);

  // Auto-save effect
  useEffect(() => {
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  const clearEditData = useCallback(() => {
    setInlineEditData({});
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
    setSubmitError(null);
  }, []);

  return {
    inlineEditData,
    errors,
    isSubmitting,
    submitError,
    autoSaveEnabled,
    changesSummary,
    initializeEditData,
    updateInlineEditData,
    getEditData,
    handleSubmitChanges,
    setAutoSaveEnabled,
    clearEditData,
    clearErrors
  };
}
