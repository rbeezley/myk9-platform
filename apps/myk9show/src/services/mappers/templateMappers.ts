// Type mapping utilities for Template Store <-> Database integration
// Phase 4.1: Template System Integration
//
// Note: Template tables store most structured data in JSONB `template_data` columns.
// Organization, show type, fields, and patterns are stored in template_data rather than
// as individual columns.

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
 *
 * Actual class_templates columns: competition_type, created_at, created_by,
 * default_entry_fee, default_max_entries, default_time_limit_seconds, description,
 * element, id, is_public, level, name, template_data, updated_at
 */
export const mapClassTemplateToInsert = (template: Omit<ClassTemplate, 'id' | 'createdAt' | 'updatedAt'>): DbClassTemplateInsert => {
  return {
    name: template.name,
    description: template.description || null,
    element: template.fields.find(f => f.type === 'element')?.values[0] || null,
    level: template.fields.find(f => f.type === 'level')?.values[0] || null,
    default_entry_fee: template.entryFeeDefault || null,
    default_max_entries: template.maxEntriesDefault || null,
    default_time_limit_seconds: null,
    is_public: false,
    created_by: null,
    // Store structured template data (organization, showType, fields, classPattern) in JSON
    template_data: JSON.parse(JSON.stringify({
      organization: template.organization,
      showType: template.showType,
      fields: template.fields,
      classPattern: template.classPattern,
      requiresJumpHeight: template.requiresJumpHeight,
    })),
  };
};

/**
 * Convert ClassTemplate updates to DbClassTemplateUpdate
 */
export const mapClassTemplateToUpdate = (updates: Partial<ClassTemplate>): DbClassTemplateUpdate => {
  const update: DbClassTemplateUpdate = {};

  if (updates.name !== undefined) update.name = updates.name;
  if (updates.description !== undefined) update.description = updates.description || null;
  if (updates.entryFeeDefault !== undefined) update.default_entry_fee = updates.entryFeeDefault || null;
  if (updates.maxEntriesDefault !== undefined) update.default_max_entries = updates.maxEntriesDefault || null;

  // Store structured updates in template_data
  const hasTemplateDataUpdates = updates.organization !== undefined ||
    updates.showType !== undefined ||
    updates.fields !== undefined ||
    updates.classPattern !== undefined ||
    updates.requiresJumpHeight !== undefined;

  if (hasTemplateDataUpdates) {
    const templateData: Record<string, unknown> = {};
    if (updates.organization !== undefined) templateData.organization = updates.organization;
    if (updates.showType !== undefined) templateData.showType = updates.showType;
    if (updates.fields !== undefined) templateData.fields = updates.fields;
    if (updates.classPattern !== undefined) templateData.classPattern = updates.classPattern;
    if (updates.requiresJumpHeight !== undefined) templateData.requiresJumpHeight = updates.requiresJumpHeight;
    update.template_data = JSON.parse(JSON.stringify(templateData));
  }

  return update;
};

/**
 * Convert database class template result to ClassTemplate type
 */
export const mapDatabaseToClassTemplate = (dbTemplate: Record<string, unknown>): ClassTemplate => {
  const templateData = dbTemplate.template_data as Record<string, unknown> || {};

  // Fields can come from template_fields relation or template_data JSON
  const templateFields = Array.isArray(dbTemplate.template_fields)
    ? dbTemplate.template_fields.map((field: Record<string, unknown>) => mapDatabaseToClassTemplateField(field))
    : Array.isArray(templateData.fields)
      ? templateData.fields as ClassTemplateField[]
      : [];

  return {
    id: dbTemplate.id as string,
    name: dbTemplate.name as string,
    organization: (templateData.organization as ClassTemplate['organization']) || 'OTHER',
    showType: (templateData.showType as string) || '',
    description: dbTemplate.description as string,
    fields: templateFields,
    classPattern: (templateData.classPattern as string) || '{name}',
    entryFeeDefault: dbTemplate.default_entry_fee as number,
    maxEntriesDefault: dbTemplate.default_max_entries as number,
    requiresJumpHeight: (templateData.requiresJumpHeight as boolean) || templateFields.some(field => field.name === 'jumpHeight'),
    createdAt: new Date(dbTemplate.created_at as string),
    updatedAt: new Date(dbTemplate.updated_at as string),
  };
};

/**
 * Convert database template field to ClassTemplateField
 */
export const mapDatabaseToClassTemplateField = (dbField: Record<string, unknown>): ClassTemplateField => {
  // Field values may be stored in validation_rules JSON
  const validationRules = dbField.validation_rules as Record<string, unknown> | null;
  const fieldValues = validationRules?.options as string[] || [];

  return {
    name: dbField.field_name as string,
    type: dbField.field_type as 'element' | 'level' | 'section' | 'custom',
    values: fieldValues,
    optional: !(dbField.is_required as boolean),
  };
};

/**
 * Convert ClassTemplateField to DbTemplateFieldInsert
 *
 * Actual template_fields columns: created_at, default_value, field_label,
 * field_name, field_type, id, is_required, sort_order, template_id,
 * template_type, validation_rules
 */
export const mapClassTemplateFieldToInsert = (
  field: ClassTemplateField,
  templateId: string,
  order: number
): DbTemplateFieldInsert => {
  return {
    template_id: templateId,
    template_type: 'class',
    field_name: field.name,
    field_type: field.type,
    field_label: field.name.charAt(0).toUpperCase() + field.name.slice(1),
    is_required: !field.optional,
    default_value: null,
    sort_order: order,
    validation_rules: { options: field.values },
  };
};

// ===== SHOW TEMPLATE MAPPERS =====

/**
 * Convert ShowTemplateDefinition to DbShowTemplateInsert
 *
 * Actual show_templates columns: club_id, created_at, created_by,
 * default_day_of_show_fee, default_entry_period_days, default_max_entries_per_dog,
 * default_pre_entry_fee, description, id, is_public, name, show_type,
 * template_data, updated_at
 */
export const mapShowTemplateToInsert = (template: Omit<ShowTemplateDefinition, 'id' | 'createdAt' | 'updatedAt'>): DbShowTemplateInsert => {
  return {
    name: template.name,
    show_type: template.showType || 'Other',
    description: template.description || null,
    template_data: JSON.parse(JSON.stringify({
      organization: template.organization,
      version: template.version,
      classFields: template.classFields,
      classNamePattern: template.classNamePattern,
      defaults: template.defaults,
      validation: template.validation,
      customFields: template.customFields,
    })),
    default_pre_entry_fee: template.defaults.entryFee || null,
    default_max_entries_per_dog: template.defaults.maxEntries || null,
    created_by: null,
    is_public: false,
  };
};

/**
 * Convert ShowTemplateDefinition updates to DbShowTemplateUpdate
 */
export const mapShowTemplateToUpdate = (updates: Partial<ShowTemplateDefinition>): DbShowTemplateUpdate => {
  const update: DbShowTemplateUpdate = {};

  if (updates.name !== undefined) update.name = updates.name;
  if (updates.description !== undefined) update.description = updates.description || null;
  if (updates.showType !== undefined) update.show_type = updates.showType;

  // Handle template_data updates
  if (updates.organization !== undefined ||
      updates.version !== undefined ||
      updates.classFields !== undefined ||
      updates.classNamePattern !== undefined ||
      updates.defaults !== undefined ||
      updates.validation !== undefined ||
      updates.customFields !== undefined) {

    const templateData: Record<string, unknown> = {};

    if (updates.organization !== undefined) templateData.organization = updates.organization;
    if (updates.version !== undefined) templateData.version = updates.version;
    if (updates.showType !== undefined) templateData.showType = updates.showType;
    if (updates.classFields !== undefined) templateData.classFields = updates.classFields;
    if (updates.classNamePattern !== undefined) templateData.classNamePattern = updates.classNamePattern;
    if (updates.defaults !== undefined) templateData.defaults = updates.defaults;
    if (updates.validation !== undefined) templateData.validation = updates.validation;
    if (updates.customFields !== undefined) templateData.customFields = updates.customFields;

    update.template_data = JSON.parse(JSON.stringify(templateData));
  }

  if (updates.defaults?.entryFee !== undefined) update.default_pre_entry_fee = updates.defaults.entryFee;
  if (updates.defaults?.maxEntries !== undefined) update.default_max_entries_per_dog = updates.defaults.maxEntries;

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
    organization: (templateData.organization as Organization) || 'OTHER',
    showType: (dbTemplate.show_type as ShowType) || (templateData.showType as ShowType) || 'Other',
    description: dbTemplate.description as string,
    version: templateData.version as string || '1.0',
    classFields: templateData.classFields as ShowFieldDefinition[] || [],
    classNamePattern: templateData.classNamePattern as string || '{name}',
    defaults: {
      entryFee: dbTemplate.default_pre_entry_fee as number,
      maxEntries: dbTemplate.default_max_entries_per_dog as number,
      timeLimit: (templateData.defaults as Record<string, unknown>)?.timeLimit as string,
      requiresJumpHeight: (templateData.defaults as Record<string, unknown>)?.requiresJumpHeight as boolean,
      requiresArmband: (templateData.defaults as Record<string, unknown>)?.requiresArmband as boolean,
      allowsMultipleRuns: (templateData.defaults as Record<string, unknown>)?.allowsMultipleRuns as boolean,
      ...(templateData.defaults as Record<string, unknown>) || {},
    },
    ...(templateData.validation ? { validation: templateData.validation as NonNullable<ShowTemplateDefinition['validation']> } : {}),
    ...(templateData.customFields ? { customFields: templateData.customFields as ShowFieldDefinition[] } : {}),
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
    template_type: 'show',
    field_name: field.name,
    field_type: field.type,
    field_label: field.name.charAt(0).toUpperCase() + field.name.slice(1),
    is_required: field.required,
    default_value: field.defaultValue ? String(field.defaultValue) : null,
    sort_order: order,
    validation_rules: {
      ...(field.options ? { options: field.options } : {}),
      ...(field.showWhen ? { showWhen: field.showWhen } : {}),
    },
  };
};

/**
 * Convert DbTemplateField to ShowFieldDefinition
 */
export const mapTemplateFieldToShowField = (dbField: DbTemplateField): ShowFieldDefinition => {
  const validationRules = dbField.validation_rules as Record<string, unknown> | null;

  return {
    name: dbField.field_name,
    type: dbField.field_type as 'select' | 'text' | 'number' | 'boolean',
    required: dbField.is_required || false,
    ...(validationRules?.options ? { options: validationRules.options as string[] } : {}),
    ...(dbField.default_value ? { defaultValue: dbField.default_value } : {}),
    ...(dbField.field_label ? { description: dbField.field_label } : {}),
    ...(validationRules?.showWhen ? { showWhen: validationRules.showWhen as NonNullable<ShowFieldDefinition['showWhen']> } : {}),
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
