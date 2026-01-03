import { ClassTemplate, ClassDefinition, FieldSpecification } from '../types/template.types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface FieldValidationContext {
  [key: string]: unknown;
}

/**
 * Validates a complete class template
 */
export const validateTemplate = (template: ClassTemplate): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic template validation
  if (!template.templateName?.trim()) {
    errors.push('Template name is required');
  }

  if (!template.organization) {
    errors.push('Organization is required');
  }

  if (!template.showType) {
    errors.push('Show type is required');
  }

  if (!template.classDefinitions || template.classDefinitions.length === 0) {
    errors.push('Template must contain at least one class definition');
  }

  // Validate each class definition
  if (template.classDefinitions) {
    template.classDefinitions.forEach((classDef, index) => {
      const classValidation = validateClassDefinition(classDef);
      
      classValidation.errors.forEach(error => {
        errors.push(`Class ${index + 1}: ${error}`);
      });
      
      classValidation.warnings.forEach(warning => {
        warnings.push(`Class ${index + 1}: ${warning}`);
      });
    });
  }

  // Check for duplicate class combinations
  const classKeys = new Set<string>();
  template.classDefinitions?.forEach((classDef) => {
    const key = `${classDef.element}-${classDef.level}-${classDef.section || 'none'}`;
    if (classKeys.has(key)) {
      errors.push(`Duplicate class definition: ${classDef.element} ${classDef.level} ${classDef.section || ''}`);
    }
    classKeys.add(key);
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Validates a single class definition
 */
export const validateClassDefinition = (classDef: ClassDefinition): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!classDef.element?.trim()) {
    errors.push('Element is required');
  }

  if (!classDef.level?.trim()) {
    errors.push('Level is required');
  }

  if (!classDef.className?.trim()) {
    errors.push('Class name is required');
  }

  if (!classDef.fieldOverrides || Object.keys(classDef.fieldOverrides).length === 0) {
    warnings.push('Class has no field overrides');
  }

  // Validate each field override
  Object.entries(classDef.fieldOverrides || {}).forEach(([fieldName, override]) => {
    if (override && typeof override === 'object') {
      // Basic validation for field overrides
      if (override.defaultValue !== undefined && override.dataType === 'number' && isNaN(Number(override.defaultValue))) {
        errors.push(`Field ${fieldName}: Invalid number value in override`);
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Validates a single field specification
 */
export const validateField = (field: FieldSpecification): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!field.fieldName?.trim()) {
    errors.push('Field name is required');
  }

  if (!field.fieldSource) {
    errors.push('Field source is required');
  }

  if (!field.dataType) {
    errors.push('Data type is required');
  }

  if (!field.displayName?.trim()) {
    errors.push('Display name is required');
  }

  // Validate field type specific requirements
  if (field.fieldSource === 'judge-set' && !field.allowedRange) {
    warnings.push('Judge-set fields should have allowed range or options');
  }

  if (field.fieldSource === 'rule-based' && field.ruleValue === undefined) {
    errors.push('Rule-based fields must have a rule value');
  }

  // Validate data type consistency
  if (field.dataType === 'number' && field.defaultValue !== undefined) {
    if (typeof field.defaultValue !== 'number') {
      errors.push('Default value must be a number for numeric fields');
    }
  }

  if (field.dataType === 'boolean' && field.defaultValue !== undefined) {
    if (typeof field.defaultValue !== 'boolean') {
      errors.push('Default value must be a boolean for boolean fields');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Checks if a field should be displayed based on conditional rules
 */
export const shouldShowField = (
  field: FieldSpecification, 
  context: FieldValidationContext
): boolean => {
  if (!field.showWhen) return true;

  const conditions = Array.isArray(field.showWhen) ? field.showWhen : [field.showWhen];
  
  return conditions.every(condition => {
    const contextValue = context[condition.dependsOn];
    
    switch (condition.condition) {
      case 'equals':
        return contextValue === condition.value;
      case 'notEquals':
        return contextValue !== condition.value;
      case 'greaterThan':
        return Number(contextValue) > Number(condition.value);
      case 'lessThan':
        return Number(contextValue) < Number(condition.value);
      case 'contains':
        return String(contextValue).includes(String(condition.value));
      default:
        return true;
    }
  });
};

/**
 * Generates a class name from a definition and context
 */
export const generateClassName = (
  classDef: ClassDefinition,
  context: FieldValidationContext = {}
): string => {
  let name = classDef.className;
  
  // Replace placeholders with actual values
  name = name.replace('{element}', classDef.element || '');
  name = name.replace('{level}', classDef.level || '');
  name = name.replace('{section}', classDef.section || '');
  
  // Replace any context values
  Object.entries(context).forEach(([key, value]) => {
    name = name.replace(`{${key}}`, String(value));
  });
  
  // Clean up extra spaces
  return name.replace(/\s+/g, ' ').trim();
};

/**
 * Validates field overrides against template rules
 */
export const validateFieldOverrides = (
  field: FieldSpecification,
  overrideValue: unknown
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if field is editable
  if (!field.editable && overrideValue !== undefined) {
    errors.push('Field is not editable');
  }

  // Check data type
  if (overrideValue !== undefined) {
    switch (field.dataType) {
      case 'number':
        if (isNaN(Number(overrideValue))) {
          errors.push('Value must be a number');
        }
        break;
      case 'boolean':
        if (typeof overrideValue !== 'boolean') {
          errors.push('Value must be true or false');
        }
        break;
      case 'string':
        if (typeof overrideValue !== 'string') {
          errors.push('Value must be text');
        }
        break;
    }
  }

  // Check allowed range for judge-set fields
  if (field.fieldSource === 'judge-set' && field.allowedRange && overrideValue !== undefined) {
    const numValue = Number(overrideValue);
    
    if (field.allowedRange.min !== undefined && numValue < Number(field.allowedRange.min)) {
      errors.push(`Value must be at least ${field.allowedRange.min}`);
    }
    
    if (field.allowedRange.max !== undefined && numValue > Number(field.allowedRange.max)) {
      errors.push(`Value must be at most ${field.allowedRange.max}`);
    }
  }
  
  // Check options for select fields
  if (field.dataType === 'select' && field.options && overrideValue !== undefined) {
    const validValues = Array.isArray(field.options) 
      ? field.options.map(opt => typeof opt === 'string' ? opt : opt.value)
      : [];
    if (!validValues.includes(String(overrideValue))) {
      errors.push(`Value must be one of: ${validValues.join(', ')}`);
    }
  }

  // Check required fields
  if (field.required && (overrideValue === undefined || overrideValue === null || overrideValue === '')) {
    errors.push('Field is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};