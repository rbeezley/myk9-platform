// Type mapping utilities for Template Store <-> Database integration
// Phase 4.1: Template System Integration
//
// Note: Template tables store most structured data in JSONB `template_data` columns.
// Organization, show type, fields, and patterns are stored in template_data rather than
// as individual columns.

import type {
  ClassTemplate,
  ClassTemplateField,
  GeneratedClass,
} from '@/types/class-template-types';
import type {
  ShowTemplateDefinition,
  ShowFieldDefinition,
  Organization,
  ShowType,
} from '@/types/show-template-types';
import type {
  DbClassTemplate,
  DbClassTemplateInsert,
  DbClassTemplateUpdate,
  DbShowTemplate,
  DbShowTemplateInsert,
  DbShowTemplateUpdate,
  DbTemplateField,
  DbTemplateFieldInsert,
} from '@/types/database-mappings';
import type { Json } from '@/types/supabase';

// ===== TEMPLATE DATA JSONB INTERFACES =====

/** Shape of the `template_data` JSONB column in `class_templates` */
interface ClassTemplateData {
  organization?: ClassTemplate['organization'];
  showType?: string;
  fields?: ClassTemplateField[];
  classPattern?: string;
  requiresJumpHeight?: boolean;
}

/** Shape of the `template_data` JSONB column in `show_templates` */
interface ShowTemplateData {
  organization?: Organization;
  showType?: ShowType;
  version?: string;
  classFields?: ShowFieldDefinition[];
  classNamePattern?: string;
  defaults?: ShowTemplateDefinition['defaults'];
  validation?: ShowTemplateDefinition['validation'];
  customFields?: ShowFieldDefinition[];
}

/**
 * Extended DbClassTemplate that includes the optional `template_fields` relation
 * returned by Supabase when using `.select('*, template_fields(*)')`.
 */
type DbClassTemplateWithFields = DbClassTemplate & {
  template_fields?: DbTemplateField[];
};

// ===== HELPER FUNCTIONS =====

/** Safely parse a Json value as a typed template data object */
function parseClassTemplateData(data: Json | null): ClassTemplateData {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  return data as unknown as ClassTemplateData;
}

function parseShowTemplateData(data: Json | null): ShowTemplateData {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  return data as unknown as ShowTemplateData;
}

// ===== CLASS TEMPLATE MAPPERS =====

/**
 * Convert ClassTemplate to DbClassTemplateInsert (for database)
 *
 * Actual class_templates columns: competition_type, created_at, created_by,
 * default_entry_fee, default_max_entries, default_time_limit_seconds, description,
 * element, id, is_public, level, name, template_data, updated_at
 */
export const mapClassTemplateToInsert = (
  template: Omit<ClassTemplate, 'id' | 'createdAt' | 'updatedAt'>
): DbClassTemplateInsert => {
  return {
    name: template.name,
    description: template.description ?? null,
    element: template.fields.find(f => f.type === 'element')?.values[0] ?? null,
    level: template.fields.find(f => f.type === 'level')?.values[0] ?? null,
    default_entry_fee: null,
    default_max_entries: template.maxEntriesDefault ?? null,
    default_time_limit_seconds: null,
    is_public: false,
    created_by: null,
    // Store structured template data (organization, showType, fields, classPattern) in JSON
    template_data: JSON.parse(
      JSON.stringify({
        organization: template.organization,
        showType: template.showType,
        fields: template.fields,
        classPattern: template.classPattern,
        requiresJumpHeight: template.requiresJumpHeight,
      })
    ) as Json,
  };
};

/**
 * Convert ClassTemplate updates to DbClassTemplateUpdate
 */
export const mapClassTemplateToUpdate = (
  updates: Partial<ClassTemplate>
): DbClassTemplateUpdate => {
  const update: DbClassTemplateUpdate = {};

  if (updates.name !== undefined) update.name = updates.name;
  if (updates.description !== undefined) update.description = updates.description ?? null;
  if (updates.maxEntriesDefault !== undefined)
    update.default_max_entries = updates.maxEntriesDefault ?? null;

  // Store structured updates in template_data
  const hasTemplateDataUpdates =
    updates.organization !== undefined ||
    updates.showType !== undefined ||
    updates.fields !== undefined ||
    updates.classPattern !== undefined ||
    updates.requiresJumpHeight !== undefined;

  if (hasTemplateDataUpdates) {
    const templateData: ClassTemplateData = {};
    if (updates.organization !== undefined) templateData.organization = updates.organization;
    if (updates.showType !== undefined) templateData.showType = updates.showType;
    if (updates.fields !== undefined) templateData.fields = updates.fields;
    if (updates.classPattern !== undefined) templateData.classPattern = updates.classPattern;
    if (updates.requiresJumpHeight !== undefined)
      templateData.requiresJumpHeight = updates.requiresJumpHeight;
    update.template_data = JSON.parse(JSON.stringify(templateData)) as Json;
  }

  return update;
};

/**
 * Convert database class template result to ClassTemplate type
 */
export const mapDatabaseToClassTemplate = (
  dbTemplate: DbClassTemplateWithFields
): ClassTemplate => {
  const templateData = parseClassTemplateData(dbTemplate.template_data);

  // Fields can come from template_fields relation or template_data JSON
  const templateFields = Array.isArray(dbTemplate.template_fields)
    ? dbTemplate.template_fields.map(mapDatabaseToClassTemplateField)
    : Array.isArray(templateData.fields)
      ? templateData.fields
      : [];

  return {
    id: dbTemplate.id,
    name: dbTemplate.name,
    organization: templateData.organization ?? 'OTHER',
    showType: templateData.showType ?? '',
    fields: templateFields,
    classPattern: templateData.classPattern ?? '{name}',
    requiresJumpHeight:
      templateData.requiresJumpHeight ?? templateFields.some(field => field.name === 'jumpHeight'),
    createdAt: new Date(dbTemplate.created_at ?? new Date().toISOString()),
    updatedAt: new Date(dbTemplate.updated_at ?? new Date().toISOString()),
    ...(dbTemplate.description != null ? { description: dbTemplate.description } : {}),
    ...(dbTemplate.default_max_entries != null
      ? { maxEntriesDefault: dbTemplate.default_max_entries }
      : {}),
  };
};

/**
 * Convert database template field to ClassTemplateField
 */
export const mapDatabaseToClassTemplateField = (dbField: DbTemplateField): ClassTemplateField => {
  // Field values may be stored in validation_rules JSON
  const validationRules = dbField.validation_rules as Record<string, Json | undefined> | null;
  const fieldValues = (
    Array.isArray(validationRules?.options) ? validationRules.options : []
  ) as string[];

  return {
    name: dbField.field_name,
    type: dbField.field_type as ClassTemplateField['type'],
    values: fieldValues,
    ...(dbField.is_required != null ? { optional: !dbField.is_required } : {}),
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
    validation_rules: { options: field.values } as unknown as Json,
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
export const mapShowTemplateToInsert = (
  template: Omit<ShowTemplateDefinition, 'id' | 'createdAt' | 'updatedAt'>
): DbShowTemplateInsert => {
  return {
    name: template.name,
    show_type: template.showType ?? 'Other',
    description: template.description ?? null,
    template_data: JSON.parse(
      JSON.stringify({
        organization: template.organization,
        version: template.version,
        classFields: template.classFields,
        classNamePattern: template.classNamePattern,
        defaults: template.defaults,
        validation: template.validation,
        customFields: template.customFields,
      })
    ) as Json,
    default_pre_entry_fee: template.defaults.entryFee ?? null,
    default_max_entries_per_dog: template.defaults.maxEntries ?? null,
    created_by: null,
    is_public: false,
  };
};

/**
 * Convert ShowTemplateDefinition updates to DbShowTemplateUpdate
 */
export const mapShowTemplateToUpdate = (
  updates: Partial<ShowTemplateDefinition>
): DbShowTemplateUpdate => {
  const update: DbShowTemplateUpdate = {};

  if (updates.name !== undefined) update.name = updates.name;
  if (updates.description !== undefined) update.description = updates.description ?? null;
  if (updates.showType !== undefined) update.show_type = updates.showType;

  // Handle template_data updates
  if (
    updates.organization !== undefined ||
    updates.version !== undefined ||
    updates.classFields !== undefined ||
    updates.classNamePattern !== undefined ||
    updates.defaults !== undefined ||
    updates.validation !== undefined ||
    updates.customFields !== undefined
  ) {
    const templateData: ShowTemplateData = {};

    if (updates.organization !== undefined) templateData.organization = updates.organization;
    if (updates.version !== undefined) templateData.version = updates.version;
    if (updates.showType !== undefined) templateData.showType = updates.showType;
    if (updates.classFields !== undefined) templateData.classFields = updates.classFields;
    if (updates.classNamePattern !== undefined)
      templateData.classNamePattern = updates.classNamePattern;
    if (updates.defaults !== undefined) templateData.defaults = updates.defaults;
    if (updates.validation !== undefined) templateData.validation = updates.validation;
    if (updates.customFields !== undefined) templateData.customFields = updates.customFields;

    update.template_data = JSON.parse(JSON.stringify(templateData)) as Json;
  }

  if (updates.defaults?.entryFee !== undefined)
    update.default_pre_entry_fee = updates.defaults.entryFee;
  if (updates.defaults?.maxEntries !== undefined)
    update.default_max_entries_per_dog = updates.defaults.maxEntries;

  return update;
};

/**
 * Convert database show template result to ShowTemplateDefinition
 */
export const mapDatabaseToShowTemplate = (dbTemplate: DbShowTemplate): ShowTemplateDefinition => {
  const templateData = parseShowTemplateData(dbTemplate.template_data);

  const parsedDefaults = templateData.defaults ?? {};

  return {
    id: dbTemplate.id,
    name: dbTemplate.name,
    organization: templateData.organization ?? 'OTHER',
    showType: (dbTemplate.show_type as ShowType) ?? templateData.showType ?? 'Other',
    version: templateData.version ?? '1.0',
    classFields: templateData.classFields ?? [],
    classNamePattern: templateData.classNamePattern ?? '{name}',
    defaults: {
      ...parsedDefaults,
      ...(dbTemplate.default_pre_entry_fee != null
        ? { entryFee: dbTemplate.default_pre_entry_fee }
        : {}),
      ...(dbTemplate.default_max_entries_per_dog != null
        ? { maxEntries: dbTemplate.default_max_entries_per_dog }
        : {}),
    },
    createdAt: new Date(dbTemplate.created_at ?? new Date().toISOString()),
    updatedAt: new Date(dbTemplate.updated_at ?? new Date().toISOString()),
    ...(dbTemplate.description != null ? { description: dbTemplate.description } : {}),
    ...(templateData.validation ? { validation: templateData.validation } : {}),
    ...(templateData.customFields ? { customFields: templateData.customFields } : {}),
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
    default_value: field.defaultValue != null ? String(field.defaultValue) : null,
    sort_order: order,
    validation_rules: {
      ...(field.options ? { options: field.options } : {}),
      ...(field.showWhen ? { showWhen: field.showWhen } : {}),
    } as unknown as Json,
  };
};

/**
 * Convert DbTemplateField to ShowFieldDefinition
 */
export const mapTemplateFieldToShowField = (dbField: DbTemplateField): ShowFieldDefinition => {
  const validationRules = dbField.validation_rules as Record<string, Json | undefined> | null;

  return {
    name: dbField.field_name,
    type: dbField.field_type as ShowFieldDefinition['type'],
    required: dbField.is_required ?? false,
    ...(validationRules?.options ? { options: validationRules.options as string[] } : {}),
    ...(dbField.default_value != null ? { defaultValue: dbField.default_value } : {}),
    ...(dbField.field_label != null ? { description: dbField.field_label } : {}),
    ...(validationRules?.showWhen
      ? { showWhen: validationRules.showWhen as NonNullable<ShowFieldDefinition['showWhen']> }
      : {}),
  };
};

// ===== UTILITY MAPPERS =====

/**
 * Convert array of database class templates to ClassTemplate array
 */
export const mapDatabaseClassTemplatesArray = (
  dbTemplates: DbClassTemplateWithFields[]
): ClassTemplate[] => {
  return dbTemplates.map(mapDatabaseToClassTemplate);
};

/**
 * Convert array of database show templates to ShowTemplateDefinition array
 */
export const mapDatabaseShowTemplatesArray = (
  dbTemplates: DbShowTemplate[]
): ShowTemplateDefinition[] => {
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

  const elements = elementField?.values ?? [''];
  const levels = levelField?.values ?? [''];
  const sections = sectionField?.values ?? [''];

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
    id: childFields.id ?? parentTemplate.id,
    fields: [...parentTemplate.fields, ...(childFields.fields ?? [])],
    createdAt: childFields.createdAt ?? parentTemplate.createdAt,
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
  const patternPlaceholders = template.classPattern.match(/\{(\w+)\}/g) ?? [];
  patternPlaceholders.forEach(placeholder => {
    const fieldName = placeholder.replace(/[{}]/g, '');
    if (!fieldNames.includes(fieldName)) {
      errors.push(`Pattern placeholder '${placeholder}' has no matching field`);
    }
  });

  return errors;
};
