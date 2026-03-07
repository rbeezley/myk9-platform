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
} from './templateStore.helpers';

export type { TemplateStore } from './templateStore.types';

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
              set(state => {
                const existingIds = new Set(state.templates.map(t => t.id));
                const newTemplates = dbTemplates.filter(t => !existingIds.has(t.id));
                return {
                  templates: [...state.templates, ...newTemplates],
                  isInitialized: true,
                  isLoading: false,
                  error: null,
                };
              });
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

      // Emergency function to clear corrupted data
      clearCorruptedData: async () => {
        set({ templates: [], isInitialized: false });

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
      }),
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0) {
          return migrateV0ToV1(persistedState);
        }
        return persistedState;
      },
      onRehydrateStorage: () => {
        return (_state, _error) => {
          // PERFORMANCE OPTIMIZATION: Skip automatic template initialization
          // Templates will be loaded on-demand when template features are accessed
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
