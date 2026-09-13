import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
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
  customTitle?: boolean;
  preview: string;
  /** Derived from the saved payload when listing drafts; older previews can be stale. */
  selectedDogsCount?: number;
  /** Derived from the saved workflow step so filed entries cannot be resumed. */
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

const DRAFTS_UPDATED_EVENT = 'registration-drafts-updated';

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
  const skipFinalSaveRef = useRef(false);
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
        stepCompleted: currentStep,
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
        window.dispatchEvent(new CustomEvent(DRAFTS_UPDATED_EVENT, { detail: getMetadataKey() }));
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

      const refreshedMetadata = generateDraftMetadata(data);
      const draftMetadata = metadata
        ? {
            ...refreshedMetadata,
            id: metadata.id,
            title: metadata.customTitle
              ? metadata.title
              : metadata.title.startsWith('Draft from ')
                ? refreshedMetadata.title
                : metadata.title,
            ...(metadata.customTitle ? { customTitle: true } : {}),
          }
        : refreshedMetadata;
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

  // A read is not an accepted resume: callers validate dog ownership and the
  // workflow step before allowing autosave to overwrite this draft.
  const activateDraft = useCallback(
    (draft: SavedDraft) => {
      if (draft.metadata.showId === showId && draft.metadata.userId === userId) {
        activeDraftMetadataRef.current = draft.metadata;
      }
    },
    [showId, userId]
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
        }

        log('Deleted draft:', draftId);
      } catch (error) {
        log('Error deleting draft:', error);
      }
    },
    [getDraftKey, getDraftMetadata, saveDraftMetadata, log]
  );

  // Auto-save current draft data
  const autoSave = useCallback(() => {
    if (skipFinalSaveRef.current) return;
    if (!draftData || Object.keys(draftData).length === 0) {
      return;
    }
    // The wizard always supplies a non-empty envelope, even before a dog is
    // selected. Do not create a new empty autosave that can evict a real draft.
    // An existing active draft must still record a later deselection.
    if (!draftData.selectedDogs?.length && !activeDraftMetadataRef.current) {
      return;
    }

    // Check if data has changed since last save
    const currentDataString = JSON.stringify(draftData);
    if (currentDataString === lastSavedDataRef.current) {
      log('No changes detected, skipping auto-save');
      return;
    }

    const draftId = saveDraft(draftData, activeDraftMetadataRef.current ?? undefined);
    if (draftId) {
      lastSavedDataRef.current = currentDataString;
      setLastAutoSaveTime(new Date());
      log('Auto-saved draft:', draftId);
    }
  }, [draftData, saveDraft, log]);

  // Manual save with custom title
  const saveWithTitle = useCallback(
    (title: string) => {
      if (skipFinalSaveRef.current || !draftData || Object.keys(draftData).length === 0) {
        return null;
      }

      const metadata = generateDraftMetadata(draftData);
      metadata.title = title;
      metadata.customTitle = true;

      return saveDraft(draftData, metadata);
    },
    [draftData, generateDraftMetadata, saveDraft]
  );

  // Clear all drafts for current show
  const clearAllDrafts = useCallback(() => {
    const allMetadata = getDraftMetadata();
    allMetadata.forEach(meta => {
      localStorage.removeItem(getDraftKey(meta.id));
    });
    localStorage.removeItem(getMetadataKey());
    window.dispatchEvent(new CustomEvent(DRAFTS_UPDATED_EVENT, { detail: getMetadataKey() }));
    activeDraftMetadataRef.current = null;
    lastSavedDataRef.current = JSON.stringify(draftData ?? {});
    log('Cleared all drafts for show:', showId);
  }, [draftData, getDraftMetadata, getDraftKey, getMetadataKey, showId, log]);

  const discardDraftsWithoutFinalSave = useCallback(() => {
    skipFinalSaveRef.current = true;
    const submittedDogs = new Set(draftData?.selectedDogs ?? []);
    const activeId = activeDraftMetadataRef.current?.id;
    const remaining = getDraftMetadata().filter(metadata => {
      const draft = loadDraft(metadata.id);
      const overlaps = draft?.data.selectedDogs?.some(id => submittedDogs.has(id));
      if (!overlaps && !(submittedDogs.size === 0 && metadata.id === activeId)) return true;
      localStorage.removeItem(getDraftKey(metadata.id));
      return false;
    });
    saveDraftMetadata(remaining);
    activeDraftMetadataRef.current = null;
    lastSavedDataRef.current = JSON.stringify(draftData ?? {});
  }, [draftData, getDraftMetadata, getDraftKey, loadDraft, saveDraftMetadata]);

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
      if (skipFinalSaveRef.current) {
        log('Component unmounting, final draft save skipped');
        return;
      }
      log('Component unmounting, performing final save');
      autoSaveRef.current();
    };
  }, [log]);

  // Browser Back can unload the document without a React unmount. Persist the
  // latest form state before navigation, even when the 30-second timer has not fired.
  useEffect(() => {
    const saveOnPageHide = () => {
      if (!skipFinalSaveRef.current) autoSaveRef.current();
    };
    window.addEventListener('pagehide', saveOnPageHide);
    return () => window.removeEventListener('pagehide', saveOnPageHide);
  }, []);

  // A different tab can change this user's draft list without a local save.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === getMetadataKey()) setDraftsVersion(version => version + 1);
    };
    window.addEventListener('storage', onStorage);
    const onLocalUpdate = (event: Event) => {
      if ((event as CustomEvent<string>).detail === getMetadataKey()) {
        setDraftsVersion(version => version + 1);
      }
    };
    window.addEventListener(DRAFTS_UPDATED_EVENT, onLocalUpdate);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(DRAFTS_UPDATED_EVENT, onLocalUpdate);
    };
  }, [getMetadataKey]);

  // Draft payloads only change after in-hook writes or another tab's storage
  // event. Avoid synchronous JSON parsing on unrelated wizard renders.
  const availableDrafts = useMemo(
    () =>
      getDraftMetadata().map(metadata => {
        try {
          const raw = localStorage.getItem(getDraftKey(metadata.id));
          if (!raw) return { ...metadata, selectedDogsCount: 0, completed: false };
          const saved: SavedDraft = JSON.parse(raw);
          const validOwner =
            saved.metadata?.id === metadata.id &&
            saved.metadata.showId === showId &&
            saved.metadata.userId === userId;
          return {
            ...metadata,
            completed: validOwner && saved.data?._workflowState?.currentStep === 'confirmation',
            selectedDogsCount:
              validOwner && Array.isArray(saved.data?.selectedDogs)
                ? saved.data.selectedDogs.length
                : 0,
          };
        } catch {
          return { ...metadata, selectedDogsCount: 0, completed: false };
        }
      }),
    // The version is an intentional invalidation signal for localStorage writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftsVersion, getDraftMetadata, getDraftKey, showId, userId]
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
    hasUnsavedChanges: !skipFinalSaveRef.current && draftData && Object.keys(draftData).length > 0,
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
