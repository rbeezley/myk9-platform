import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { RegistrationFormData } from '@/types/show-registration-types';

export interface DraftMetadata {
  id: string;
  showId: string;
  userId: string;
  timestamp: number;
  stepCompleted: string;
  title: string;
  preview: string;
  draftType: 'registration' | 'show' | 'class' | 'trial' | 'person' | 'dog';
  lastModified: Date;
  autoSaved: boolean;
}

export interface SavedDraft<T = Record<string, unknown>> {
  metadata: DraftMetadata;
  data: Partial<T>;
  version: number;
}

export interface DraftConfig {
  autoSaveInterval: number;
  maxDraftsPerShow: number;
  maxDraftsPerUser: number;
  enableCompression: boolean;
  retentionDays: number;
}

interface DraftStore {
  // State
  drafts: SavedDraft[];
  config: DraftConfig;
  isAutoSaving: boolean;
  lastAutoSave: Date | null;
  
  // CRUD Operations
  saveDraft: <T>(
    showId: string,
    userId: string,
    draftType: DraftMetadata['draftType'],
    data: Partial<T>,
    metadata?: Partial<DraftMetadata>
  ) => string;
  
  loadDraft: <T>(draftId: string) => SavedDraft<T> | null;
  updateDraft: <T>(draftId: string, data: Partial<T>, metadata?: Partial<DraftMetadata>) => boolean;
  deleteDraft: (draftId: string) => boolean;
  
  // Batch Operations
  saveBulkDrafts: <T>(drafts: Array<{
    showId: string;
    userId: string;
    draftType: DraftMetadata['draftType'];
    data: Partial<T>;
    metadata?: Partial<DraftMetadata>;
  }>) => string[];
  
  deleteBulkDrafts: (draftIds: string[]) => number;
  
  // Query Operations
  getDraftsByShow: (showId: string) => SavedDraft[];
  getDraftsByUser: (userId: string) => SavedDraft[];
  getDraftsByType: (draftType: DraftMetadata['draftType']) => SavedDraft[];
  getDraftsByShowAndUser: (showId: string, userId: string) => SavedDraft[];
  getDraftsByShowAndType: (showId: string, draftType: DraftMetadata['draftType']) => SavedDraft[];
  
  // Search Operations
  searchDrafts: (query: string) => SavedDraft[];
  getRecentDrafts: (limit?: number) => SavedDraft[];
  getDraftsModifiedSince: (since: Date) => SavedDraft[];
  
  // Auto-save Management
  startAutoSave: (intervalMs?: number) => void;
  stopAutoSave: () => void;
  performAutoSave: <T>(
    showId: string,
    userId: string,
    draftType: DraftMetadata['draftType'],
    data: Partial<T>
  ) => string | null;
  
  // Cleanup Operations
  cleanupExpiredDrafts: () => number;
  cleanupOldDrafts: (showId: string, maxDrafts: number) => number;
  clearAllDrafts: () => void;
  clearDraftsByShow: (showId: string) => number;
  clearDraftsByUser: (userId: string) => number;
  
  // Configuration
  updateConfig: (config: Partial<DraftConfig>) => void;
  resetConfig: () => void;
  
  // Utilities
  exportDrafts: (showId?: string, userId?: string) => SavedDraft[];
  importDrafts: (drafts: SavedDraft[]) => number;
  getDraftStatistics: () => {
    totalDrafts: number;
    draftsByType: Record<string, number>;
    draftsByShow: Record<string, number>;
    oldestDraft: Date | null;
    newestDraft: Date | null;
    totalSize: number;
  };
  
  // Migration utilities
  migrateLegacyDrafts: () => number;
}

const DEFAULT_CONFIG: DraftConfig = {
  autoSaveInterval: 30000, // 30 seconds
  maxDraftsPerShow: 10,
  maxDraftsPerUser: 50,
  enableCompression: false,
  retentionDays: 30
};

let autoSaveTimer: NodeJS.Timeout | null = null;

export const useDraftStore = create<DraftStore>()(
  persist(
    (set, get) => ({
      // Initial state
      drafts: [],
      config: DEFAULT_CONFIG,
      isAutoSaving: false,
      lastAutoSave: null,

      // CRUD Operations
      saveDraft: (showId, userId, draftType, data, metadata = {}) => {
        const now = new Date();
        const draftId = `draft-${now.getTime()}-${Math.random().toString(36).substring(2, 9)}`;
        
        const draftMetadata: DraftMetadata = {
          id: draftId,
          showId,
          userId,
          timestamp: now.getTime(),
          stepCompleted: metadata.stepCompleted || 'unknown',
          title: metadata.title || `${draftType} draft - ${now.toLocaleDateString()}`,
          preview: metadata.preview || generatePreview(data, draftType),
          draftType,
          lastModified: now,
          autoSaved: metadata.autoSaved || false,
          ...metadata
        };

        const newDraft: SavedDraft = {
          metadata: draftMetadata,
          data,
          version: 1
        };

        set(state => {
          const updatedDrafts = [...state.drafts, newDraft];
          
          // Cleanup old drafts if over limit
          const userDrafts = updatedDrafts.filter(d => d.metadata.userId === userId);
          const showDrafts = updatedDrafts.filter(d => d.metadata.showId === showId);
          
          let finalDrafts = updatedDrafts;
          
          // Apply per-show limit
          if (showDrafts.length > state.config.maxDraftsPerShow) {
            const showDraftsToRemove = showDrafts
              .sort((a, b) => a.metadata.timestamp - b.metadata.timestamp)
              .slice(0, showDrafts.length - state.config.maxDraftsPerShow);
            
            finalDrafts = finalDrafts.filter(d => 
              !showDraftsToRemove.some(remove => remove.metadata.id === d.metadata.id)
            );
          }
          
          // Apply per-user limit
          if (userDrafts.length > state.config.maxDraftsPerUser) {
            const userDraftsToRemove = userDrafts
              .sort((a, b) => a.metadata.timestamp - b.metadata.timestamp)
              .slice(0, userDrafts.length - state.config.maxDraftsPerUser);
            
            finalDrafts = finalDrafts.filter(d => 
              !userDraftsToRemove.some(remove => remove.metadata.id === d.metadata.id)
            );
          }

          return { drafts: finalDrafts };
        });

        return draftId;
      },

      loadDraft: <T>(draftId: string) => {
        const draft = get().drafts.find(d => d.metadata.id === draftId);
        return (draft as SavedDraft<T>) || null;
      },

      updateDraft: (draftId, data, metadata = {}) => {
        const draft = get().drafts.find(d => d.metadata.id === draftId);
        if (!draft) return false;

        const now = new Date();
        set(state => ({
          drafts: state.drafts.map(d =>
            d.metadata.id === draftId
              ? {
                  ...d,
                  data: { ...d.data, ...data },
                  metadata: {
                    ...d.metadata,
                    ...metadata,
                    lastModified: now,
                    timestamp: now.getTime()
                  },
                  version: d.version + 1
                }
              : d
          )
        }));

        return true;
      },

      deleteDraft: (draftId) => {
        const draftExists = get().drafts.some(d => d.metadata.id === draftId);
        if (!draftExists) return false;

        set(state => ({
          drafts: state.drafts.filter(d => d.metadata.id !== draftId)
        }));

        return true;
      },

      // Batch Operations
      saveBulkDrafts: (drafts) => {
        const savedIds: string[] = [];
        
        drafts.forEach(({ showId, userId, draftType, data, metadata }) => {
          const draftId = get().saveDraft(showId, userId, draftType, data, metadata);
          savedIds.push(draftId);
        });

        return savedIds;
      },

      deleteBulkDrafts: (draftIds) => {
        const existingIds = get().drafts
          .filter(d => draftIds.includes(d.metadata.id))
          .map(d => d.metadata.id);

        set(state => ({
          drafts: state.drafts.filter(d => !draftIds.includes(d.metadata.id))
        }));

        return existingIds.length;
      },

      // Query Operations
      getDraftsByShow: (showId) => {
        return get().drafts.filter(d => d.metadata.showId === showId);
      },

      getDraftsByUser: (userId) => {
        return get().drafts.filter(d => d.metadata.userId === userId);
      },

      getDraftsByType: (draftType) => {
        return get().drafts.filter(d => d.metadata.draftType === draftType);
      },

      getDraftsByShowAndUser: (showId, userId) => {
        return get().drafts.filter(d => 
          d.metadata.showId === showId && d.metadata.userId === userId
        );
      },

      getDraftsByShowAndType: (showId, draftType) => {
        return get().drafts.filter(d => 
          d.metadata.showId === showId && d.metadata.draftType === draftType
        );
      },

      // Search Operations
      searchDrafts: (query) => {
        const lowerQuery = query.toLowerCase();
        return get().drafts.filter(d =>
          d.metadata.title.toLowerCase().includes(lowerQuery) ||
          d.metadata.preview.toLowerCase().includes(lowerQuery) ||
          d.metadata.draftType.toLowerCase().includes(lowerQuery)
        );
      },

      getRecentDrafts: (limit = 10) => {
        return get().drafts
          .sort((a, b) => b.metadata.timestamp - a.metadata.timestamp)
          .slice(0, limit);
      },

      getDraftsModifiedSince: (since) => {
        return get().drafts.filter(d => d.metadata.lastModified > since);
      },

      // Auto-save Management
      startAutoSave: (intervalMs) => {
        const interval = intervalMs || get().config.autoSaveInterval;
        
        if (autoSaveTimer) {
          clearInterval(autoSaveTimer);
        }

        set({ isAutoSaving: true });
        
        autoSaveTimer = setInterval(() => {
          set({ lastAutoSave: new Date() });
        }, interval);
      },

      stopAutoSave: () => {
        if (autoSaveTimer) {
          clearInterval(autoSaveTimer);
          autoSaveTimer = null;
        }
        set({ isAutoSaving: false });
      },

      performAutoSave: (showId, userId, draftType, data) => {
        if (!data || Object.keys(data).length === 0) {
          return null;
        }

        return get().saveDraft(showId, userId, draftType, data, { autoSaved: true });
      },

      // Cleanup Operations
      cleanupExpiredDrafts: () => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - get().config.retentionDays);

        const expiredDrafts = get().drafts.filter(d => 
          d.metadata.lastModified < cutoffDate
        );

        set(state => ({
          drafts: state.drafts.filter(d => d.metadata.lastModified >= cutoffDate)
        }));

        return expiredDrafts.length;
      },

      cleanupOldDrafts: (showId, maxDrafts) => {
        const showDrafts = get().drafts
          .filter(d => d.metadata.showId === showId)
          .sort((a, b) => b.metadata.timestamp - a.metadata.timestamp);

        if (showDrafts.length <= maxDrafts) {
          return 0;
        }

        const draftsToRemove = showDrafts.slice(maxDrafts);
        const idsToRemove = draftsToRemove.map(d => d.metadata.id);

        set(state => ({
          drafts: state.drafts.filter(d => !idsToRemove.includes(d.metadata.id))
        }));

        return draftsToRemove.length;
      },

      clearAllDrafts: () => {
        set({ drafts: [] });
      },

      clearDraftsByShow: (showId) => {
        const removedCount = get().drafts.filter(d => d.metadata.showId === showId).length;
        
        set(state => ({
          drafts: state.drafts.filter(d => d.metadata.showId !== showId)
        }));

        return removedCount;
      },

      clearDraftsByUser: (userId) => {
        const removedCount = get().drafts.filter(d => d.metadata.userId === userId).length;
        
        set(state => ({
          drafts: state.drafts.filter(d => d.metadata.userId !== userId)
        }));

        return removedCount;
      },

      // Configuration
      updateConfig: (configUpdates) => {
        set(state => ({
          config: { ...state.config, ...configUpdates }
        }));
      },

      resetConfig: () => {
        set({ config: DEFAULT_CONFIG });
      },

      // Utilities
      exportDrafts: (showId, userId) => {
        let drafts = get().drafts;
        
        if (showId) {
          drafts = drafts.filter(d => d.metadata.showId === showId);
        }
        
        if (userId) {
          drafts = drafts.filter(d => d.metadata.userId === userId);
        }

        return drafts;
      },

      importDrafts: (drafts) => {
        const validDrafts = drafts.filter(draft => 
          draft.metadata && draft.data && draft.metadata.id
        );

        set(state => {
          // Merge with existing drafts, replacing any with same ID
          const existingIds = state.drafts.map(d => d.metadata.id);
          const newDrafts = validDrafts.filter(d => !existingIds.includes(d.metadata.id));
          
          return {
            drafts: [...state.drafts, ...newDrafts]
          };
        });

        return validDrafts.length;
      },

      getDraftStatistics: () => {
        const drafts = get().drafts;
        
        const draftsByType: Record<string, number> = {};
        const draftsByShow: Record<string, number> = {};
        let oldestDraft: Date | null = null;
        let newestDraft: Date | null = null;

        drafts.forEach(draft => {
          // Count by type
          draftsByType[draft.metadata.draftType] = 
            (draftsByType[draft.metadata.draftType] || 0) + 1;
          
          // Count by show
          draftsByShow[draft.metadata.showId] = 
            (draftsByShow[draft.metadata.showId] || 0) + 1;
          
          // Track oldest/newest
          const draftDate = draft.metadata.lastModified;
          if (!oldestDraft || draftDate < oldestDraft) {
            oldestDraft = draftDate;
          }
          if (!newestDraft || draftDate > newestDraft) {
            newestDraft = draftDate;
          }
        });

        // Calculate approximate size
        const totalSize = JSON.stringify(drafts).length;

        return {
          totalDrafts: drafts.length,
          draftsByType,
          draftsByShow,
          oldestDraft,
          newestDraft,
          totalSize
        };
      },

      // Migration utilities
      migrateLegacyDrafts: () => {
        let migratedCount = 0;
        
        // Scan localStorage for legacy draft keys
        const legacyPatterns = [
          'registration-draft-',
          'show-draft-',
          'class-draft-',
          'trial-draft-',
          'person-draft-',
          'dog-draft-'
        ];

        legacyPatterns.forEach(pattern => {
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith(pattern)) {
              try {
                const data = JSON.parse(localStorage.getItem(key) || '{}');
                
                if (data && Object.keys(data).length > 0) {
                  const draftType = pattern.replace('draft-', '').replace('-', '') as DraftMetadata['draftType'];
                  const showId = extractShowIdFromKey(key) || 'unknown-show';
                  const userId = extractUserIdFromData(data) || 'unknown-user';
                  
                  get().saveDraft(showId, userId, draftType, data, {
                    title: `Migrated ${draftType} draft`,
                    stepCompleted: 'migrated'
                  });
                  
                  // Remove legacy entry
                  localStorage.removeItem(key);
                  migratedCount++;
                }
              } catch {
                // Failed to migrate legacy draft
              }
            }
          });
        });

        return migratedCount;
      }
    }),
    {
      name: 'draft-storage',
      storage: createJSONStorage(() => getOptimalStorage('drafts')),
      partialize: (state) => ({
        drafts: state.drafts,
        config: state.config,
      }),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for drafts
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            if (state.drafts && Array.isArray(state.drafts)) {
              // Ensure all drafts have proper relationships and new fields
              state.drafts = state.drafts.map((draft: unknown) => {
                const d = draft as Record<string, unknown>;
                const metadata = d.metadata as Record<string, unknown>;
                return {
                  ...d,
                  // Add any data transformations needed for relationships
                  version: d.version || 1,
                  metadata: {
                    ...metadata,
                    lastModified: metadata.lastModified || new Date(metadata.timestamp as string | number | Date),
                    autoSaved: metadata.autoSaved || false,
                    draftType: metadata.draftType || 'registration'
                  }
                };
              });
            }
            if (!state.config) {
              state.config = DEFAULT_CONFIG;
            }
          }
        }
        return persistedState;
      },
    }
  )
);

// Helper functions
function generatePreview<T>(data: Partial<T>, draftType: DraftMetadata['draftType']): string {
  if (!data || Object.keys(data).length === 0) {
    return `Empty ${draftType} draft`;
  }

  const registrationData = data as Partial<RegistrationFormData>;
  
  switch (draftType) {
    case 'registration': {
      const selectedDogs = registrationData.selectedDogs?.length || 0;
      const selectedClasses = registrationData.entries?.reduce((total, entry) => 
        total + (entry.classes?.length || 0), 0) || 0;
      
      if (selectedDogs > 0 || selectedClasses > 0) {
        return `${selectedDogs} dog${selectedDogs !== 1 ? 's' : ''}, ${selectedClasses} class${selectedClasses !== 1 ? 'es' : ''}`;
      }
      break;
    }
    
    default: {
      const fieldCount = Object.keys(data).length;
      return `${fieldCount} field${fieldCount !== 1 ? 's' : ''} saved`;
    }
  }

  return `${draftType} draft`;
}

function extractShowIdFromKey(key: string): string | null {
  const parts = key.split('-');
  // Look for a show ID pattern in the key
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('show') || parts[i].length > 10) {
      return parts[i];
    }
  }
  return null;
}

function extractUserIdFromData(data: Record<string, unknown>): string | null {
  // Try to extract user ID from the data
  return (data.userId as string) || ((data.user as Record<string, unknown>)?.id as string) || (data.createdBy as string) || null;
}