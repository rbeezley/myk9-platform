import { useEffect, useRef, useCallback } from 'react';
import { useShowRegistrationStore } from '../store/showRegistrationStore';
import { RegistrationFormData } from '../types/show-registration-types';
import { logger } from '@/services/LoggingService';

export interface DraftPersistenceConfig {
  /** Auto-save interval in milliseconds (default: 30000 = 30 seconds) */
  autoSaveInterval?: number;
  /** Storage key prefix (default: 'registration-draft') */
  storageKeyPrefix?: string;
  /** Maximum number of drafts to keep per show (default: 5) */
  maxDraftsPerShow?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

export interface DraftMetadata {
  id: string;
  showId: string;
  userId: string;
  timestamp: number;
  stepCompleted: string;
  title: string;
  preview: string;
}

export interface SavedDraft {
  metadata: DraftMetadata;
  data: Partial<RegistrationFormData>;
}

const DEFAULT_CONFIG: Required<DraftPersistenceConfig> = {
  autoSaveInterval: 30000, // 30 seconds
  storageKeyPrefix: 'registration-draft',
  maxDraftsPerShow: 5,
  debug: false
};

/**
 * Hook for managing registration draft persistence with auto-save functionality
 */
export function useDraftPersistence(
  showId: string,
  userId: string,
  currentStep: string,
  config: DraftPersistenceConfig = {}
) {
  const {
    autoSaveInterval,
    storageKeyPrefix,
    maxDraftsPerShow,
    debug
  } = { ...DEFAULT_CONFIG, ...config };

  const { draftData } = useShowRegistrationStore();
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>('');

  const log = useCallback((message: string, ...args: unknown[]) => {
    if (debug) {
      logger.debug(`[DraftPersistence] ${message}`, 'hooks', { data: ...args });
    }
  }, [debug]);

  // Generate storage keys
  const getDraftKey = useCallback((draftId: string) => 
    `${storageKeyPrefix}-${showId}-${draftId}`, [storageKeyPrefix, showId]);

  const getMetadataKey = useCallback(() => 
    `${storageKeyPrefix}-metadata-${showId}`, [storageKeyPrefix, showId]);

  // Generate draft metadata
  const generateDraftMetadata = useCallback((data: Partial<RegistrationFormData>): DraftMetadata => {
    const selectedDogs = data.selectedDogs?.length || 0;
    const selectedClasses = data.entries?.reduce((total, entry) => total + (entry.classes?.length || 0), 0) || 0;
    
    let preview = '';
    if (selectedDogs > 0) {
      preview += `${selectedDogs} dog${selectedDogs !== 1 ? 's' : ''}`;
    }
    if (selectedClasses > 0) {
      preview += `${preview ? ', ' : ''}${selectedClasses} class${selectedClasses !== 1 ? 'es' : ''}`;
    }
    if (!preview) {
      preview = 'New registration';
    }

    return {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      showId,
      userId,
      timestamp: Date.now(),
      stepCompleted: currentStep,
      title: `Draft from ${new Date().toLocaleDateString()}`,
      preview
    };
  }, [showId, userId, currentStep]);

  // Get all draft metadata for the current show
  const getDraftMetadata = useCallback((): DraftMetadata[] => {
    try {
      const metadata = localStorage.getItem(getMetadataKey());
      return metadata ? JSON.parse(metadata) : [];
    } catch (error) {
      log('Error reading draft metadata:', error);
      return [];
    }
  }, [getMetadataKey, log]);

  // Save draft metadata
  const saveDraftMetadata = useCallback((metadata: DraftMetadata[]) => {
    try {
      localStorage.setItem(getMetadataKey(), JSON.stringify(metadata));
      log('Saved draft metadata:', metadata.length, 'drafts');
    } catch (error) {
      log('Error saving draft metadata:', error);
    }
  }, [getMetadataKey, log]);

  // Save draft to localStorage
  const saveDraft = useCallback((data: Partial<RegistrationFormData>, metadata?: DraftMetadata) => {
    if (!data || Object.keys(data).length === 0) {
      log('Skipping empty draft save');
      return null;
    }

    const draftMetadata = metadata || generateDraftMetadata(data);
    const savedDraft: SavedDraft = { metadata: draftMetadata, data };

    try {
      // Save draft data
      localStorage.setItem(getDraftKey(draftMetadata.id), JSON.stringify(savedDraft));

      // Update metadata list
      let allMetadata = getDraftMetadata();
      
      // Remove existing draft with same ID if updating
      allMetadata = allMetadata.filter(m => m.id !== draftMetadata.id);
      
      // Add new draft metadata
      allMetadata.unshift(draftMetadata);

      // Limit number of drafts per show
      if (allMetadata.length > maxDraftsPerShow) {
        const removedMetadata = allMetadata.splice(maxDraftsPerShow);
        // Clean up old draft data
        removedMetadata.forEach(meta => {
          localStorage.removeItem(getDraftKey(meta.id));
        });
      }

      saveDraftMetadata(allMetadata);
      log('Saved draft:', draftMetadata.id, 'with', Object.keys(data).length, 'fields');
      
      return draftMetadata.id;
    } catch (error) {
      log('Error saving draft:', error);
      return null;
    }
  }, [generateDraftMetadata, getDraftKey, getDraftMetadata, saveDraftMetadata, maxDraftsPerShow, log]);

  // Load draft from localStorage
  const loadDraft = useCallback((draftId: string): SavedDraft | null => {
    try {
      const draftData = localStorage.getItem(getDraftKey(draftId));
      if (!draftData) {
        log('Draft not found:', draftId);
        return null;
      }

      const savedDraft: SavedDraft = JSON.parse(draftData);
      log('Loaded draft:', draftId, 'with', Object.keys(savedDraft.data).length, 'fields');
      
      return savedDraft;
    } catch (error) {
      log('Error loading draft:', error);
      return null;
    }
  }, [getDraftKey, log]);

  // Delete draft from localStorage
  const deleteDraft = useCallback((draftId: string) => {
    try {
      localStorage.removeItem(getDraftKey(draftId));
      
      // Update metadata
      const allMetadata = getDraftMetadata().filter(m => m.id !== draftId);
      saveDraftMetadata(allMetadata);
      
      log('Deleted draft:', draftId);
    } catch (error) {
      log('Error deleting draft:', error);
    }
  }, [getDraftKey, getDraftMetadata, saveDraftMetadata, log]);

  // Auto-save current draft data
  const autoSave = useCallback(() => {
    if (!draftData || Object.keys(draftData).length === 0) {
      return;
    }

    // Check if data has changed since last save
    const currentDataString = JSON.stringify(draftData);
    if (currentDataString === lastSavedDataRef.current) {
      log('No changes detected, skipping auto-save');
      return;
    }

    const draftId = saveDraft(draftData);
    if (draftId) {
      lastSavedDataRef.current = currentDataString;
      log('Auto-saved draft:', draftId);
    }
  }, [draftData, saveDraft, log]);

  // Manual save with custom title
  const saveWithTitle = useCallback((title: string) => {
    if (!draftData || Object.keys(draftData).length === 0) {
      return null;
    }

    const metadata = generateDraftMetadata(draftData);
    metadata.title = title;
    
    return saveDraft(draftData, metadata);
  }, [draftData, generateDraftMetadata, saveDraft]);

  // Clear all drafts for current show
  const clearAllDrafts = useCallback(() => {
    const allMetadata = getDraftMetadata();
    allMetadata.forEach(meta => {
      localStorage.removeItem(getDraftKey(meta.id));
    });
    localStorage.removeItem(getMetadataKey());
    log('Cleared all drafts for show:', showId);
  }, [getDraftMetadata, getDraftKey, getMetadataKey, showId, log]);

  // Setup auto-save timer
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setInterval(autoSave, autoSaveInterval);
    log('Started auto-save timer with interval:', autoSaveInterval, 'ms');

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        log('Cleared auto-save timer');
      }
    };
  }, [autoSave, autoSaveInterval, log]);

  // Save on component unmount
  useEffect(() => {
    return () => {
      log('Component unmounting, performing final save');
      autoSave();
    };
  }, [autoSave, log]);

  // Get available drafts for current show
  const availableDrafts = getDraftMetadata();

  return {
    // Draft operations
    saveDraft: saveWithTitle,
    loadDraft,
    deleteDraft,
    autoSave,
    
    // Draft management
    availableDrafts,
    clearAllDrafts,
    
    // State
    hasUnsavedChanges: draftData && Object.keys(draftData).length > 0,
    lastAutoSave: lastSavedDataRef.current ? new Date(JSON.parse(lastSavedDataRef.current).timestamp || Date.now()) : null
  };
}

/**
 * Hook for managing draft restoration on component mount
 */
export function useDraftRestoration(
  showId: string,
  userId: string,
  onDraftSelected?: (draft: SavedDraft) => void
) {
  const { setDraftData } = useShowRegistrationStore();

  // Create a stable instance of useDraftPersistence outside the callback
  const draftPersistence = useDraftPersistence(showId, userId, 'draft-restoration');

  const restoreDraft = useCallback((draftId: string) => {
    const savedDraft = draftPersistence.loadDraft(draftId);
    
    if (savedDraft) {
      setDraftData(savedDraft.data);
      onDraftSelected?.(savedDraft);
      return true;
    }
    
    return false;
  }, [draftPersistence, setDraftData, onDraftSelected]);

  return { restoreDraft };
}