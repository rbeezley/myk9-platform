import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import {
  ClassTemplate,
  ClassDefinition,
  ClassSelectionItem,
  CreatedClass,
  ClassStatus
} from '@/types/template.types';
// Lazy import to avoid circular dependency - imported at runtime, not module load time
// eslint-disable-next-line @typescript-eslint/no-require-imports
const getTemplateStore = () => require('./templateStore').useTemplateStore;

interface ClassCreationStore {
  // Selection state
  selectedTemplateId: string | null;
  selectedTemplate: ClassTemplate | null;
  selectedClasses: ClassSelectionItem[];
  fieldOverrides: Record<string, unknown>; // fieldName -> value
  
  // UI state
  currentStep: number;
  validationErrors: Record<string, string[]>; // classKey -> errors
  createdClasses: CreatedClass[];
  trialId: string | null;
  
  // Actions
  selectTemplate: (templateId: string) => void;
  setTemplateData: (template: ClassTemplate) => void;
  clearTemplateSelection: () => void;
  toggleClassSelection: (className: string) => void;
  toggleClass: (classDefinition: Record<string, unknown>) => void;
  selectAllClasses: () => void;
  deselectAllClasses: () => void;
  updateFieldOverride: (fieldName: string, value: unknown) => void;
  updateBulkFieldOverride: (fieldName: string, value: unknown) => void;
  updateFieldOverrides: (overrides: Record<string, unknown>) => void;
  resetFieldOverride: (fieldName: string) => void;
  
  // Validation
  validateSelections: () => boolean;
  validateSelection: () => { isValid: boolean; errors: string[] };
  getFieldValue: (className: string, fieldName: string) => unknown;
  
  // Class creation
  createClasses: (trialId: string, userId: string) => { success: boolean; classes: CreatedClass[]; errors: string[] };
  getClassesByTrial: (trialId: string) => CreatedClass[];
  updateClassRunOrder: (classId: string, runOrder: number) => void;
  updateClassTime: (classId: string, time: Date) => void;
  updateClassJudge: (classId: string, judgeId: string) => void;
  updateClassStatus: (classId: string, status: ClassStatus) => void;
  deleteClass: (classId: string) => void;
  
  // Element and level filtering
  getAvailableElements: () => string[];
  getAvailableLevels: () => string[];
  
  // Step management
  nextStep: () => void;
  previousStep: () => void;
  setStep: (step: number) => void;
  resetSteps: () => void;
  
  // Reset
  resetCreation: () => void;
  resetWorkflow: () => void;
  setCurrentStep: (step: number) => void;
}

export const useClassCreationStore = create<ClassCreationStore>()(
  persist(
    (set, get) => ({
  // Initial state
  selectedTemplateId: null,
  selectedTemplate: null,
  selectedClasses: [],
  fieldOverrides: {},
  currentStep: 1,
  validationErrors: {},
  createdClasses: [],
  trialId: null,

  // Select template and initialize class list
  selectTemplate: (templateId) => {
    // Use lazy import to avoid circular dependency at module load time
    const templateStore = getTemplateStore();
    const template = templateStore.getState().getTemplate(templateId);

    if (!template) {
      set({ selectedTemplateId: templateId, selectedTemplate: null });
      return;
    }

    // Initialize selection items for all classes
    const selectionItems: ClassSelectionItem[] = template.classDefinitions.map((classDef: ClassDefinition) => ({
      classDefinition: classDef,
      selected: false,
      fieldOverrides: {},
      validationErrors: []
    }));

    set({
      selectedTemplateId: templateId,
      selectedTemplate: template,
      selectedClasses: selectionItems,
      fieldOverrides: {},
      validationErrors: {},
      currentStep: 1
    });
  },

  // New method to set template data (called by components)
  setTemplateData: (template: ClassTemplate) => {

    // Initialize selection items for all classes
    const selectionItems: ClassSelectionItem[] = template.classDefinitions.map((classDef: ClassDefinition) => ({
      classDefinition: classDef,
      selected: false,
      fieldOverrides: {},
      validationErrors: []
    }));

    set(state => ({
      ...state,
      selectedTemplate: template,
      selectedClasses: selectionItems,
      fieldOverrides: {},
      validationErrors: {},
      currentStep: 1
    }));
  },

  // Toggle individual class selection
  toggleClassSelection: (className) => {
    set(state => ({
      selectedClasses: state.selectedClasses.map(item =>
        item.classDefinition.className === className
          ? { ...item, selected: !item.selected }
          : item
      )
    }));
  },

  // Select all classes
  selectAllClasses: () => {
    set(state => ({
      selectedClasses: state.selectedClasses.map(item => ({
        ...item,
        selected: true
      }))
    }));
  },

  // Deselect all classes
  deselectAllClasses: () => {
    set(state => ({
      selectedClasses: state.selectedClasses.map(item => ({
        ...item,
        selected: false
      }))
    }));
  },

  // Update field override for specific field
  updateFieldOverride: (fieldName, value) => {
    set(state => ({
      fieldOverrides: {
        ...state.fieldOverrides,
        [fieldName]: value
      }
    }));
  },

  // Clear a field override
  resetFieldOverride: (fieldName) => {
    set(state => {
      const newOverrides = { ...state.fieldOverrides };
      delete newOverrides[fieldName];
      return { fieldOverrides: newOverrides };
    });
  },

  // Update multiple field overrides at once
  updateFieldOverrides: (overrides) => {
    set(state => ({
      fieldOverrides: {
        ...state.fieldOverrides,
        ...overrides
      }
    }));
  },

  // Update field override for all selected classes
  updateBulkFieldOverride: (fieldName, value) => {
    // Since we've changed the structure to store field overrides directly by field name,
    // this method now simply calls updateFieldOverride
    get().updateFieldOverride(fieldName, value);
  },

  // Validate all selections
  validateSelections: () => {
    const { selectedTemplate, selectedClasses } = get();
    if (!selectedTemplate) return false;

    const errors: Record<string, string[]> = {};
    let isValid = true;

    selectedClasses
      .filter(item => item.selected)
      .forEach(item => {
        const classErrors: string[] = [];

        // Validate required fields
        selectedTemplate.fieldSpecifications
          .filter(field => field.required)
          .forEach(field => {
            const value = get().getFieldValue(item.classDefinition.className, field.fieldName);
            if (value === undefined || value === null || value === '') {
              classErrors.push(`${field.fieldName} is required`);
            }
          });

        // Validate field-specific rules
        selectedTemplate.fieldSpecifications.forEach(field => {
          const value = get().getFieldValue(item.classDefinition.className, field.fieldName);
          if (value !== undefined && value !== null && value !== '') {
            // Numeric validation
            if (field.dataType === 'number') {
              const numValue = Number(value);
              if (isNaN(numValue)) {
                classErrors.push(`${field.fieldName} must be a number`);
              } else {
                if (field.allowedRange?.min !== undefined && numValue < Number(field.allowedRange.min)) {
                  classErrors.push(`${field.fieldName} must be at least ${field.allowedRange.min}`);
                }
                if (field.allowedRange?.max !== undefined && numValue > Number(field.allowedRange.max)) {
                  classErrors.push(`${field.fieldName} must be at most ${field.allowedRange.max}`);
                }
              }
            }
            
            // String length validation
            if (field.dataType === 'text' || field.dataType === 'rich-text') {
              const strValue = String(value);
              const minLength = field.allowedRange?.min !== undefined ? Number(field.allowedRange.min) : undefined;
              const maxLength = field.allowedRange?.max !== undefined ? Number(field.allowedRange.max) : undefined;
              
              if (minLength !== undefined && strValue.length < minLength) {
                classErrors.push(`${field.fieldName} must be at least ${minLength} characters`);
              }
              if (maxLength !== undefined && strValue.length > maxLength) {
                classErrors.push(`${field.fieldName} must be at most ${maxLength} characters`);
              }
            }
          }
        });

        if (classErrors.length > 0) {
          errors[item.classDefinition.className] = classErrors;
          isValid = false;
        }
      });

    set({ validationErrors: errors });
    return isValid;
  },

  // Validate selection with detailed return value
  validateSelection: () => {
    const { selectedTemplate, selectedClasses } = get();
    if (!selectedTemplate) return { isValid: false, errors: ['No template selected'] };

    const errors: string[] = [];
    const selectedItems = selectedClasses.filter(item => item.selected);
    
    if (selectedItems.length === 0) {
      errors.push('No classes selected');
      return { isValid: false, errors };
    }

    // Check for any validation errors in the store
    const { validationErrors } = get();
    const hasErrors = Object.values(validationErrors).some(errs => errs.length > 0);
    
    if (hasErrors) {
      // Flatten all validation errors into a single array
      Object.values(validationErrors).forEach(errs => {
        errors.push(...errs);
      });
    }

    return { isValid: errors.length === 0, errors };
  },

  // Get field value with overrides and defaults
  getFieldValue: (className: string, fieldName: string) => {
    const { selectedTemplate, fieldOverrides } = get();
    if (!selectedTemplate) return undefined;

    // Check for bulk field override first (applies to all classes)
    if (fieldOverrides[fieldName] !== undefined) {
      return fieldOverrides[fieldName];
    }
    
    // Check for class-specific user override
    const classOverrides = fieldOverrides[className] as Record<string, unknown> | undefined;
    if (classOverrides?.[fieldName] !== undefined) {
      return classOverrides[fieldName];
    }

    // Find the class definition
    const classDef = selectedTemplate.classDefinitions.find(
      c => c.className === className
    );
    if (!classDef) return undefined;

    // Check for class-specific override
    if (classDef.fieldOverrides?.[fieldName]?.ruleValue !== undefined) {
      return classDef.fieldOverrides[fieldName].ruleValue;
    }
    if (classDef.fieldOverrides?.[fieldName]?.defaultValue !== undefined) {
      return classDef.fieldOverrides[fieldName].defaultValue;
    }

    // Get field specification
    const fieldSpec = selectedTemplate.fieldSpecifications.find(
      f => f.fieldName === fieldName
    );
    if (!fieldSpec) return undefined;

    // Return rule value or default value
    return fieldSpec.ruleValue !== undefined ? fieldSpec.ruleValue : fieldSpec.defaultValue;
  },

  // Create classes from selections
  createClasses: (trialId, userId) => {
    const { selectedTemplate, selectedClasses } = get();
    if (!selectedTemplate) return { success: false, classes: [], errors: ['No template selected'] };

    const createdClasses: CreatedClass[] = [];
    const errors: string[] = [];
    let runOrder = 1;

    const selectedItems = selectedClasses.filter(item => item.selected);
    if (selectedItems.length === 0) {
      return { success: false, classes: [], errors: ['No classes selected'] };
    }

    selectedItems.forEach(item => {
      const classDef = item.classDefinition;
      const className = classDef.className;

      // Gather all field values
      const fieldValues: Record<string, unknown> = {};
      selectedTemplate.fieldSpecifications.forEach(field => {
        const value = get().getFieldValue(className, field.fieldName);
        if (value !== undefined) {
          fieldValues[field.fieldName] = value;
        }
      });

      // Create the class
      const createdClass: CreatedClass = {
        id: `class-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        templateId: selectedTemplate.id,
        templateVersion: selectedTemplate.version,
        trialId,
        
        // Identity
        organization: selectedTemplate.organization,
        showType: selectedTemplate.showType,
        element: classDef.element,
        level: classDef.level,
        section: classDef.section,
        className: classDef.className,
        classNumber: classDef.classNumber || runOrder.toString().padStart(3, '0'),
        
        // Status
        status: 'Scheduled' as const,
        runOrder: Number(fieldValues.runOrder) || runOrder,
        
        // Field values (convert to proper types)
        fieldValues: Object.fromEntries(
          Object.entries(fieldValues).map(([k, v]) => [
            k, 
            typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || Array.isArray(v) || v instanceof Date 
              ? v 
              : String(v)
          ])
        ) as Record<string, string | number | boolean | string[] | Date>,
        
        // Personnel (extract from field values)
        personnel: {
          judgeName: String(fieldValues.judgeName || ''),
          stewards: {
            gate: String(fieldValues.gateSteward || ''),
            table: String(fieldValues.tableSteward || ''),
            timer: String(fieldValues.timerSteward || ''),
            ring: [
              String(fieldValues.ringSteward1 || ''),
              String(fieldValues.ringSteward2 || ''),
              String(fieldValues.ringSteward3 || '')
            ].filter(Boolean)
          }
        },
        
        // Entries
        entries: {
          maxEntries: Number(fieldValues.maxEntries) || 40,
          currentEntries: 0,
          waitlistEntries: 0
        },
        
        // Audit
        createdBy: userId,
        createdAt: new Date()
      };

      createdClasses.push(createdClass);
      runOrder++;
    });

    // Store created classes
    set(state => ({
      createdClasses: [...state.createdClasses, ...createdClasses],
      trialId
    }));

    // Reset creation state
    get().resetCreation();
    
    return { 
      success: true, 
      classes: createdClasses, 
      errors: errors 
    };
  },

  // Clear template selection
  clearTemplateSelection: () => {
    set({
      selectedTemplateId: null,
      selectedTemplate: null,
      selectedClasses: [],
      fieldOverrides: {},
      validationErrors: {}
    });
  },

  // Toggle class by class definition
  toggleClass: (classDefinition) => {
    set(state => {
      const className = classDefinition.className;
      return {
        selectedClasses: state.selectedClasses.map(item =>
          item.classDefinition.className === className
            ? { ...item, selected: !item.selected }
            : item
        )
      };
    });
  },

  // Get classes by trial ID
  getClassesByTrial: (trialId) => {
    return get().createdClasses.filter(cls => cls.trialId === trialId);
  },

  // Update class run order
  updateClassRunOrder: (classId, runOrder) => {
    set(state => ({
      createdClasses: state.createdClasses.map(cls =>
        cls.id === classId ? { ...cls, runOrder } : cls
      )
    }));
  },

  // Update class time
  updateClassTime: (classId, time) => {
    set(state => ({
      createdClasses: state.createdClasses.map(cls =>
        cls.id === classId ? { ...cls, plannedStartTime: time } : cls
      )
    }));
  },

  // Update class judge
  updateClassJudge: (classId, judgeId) => {
    set(state => ({
      createdClasses: state.createdClasses.map(cls =>
        cls.id === classId ? { ...cls, personnel: { ...cls.personnel, judgeId } } : cls
      )
    }));
  },

  // Update class status
  updateClassStatus: (classId, status) => {
    set(state => ({
      createdClasses: state.createdClasses.map(cls =>
        cls.id === classId ? { ...cls, status } : cls
      )
    }));
  },

  // Delete class
  deleteClass: (classId) => {
    set(state => ({
      createdClasses: state.createdClasses.filter(cls => cls.id !== classId)
    }));
  },

  // Get available elements
  getAvailableElements: () => {
    const { selectedTemplate } = get();
    if (!selectedTemplate) return [];
    
    return Array.from(new Set(
      selectedTemplate.classDefinitions.map(cls => cls.element)
    ));
  },

  // Get available levels
  getAvailableLevels: () => {
    const { selectedTemplate } = get();
    if (!selectedTemplate) return [];
    
    return Array.from(new Set(
      selectedTemplate.classDefinitions
        .map(cls => cls.level)
        .filter(Boolean) as string[]
    ));
  },

  // Step management
  nextStep: () => {
    set(state => ({
      currentStep: Math.min(state.currentStep + 1, 4) // Assuming max 4 steps
    }));
  },

  previousStep: () => {
    set(state => ({
      currentStep: Math.max(state.currentStep - 1, 1)
    }));
  },

  setStep: (step) => {
    set({ currentStep: Math.max(1, Math.min(step, 4)) });
  },

  resetSteps: () => {
    set({ currentStep: 1 });
  },

  // Reset entire workflow
  resetWorkflow: () => {
    set({
      selectedTemplateId: null,
      selectedTemplate: null,
      selectedClasses: [],
      fieldOverrides: {},
      currentStep: 1,
      validationErrors: {},
      trialId: null
    });
  },

  // Reset creation state
  resetCreation: () => {
    set({
      selectedTemplateId: null,
      selectedTemplate: null,
      selectedClasses: [],
      fieldOverrides: {},
      currentStep: 1,
      validationErrors: {}
    });
  },

  // Set current step
  setCurrentStep: (step) => {
    set({ currentStep: step });
  }
    }),
    {
      name: 'class-creation-storage',
      storage: createJSONStorage(() => getOptimalStorage('classCreation')),
      partialize: (state) => ({
        createdClasses: state.createdClasses,
        // Don't persist UI state like selectedTemplate, currentStep, etc.
      }),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for class creation
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            if (state.createdClasses && Array.isArray(state.createdClasses)) {
              // Ensure all created classes have proper relationships
              state.createdClasses = state.createdClasses.map((createdClass: unknown) => {
                const cc = createdClass as Record<string, unknown>;
                return {
                  ...cc,
                  // Add any data transformations needed for relationships
                  status: cc.status || 'Pending',
                  entries: cc.entries || {
                    maxEntries: 40,
                    currentEntries: 0,
                    waitlistEntries: 0
                  },
                  personnel: cc.personnel || {
                    judgeName: '',
                    stewards: {
                      gate: '',
                      table: '',
                      timer: '',
                      ring: []
                    }
                  }
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