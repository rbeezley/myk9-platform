import { useState, useCallback, useRef, useEffect } from 'react';
import { logger } from '@/services/LoggingService';
import { EntryData } from '../../types/classTypes';
import { InlineEditData, InlineEditEntry } from '../types';
import { validateEntryData, convertTimeToStandardFormat } from '@/utils/entryValidation';
import { calculateChangesSummary } from '../utils';

interface UseInlineEditingOptions {
  entries: EntryData[];
  onResultUpdate?: ((entryId: string, result: Partial<EntryData>) => Promise<void>) | undefined;
  canSubmitResults: boolean;
}

interface UseInlineEditingResult {
  inlineEditData: InlineEditData;
  isSubmitting: boolean;
  submitError: string | null;
  autoSaveEnabled: boolean;
  changesSummary: ReturnType<typeof calculateChangesSummary>;
  updateInlineEditData: (entryId: string, field: string, value: string) => void;
  getEditData: (entry: EntryData) => InlineEditEntry;
  handleSubmitChanges: () => Promise<void>;
  setAutoSaveEnabled: (enabled: boolean) => void;
  clearEditData: () => void;
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
      placement: entry.placement || '',
    },
  };
}

export function useInlineEditing({
  entries,
  onResultUpdate,
  canSubmitResults,
}: UseInlineEditingOptions): UseInlineEditingResult {
  const [inlineEditData, setInlineEditData] = useState<InlineEditData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate changes summary
  const changesSummary = calculateChangesSummary(inlineEditData, canSubmitResults);

  // Update inline edit data with validation
  const updateInlineEditData = useCallback(
    (entryId: string, field: string, value: string) => {
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
        const hasChanges =
          updated.time !== current.originalData.time ||
          updated.status !== current.originalData.status ||
          updated.score !== current.originalData.score ||
          updated.placement !== current.originalData.placement;

        // Enhanced validation
        const validationErrors = validateEntryData({
          time: updated.time,
          status: updated.status,
          score: updated.score,
          placement: updated.placement,
        });

        updated.hasChanges = hasChanges;
        updated.isValid = validationErrors.length === 0;
        updated.errors = validationErrors;

        return {
          ...prev,
          [entryId]: updated,
        };
      });
    },
    [entries]
  );

  // Get edit data for an entry, auto-initializing if not yet present
  const getEditData = useCallback(
    (entry: EntryData): InlineEditEntry => {
      const existing = inlineEditData[entry.id];
      if (existing) return existing;
      const defaultEntry = createDefaultEditEntry(entry);
      // Schedule lazy initialization without blocking the render
      setInlineEditData(prev => (prev[entry.id] ? prev : { ...prev, [entry.id]: defaultEntry }));
      return defaultEntry;
    },
    [inlineEditData]
  );

  // Submit all changes
  const handleSubmitChanges = useCallback(async () => {
    if (!onResultUpdate || !canSubmitResults) return;

    const changedEntries = Object.entries(inlineEditData)
      .filter(([, data]) => data.hasChanges && data.isValid)
      .map(([entryId, data]) => ({ entryId, data }));

    if (changedEntries.length === 0) {
      setSubmitError('No valid changes to submit');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      logger.debug('Starting to submit changes', 'classes', {
        entriesCount: changedEntries.length,
      });

      for (const { entryId, data } of changedEntries) {
        const updateData = {
          time: data.time,
          status: data.status as EntryData['status'],
          score: data.score,
          placement: data.placement,
        };

        logger.debug('Updating entry', 'classes', { entryId, updateData });
        await onResultUpdate(entryId, updateData);
        logger.debug('Entry updated successfully', 'classes', { entryId });
      }

      setInlineEditData({});

      logger.info('Successfully submitted changes', 'classes', {
        changesCount: changedEntries.length,
      });
    } catch (error) {
      logger.error(
        'Failed to submit changes',
        'classes',
        { entriesCount: changedEntries.length },
        error as Error
      );
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit changes');
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
    if (
      autoSaveEnabled &&
      Object.values(inlineEditData).some(data => data.hasChanges && data.isValid)
    ) {
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

  return {
    inlineEditData,
    isSubmitting,
    submitError,
    autoSaveEnabled,
    changesSummary,
    updateInlineEditData,
    getEditData,
    handleSubmitChanges,
    setAutoSaveEnabled,
    clearEditData,
  };
}
