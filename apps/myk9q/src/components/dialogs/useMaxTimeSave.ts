import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import type { Class } from '@/services/replication/tables/ReplicatedClassesTable';
import { logger } from '@/utils/logger';
import type { TimeRange, MaxTimeClassData } from './MaxTimeDialog.types';
import { validateTime, timeStringToSeconds } from './MaxTimeDialog.utils';

interface UseMaxTimeSaveOptions {
  classData: MaxTimeClassData;
  timeRange: TimeRange | null;
  times: string[];
  onTimeUpdate?: () => void;
  onClose: () => void;
}

interface UseMaxTimeSaveReturn {
  saving: boolean;
  validationMessage: string;
  successMessage: string;
  errorMessage: string;
  clearMessages: () => void;
  setValidationMessage: (msg: string) => void;
  setErrorMessage: (msg: string) => void;
  handleSave: () => Promise<void>;
}

export function useMaxTimeSave({
  classData,
  timeRange,
  times,
  onTimeUpdate,
  onClose,
}: UseMaxTimeSaveOptions): UseMaxTimeSaveReturn {
  const [saving, setSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const clearMessages = () => {
    setValidationMessage('');
    setSuccessMessage('');
    setErrorMessage('');
  };

  const handleSave = async () => {
    if (!timeRange) return;

    // Validate all times
    const newErrors = times.map(time => validateTime(time, timeRange));

    // Check if any errors exist
    const hasErrors = newErrors.some(error => error !== '');
    if (hasErrors) return;

    // Allow saving cleared times (for corrections) or properly filled times
    const requiredAreas = timeRange.areas;
    const filledTimes = times.slice(0, requiredAreas).filter(time => time !== '');
    const allAreasEmpty = filledTimes.length === 0;
    const allAreasStillFilled = filledTimes.length === requiredAreas;

    // Only prevent saving if some areas are filled and some are empty (incomplete state)
    if (!allAreasEmpty && !allAreasStillFilled) {
      setValidationMessage(
        `Please either set max time for all ${requiredAreas} area${requiredAreas !== 1 ? 's' : ''} or clear all fields`
      );
      return;
    }

    clearMessages();

    setSaving(true);
    try {
      // Use null instead of 0 for empty times (database has CHECK constraints requiring > 0 or NULL)
      const updateData: {
        time_limit_seconds: number | null;
        time_limit_area2_seconds: number | null;
        time_limit_area3_seconds: number | null;
      } = {
        time_limit_seconds: times[0] ? timeStringToSeconds(times[0]) : null,
        time_limit_area2_seconds: times[1] ? timeStringToSeconds(times[1]) : null,
        time_limit_area3_seconds: times[2] ? timeStringToSeconds(times[2]) : null,
      };

      // For combined Novice A & B classes, update both records
      const idsToUpdate = classData.pairedClassId
        ? [classData.id, classData.pairedClassId]
        : [classData.id];

      const { error } = await supabase.from('classes').update(updateData).in('id', idsToUpdate);

      if (error) {
        logger.error('❌ Error updating max times:', error);
        setErrorMessage('Failed to save max times. Please try again.');
        return;
      }

      // Update IndexedDB cache directly to avoid stale data on refetch
      try {
        const manager = await ensureReplicationManager();
        const classesTable = manager.getTable<Class>('classes');

        if (classesTable) {
          for (const id of idsToUpdate) {
            const existingClass = await classesTable.get(String(id));
            if (existingClass) {
              const updatedClass: Class = {
                ...existingClass,
                time_limit_seconds: updateData.time_limit_seconds || undefined,
                time_limit_area2_seconds: updateData.time_limit_area2_seconds || undefined,
                time_limit_area3_seconds: updateData.time_limit_area3_seconds || undefined,
              };
              await classesTable.set(String(id), updatedClass, false);
            }
          }
        }
      } catch (cacheError) {
        // Non-fatal - cache will be updated on next sync
        logger.warn('⚠️ [MaxTimeDialog] Failed to update IndexedDB cache:', cacheError);
      }

      if (allAreasEmpty) {
        setSuccessMessage(
          'Max times have been cleared successfully. Judges can now set new times.'
        );
      } else {
        setSuccessMessage('Max times have been saved successfully.');
      }

      // Auto-close dialog after showing success message
      setTimeout(() => {
        onTimeUpdate?.();
        onClose();
      }, 2000);
    } catch (error) {
      logger.error('💥 Error saving max times:', error);
      setErrorMessage('Failed to save max times. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return {
    saving,
    validationMessage,
    successMessage,
    errorMessage,
    clearMessages,
    setValidationMessage,
    setErrorMessage,
    handleSave,
  };
}
