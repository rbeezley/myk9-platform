import { ClassTemplate, ClassDefinition, CreatedClass } from '@/types/template.types';
import { generateClassName } from './templateValidation';

export interface ClassGenerationOptions {
  trialId: string;
  selectedClasses: ClassDefinition[];
  fieldOverrides: Record<string, unknown>;
  runOrderStart?: number;
  createdBy: string;
}

export interface ClassGenerationResult {
  success: boolean;
  classes: CreatedClass[];
  errors: string[];
  warnings: string[];
}

/**
 * Generates created classes from a template and options
 */
export const generateClassesFromTemplate = (
  template: ClassTemplate,
  options: ClassGenerationOptions
): ClassGenerationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const classes: CreatedClass[] = [];

  if (!template) {
    errors.push('Template is required');
    return { success: false, classes: [], errors, warnings };
  }

  if (!options.selectedClasses || options.selectedClasses.length === 0) {
    errors.push('At least one class must be selected');
    return { success: false, classes: [], errors, warnings };
  }

  options.selectedClasses.forEach((classDef, index) => {
    try {
      const createdClass = generateSingleClass(
        template,
        classDef,
        options,
        (options.runOrderStart || 1) + index
      );
      classes.push(createdClass);
    } catch (error) {
      errors.push(`Failed to generate class ${classDef.element} ${classDef.level}: ${error}`);
    }
  });

  return {
    success: errors.length === 0,
    classes,
    errors,
    warnings
  };
};

/**
 * Generates a single created class from a class definition
 */
const generateSingleClass = (
  template: ClassTemplate,
  classDef: ClassDefinition,
  options: ClassGenerationOptions,
  runOrder: number
): CreatedClass => {
  const className = generateClassName(classDef);
  const classNumber = generateClassNumber(classDef, runOrder);
  
  // Merge field values from template, defaults, and overrides
  const fieldValues = mergeFieldValues(classDef, options.fieldOverrides, template);

  const createdClass: CreatedClass = {
    id: `class-${Date.now()}-${runOrder}`,
    templateId: template.id,
    templateVersion: template.version,
    trialId: options.trialId,
    organization: template.organization,
    showType: template.showType,
    className,
    classNumber,
    element: classDef.element,
    level: classDef.level,
    section: classDef.section,
    status: 'Pending',
    runOrder,
    
    // Field values  
    fieldValues,
    
    // Personnel
    personnel: {
      stewards: {}
    },
    
    // Entry tracking
    entries: {
      maxEntries: (fieldValues.maxEntries as number) || 30,
      currentEntries: 0,
      waitlistEntries: 0
    },
    
    // Audit trail
    createdBy: options.createdBy,
    createdAt: new Date()
  };

  return createdClass;
};

/**
 * Merges field values from multiple sources
 */
const mergeFieldValues = (
  classDef: ClassDefinition,
  overrides: Record<string, unknown>,
  template: ClassTemplate
): Record<string, string | number | boolean | Date | string[]> => {
  const values: Record<string, string | number | boolean | Date | string[]> = {};

  // Start with template defaults
  if (template.defaults) {
    Object.assign(values, template.defaults);
  }

  // Apply field specification defaults
  template.fieldSpecifications.forEach(spec => {
    if (spec.defaultValue !== undefined) {
      values[spec.fieldName] = spec.defaultValue;
    }
  });

  // Apply class-specific field overrides from definition
  if (classDef.fieldOverrides) {
    Object.entries(classDef.fieldOverrides).forEach(([fieldName, fieldOverride]) => {
      if (fieldOverride.defaultValue !== undefined) {
        values[fieldName] = fieldOverride.defaultValue;
      }
    });
  }

  // Finally apply user overrides
  Object.assign(values, overrides);

  return values;
};

/**
 * Generates a unique class number
 */
const generateClassNumber = (classDef: ClassDefinition, runOrder: number): string => {
  const elementCode = classDef.element.charAt(0).toUpperCase();
  const levelCode = classDef.level ? classDef.level.charAt(0).toUpperCase() : '';
  const sectionCode = classDef.section || '';
  
  return `${elementCode}${levelCode}${sectionCode}-${runOrder}`;
};

// Note: The following helper functions have been removed as they reference
// properties that don't exist in the CreatedClass interface:
// - getTimeLimits
// - getHideConfiguration
// - getDistractions
// - getFees
// - getEstimatedJudgingTime
// 
// These values should be stored in the fieldValues record instead.

/**
 * Validates that a class can be generated from a template
 */
export const validateClassGeneration = (
  template: ClassTemplate,
  classDef: ClassDefinition,
  overrides: Record<string, unknown>
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Check if class definition exists in template
  const exists = template.classDefinitions.some(def => 
    def.element === classDef.element &&
    def.level === classDef.level &&
    def.section === classDef.section
  );

  if (!exists) {
    errors.push('Class definition not found in template');
  }

  // Validate overrides against field specifications from the template
  template.fieldSpecifications.forEach(fieldSpec => {
    const overrideValue = overrides[fieldSpec.fieldName];
    
    if (overrideValue !== undefined) {
      // Check if field allows overrides
      if (fieldSpec.fieldSource === 'rule-based' && !fieldSpec.editable) {
        errors.push(`Field ${fieldSpec.fieldName} is rule-based and cannot be overridden`);
      }
      
      // Validate data types
      if (fieldSpec.dataType === 'number' && isNaN(Number(overrideValue))) {
        errors.push(`Field ${fieldSpec.fieldName} must be a number`);
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
};