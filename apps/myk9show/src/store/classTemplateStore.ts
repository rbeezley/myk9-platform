import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { ClassTemplate, ClassTemplatePreset, GeneratedClass, CLASS_TEMPLATE_PRESETS } from '@/types/class-template-types';

interface ClassTemplateStore {
  templates: ClassTemplate[];
  
  // Actions
  addTemplate: (template: Omit<ClassTemplate, 'id' | 'createdAt' | 'updatedAt'>) => ClassTemplate;
  updateTemplate: (id: string, updates: Partial<ClassTemplate>) => void;
  deleteTemplate: (id: string) => void;
  getTemplate: (id: string) => ClassTemplate | undefined;
  getTemplatesByOrganization: (organization: string) => ClassTemplate[];
  getTemplatesByShowType: (showType: string) => ClassTemplate[];
  
  // Preset management
  getPresets: () => Record<string, ClassTemplatePreset>;
  generateClassesFromPreset: (presetKey: string) => GeneratedClass[];
  generateClassesFromTemplate: (templateId: string) => GeneratedClass[];
  
  // Bulk operations
  createClassesFromTemplate: (templateId: string, trialId: string) => Promise<GeneratedClass[]>;
  createClassesFromPreset: (presetKey: string, trialId: string) => Promise<GeneratedClass[]>;
}

interface LegacyTemplate {
  id?: string;
  name?: string;
  organization?: string;
  showType?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  fields?: unknown[];
  entryFeeDefault?: number;
  maxEntriesDefault?: number;
  [key: string]: unknown;
}

interface LegacyStoreState {
  templates?: LegacyTemplate[];
  [key: string]: unknown;
}

export const useClassTemplateStore = create<ClassTemplateStore>()(
  persist(
    (set, get) => ({
      templates: [],

      addTemplate: (templateData) => {
        const template: ClassTemplate = {
          ...templateData,
          id: `template-${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        set(state => ({
          templates: [...state.templates, template]
        }));
        
        return template;
      },

      updateTemplate: (id, updates) => {
        set(state => ({
          templates: state.templates.map(template =>
            template.id === id
              ? { ...template, ...updates, updatedAt: new Date() }
              : template
          )
        }));
      },

      deleteTemplate: (id) => {
        set(state => ({
          templates: state.templates.filter(template => template.id !== id)
        }));
      },

      getTemplate: (id) => {
        return get().templates.find(template => template.id === id);
      },

      getTemplatesByOrganization: (organization) => {
        return get().templates.filter(template => template.organization === organization);
      },

      getTemplatesByShowType: (showType) => {
        return get().templates.filter(template => template.showType === showType);
      },

      getPresets: () => {
        return CLASS_TEMPLATE_PRESETS;
      },

      generateClassesFromPreset: (presetKey) => {
        const preset = CLASS_TEMPLATE_PRESETS[presetKey];
        if (!preset) return [];
        return preset.generateClasses();
      },

      generateClassesFromTemplate: (templateId) => {
        const template = get().getTemplate(templateId);
        if (!template) return [];
        
        // Generate classes based on template pattern
        const classes: GeneratedClass[] = [];
        const { fields, entryFeeDefault, maxEntriesDefault, requiresJumpHeight } = template;
        
        // This is a simplified implementation - in practice, you'd want more sophisticated pattern matching
        // For now, we'll use the preset logic if it matches a known pattern
        const matchingPreset = Object.values(CLASS_TEMPLATE_PRESETS).find(
          preset => preset.template.name === template.name && preset.template.organization === template.organization
        );
        
        if (matchingPreset) {
          return matchingPreset.generateClasses();
        }
        
        // Fallback: generate basic classes from field combinations
        if (fields.length > 0) {
          const firstField = fields[0];
          firstField.values.forEach(value => {
            classes.push({
              className: value,
              entryFee: entryFeeDefault,
              maxEntries: maxEntriesDefault,
              requiresJumpHeight
            });
          });
        }
        
        return classes;
      },

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      createClassesFromTemplate: async (templateId, _trialId) => {
        const generatedClasses = get().generateClassesFromTemplate(templateId);
        
        // Note: Since this is in a Zustand store, we can't use React hooks
        // This method should be deprecated in favor of component-level logic
        return generatedClasses;
      },

      createClassesFromPreset: async (presetKey, _trialId) => {
        const generatedClasses = get().generateClassesFromPreset(presetKey);

        // Note: Since this is in a Zustand store, we can't use React hooks
        // This method should be deprecated in favor of component-level logic
        
        return generatedClasses;
      }
    }),
    {
      name: 'class-template-storage',
      storage: createJSONStorage(() => getOptimalStorage('classTemplates')),
      partialize: (state) => ({
        templates: state.templates,
      }),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for class templates
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as LegacyStoreState;
            if (state.templates && Array.isArray(state.templates)) {
              // Ensure all templates have proper relationships
              state.templates = state.templates.map((template: LegacyTemplate) => {
                return {
                  ...template,
                  // Add any data transformations needed for relationships
                  updatedAt: template.updatedAt || template.createdAt || new Date(),
                  fields: template.fields || [],
                  entryFeeDefault: template.entryFeeDefault || 0,
                  maxEntriesDefault: template.maxEntriesDefault || 100
                };
              });
            }
          }
        }
        return persistedState;
      },
    }
  )
);