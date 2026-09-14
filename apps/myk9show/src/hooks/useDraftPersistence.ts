import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useShowRegistrationStore } from '../store/showRegistrationStore';
import { RegistrationFormData } from '../types/show-registration-types';
import { logger } from '@/services/LoggingService';
import {
  pruneFiledDogsFromDraft,
  pruneStoredDrafts,
  type HandledDraftClass,
} from './pruneFiledDogsFromDraft';
import { makeHandlerKey } from '@/types/show-registration-types';
import { readSavedDraftMetadata } from './readSavedDraftMetadata';

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
  /** Read from the saved payload when listing drafts. */
  selectedDogsCount?: number;
  completed?: boolean;
}

export interface SavedDraft {
  metadata: DraftMetadata;
  data: Partial<RegistrationFormData>;
}

const DEFAULT_CONFIG: Required<DraftPersistenceConfig> = {
  autoSaveInterval: 30000, // 30 seconds
  storageKeyPrefix: 'registration-draft',
  maxDraftsPerShow: 5,
  debug: false,
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
  const { autoSaveInterval, storageKeyPrefix, maxDraftsPerShow, debug } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const { draftData } = useShowRegistrationStore();
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>('');
  const activeDraftMetadataRef = useRef<DraftMetadata | null>(null);
  const pendingRestoreDataRef = useRef<Partial<RegistrationFormData> | null>(null);
  const handledAfterSubmitRef = useRef<{
    classKeys: Set<string>;
    dogIds: Set<string>;
  } | null>(null);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);
  const [draftsVersion, setDraftsVersion] = useState(0);

  const log = useCallback(
    (message: string, ...args: unknown[]) => {
      if (debug) {
        logger.debug(`[DraftPersistence] ${message}`, 'hooks', { data: args });
      }
    },
    [debug]
  );

  // Generate storage keys. userId is baked into the key so the maxDraftsPerShow
  // trim and clearAllDrafts operate per-user, not across all users who've used
  // this device — read-side filtering alone would let one user's save evict
  // another user's drafts.
  const getDraftKey = useCallback(
    (draftId: string) => `${storageKeyPrefix}-${showId}-${userId}-${draftId}`,
    [storageKeyPrefix, showId, userId]
  );

  const getMetadataKey = useCallback(
    () => `${storageKeyPrefix}-metadata-${showId}-${userId}`,
    [storageKeyPrefix, showId, userId]
  );

  // Generate draft metadata
  const generateDraftMetadata = useCallback(
    (data: Partial<RegistrationFormData>): DraftMetadata => {
      const selectedDogs = data.selectedDogs?.length || 0;
      const selectedClasses =
        data.entries?.reduce((total, entry) => total + (entry.classes?.length || 0), 0) || 0;

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
        id: crypto.randomUUID(),
        showId,
        userId,
        timestamp: Date.now(),
        stepCompleted: data._workflowState?.currentStep ?? currentStep,
        title: `Draft from ${new Date().toLocaleDateString()}`,
        preview,
      };
    },
    [showId, userId, currentStep]
  );

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
  const saveDraftMetadata = useCallback(
    (metadata: DraftMetadata[]) => {
      try {
        localStorage.setItem(getMetadataKey(), JSON.stringify(metadata));
        log('Saved draft metadata:', metadata.length, 'drafts');
      } catch (error) {
        log('Error saving draft metadata:', error);
      }
    },
    [getMetadataKey, log]
  );

  // Save draft to localStorage
  const saveDraft = useCallback(
    (data: Partial<RegistrationFormData>, metadata?: DraftMetadata) => {
      if (!data || Object.keys(data).length === 0) {
        log('Skipping empty draft save');
        return null;
      }
      // Without a userId, the key collapses to a shared "anonymous" bucket
      // that different sessions would overwrite. Bail rather than persist.
      if (!userId) {
        log('Skipping draft save: no userId');
        return null;
      }

      const draftMetadata = metadata
        ? { ...generateDraftMetadata(data), id: metadata.id, title: metadata.title }
        : generateDraftMetadata(data);
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
        activeDraftMetadataRef.current = draftMetadata;
        setDraftsVersion(version => version + 1);
        log('Saved draft:', draftMetadata.id, 'with', Object.keys(data).length, 'fields');

        return draftMetadata.id;
      } catch (error) {
        log('Error saving draft:', error);
        return null;
      }
    },
    [
      userId,
      generateDraftMetadata,
      getDraftKey,
      getDraftMetadata,
      saveDraftMetadata,
      maxDraftsPerShow,
      log,
    ]
  );

  // Load draft from localStorage
  const loadDraft = useCallback(
    (draftId: string): SavedDraft | null => {
      try {
        const draftData = localStorage.getItem(getDraftKey(draftId));
        if (!draftData) {
          log('Draft not found:', draftId);
          return null;
        }

        const savedDraft: SavedDraft = JSON.parse(draftData);

        // Defense-in-depth: storage keys already scope by userId, but re-verify
        // the payload's userId in case a draft was stored under a legacy key
        // format or manually copied between buckets.
        const draftUserId = savedDraft.metadata?.userId;
        if (draftUserId && draftUserId !== userId) {
          log('Draft belongs to a different user, refusing to load:', draftId);
          return null;
        }

        log('Loaded draft:', draftId, 'with', Object.keys(savedDraft.data).length, 'fields');
        return savedDraft;
      } catch (error) {
        log('Error loading draft:', error);
        return null;
      }
    },
    [getDraftKey, userId, log]
  );

  // Reading a draft does not accept it. The wizard activates a requested draft;
  // it validates dogs immediately when available or defers registration creation.
  const activateDraft = useCallback(
    (draft: SavedDraft) => {
      if (draft.metadata.showId === showId && draft.metadata.userId === userId) {
        activeDraftMetadataRef.current = draft.metadata;
        pendingRestoreDataRef.current = draftData;
      }
    },
    [draftData, showId, userId]
  );

  // Delete draft from localStorage
  const deleteDraft = useCallback(
    (draftId: string) => {
      try {
        localStorage.removeItem(getDraftKey(draftId));

        // Update metadata
        const allMetadata = getDraftMetadata().filter(m => m.id !== draftId);
        saveDraftMetadata(allMetadata);
        if (activeDraftMetadataRef.current?.id === draftId) {
          activeDraftMetadataRef.current = null;
          pendingRestoreDataRef.current = null;
        }
        setDraftsVersion(version => version + 1);

        log('Deleted draft:', draftId);
      } catch (error) {
        log('Error deleting draft:', error);
      }
    },
    [getDraftKey, getDraftMetadata, saveDraftMetadata, log]
  );

  const saveableData = useCallback(
    (data: Partial<RegistrationFormData>): Partial<RegistrationFormData> | null => {
      const handled = handledAfterSubmitRef.current;
      if (!handled) return data;
      if (data._workflowState?.currentStep === 'confirmation') return null;
      const candidate: SavedDraft = {
        metadata: activeDraftMetadataRef.current ?? generateDraftMetadata(data),
        data,
      };
      try {
        return pruneFiledDogsFromDraft(candidate, handled.classKeys, handled.dogIds)?.data ?? null;
      } catch (error) {
        log('Could not save malformed restored draft:', error);
        return null;
      }
    },
    [generateDraftMetadata, log]
  );

  // Auto-save current draft data
  const autoSave = useCallback(() => {
    if (!draftData || Object.keys(draftData).length === 0) {
      return;
    }
    if (pendingRestoreDataRef.current === draftData) return;
    pendingRestoreDataRef.current = null;
    const dataToSave = saveableData(draftData);
    if (!dataToSave) return;
    // The wizard supplies a non-empty envelope even before a dog is selected.
    // Do not let a fresh empty wizard evict an unfinished entry on this device.
    if (!dataToSave.selectedDogs?.length && !activeDraftMetadataRef.current) return;

    // Check if data has changed since last save
    const currentDataString = JSON.stringify(dataToSave);
    if (currentDataString === lastSavedDataRef.current) {
      log('No changes detected, skipping auto-save');
      return;
    }

    const draftId = saveDraft(dataToSave, activeDraftMetadataRef.current ?? undefined);
    if (draftId) {
      lastSavedDataRef.current = currentDataString;
      setLastAutoSaveTime(new Date());
      log('Auto-saved draft:', draftId);
    }
  }, [draftData, saveDraft, saveableData, log]);

  // Manual save with custom title
  const saveWithTitle = useCallback(
    (title: string) => {
      if (!draftData || Object.keys(draftData).length === 0) {
        return null;
      }
      const dataToSave = saveableData(draftData);
      if (!dataToSave) return null;

      const metadata = generateDraftMetadata(dataToSave);
      metadata.title = title;

      return saveDraft(dataToSave, metadata);
    },
    [draftData, generateDraftMetadata, saveDraft, saveableData]
  );

  // Clear all drafts for current show
  const clearAllDrafts = useCallback(() => {
    const allMetadata = getDraftMetadata();
    allMetadata.forEach(meta => {
      localStorage.removeItem(getDraftKey(meta.id));
    });
    localStorage.removeItem(getMetadataKey());
    activeDraftMetadataRef.current = null;
    pendingRestoreDataRef.current = null;
    lastSavedDataRef.current = JSON.stringify(draftData ?? {});
    setDraftsVersion(version => version + 1);
    log('Cleared all drafts for show:', showId);
  }, [draftData, getDraftMetadata, getDraftKey, getMetadataKey, showId, log]);

  const discardDraftsWithoutFinalSave = useCallback(
    (handledClasses: HandledDraftClass[]) => {
      const handled = new Set(
        handledClasses.map(({ dogId, classId }) => makeHandlerKey(dogId, classId))
      );
      const handledDogIds = new Set(handledClasses.map(({ dogId }) => dogId));
      handledAfterSubmitRef.current = { classKeys: handled, dogIds: handledDogIds };
      const { remainingMetadata, remainingActive } = pruneStoredDrafts({
        metadata: getDraftMetadata(),
        keyFor: getDraftKey,
        showId,
        userId,
        handledClassKeys: handled,
        handledDogIds,
        activeId: activeDraftMetadataRef.current?.id,
        onError: (id, error) => log('Could not prune saved draft:', id, error),
      });
      if (remainingMetadata.length > 0) {
        remainingMetadata.sort((a, b) => b.timestamp - a.timestamp);
        saveDraftMetadata(remainingMetadata);
      } else localStorage.removeItem(getMetadataKey());
      activeDraftMetadataRef.current = remainingActive;
      pendingRestoreDataRef.current = null;
      lastSavedDataRef.current = '';
      setDraftsVersion(version => version + 1);
    },
    [getDraftKey, getDraftMetadata, getMetadataKey, log, saveDraftMetadata, showId, userId]
  );

  // Keep a ref to the latest autoSave so the timer effect can call it without
  // having `autoSave` as a dependency — otherwise the timer gets cleared and
  // restarted on every render (because `autoSave` depends on `draftData`,
  // which changes continuously), so the interval never actually elapses.
  const autoSaveRef = useRef(autoSave);
  useEffect(() => {
    autoSaveRef.current = autoSave;
  }, [autoSave]);

  // Setup auto-save timer
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setInterval(() => autoSaveRef.current(), autoSaveInterval);
    log('Started auto-save timer with interval:', autoSaveInterval, 'ms');

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        log('Cleared auto-save timer');
      }
    };
  }, [autoSaveInterval, log]);

  // Save on component unmount
  useEffect(() => {
    return () => {
      log('Component unmounting, performing final save');
      autoSaveRef.current();
    };
  }, [log]);

  // Browser Back can leave the document before the 30-second timer fires.
  useEffect(() => {
    const saveOnPageHide = () => autoSaveRef.current();
    window.addEventListener('pagehide', saveOnPageHide);
    return () => window.removeEventListener('pagehide', saveOnPageHide);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === getMetadataKey()) setDraftsVersion(version => version + 1);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [getMetadataKey]);

  const availableDrafts = useMemo(
    () =>
      getDraftMetadata().map(metadata =>
        readSavedDraftMetadata(metadata, getDraftKey(metadata.id), showId, userId)
      ),
    // Local draft writes invalidate the memo without changing the storage key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftsVersion, getDraftKey, getDraftMetadata, showId, userId]
  );

  return {
    // Draft operations
    saveDraft: saveWithTitle,
    loadDraft,
    activateDraft,
    deleteDraft,
    autoSave,

    // Draft management
    availableDrafts,
    clearAllDrafts,
    discardDraftsWithoutFinalSave,

    // State
    hasUnsavedChanges: draftData && Object.keys(draftData).length > 0,
    lastAutoSave: lastAutoSaveTime,
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

  const restoreDraft = useCallback(
    (draftId: string) => {
      const savedDraft = draftPersistence.loadDraft(draftId);

      if (savedDraft) {
        draftPersistence.activateDraft(savedDraft);
        setDraftData(savedDraft.data);
        onDraftSelected?.(savedDraft);
        return true;
      }

      return false;
    },
    [draftPersistence, setDraftData, onDraftSelected]
  );

  return { restoreDraft };
}
