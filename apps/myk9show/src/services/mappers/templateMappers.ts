// Type mapping utilities for Template Store <-> Database integration
// Phase 4.1: Template System Integration

import type { 
  ClassTemplate, 
  ClassTemplateField,
  GeneratedClass 
} from '@/types/class-template-types';
import type { 
  ShowTemplateDefinition, 
  ShowFieldDefinition,
  Organization,
  ShowType 
} from '@/types/show-template-types';
import type {
  DbClassTemplateInsert,
  DbClassTemplateUpdate,
  DbShowTemplateInsert,
  DbShowTemplateUpdate,
  DbTemplateField,
  DbTemplateFieldInsert,
} from '@/types/database-mappings';

// ===== CLASS TEMPLATE MAPPERS =====

/**
 * Convert ClassTemplate to DbClassTemplateInsert (for database)
 */
export const mapClassTemplateToInsert = (template: Omit<ClassTemplate, 'id' | 'createdAt' | 'updatedAt'>): DbClassTemplateInsert => {
  return {
    name: template.name,
    organization: template.organization,
    show_type: template.showType,
    description: template.description || null,
    fields: template.fields ? JSON.parse(JSON.stringify(template.fields)) : {},
    class_pattern: template.classPattern,
    entry_fee_default: template.entryFeeDefault || null,
    max_entries_default: template.maxEntriesDefault || null,
    // Note: jump_heights and breed_restrictions will be handled via template fields
    estimated_duration: null, // Will be calculated based on fields
    start_time_default: null,
    created_by: null, // Will be set by auth context
    is_active: true,
    is_system: false,
  };
};

/**
 * Convert ClassTemplate updates to DbClassTemplateUpdate
 */
export const mapClassTemplateToUpdate = (updates: Partial<ClassTemplate>): DbClassTemplateUpdate => {
  const update: DbClassTemplateUpdate = {};

  if (updates.name !== undefined) update.name = updates.name;
  if (updates.organization !== undefined) update.organization = updates.organization;
  if (updates.showType !== undefined) update.show_type = updates.showType;
  if (updates.description !== undefined) update.description = updates.description || null;
  if (updates.fields !== undefined) update.fields = updates.fields ? JSON.parse(JSON.stringify(updates.fields)) : {};
  if (updates.classPattern !== undefined) update.class_pattern = updates.classPattern;
  if (updates.entryFeeDefault !== undefined) update.entry_fee_default = updates.entryFeeDefault || null;
  if (updates.maxEntriesDefault !== undefined) update.max_entries_default = updates.maxEntriesDefault || null;

  return update;
};

/**
 * Convert database class template result to ClassTemplate type
 */
export const mapDatabaseToClassTemplate = (dbTemplate: Record<string, unknown>): ClassTemplate => {
  const templateFields = Array.isArray(dbTemplate.template_fields) 
    ? dbTemplate.template_fields.map((field: Record<string, unknown>) => mapDatabaseToClassTemplateField(field))
    : [];

  return {
    id: dbTemplate.id as string,
    name: dbTemplate.name as string,
    organization: dbTemplate.organization as ClassTemplate['organization'],
    showType: dbTemplate.show_type as string,
    description: dbTemplate.description as string,
    fields: templateFields,
    classPattern: dbTemplate.class_pattern as string,
    entryFeeDefault: dbTemplate.entry_fee_default as number,
    maxEntriesDefault: dbTemplate.max_entries_default as number,
    requiresJumpHeight: templateFields.some(field => field.name === 'jumpHeight'),
    createdAt: new Date(dbTemplate.created_at as string),
    updatedAt: new Date(dbTemplate.updated_at as string),
  };
};

/**
 * Convert database template field to ClassTemplateField
 */
export const mapDatabaseToClassTemplateField = (dbField: Record<string, unknown>): ClassTemplateField => {
  return {
    name: dbField.field_name as string,
    type: dbField.field_type as 'element' | 'level' | 'section' | 'custom',
    values: Array.isArray(dbField.field_values) 
      ? dbField.field_values as string[] 
      : (dbField.field_values as Record<string, unknown>)?.options as string[] || [],
    optional: !(dbField.is_required as boolean),
  };
};

/**
 * Convert ClassTemplateField to DbTemplateFieldInsert
 */
export const mapClassTemplateFieldToInsert = (
  field: ClassTemplateField, 
  templateId: string, 
  order: number
): DbTemplateFieldInsert => {
  return {
    template_id: templateId,
    field_name: field.name,
    field_type: field.type,
    field_label: field.name.charAt(0).toUpperCase() + field.name.slice(1),
    field_description: `${field.type} field for ${field.name}`,
    field_values: { options: field.values },
    is_required: !field.optional,
    is_optional: field.optional || false,
    default_value: null,
    field_order: order,
    field_group: field.type,
    validation_rules: null,
    is_active: true,
  };
};

// ===== SHOW TEMPLATE MAPPERS =====

/**
 * Convert ShowTemplateDefinition to DbShowTemplateInsert
 */
export const mapShowTemplateToInsert = (template: Omit<ShowTemplateDefinition, 'id' | 'createdAt' | 'updatedAt'>): DbShowTemplateInsert => {
  return {
    name: template.name,
    organization: template.organization,
    description: template.description || null,
    template_data: JSON.parse(JSON.stringify({
      version: template.version,
      showType: template.showType,
      classFields: template.classFields,
      classNamePattern: template.classNamePattern,
      defaults: template.defaults,
      validation: template.validation,
      customFields: template.customFields,
    })),
    default_entry_fee: template.defaults.entryFee || null,
    default_max_entries: template.defaults.maxEntries || null,
    default_duration_days: 1,
    created_by: null, // Will be set by auth context
    is_active: true,
    is_public: false,
    usage_count: 0,
    last_used_at: null,
  };
};

/**
 * Convert ShowTemplateDefinition updates to DbShowTemplateUpdate
 */
export const mapShowTemplateToUpdate = (updates: Partial<ShowTemplateDefinition>): DbShowTemplateUpdate => {
  const update: DbShowTemplateUpdate = {};

  if (updates.name !== undefined) update.name = updates.name;
  if (updates.organization !== undefined) update.organization = updates.organization;
  if (updates.description !== undefined) update.description = updates.description || null;
  
  // Handle template_data updates
  if (updates.version !== undefined || 
      updates.showType !== undefined || 
      updates.classFields !== undefined ||
      updates.classNamePattern !== undefined ||
      updates.defaults !== undefined ||
      updates.validation !== undefined ||
      updates.customFields !== undefined) {
    
    const templateData: Record<string, unknown> = {};
    
    if (updates.version !== undefined) templateData.version = updates.version;
    if (updates.showType !== undefined) templateData.showType = updates.showType;
    if (updates.classFields !== undefined) templateData.classFields = updates.classFields;
    if (updates.classNamePattern !== undefined) templateData.classNamePattern = updates.classNamePattern;
    if (updates.defaults !== undefined) templateData.defaults = updates.defaults;
    if (updates.validation !== undefined) templateData.validation = updates.validation;
    if (updates.customFields !== undefined) templateData.customFields = updates.customFields;
    
    update.template_data = JSON.parse(JSON.stringify(templateData));
  }
  
  if (updates.defaults?.entryFee !== undefined) update.default_entry_fee = updates.defaults.entryFee;
  if (updates.defaults?.maxEntries !== undefined) update.default_max_entries = updates.defaults.maxEntries;

  return update;
};

/**
 * Convert database show template result to ShowTemplateDefinition
 */
export const mapDatabaseToShowTemplate = (dbTemplate: Record<string, unknown>): ShowTemplateDefinition => {
  const templateData = dbTemplate.template_data as Record<string, unknown> || {};
  
  return {
    id: dbTemplate.id as string,
    name: dbTemplate.name as string,
    organization: dbTemplate.organization as Organization,
    showType: templateData.showType as ShowType || 'Other',
    description: dbTemplate.description as string,
    version: templateData.version as string || '1.0',
    classFields: templateData.classFields as ShowFieldDefinition[] || [],
    classNamePattern: templateData.classNamePattern as string || '{name}',
    defaults: {
      entryFee: dbTemplate.default_entry_fee as number,
      maxEntries: dbTemplate.default_max_entries as number,
      timeLimit: (templateData.defaults as Record<string, unknown>)?.timeLimit as string,
      requiresJumpHeight: (templateData.defaults as Record<string, unknown>)?.requiresJumpHeight as boolean,
      requiresArmband: (templateData.defaults as Record<string, unknown>)?.requiresArmband as boolean,
      allowsMultipleRuns: (templateData.defaults as Record<string, unknown>)?.allowsMultipleRuns as boolean,
      ...(templateData.defaults as Record<string, unknown>) || {},
    },
    validation: templateData.validation as ShowTemplateDefinition['validation'],
    customFields: templateData.customFields as ShowFieldDefinition[],
    createdAt: new Date(dbTemplate.created_at as string),
    updatedAt: new Date(dbTemplate.updated_at as string),
  };
};

// ===== TEMPLATE FIELD MAPPERS =====

/**
 * Convert ShowFieldDefinition to DbTemplateFieldInsert
 */
export const mapShowFieldToTemplateField = (
  field: ShowFieldDefinition, 
  templateId: string, 
  order: number
): DbTemplateFieldInsert => {
  return {
    template_id: templateId,
    field_name: field.name,
    field_type: field.type,
    field_label: field.name.charAt(0).toUpperCase() + field.name.slice(1),
    field_description: field.description || null,
    field_values: field.options ? { options: field.options } : null,
    is_required: field.required,
    is_optional: !field.required,
    default_value: field.defaultValue ? String(field.defaultValue) : null,
    field_order: order,
    field_group: 'show_field',
    validation_rules: field.showWhen ? { showWhen: field.showWhen } : null,
    is_active: true,
  };
};

/**
 * Convert DbTemplateField to ShowFieldDefinition
 */
export const mapTemplateFieldToShowField = (dbField: DbTemplateField): ShowFieldDefinition => {
  const fieldValues = dbField.field_values as Record<string, unknown>;
  
  return {
    name: dbField.field_name,
    type: dbField.field_type as 'select' | 'text' | 'number' | 'boolean',
    options: fieldValues?.options as string[],
    required: dbField.is_required || false,
    defaultValue: dbField.default_value || undefined,
    description: dbField.field_description || undefined,
    showWhen: (dbField.validation_rules as Record<string, unknown>)?.showWhen as ShowFieldDefinition['showWhen'],
  };
};

// ===== UTILITY MAPPERS =====

/**
 * Convert array of database class templates to ClassTemplate array
 */
export const mapDatabaseClassTemplatesArray = (dbTemplates: Record<string, unknown>[]): ClassTemplate[] => {
  return dbTemplates.map(mapDatabaseToClassTemplate);
};

/**
 * Convert array of database show templates to ShowTemplateDefinition array
 */
export const mapDatabaseShowTemplatesArray = (dbTemplates: Record<string, unknown>[]): ShowTemplateDefinition[] => {
  return dbTemplates.map(mapDatabaseToShowTemplate);
};

/**
 * Generate classes from a class template using its fields
 */
export const generateClassesFromTemplate = (template: ClassTemplate): GeneratedClass[] => {
  const classes: GeneratedClass[] = [];
  
  // Extract field values
  const elementField = template.fields.find(f => f.type === 'element');
  const levelField = template.fields.find(f => f.type === 'level');
  const sectionField = template.fields.find(f => f.type === 'section');
  
  const elements = elementField?.values || [''];
  const levels = levelField?.values || [''];
  const sections = sectionField?.values || [''];
  
  // Generate all combinations
  elements.forEach(element => {
    levels.forEach(level => {
      sections.forEach(section => {
        // Skip empty combinations unless it's the base case
        if (!element && !level && !section && elements.length > 1) return;
        
        const className = template.classPattern
          .replace('{element}', element)
          .replace('{level}', level)
          .replace('{section}', section)
          .replace(/\s+/g, ' ')
          .trim();
        
        if (className) {
          classes.push({
            className,
            element: element || undefined,
            level: level || undefined,
            section: section || undefined,
            entryFee: template.entryFeeDefault,
            maxEntries: template.maxEntriesDefault,
            requiresJumpHeight: template.requiresJumpHeight,
            customFields: {},
          });
        }
      });
    });
  });
  
  return classes;
};

/**
 * Create template inheritance - merge parent and child template fields
 */
export const mergeTemplateFields = (
  parentTemplate: ClassTemplate, 
  childFields: Partial<ClassTemplate>
): ClassTemplate => {
  return {
    ...parentTemplate,
    ...childFields,
    id: childFields.id || parentTemplate.id,
    fields: [
      ...parentTemplate.fields,
      ...(childFields.fields || [])
    ],
    createdAt: childFields.createdAt || parentTemplate.createdAt,
    updatedAt: new Date(),
  };
};

/**
 * Validate template field relationships and constraints
 */
export const validateTemplateStructure = (template: ClassTemplate): string[] => {
  const errors: string[] = [];
  
  // Check required fields
  if (!template.name) errors.push('Template name is required');
  if (!template.organization) errors.push('Organization is required');
  if (!template.classPattern) errors.push('Class pattern is required');
  
  // Check field consistency
  const fieldNames = template.fields.map(f => f.name);
  const uniqueNames = new Set(fieldNames);
  if (fieldNames.length !== uniqueNames.size) {
    errors.push('Duplicate field names found');
  }
  
  // Check pattern placeholders exist in fields
  const patternPlaceholders = template.classPattern.match(/\{(\w+)\}/g) || [];
  patternPlaceholders.forEach(placeholder => {
    const fieldName = placeholder.replace(/[{}]/g, '');
    if (!fieldNames.includes(fieldName)) {
      errors.push(`Pattern placeholder '${placeholder}' has no matching field`);
    }
  });
  
  return errors;
};