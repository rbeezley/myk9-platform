import { 
  ClassTemplate 
} from '@/types/template.types';
import { 
  TemplateFieldConfiguration, 
  FieldDefinition, 
  ShowTypeField,
  StructuredClassData,
  ClassFieldValues,
  ValueConstraint
} from '@/types/field-definition-types';
import { 
  getFieldDefinition 
} from '@/data/fieldDefinitions';
import { 
  msToDisplay, 
  displayToMs, 
  isValidTimeFormat, 
  parseTimeInput, 
  formatTimeRange
} from './timeUtils';

/**
 * Get visible field configurations for a template, sorted by display order
 */
export function getVisibleFields(template: ClassTemplate): TemplateFieldConfiguration[] {
  if (!template.fieldConfigurations) return [];
  
  return template.fieldConfigurations
    .filter(config => config.visible)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

/**
 * Get required field configurations for a template
 */
export function getRequiredFields(template: ClassTemplate): TemplateFieldConfiguration[] {
  if (!template.fieldConfigurations) return [];
  
  return template.fieldConfigurations.filter(config => config.required);
}

/**
 * Get field definition with template configuration merged
 */
export function getConfiguredField(
  fieldName: ShowTypeField, 
  template: ClassTemplate
): (FieldDefinition & TemplateFieldConfiguration) | null {
  const fieldDef = getFieldDefinition(fieldName);
  const config = template.fieldConfigurations?.find(c => c.fieldName === fieldName);
  
  if (!fieldDef || !config) return null;
  
  return {
    ...fieldDef,
    ...config
  };
}

/**
 * Get all configured fields for a template with their definitions
 */
export function getConfiguredFieldsWithDefinitions(template: ClassTemplate): (FieldDefinition & TemplateFieldConfiguration)[] {
  if (!template.fieldConfigurations) return [];
  
  return template.fieldConfigurations
    .map(config => {
      const fieldDef = getFieldDefinition(config.fieldName);
      if (!fieldDef) return null;
      return { ...fieldDef, ...config };
    })
    .filter(Boolean) as (FieldDefinition & TemplateFieldConfiguration)[];
}

/**
 * Validate field values against template configuration
 */
export function validateFieldValues(
  values: ClassFieldValues,
  template: ClassTemplate
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const requiredFields = getRequiredFields(template);
  
  // Check required fields
  requiredFields.forEach(config => {
    const value = values[config.fieldName];
    if (value === undefined || value === null || value === '') {
      const fieldDef = getFieldDefinition(config.fieldName);
      errors[config.fieldName] = `${fieldDef?.displayName || config.fieldName} is required`;
    }
  });
  
  // Validate field types and constraints
  template.fieldConfigurations?.forEach(config => {
    const value = values[config.fieldName];
    if (value === undefined || value === null || value === '') return;
    
    const fieldDef = getFieldDefinition(config.fieldName);
    if (!fieldDef) return;
    
    // Type validation
    switch (fieldDef.dataType) {
      case 'number': {
        const numValue = Number(value);
        if (isNaN(numValue)) {
          errors[config.fieldName] = `${fieldDef.displayName} must be a number`;
        } else {
          if (fieldDef.minValue !== undefined && numValue < fieldDef.minValue) {
            errors[config.fieldName] = `${fieldDef.displayName} must be at least ${fieldDef.minValue}`;
          }
          if (fieldDef.maxValue !== undefined && numValue > fieldDef.maxValue) {
            errors[config.fieldName] = `${fieldDef.displayName} must be at most ${fieldDef.maxValue}`;
          }
        }
        break;
      }
        
      case 'select': {
        if (fieldDef.options) {
          const validValues = fieldDef.options.map(opt => 
            typeof opt === 'string' ? opt : opt.value
          );
          if (!validValues.includes(String(value))) {
            errors[config.fieldName] = `${fieldDef.displayName} must be one of: ${validValues.join(', ')}`;
          }
        }
        break;
      }
    }
  });
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Get default values for a template's configured fields
 */
export function getDefaultFieldValues(template: ClassTemplate): ClassFieldValues {
  const defaults: ClassFieldValues = {};
  
  template.fieldConfigurations?.forEach(config => {
    const fieldDef = getFieldDefinition(config.fieldName);
    if (!fieldDef) return;
    
    // Use template override default, then field definition default
    if (config.defaultValue !== undefined) {
      defaults[config.fieldName] = config.defaultValue;
    } else if (fieldDef.defaultValue !== undefined) {
      defaults[config.fieldName] = fieldDef.defaultValue;
    }
  });
  
  return defaults;
}

/**
 * Convert legacy field specifications to field configurations (migration helper)
 */
export function convertLegacyFieldsToConfigurations(template: ClassTemplate): TemplateFieldConfiguration[] {
  if (!template.fieldSpecifications) return [];
  
  return template.fieldSpecifications.map((spec, index) => ({
    fieldName: spec.fieldName as ShowTypeField,
    required: spec.required,
    visible: true,
    editable: spec.editable,
    defaultValue: spec.defaultValue,
    displayOrder: spec.displayOrder || index + 1
  }));
}

/**
 * Check if template uses new structured fields or legacy fields
 */
export function usesStructuredFields(template: ClassTemplate): boolean {
  return Boolean(template.fieldConfigurations && template.fieldConfigurations.length > 0);
}

/**
 * Generate a class name from field values
 */
export function generateClassName(values: ClassFieldValues): string {
  const parts: string[] = [];
  
  // Add element if present
  if (values.element) {
    parts.push(String(values.element));
  }
  
  // Add level if present
  if (values.level) {
    parts.push(String(values.level));
  }
  
  // Add section if present
  if (values.section) {
    parts.push(String(values.section));
  }
  
  // Add division if present and not "Regular"
  if (values.division && String(values.division) !== 'Regular') {
    parts.push(String(values.division));
  }
  
  return parts.join(' ') || 'Untitled Class';
}

/**
 * Convert field values to structured class data
 */
export function fieldValuesToStructuredData(values: ClassFieldValues): StructuredClassData {
  return {
    // Identity fields
    element: values.element as string,
    level: values.level as string,
    section: values.section as string,
    className: values.className as string || generateClassName(values),
    division: values.division as string,
    
    // Scheduling fields
    scheduledDate: values.scheduledDate as Date,
    startTime: values.startTime as string,
    endTime: values.endTime as string,
    ringNumber: values.ringNumber as number,
    runOrder: values.runOrder as number,
    estimatedDuration: values.estimatedDuration as number,
    
    // Personnel fields
    judgeName: values.judgeName as string,
    judgeId: values.judgeId as string,
    stewardName: values.stewardName as string,
    stewardId: values.stewardId as string,
    timerName: values.timerName as string,
    timerId: values.timerId as string,
    
    // Financial fields
    preEntryFee: values.preEntryFee as number,
    dayOfShowFee: values.dayOfShowFee as number,
    
    // Scent Work fields
    searchAreas: values.searchAreas as string[],
    hideCount: values.hideCount as number,
    distractionCount: values.distractionCount as number,
    searchTimeLimit: values.searchTimeLimit as number,
    searchEnvironment: values.searchEnvironment as string,
    
    // Agility fields
    jumpHeight: values.jumpHeight as string,
    courseYards: values.courseYards as number,
    obstacles: values.obstacles as number,
    standardCourseTime: values.standardCourseTime as number,
    courseType: values.courseType as string,
    
    // Conformation fields
    classType: values.classType as string,
    sex: values.sex as string,
    ageGroup: values.ageGroup as string,
    variety: values.variety as string,
    breed: values.breed as string,
    
    // Obedience fields
    exerciseList: values.exerciseList as string[],
    maxPoints: values.maxPoints as number,
    
    // Rally fields
    courseDesign: values.courseDesign as string,
    signCount: values.signCount as number,
    
    // Administrative fields
    entryLimit: values.entryLimit as number,
    currentEntries: values.currentEntries as number,
    notes: values.notes as string,
    status: values.status as string
  };
}

/**
 * Group fields by category for UI display
 */
export function groupFieldsByCategory(
  fields: (FieldDefinition & TemplateFieldConfiguration)[]
): Record<string, (FieldDefinition & TemplateFieldConfiguration)[]> {
  return fields.reduce((groups, field) => {
    const category = field.category;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(field);
    return groups;
  }, {} as Record<string, (FieldDefinition & TemplateFieldConfiguration)[]>);
}

/**
 * Get fields that have defaultVariesByClass enabled
 */
export function getFieldsWithVariableDefaults(template: ClassTemplate): TemplateFieldConfiguration[] {
  if (!template.fieldConfigurations) return [];
  
  return template.fieldConfigurations.filter(config => config.defaultVariesByClass);
}

/**
 * Check if a field has value constraints
 */
export function hasValueConstraints(field: TemplateFieldConfiguration): boolean {
  return Boolean(field.valueConstraints);
}

/**
 * Validate value against constraints
 */
export function validateValueConstraints(
  value: unknown,
  constraints: ValueConstraint,
  fieldName: string,
  fieldDataType?: string
): { isValid: boolean; error?: string } {
  if (!constraints) return { isValid: true };
  
  switch (constraints.type) {
    case 'range':
      // Handle duration array fields
      if (fieldDataType === 'duration-array') {
        if (!Array.isArray(value)) {
          return { isValid: false, error: `${fieldName} must be an array of time durations` };
        }
        
        // Validate each time in the array
        for (let i = 0; i < value.length; i++) {
          const timeValue = value[i];
          let numValue: number;
          
          if (typeof timeValue === 'string') {
            if (!isValidTimeFormat(timeValue)) {
              return { isValid: false, error: `${fieldName} area ${i + 1} must be in MM:SS or MM:SS.HH format` };
            }
            numValue = displayToMs(timeValue);
          } else if (typeof timeValue === 'number') {
            numValue = timeValue; // Already in milliseconds
          } else {
            return { isValid: false, error: `${fieldName} area ${i + 1} must be a valid time duration` };
          }
          
          if (constraints.min !== undefined && numValue < constraints.min) {
            const minDisplay = msToDisplay(constraints.min, 'hundredths');
            return { 
              isValid: false, 
              error: `${fieldName} area ${i + 1} must be at least ${minDisplay}` 
            };
          }
          
          if (constraints.max !== undefined && numValue > constraints.max) {
            const maxDisplay = msToDisplay(constraints.max, 'hundredths');
            return { 
              isValid: false, 
              error: `${fieldName} area ${i + 1} must be at most ${maxDisplay}` 
            };
          }
        }
        
        return { isValid: true };
      }
      
      // Handle single duration fields (MM:SS.HH format stored as milliseconds)
      if (fieldDataType === 'duration') {
        let numValue: number;
        if (typeof value === 'string') {
          if (!isValidTimeFormat(value)) {
            return { isValid: false, error: `${fieldName} must be in MM:SS or MM:SS.HH format (e.g., 1:30 or 1:27.35)` };
          }
          numValue = displayToMs(value);
        } else if (typeof value === 'number') {
          numValue = value; // Already in milliseconds
        } else {
          return { isValid: false, error: `${fieldName} must be a valid time duration` };
        }
        
        if (constraints.min !== undefined && numValue < constraints.min) {
          const minDisplay = msToDisplay(constraints.min, 'hundredths');
          return { 
            isValid: false, 
            error: `${fieldName} must be at least ${minDisplay}` 
          };
        }
        
        if (constraints.max !== undefined && numValue > constraints.max) {
          const maxDisplay = msToDisplay(constraints.max, 'hundredths');
          return { 
            isValid: false, 
            error: `${fieldName} must be at most ${maxDisplay}` 
          };
        }
      } else {
        const numValue = Number(value);
        if (isNaN(numValue)) {
          return { isValid: false, error: `${fieldName} must be a number` };
        }
        
        if (constraints.min !== undefined && numValue < constraints.min) {
          const minDisplay = constraints.min;
          return { 
            isValid: false, 
            error: `${fieldName} must be at least ${minDisplay}${constraints.unit ? ' ' + constraints.unit : ''}` 
          };
        }
        
        if (constraints.max !== undefined && numValue > constraints.max) {
          const maxDisplay = constraints.max;
          return { 
            isValid: false, 
            error: `${fieldName} must be at most ${maxDisplay}${constraints.unit ? ' ' + constraints.unit : ''}` 
          };
        }
      }
      
      return { isValid: true };
      
    case 'enum':
      if (constraints.allowedValues && !constraints.allowedValues.includes(String(value))) {
        return { 
          isValid: false, 
          error: `${fieldName} must be one of: ${constraints.allowedValues.join(', ')}` 
        };
      }
      return { isValid: true };
      
    case 'pattern':
      if (constraints.pattern && !constraints.pattern.test(String(value))) {
        return { 
          isValid: false, 
          error: `${fieldName} format is invalid` 
        };
      }
      return { isValid: true };
      
    default:
      return { isValid: true };
  }
}

/**
 * Format range constraint for display
 */
export function formatRangeConstraint(constraints: ValueConstraint, fieldDataType?: string): string {
  if (constraints.type !== 'range') return '';
  
  const { min, max, unit, hint } = constraints;
  
  if (hint) return hint;
  
  // Handle duration fields specially (both single and array)
  if (fieldDataType === 'duration' || fieldDataType === 'duration-array' || unit === 'MM:SS.HH') {
    if (min !== undefined && max !== undefined) {
      return formatTimeRange(min, max, 'seconds');
    } else if (min !== undefined) {
      return `Minimum: ${msToDisplay(min, 'seconds')}`;
    } else if (max !== undefined) {
      return `Maximum: ${msToDisplay(max, 'seconds')}`;
    }
  } else {
    if (min !== undefined && max !== undefined) {
      return `Range: ${min}-${max}${unit ? ' ' + unit : ''}`;
    } else if (min !== undefined) {
      return `Minimum: ${min}${unit ? ' ' + unit : ''}`;
    } else if (max !== undefined) {
      return `Maximum: ${max}${unit ? ' ' + unit : ''}`;
    }
  }
  
  return '';
}

/**
 * Get default value for a field, considering class-specific overrides
 */
export function getFieldDefaultValue(
  fieldConfig: TemplateFieldConfiguration,
  classSpecificDefaults?: Record<string, unknown>
): unknown {
  // If field varies by class and we have class-specific defaults, use those
  if (fieldConfig.defaultVariesByClass && classSpecificDefaults?.[fieldConfig.fieldName] !== undefined) {
    return classSpecificDefaults[fieldConfig.fieldName];
  }
  
  // Otherwise use the template's default value
  return fieldConfig.defaultValue;
}


/**
 * Enhanced field validation that includes value constraints
 */
export function validateFieldValuesWithConstraints(
  values: ClassFieldValues,
  template: ClassTemplate
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const requiredFields = getRequiredFields(template);
  
  // Check required fields
  requiredFields.forEach(config => {
    const value = values[config.fieldName];
    if (value === undefined || value === null || value === '') {
      const fieldDef = getFieldDefinition(config.fieldName);
      errors[config.fieldName] = `${fieldDef?.displayName || config.fieldName} is required`;
    }
  });
  
  // Validate field types, constraints, and value constraints
  template.fieldConfigurations?.forEach(config => {
    const value = values[config.fieldName];
    if (value === undefined || value === null || value === '') return;
    
    const fieldDef = getFieldDefinition(config.fieldName);
    if (!fieldDef) return;
    
    // Type validation (existing logic)
    switch (fieldDef.dataType) {
      case 'number': {
        const numValue = Number(value);
        if (isNaN(numValue)) {
          errors[config.fieldName] = `${fieldDef.displayName} must be a number`;
        } else {
          if (fieldDef.minValue !== undefined && numValue < fieldDef.minValue) {
            errors[config.fieldName] = `${fieldDef.displayName} must be at least ${fieldDef.minValue}`;
          }
          if (fieldDef.maxValue !== undefined && numValue > fieldDef.maxValue) {
            errors[config.fieldName] = `${fieldDef.displayName} must be at most ${fieldDef.maxValue}`;
          }
        }
        break;
      }
        
      case 'select': {
        if (fieldDef.options) {
          const validValues = fieldDef.options.map(opt => 
            typeof opt === 'string' ? opt : opt.value
          );
          if (!validValues.includes(String(value))) {
            errors[config.fieldName] = `${fieldDef.displayName} must be one of: ${validValues.join(', ')}`;
          }
        }
        break;
      }
    }
    
    // Value constraints validation
    if (config.valueConstraints) {
      const constraintValidation = validateValueConstraints(
        value, 
        config.valueConstraints, 
        fieldDef.displayName,
        fieldDef.dataType
      );
      
      if (!constraintValidation.isValid && constraintValidation.error) {
        errors[config.fieldName] = constraintValidation.error;
      }
    }
  });
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

// Legacy compatibility - maintain old function names for gradual migration
export const durationToSeconds = (mmss: string): number => Math.floor(displayToMs(mmss) / 1000);
export const secondsToMMSS = (seconds: number): string => msToDisplay(seconds * 1000, 'seconds');
export const parseMMSSInput = parseTimeInput;
export const isValidMMSSFormat = isValidTimeFormat;