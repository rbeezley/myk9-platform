import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { logger } from '@/services/LoggingService';
import { ClassTemplate, TemplateStatus, TemplateType } from '@/types/template.types';
import { AKC_SCENT_WORK_TEMPLATE } from '@/data/templates/akcScentWorkTemplate';
import { STRUCTURED_TEMPLATES } from '@/data/mockTemplatesWithFields';
import { runTemplateStorageCleanup } from '@/utils/cleanup-localstorage';
import { fetchAllSportTemplatesWithRules } from '@/services/sportTemplateService';
import { mapSportTemplateToClassTemplate } from '@/types/sport-template-types';
import { TemplateStore, initialState } from './templateStore.types';
import {
  generateTemplateId,
  checkCanEdit,
  filterTemplates,
  applyActiveFilters,
  migrateV0ToV1,
  upsertTemplates,
  shouldRevalidate,
} from './templateStore.helpers';

export type { TemplateStore } from './templateStore.types';

/**
 * How long a persisted template cache is considered fresh before a background
 * revalidation is due. `0` = revalidate on every load (the current default —
 * chosen because sport templates are low-churn setup data and a single embed
 * fetch is cheap). Raise this to trade freshness for fewer round-trips.
 */
const TEMPLATE_REVALIDATE_TTL_MS = 0;

// Dedupes concurrent revalidations (e.g. onRehydrate + a component mount racing)
// into a single in-flight DB fetch.
let _refreshInFlight: Promise<void> | null = null;

export const useTemplateStore = create<TemplateStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // CRUD Operations
      createTemplate: (templateData, userId) => {
        const newTemplate: ClassTemplate = {
          ...templateData,
          id: generateTemplateId(),
          createdAt: new Date(),
          createdBy: userId,
          updatedAt: new Date(),
        };

        set(state => ({
          templates: [...state.templates, newTemplate],
          error: null,
        }));

        return newTemplate;
      },

      updateTemplate: (id, updates, userId) => {
        const template = get().templates.find(t => t.id === id);
        if (!template) {
          set({ error: `Template with id ${id} not found` });
          return false;
        }

        const editCheck = get().canEdit(template);
        if (!editCheck.canEdit && !updates.allowEditing) {
          set({ error: editCheck.reason || 'Template cannot be edited' });
          return false;
        }

        set(state => ({
          templates: state.templates.map(t =>
            t.id === id ? { ...t, ...updates, updatedAt: new Date(), updatedBy: userId } : t
          ),
          activeTemplate:
            state.activeTemplate?.id === id
              ? { ...state.activeTemplate, ...updates, updatedAt: new Date() }
              : state.activeTemplate,
          error: null,
        }));

        return true;
      },

      deleteTemplate: id => {
        const template = get().templates.find(t => t.id === id);
        if (!template) {
          set({ error: `Template with id ${id} not found` });
          return false;
        }

        if (template.isOfficial) {
          set({ error: 'Cannot delete official templates' });
          return false;
        }

        set(state => ({
          templates: state.templates.filter(t => t.id !== id),
          activeTemplate: state.activeTemplate?.id === id ? null : state.activeTemplate,
          error: null,
        }));

        return true;
      },

      duplicateTemplate: (id, newName, userId) => {
        const template = get().templates.find(t => t.id === id);
        if (!template) {
          set({ error: `Template with id ${id} not found` });
          return null;
        }

        const duplicatedTemplate: ClassTemplate = {
          ...template,
          id: generateTemplateId(),
          templateName: newName,
          isOfficial: false,
          isCustom: true,
          createdAt: new Date(),
          createdBy: userId,
          updatedAt: new Date(),
        };

        set(state => ({
          templates: [...state.templates, duplicatedTemplate],
          error: null,
        }));

        return duplicatedTemplate;
      },

      // Advanced template operations
      createEditableCopy: (id, userId, newName) => {
        const template = get().templates.find(t => t.id === id);
        if (!template) {
          set({ error: `Template with id ${id} not found` });
          return null;
        }

        const editableCopy: ClassTemplate = {
          ...template,
          id: generateTemplateId(),
          templateName: newName || `${template.templateName} (Editable Copy)`,
          type: TemplateType.FORK,
          status: TemplateStatus.DRAFT,
          sourceTemplateId: template.id,
          parentVersion: template.version,
          allowEditing: true,
          isOfficial: false,
          isCustom: true,
          createdAt: new Date(),
          createdBy: userId,
          updatedAt: new Date(),
          updatedBy: userId,
        };

        set(state => ({
          templates: [...state.templates, editableCopy],
          error: null,
        }));

        return editableCopy;
      },

      promoteToOfficial: (id, userId) => {
        const template = get().templates.find(t => t.id === id);
        if (!template) {
          set({ error: `Template with id ${id} not found` });
          return false;
        }

        if (template.type === TemplateType.OFFICIAL) {
          set({ error: 'Template is already official' });
          return false;
        }

        set(state => ({
          templates: state.templates.map(t =>
            t.id === id
              ? {
                  ...t,
                  type: TemplateType.OFFICIAL,
                  status: TemplateStatus.ACTIVE,
                  isOfficial: true,
                  isCustom: false,
                  updatedAt: new Date(),
                  updatedBy: userId,
                }
              : t
          ),
          error: null,
        }));

        return true;
      },

      deprecateTemplate: (id, userId, successorId) => {
        const template = get().templates.find(t => t.id === id);
        if (!template) {
          set({ error: `Template with id ${id} not found` });
          return false;
        }

        set(state => ({
          templates: state.templates.map(t =>
            t.id === id
              ? {
                  ...t,
                  status: TemplateStatus.DEPRECATED,
                  successorId,
                  isLatestVersion: false,
                  updatedAt: new Date(),
                  updatedBy: userId,
                }
              : t
          ),
          error: null,
        }));

        return true;
      },

      createNewVersion: (id, versionNumber, userId) => {
        const template = get().templates.find(t => t.id === id);
        if (!template) {
          set({ error: `Template with id ${id} not found` });
          return null;
        }

        const newVersion: ClassTemplate = {
          ...template,
          id: generateTemplateId(),
          version: versionNumber,
          status: TemplateStatus.DRAFT,
          sourceTemplateId: template.id,
          parentVersion: template.version,
          isLatestVersion: true,
          createdAt: new Date(),
          createdBy: userId,
          updatedAt: new Date(),
          updatedBy: userId,
        };

        set(state => ({
          templates: [
            ...state.templates.map(t =>
              t.id === id ? { ...t, isLatestVersion: false, successorId: newVersion.id } : t
            ),
            newVersion,
          ],
          error: null,
        }));

        return newVersion;
      },

      canEdit: template => checkCanEdit(template),

      // Queries
      getTemplate: id => get().templates.find(t => t.id === id),

      getTemplatesByOrganization: org =>
        get().templates.filter(t => t.organization === org && t.isActive),

      getTemplatesByTrialType: type =>
        get().templates.filter(t => t.trialType === type && t.isActive),

      getTemplatesByOrgAndType: (org, type) =>
        get().templates.filter(t => t.organization === org && t.trialType === type && t.isActive),

      ensureTemplatesLoaded: async () => {
        const { templates, isInitialized } = get();
        if (isInitialized && templates.length > 0) return;

        return new Promise<void>(resolve => {
          setTimeout(() => {
            try {
              get().initializeDefaultTemplates();
              resolve();
            } catch {
              resolve();
            }
          }, 0);
        });
      },

      getOfficialTemplates: () => get().templates.filter(t => t.isOfficial && t.isActive),

      getCustomTemplates: () => get().templates.filter(t => t.isCustom && t.isActive),

      searchTemplates: filter => filterTemplates(get().templates, filter),

      setSearchQuery: query => set({ searchQuery: query }),
      setFilterOrganization: org => set({ filterOrganization: org }),
      setFilterTrialType: type => set({ filterTrialType: type }),

      getFilteredTemplates: () => {
        const { templates, searchQuery, filterOrganization, filterTrialType } = get();
        return applyActiveFilters(templates, filterOrganization, filterTrialType, searchQuery);
      },

      clearFilters: () => set({ searchQuery: '', filterOrganization: null, filterTrialType: null }),

      // Active template management
      setActiveTemplate: id => {
        if (id === null) {
          set({ activeTemplate: null });
          return;
        }
        const template = get().templates.find(t => t.id === id);
        if (template) {
          set({ activeTemplate: template, error: null });
        } else {
          set({ error: `Template with id ${id} not found` });
        }
      },

      clearActiveTemplate: () => set({ activeTemplate: null }),

      // Import/Export
      exportTemplate: (id, userId) => {
        const template = get().templates.find(t => t.id === id);
        if (!template) {
          set({ error: `Template with id ${id} not found` });
          return null;
        }

        const {
          id: _templateId,
          createdAt: _createdAt,
          createdBy: _createdBy,
          ...exportData
        } = template;
        void _templateId;
        void _createdAt;
        void _createdBy;

        return {
          template: exportData,
          exportedAt: new Date(),
          exportedBy: userId,
          exportFormat: '1.0',
        };
      },

      importTemplate: (data, userId) => {
        try {
          if (data.exportFormat !== '1.0') {
            set({ error: 'Unsupported template format' });
            return null;
          }

          const importedTemplate: ClassTemplate = {
            ...data.template,
            id: generateTemplateId(),
            isOfficial: false,
            isCustom: true,
            createdAt: new Date(),
            createdBy: userId,
            updatedAt: new Date(),
          };

          set(state => ({
            templates: [...state.templates, importedTemplate],
            error: null,
          }));

          return importedTemplate;
        } catch {
          set({ error: 'Failed to import template' });
          return null;
        }
      },

      // Utility
      clearError: () => set({ error: null }),
      resetStore: () => set(initialState),

      // Initialize templates from DB, with hardcoded fallback
      initializeDefaultTemplates: (force = false) => {
        const { templates, isInitialized } = get();

        if (!force && (isInitialized || templates.length > 0)) return;

        set({ isLoading: true });

        const loadFromDB = async () => {
          try {
            const rows = await fetchAllSportTemplatesWithRules();
            const dbTemplates = rows.map(row =>
              mapSportTemplateToClassTemplate(row, row.sport_class_rules)
            );

            if (dbTemplates.length > 0) {
              set(state => ({
                // Upsert (replace-by-id) so a re-init actually refreshes changed
                // templates instead of skipping them because the id already exists.
                templates: upsertTemplates(state.templates, dbTemplates),
                isInitialized: true,
                isLoading: false,
                templatesFetchedAt: Date.now(),
                error: null,
              }));
              return;
            }
          } catch (error) {
            logger.warn('DB template fetch failed, using local fallback', 'store', {
              error: error instanceof Error ? error.message : String(error),
            });
          }

          // Fallback: hardcoded AKC template + STRUCTURED_TEMPLATES
          try {
            const templatesToAdd: ClassTemplate[] = [];
            const currentTemplates = get().templates;

            if (force || !currentTemplates.some(t => t.id === 'akc-scent-work-official-2024')) {
              templatesToAdd.push({
                ...AKC_SCENT_WORK_TEMPLATE,
                id: 'akc-scent-work-official-2024',
                createdAt: new Date(),
                createdBy: 'system',
              });
            }

            STRUCTURED_TEMPLATES.forEach(template => {
              if (force || !currentTemplates.some(t => t.id === template.id)) {
                templatesToAdd.push({
                  ...template,
                  createdAt: template.createdAt || new Date(),
                  createdBy: template.createdBy || 'system',
                  updatedAt: new Date(),
                });
              }
            });

            set(state => {
              const existingIds = new Set(state.templates.map(t => t.id));
              const newTemplates = templatesToAdd.filter(t => !existingIds.has(t.id));
              return {
                templates: [...state.templates, ...newTemplates],
                isInitialized: true,
                isLoading: false,
                error: null,
              };
            });
          } catch (error) {
            logger.error('Error initializing templates:', 'store', {}, error as Error);
            set({
              isInitialized: true,
              isLoading: false,
              error: `Failed to initialize templates: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
          }
        };

        // Non-blocking: kick off the async load
        loadFromDB();
      },

      // Stale-while-revalidate: reach already-active clients that cached templates
      // before a DB change, without a manual cache clear. Keeps serving the
      // persisted cache on failure/offline (offline-first) and upserts fresh rows
      // by id so a stale snapshot (e.g. 16 ASCA classes) converges to the DB state
      // (32 classes incl. Level C).
      refreshTemplatesFromDB: async (options = {}) => {
        const { force = false } = options;

        if (
          !force &&
          !shouldRevalidate(get().templatesFetchedAt, TEMPLATE_REVALIDATE_TTL_MS, Date.now())
        ) {
          return;
        }

        // Coalesce concurrent callers onto a single in-flight fetch.
        if (_refreshInFlight) return _refreshInFlight;

        _refreshInFlight = (async () => {
          try {
            const rows = await fetchAllSportTemplatesWithRules();
            const dbTemplates = rows.map(row =>
              mapSportTemplateToClassTemplate(row, row.sport_class_rules)
            );

            if (dbTemplates.length > 0) {
              set(state => ({
                templates: upsertTemplates(state.templates, dbTemplates),
                isInitialized: true,
                templatesFetchedAt: Date.now(),
                error: null,
              }));
            }
          } catch (error) {
            // Offline-first: never wipe the cache on a failed revalidation.
            logger.warn('Template revalidation failed; keeping cached templates', 'store', {
              error: error instanceof Error ? error.message : String(error),
            });
          } finally {
            _refreshInFlight = null;
          }
        })();

        return _refreshInFlight;
      },

      // Emergency function to clear corrupted data
      clearCorruptedData: async () => {
        set({ templates: [], isInitialized: false, templatesFetchedAt: null });

        const storageName = 'myk9show-template-storage';
        localStorage.removeItem(storageName);

        try {
          const storage = getOptimalStorage('templates');
          await storage.removeItem(storageName);
        } catch {
          // Failed to clear IndexedDB silently
        }
      },
    }),
    {
      name: 'myk9show-template-storage',
      storage: createJSONStorage(() => getOptimalStorage('templates')),
      version: 1,
      partialize: state => ({
        templates: state.templates,
        isInitialized: state.isInitialized,
        templatesFetchedAt: state.templatesFetchedAt,
      }),
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0) {
          return migrateV0ToV1(persistedState);
        }
        return persistedState;
      },
      onRehydrateStorage: () => {
        return (_state, error) => {
          // PERFORMANCE OPTIMIZATION: Skip automatic template *initialization* —
          // templates are still loaded on-demand when template features are accessed.
          //
          // REVALIDATE-ON-LOAD: but if a cache WAS hydrated, kick a background
          // refresh so clients that cached templates before a DB change converge
          // without a manual clear. Offline-first — only when online; the persisted
          // cache keeps serving otherwise. Deferred so hydration fully settles
          // before we upsert fresh DB rows on top of it.
          if (error) return;
          if (typeof window === 'undefined') return;
          if (navigator.onLine === false) return;
          setTimeout(() => {
            void useTemplateStore.getState().refreshTemplatesFromDB();
          }, 0);
        };
      },
    }
  )
);

// Clean up old localStorage data on startup
if (typeof window !== 'undefined') {
  runTemplateStorageCleanup();
}

// Initialize default templates lazily to avoid blocking app startup
// DISABLED: Causing duplicates on every page load
// if (typeof window !== 'undefined') {
//   // Use setTimeout to defer initialization until after initial render
//   setTimeout(() => {
//     useTemplateStore.getState().initializeDefaultTemplates();
//   }, 0);
// }
