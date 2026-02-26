import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { logger } from '@/services/LoggingService';
import {
  ClassTemplate, 
  TemplateFilter, 
  Organization, 
  ShowType,
  TemplateImportExport,
  TemplateStatus,
  TemplateType
} from '@/types/template.types';
import { AKC_SCENT_WORK_TEMPLATE } from '@/data/templates/akcScentWorkTemplate';
import { STRUCTURED_TEMPLATES } from '@/data/mockTemplatesWithFields';
import { runTemplateStorageCleanup } from '@/utils/cleanup-localstorage';

interface TemplateStore {
  // State
  templates: ClassTemplate[];
  activeTemplate: ClassTemplate | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  filterOrganization: Organization | null;
  filterShowType: ShowType | null;
  isInitialized: boolean;

  // CRUD Operations
  createTemplate: (template: Omit<ClassTemplate, 'id' | 'createdAt' | 'createdBy'>, userId: string) => ClassTemplate;
  updateTemplate: (id: string, updates: Partial<ClassTemplate>, userId: string) => boolean;
  deleteTemplate: (id: string) => boolean;
  duplicateTemplate: (id: string, newName: string, userId: string) => ClassTemplate | null;

  // NEW: Advanced template operations
  createEditableCopy: (id: string, userId: string, newName?: string) => ClassTemplate | null;
  promoteToOfficial: (id: string, userId: string) => boolean;
  deprecateTemplate: (id: string, userId: string, successorId?: string) => boolean;
  createNewVersion: (id: string, versionNumber: string, userId: string) => ClassTemplate | null;
  canEdit: (template: ClassTemplate) => { canEdit: boolean; reason?: string };
  
  // Queries
  getTemplate: (id: string) => ClassTemplate | undefined;
  getTemplatesByOrganization: (org: Organization) => ClassTemplate[];
  getTemplatesByShowType: (type: ShowType) => ClassTemplate[];
  getTemplatesByOrgAndType: (org: Organization, type: ShowType) => ClassTemplate[];
  getOfficialTemplates: () => ClassTemplate[];
  getCustomTemplates: () => ClassTemplate[];
  searchTemplates: (filter: TemplateFilter) => ClassTemplate[];
  setSearchQuery: (query: string) => void;
  setFilterOrganization: (org: Organization | null) => void;
  setFilterShowType: (type: ShowType | null) => void;
  getFilteredTemplates: () => ClassTemplate[];
  clearFilters: () => void;
  
  // Active template management
  setActiveTemplate: (id: string | null) => void;
  clearActiveTemplate: () => void;
  
  // Import/Export
  exportTemplate: (id: string, userId: string) => TemplateImportExport | null;
  importTemplate: (data: TemplateImportExport, userId: string) => ClassTemplate | null;
  
  // Utility
  clearError: () => void;
  resetStore: () => void;
  
  // Initialize with default templates
  initializeDefaultTemplates: (force?: boolean) => void;
  
  // Lazy loading method
  ensureTemplatesLoaded: () => Promise<void>;
  
  // Emergency function to clear corrupted data
  clearCorruptedData: () => Promise<void>;
}

const initialState = {
  templates: [],
  activeTemplate: null,
  isLoading: false,
  error: null,
  searchQuery: '',
  filterOrganization: null,
  filterShowType: null,
  isInitialized: false
};

export const useTemplateStore = create<TemplateStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // CRUD Operations
      createTemplate: (templateData, userId) => {
        const newTemplate: ClassTemplate = {
          ...templateData,
          id: `template-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          createdAt: new Date(),
          createdBy: userId,
          updatedAt: new Date()
        };

        set(state => ({
          templates: [...state.templates, newTemplate],
          error: null
        }));

        return newTemplate;
      },

      updateTemplate: (id, updates, userId) => {
        const template = get().templates.find(t => t.id === id);
        if (!template) {
          set({ error: `Template with id ${id} not found` });
          return false;
        }

        // Check if template can be edited using new flexible system
        const editCheck = get().canEdit(template);
        if (!editCheck.canEdit && !updates.allowEditing) {
          set({ error: editCheck.reason || 'Template cannot be edited' });
          return false;
        }

        set(state => ({
          templates: state.templates.map(t =>
            t.id === id
              ? {
                  ...t,
                  ...updates,
                  updatedAt: new Date(),
                  updatedBy: userId
                }
              : t
          ),
          activeTemplate: state.activeTemplate?.id === id
            ? { ...state.activeTemplate, ...updates, updatedAt: new Date() }
            : state.activeTemplate,
          error: null
        }));

        return true;
      },

      deleteTemplate: (id) => {
        const template = get().templates.find(t => t.id === id);
        if (!template) {
          set({ error: `Template with id ${id} not found` });
          return false;
        }

        // Prevent deleting official templates
        if (template.isOfficial) {
          set({ error: 'Cannot delete official templates' });
          return false;
        }

        set(state => ({
          templates: state.templates.filter(t => t.id !== id),
          activeTemplate: state.activeTemplate?.id === id ? null : state.activeTemplate,
          error: null
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
          id: `template-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          templateName: newName,
          isOfficial: false,
          isCustom: true,
          createdAt: new Date(),
          createdBy: userId,
          updatedAt: new Date()
        };

        set(state => ({
          templates: [...state.templates, duplicatedTemplate],
          error: null
        }));

        return duplicatedTemplate;
      },

      // NEW: Advanced template operations
      createEditableCopy: (id, userId, newName) => {
        const template = get().templates.find(t => t.id === id);
        if (!template) {
          set({ error: `Template with id ${id} not found` });
          return null;
        }

        const copyName = newName || `${template.templateName} (Editable Copy)`;
        const editableCopy: ClassTemplate = {
          ...template,
          id: `template-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          templateName: copyName,
          type: TemplateType.FORK,
          status: TemplateStatus.DRAFT,
          sourceTemplateId: template.id,
          parentVersion: template.version,
          allowEditing: true,
          // Legacy compatibility
          isOfficial: false,
          isCustom: true,
          // Reset audit fields
          createdAt: new Date(),
          createdBy: userId,
          updatedAt: new Date(),
          updatedBy: userId
        };

        set(state => ({
          templates: [...state.templates, editableCopy],
          error: null
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
                  updatedBy: userId
                }
              : t
          ),
          error: null
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
                  updatedBy: userId
                }
              : t
          ),
          error: null
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
          id: `template-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          version: versionNumber,
          status: TemplateStatus.DRAFT,
          sourceTemplateId: template.id,
          parentVersion: template.version,
          isLatestVersion: true,
          createdAt: new Date(),
          createdBy: userId,
          updatedAt: new Date(),
          updatedBy: userId
        };

        // Mark old version as no longer latest
        set(state => ({
          templates: [
            ...state.templates.map(t =>
              t.id === id
                ? { ...t, isLatestVersion: false, successorId: newVersion.id }
                : t
            ),
            newVersion
          ],
          error: null
        }));

        return newVersion;
      },

      canEdit: (template) => {
        // Allow editing if explicitly allowed
        if (template.allowEditing) {
          return { canEdit: true };
        }

        // Allow editing of draft and custom templates
        if (template.status === TemplateStatus.DRAFT || template.type === TemplateType.CUSTOM) {
          return { canEdit: true };
        }

        // Allow editing of fork templates
        if (template.type === TemplateType.FORK) {
          return { canEdit: true };
        }

        // Official templates can be edited but with warning
        if (template.type === TemplateType.OFFICIAL) {
          return { 
            canEdit: true, 
            reason: 'This is an official template. Changes will affect all users of this template.' 
          };
        }

        // Archived templates cannot be edited
        if (template.status === TemplateStatus.ARCHIVED) {
          return { 
            canEdit: false, 
            reason: 'Archived templates cannot be edited. Please create a new version or copy.' 
          };
        }

        // Default to allowing edits
        return { canEdit: true };
      },

      // Queries
      getTemplate: (id) => {
        return get().templates.find(t => t.id === id);
      },

      getTemplatesByOrganization: (org) => {
        return get().templates.filter(t => t.organization === org && t.isActive);
      },

      getTemplatesByShowType: (type) => {
        return get().templates.filter(t => t.showType === type && t.isActive);
      },

      getTemplatesByOrgAndType: (org, type) => {
        return get().templates.filter(t => 
          t.organization === org && 
          t.showType === type && 
          t.isActive
        );
      },

      // Lazy loading method - ensures templates are initialized when needed
      ensureTemplatesLoaded: async () => {
        const { templates, isInitialized } = get();
        
        // If templates are already loaded, return immediately
        if (isInitialized && templates.length > 0) {
          return;
        }

        // Initialize templates asynchronously to avoid blocking
        return new Promise<void>((resolve) => {
          // Use setTimeout to allow React to continue rendering
          setTimeout(() => {
            try {
              get().initializeDefaultTemplates();
              resolve();
            } catch {
              resolve(); // Don't fail completely
            }
          }, 0);
        });
      },

      getOfficialTemplates: () => {
        return get().templates.filter(t => t.isOfficial && t.isActive);
      },

      getCustomTemplates: () => {
        return get().templates.filter(t => t.isCustom && t.isActive);
      },

      searchTemplates: (filter) => {
        const { templates } = get();
        let filtered = templates; // Show all templates, not just active ones

        if (filter.organization) {
          filtered = filtered.filter(t => {
            // Handle enum comparison properly
            const templateOrg = typeof t.organization === 'object' 
              ? String(Object.values(t.organization)[0] || '')
              : String(t.organization || '');
            const filterOrg = String(filter.organization);
            return templateOrg === filterOrg;
          });
        }

        if (filter.showType) {
          filtered = filtered.filter(t => {
            // Handle enum comparison properly
            const templateType = typeof t.showType === 'object'
              ? String(Object.values(t.showType)[0] || '')
              : String(t.showType || '');
            const filterType = String(filter.showType);
            return templateType === filterType;
          });
        }

        if (filter.isActive !== undefined) {
          filtered = filtered.filter(t => t.isActive === filter.isActive);
        }

        if (filter.isOfficial !== undefined) {
          filtered = filtered.filter(t => t.isOfficial === filter.isOfficial);
        }

        if (filter.searchTerm) {
          const term = filter.searchTerm.toLowerCase();
          filtered = filtered.filter(t =>
            t.templateName.toLowerCase().includes(term) ||
            t.description?.toLowerCase().includes(term) ||
            t.organization.toLowerCase().includes(term) ||
            t.showType.toLowerCase().includes(term)
          );
        }

        return filtered;
      },

      // Search and filtering
      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },

      setFilterOrganization: (org) => {
        set({ filterOrganization: org });
      },

      setFilterShowType: (type) => {
        set({ filterShowType: type });
      },

      getFilteredTemplates: () => {
        const { templates, searchQuery, filterOrganization, filterShowType } = get();
        let filtered = templates.filter(t => t.isActive);

        if (filterOrganization) {
          filtered = filtered.filter(t => t.organization === filterOrganization);
        }

        if (filterShowType) {
          filtered = filtered.filter(t => t.showType === filterShowType);
        }

        if (searchQuery) {
          const term = searchQuery.toLowerCase();
          filtered = filtered.filter(t =>
            t.templateName.toLowerCase().includes(term) ||
            t.description?.toLowerCase().includes(term) ||
            t.organization.toLowerCase().includes(term) ||
            t.showType.toLowerCase().includes(term)
          );
        }

        return filtered;
      },

      clearFilters: () => {
        set({
          searchQuery: '',
          filterOrganization: null,
          filterShowType: null
        });
      },

      // Active template management
      setActiveTemplate: (id) => {
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

      clearActiveTemplate: () => {
        set({ activeTemplate: null });
      },

      // Import/Export
      exportTemplate: (id, userId) => {
        const template = get().templates.find(t => t.id === id);
        if (!template) {
          set({ error: `Template with id ${id} not found` });
          return null;
        }

        const { id: _templateId, createdAt: _createdAt, createdBy: _createdBy, ...exportData } = template;
        void _templateId; void _createdAt; void _createdBy; // Suppress unused variable warnings

        return {
          template: exportData,
          exportedAt: new Date(),
          exportedBy: userId,
          exportFormat: '1.0'
        };
      },

      importTemplate: (data, userId) => {
        try {
          // Validate import format
          if (data.exportFormat !== '1.0') {
            set({ error: 'Unsupported template format' });
            return null;
          }

          const importedTemplate: ClassTemplate = {
            ...data.template,
            id: `template-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            isOfficial: false,
            isCustom: true,
            createdAt: new Date(),
            createdBy: userId,
            updatedAt: new Date()
          };

          set(state => ({
            templates: [...state.templates, importedTemplate],
            error: null
          }));

          return importedTemplate;
        } catch {
          set({ error: 'Failed to import template' });
          return null;
        }
      },

      // Utility
      clearError: () => {
        set({ error: null });
      },

      resetStore: () => {
        set(initialState);
      },

      // Initialize with default templates - optimized for performance
      initializeDefaultTemplates: (force = false) => {
        const { templates, isInitialized } = get();
        
        // Quick check to avoid expensive operations
        if (!force && (isInitialized || templates.length > 0)) {
          return;
        }
        
        // Use requestIdleCallback for non-blocking initialization
        const initializeAsync = () => {
          try {
            const templatesToAdd: ClassTemplate[] = [];

            // Only add essential templates to reduce load time
            const currentTemplates = get().templates; // Get fresh state
            const hasAKCTemplate = currentTemplates.some(t => t.id === 'akc-scent-work-official-2024');

            if (force || !hasAKCTemplate) {
              const akcTemplate: ClassTemplate = {
                ...AKC_SCENT_WORK_TEMPLATE,
                id: 'akc-scent-work-official-2024',
                createdAt: new Date(),
                createdBy: 'system'
              };
              templatesToAdd.push(akcTemplate);
            }

            // Defer structured templates to after initial render
            if (templatesToAdd.length > 0) {
              set((state) => {
                // Deduplicate by ID
                const existingIds = new Set(state.templates.map(t => t.id));
                const newTemplates = templatesToAdd.filter(t => !existingIds.has(t.id));

                return {
                  templates: [...state.templates, ...newTemplates],
                  isInitialized: true,
                  error: null
                };
              });
            } else {
              // No templates to add but initialization is complete
              set({ isInitialized: true });
            }
            
            // Load additional templates after a delay
            setTimeout(() => {
              const additionalTemplates: ClassTemplate[] = [];
              const currentTemplates = get().templates; // Get fresh state
              
              STRUCTURED_TEMPLATES.forEach(template => {
                const exists = currentTemplates.some(t => t.id === template.id);

                if (force || !exists) {
                  additionalTemplates.push({
                    ...template,
                    createdAt: template.createdAt || new Date(),
                    createdBy: template.createdBy || 'system',
                    updatedAt: new Date()
                  });
                }
              });
              
              if (additionalTemplates.length > 0) {
                set((state) => {
                  // Deduplicate by ID
                  const existingIds = new Set(state.templates.map(t => t.id));
                  const newTemplates = additionalTemplates.filter(t => !existingIds.has(t.id));

                  return {
                    templates: [...state.templates, ...newTemplates],
                    error: null
                  };
                });
              }
            }, 1000);
            
          } catch (error) {
            logger.error('Error initializing templates:', 'store', {}, error as Error);
            set({ error: `Failed to initialize templates: ${error instanceof Error ? error.message : 'Unknown error'}` });
          }
        };
        
        // Use requestIdleCallback if available, otherwise setTimeout
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          (window as Window & { requestIdleCallback: (callback: () => void) => void }).requestIdleCallback(initializeAsync);
        } else {
          setTimeout(initializeAsync, 0);
        }
      },
      
      // Emergency function to clear corrupted data
      clearCorruptedData: async () => {
        set({ templates: [], isInitialized: false });

        // Clear both localStorage and IndexedDB
        const storageName = 'myk9show-template-storage';

        // Clear localStorage
        localStorage.removeItem(storageName);

        // Clear IndexedDB
        try {
          const storage = getOptimalStorage('templates');
          await storage.removeItem(storageName);
        } catch {
          // Failed to clear IndexedDB silently
        }
      }
    }),
    {
      name: 'myk9show-template-storage',
      storage: createJSONStorage(() => getOptimalStorage('templates')),
      version: 1,
      // Only persist templates and initialization flag, not UI state
      partialize: (state) => ({
        templates: state.templates,
        isInitialized: state.isInitialized
      }),
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for templates
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            if (state.templates && Array.isArray(state.templates)) {
              // Ensure all templates have proper relationships and new fields
              state.templates = state.templates.map((template: unknown) => {
                const t = template as Record<string, unknown>;
                return {
                  ...t,
                  // Add any data transformations needed for relationships
                  status: t.status || 'active',
                  type: t.type || (t.isOfficial ? 'official' : 'custom'),
                  isLatestVersion: t.isLatestVersion !== false,
                  allowEditing: t.allowEditing || !t.isOfficial
                };
              });
            }
          }
        }
        return persistedState;
      },
      onRehydrateStorage: () => {
        return (_state, _error) => {
          // PERFORMANCE OPTIMIZATION: Skip automatic template initialization
          // Templates will be loaded on-demand when template features are accessed
        };
      }
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