import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import {
  ShowTemplateDefinition,
  ShowFieldDefinition,
  SHOW_TEMPLATE_PRESETS,
  UKC_TEMPLATE_PRESETS,
  Organization,
  TrialType,
} from '@/types/show-template-types';
import { GeneratedClass } from '@/types/class-template-types';
import { generateAKCScentWorkClasses } from '@/types/akc-scent-work-generator';

interface ShowTemplateStore {
  templates: ShowTemplateDefinition[];

  // Template CRUD
  addTemplate: (
    template: Omit<ShowTemplateDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ) => ShowTemplateDefinition;
  updateTemplate: (id: string, updates: Partial<ShowTemplateDefinition>) => void;
  deleteTemplate: (id: string) => void;
  getTemplate: (id: string) => ShowTemplateDefinition | undefined;

  // Template queries
  getTemplatesByOrganization: (organization: Organization) => ShowTemplateDefinition[];
  getTemplatesByTrialType: (trialType: TrialType) => ShowTemplateDefinition[];
  searchTemplates: (query: string) => ShowTemplateDefinition[];

  // Preset management
  getAllPresets: () => Record<
    string,
    Omit<ShowTemplateDefinition, 'id' | 'createdAt' | 'updatedAt'>
  >;
  getPresetsByOrganization: (
    organization: Organization
  ) => Record<string, Omit<ShowTemplateDefinition, 'id' | 'createdAt' | 'updatedAt'>>;

  // Class generation
  generateClassesFromTemplate: (
    templateId: string,
    customValues?: Record<string, unknown>
  ) => GeneratedClass[];
  generateClassesFromPreset: (
    presetKey: string,
    customValues?: Record<string, unknown>
  ) => GeneratedClass[];

  // Field combinations
  getValidFieldCombinations: (template: ShowTemplateDefinition) => Array<Record<string, unknown>>;
  validateFieldCombination: (
    template: ShowTemplateDefinition,
    values: Record<string, unknown>
  ) => { valid: boolean; errors: string[] };
}

export const useShowTemplateStore = create<ShowTemplateStore>()(
  persist(
    (set, get) => ({
      templates: [],

      addTemplate: templateData => {
        const template: ShowTemplateDefinition = {
          ...templateData,
          id: `template-${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        set(state => ({
          templates: [...state.templates, template],
        }));

        return template;
      },

      updateTemplate: (id, updates) => {
        set(state => ({
          templates: state.templates.map(template =>
            template.id === id ? { ...template, ...updates, updatedAt: new Date() } : template
          ),
        }));
      },

      deleteTemplate: id => {
        set(state => ({
          templates: state.templates.filter(template => template.id !== id),
        }));
      },

      getTemplate: id => {
        return get().templates.find(template => template.id === id);
      },

      getTemplatesByOrganization: organization => {
        return get().templates.filter(template => template.organization === organization);
      },

      getTemplatesByTrialType: trialType => {
        return get().templates.filter(template => template.trialType === trialType);
      },

      searchTemplates: query => {
        const lowerQuery = query.toLowerCase();
        return get().templates.filter(
          template =>
            template.name.toLowerCase().includes(lowerQuery) ||
            template.organization.toLowerCase().includes(lowerQuery) ||
            template.trialType.toLowerCase().includes(lowerQuery) ||
            template.description?.toLowerCase().includes(lowerQuery)
        );
      },

      getAllPresets: () => {
        return {
          ...SHOW_TEMPLATE_PRESETS,
          ...UKC_TEMPLATE_PRESETS,
        };
      },

      getPresetsByOrganization: organization => {
        const allPresets = get().getAllPresets();
        const filtered: Record<
          string,
          Omit<ShowTemplateDefinition, 'id' | 'createdAt' | 'updatedAt'>
        > = {};

        Object.entries(allPresets).forEach(([key, preset]) => {
          if (preset.organization === organization) {
            filtered[key] = preset;
          }
        });

        return filtered;
      },

      generateClassesFromTemplate: (templateId, customValues = {}) => {
        const template = get().getTemplate(templateId);
        if (!template) return [];

        // Generate classes based on template field combinations
        const combinations = get().getValidFieldCombinations(template);
        return combinations.map(
          (combo, index): GeneratedClass => ({
            className: `${combo.element || ''} ${combo.level || ''} ${combo.section || ''}`.trim(),
            classNumber: `${index + 1}`,
            element: String(combo.element || ''),
            level: String(combo.level || ''),
            section: String(combo.section || ''),
            maxEntries: Number(customValues.maxEntries) || 100,
            ...customValues,
          })
        );
      },

      generateClassesFromPreset: (presetKey, customValues = {}) => {
        const allPresets = get().getAllPresets();
        const preset = allPresets[presetKey];
        if (!preset) return [];

        // Use official AKC Scent Work generator if available
        if (presetKey === 'akc-scent-work') {
          return generateAKCScentWorkClasses();
        }

        const templateDef: ShowTemplateDefinition = {
          ...preset,
          id: presetKey,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        return get().generateClassesFromTemplate(templateDef.id, customValues);
      },

      // Helper method to generate classes from template definition
      generateClassesFromTemplateDefinition: (
        template: ShowTemplateDefinition,
        customValues: Record<string, unknown> = {}
      ) => {
        const combinations = get().getValidFieldCombinations(template);
        const classes: GeneratedClass[] = [];

        combinations.forEach((combo, index) => {
          // Merge template defaults with field combination and custom values
          const finalValues = {
            ...combo,
            ...customValues,
          };

          // Generate class name using pattern
          let className = template.classNamePattern;
          Object.entries(finalValues).forEach(([key, value]) => {
            if (value) {
              className = className.replace(`{${key}}`, String(value));
            }
          });

          // Clean up any remaining placeholders or extra spaces
          className = className
            .replace(/\{[^}]+\}/g, '') // Remove unused placeholders
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();

          // Skip if className is empty or just whitespace
          if (!className) return;

          classes.push({
            className,
            classNumber: (index + 1).toString().padStart(2, '0'),
            maxEntries: template.defaults.maxEntries,
            requiresJumpHeight: template.defaults.requiresJumpHeight,
            customFields: Object.fromEntries(
              Object.entries(finalValues).map(([k, v]) => [k, String(v)])
            ),
            // Map common fields
            element: String(finalValues.element || ''),
            level: String(finalValues.level || ''),
            section: String(finalValues.division || finalValues.section || ''),
          });
        });

        return classes;
      },

      getValidFieldCombinations: template => {
        const combinations: Array<Record<string, unknown>> = [];

        // Get all required and optional fields
        const requiredFields = template.classFields.filter(f => f.required);
        const optionalFields = template.classFields.filter(f => !f.required);

        // Generate all valid combinations
        const generateCombinations = (
          currentCombo: Record<string, unknown>,
          remainingFields: ShowFieldDefinition[]
        ) => {
          if (remainingFields.length === 0) {
            // Check if this combination is valid
            const validation = get().validateFieldCombination(template, currentCombo);
            if (validation.valid) {
              combinations.push({ ...currentCombo });
            }
            return;
          }

          const field = remainingFields[0];
          const restFields = remainingFields.slice(1);

          // Check if this field should be shown
          if (field.showWhen) {
            const { field: dependentField, value: dependentValue } = field.showWhen;
            const currentValue = currentCombo[dependentField];

            // If dependent field doesn't match, skip this field
            if (Array.isArray(dependentValue)) {
              if (!dependentValue.includes(currentValue as string)) {
                generateCombinations(currentCombo, restFields);
                return;
              }
            } else if (currentValue !== dependentValue) {
              generateCombinations(currentCombo, restFields);
              return;
            }
          }

          if (field.type === 'select' && field.options) {
            // Try each option
            field.options.forEach(option => {
              generateCombinations({ ...currentCombo, [field.name]: option }, restFields);
            });
          } else {
            // For non-select fields, use default value or skip
            const defaultValue = field.defaultValue || '';
            generateCombinations({ ...currentCombo, [field.name]: defaultValue }, restFields);
          }

          // Also try without this field if it's optional
          if (!field.required) {
            generateCombinations(currentCombo, restFields);
          }
        };

        generateCombinations({}, [...requiredFields, ...optionalFields]);

        return combinations;
      },

      validateFieldCombination: (template, values) => {
        const errors: string[] = [];

        // Check required fields
        template.classFields.forEach(field => {
          if (field.required && !values[field.name]) {
            errors.push(`${field.name} is required`);
          }
        });

        // Check prohibited combinations
        if (template.validation?.prohibitedCombinations) {
          template.validation.prohibitedCombinations.forEach(prohibition => {
            const fieldValue = values[prohibition.field];
            if (prohibition.values.includes(fieldValue as string)) {
              errors.push(prohibition.message);
            }
          });
        }

        return {
          valid: errors.length === 0,
          errors,
        };
      },
    }),
    {
      name: 'show-template-storage',
      storage: createJSONStorage(() => getOptimalStorage('showTemplates')),
      partialize: state => ({
        templates: state.templates,
      }),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for show templates
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            if (state.templates && Array.isArray(state.templates)) {
              // Ensure all templates have proper relationships
              state.templates = state.templates.map((template: unknown) => {
                const t = template as Record<string, unknown>;
                return {
                  ...t,
                  // Add any data transformations needed for relationships
                  updatedAt: t.updatedAt || t.createdAt || new Date(),
                  classFields: t.classFields || [],
                  defaults: t.defaults || {
                    entryFee: 30,
                    maxEntries: 100,
                    requiresJumpHeight: false,
                  },
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
