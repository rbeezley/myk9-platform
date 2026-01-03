// Template inheritance and customization logic
// Phase 4.1: Template System Integration

import type { 
  ClassTemplate, 
  ClassTemplateField
} from '@/types/class-template-types';
import type { 
  ShowTemplateDefinition, 
  ShowFieldDefinition,
  Organization 
} from '@/types/show-template-types';
import { validateTemplateStructure } from '@/services/mappers/templateMappers';

// ===== TEMPLATE INHERITANCE SYSTEM =====

/**
 * Template inheritance configuration
 */
export interface TemplateInheritanceConfig {
  parentId: string;
  childOverrides: Partial<ClassTemplate>;
  fieldOverrides: Record<string, Partial<ClassTemplateField>>;
  addedFields: ClassTemplateField[];
  removedFields: string[];
}

/**
 * Template customization options
 */
export interface TemplateCustomization {
  id: string;
  templateId: string;
  name: string;
  customizations: {
    fieldOverrides: Record<string, unknown>;
    addedFields: ShowFieldDefinition[];
    removedFields: string[];
    defaults: Record<string, unknown>;
  };
  isActive: boolean;
  createdAt: Date;
}

/**
 * Create a child template from a parent template with customizations
 */
export const createInheritedTemplate = (
  parentTemplate: ClassTemplate,
  config: TemplateInheritanceConfig
): ClassTemplate => {
  // Start with parent template as base
  const inheritedTemplate: ClassTemplate = {
    ...parentTemplate,
    ...config.childOverrides,
    id: config.childOverrides.id || `${parentTemplate.id}_child_${Date.now()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Process field modifications
  let fields = [...parentTemplate.fields];

  // Remove specified fields
  if (config.removedFields.length > 0) {
    fields = fields.filter(field => !config.removedFields.includes(field.name));
  }

  // Apply field overrides
  fields = fields.map(field => {
    const override = config.fieldOverrides[field.name];
    return override ? { ...field, ...override } : field;
  });

  // Add new fields
  if (config.addedFields.length > 0) {
    fields = [...fields, ...config.addedFields];
  }

  inheritedTemplate.fields = fields;

  // Validate the resulting template
  const validationErrors = validateTemplateStructure(inheritedTemplate);
  if (validationErrors.length > 0) {
    throw new Error(`Template inheritance validation failed: ${validationErrors.join(', ')}`);
  }

  return inheritedTemplate;
};

/**
 * Merge multiple templates into a composite template
 */
export const mergeTemplates = (
  baseTemplate: ClassTemplate,
  ...mergingTemplates: Partial<ClassTemplate>[]
): ClassTemplate => {
  let mergedTemplate = { ...baseTemplate };

  mergingTemplates.forEach(template => {
    // Merge basic properties
    mergedTemplate = {
      ...mergedTemplate,
      ...template,
      id: template.id || mergedTemplate.id,
      createdAt: template.createdAt || mergedTemplate.createdAt,
      updatedAt: new Date(),
    };

    // Merge fields intelligently
    if (template.fields) {
      const existingFieldNames = new Set(mergedTemplate.fields.map(f => f.name));
      const newFields = template.fields.filter(f => !existingFieldNames.has(f.name));
      mergedTemplate.fields = [...mergedTemplate.fields, ...newFields];
    }
  });

  return mergedTemplate;
};

/**
 * Create a template variant with specific customizations
 */
export const createTemplateVariant = (
  baseTemplate: ClassTemplate,
  variantName: string,
  customizations: {
    fieldModifications?: Record<string, Partial<ClassTemplateField>>;
    additionalFields?: ClassTemplateField[];
    patternOverride?: string;
    defaultOverrides?: Partial<Pick<ClassTemplate, 'entryFeeDefault' | 'maxEntriesDefault'>>;
  }
): ClassTemplate => {
  const variant: ClassTemplate = {
    ...baseTemplate,
    id: `${baseTemplate.id}_variant_${variantName.toLowerCase().replace(/\s+/g, '_')}`,
    name: `${baseTemplate.name} - ${variantName}`,
    ...customizations.defaultOverrides,
    classPattern: customizations.patternOverride || baseTemplate.classPattern,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Apply field modifications
  if (customizations.fieldModifications) {
    variant.fields = variant.fields.map(field => {
      const modification = customizations.fieldModifications![field.name];
      return modification ? { ...field, ...modification } : field;
    });
  }

  // Add additional fields
  if (customizations.additionalFields) {
    variant.fields = [...variant.fields, ...customizations.additionalFields];
  }

  return variant;
};

// ===== SHOW TEMPLATE INHERITANCE =====

/**
 * Create an inherited show template with customizations
 */
export const createInheritedShowTemplate = (
  parentTemplate: ShowTemplateDefinition,
  customizations: {
    name?: string;
    organization?: string;
    fieldOverrides?: Record<string, Partial<ShowFieldDefinition>>;
    additionalFields?: ShowFieldDefinition[];
    removedFields?: string[];
    defaultOverrides?: Partial<ShowTemplateDefinition['defaults']>;
    validationOverrides?: Partial<ShowTemplateDefinition['validation']>;
  }
): ShowTemplateDefinition => {
  const inheritedTemplate: ShowTemplateDefinition = {
    ...parentTemplate,
    id: `${parentTemplate.id}_inherited_${Date.now()}`,
    name: customizations.name || `${parentTemplate.name} (Custom)`,
    organization: (customizations.organization || parentTemplate.organization) as Organization,
    version: `${parentTemplate.version}.custom`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Process field modifications
  let classFields = [...parentTemplate.classFields];

  // Remove specified fields
  if (customizations.removedFields) {
    classFields = classFields.filter(field => !customizations.removedFields!.includes(field.name));
  }

  // Apply field overrides
  if (customizations.fieldOverrides) {
    classFields = classFields.map(field => {
      const override = customizations.fieldOverrides![field.name];
      return override ? { ...field, ...override } : field;
    });
  }

  // Add additional fields
  if (customizations.additionalFields) {
    classFields = [...classFields, ...customizations.additionalFields];
  }

  inheritedTemplate.classFields = classFields;

  // Apply defaults and validation overrides
  if (customizations.defaultOverrides) {
    inheritedTemplate.defaults = {
      ...inheritedTemplate.defaults,
      ...customizations.defaultOverrides,
    };
  }

  if (customizations.validationOverrides) {
    inheritedTemplate.validation = {
      ...inheritedTemplate.validation,
      ...customizations.validationOverrides,
    };
  }

  return inheritedTemplate;
};

// ===== TEMPLATE RESOLUTION AND DEPENDENCY MANAGEMENT =====

/**
 * Resolve template dependencies and inheritance chain
 */
export const resolveTemplateDependencies = (
  template: ClassTemplate
): ClassTemplate[] => {
  const dependencyChain: ClassTemplate[] = [template];
  // Note: visitedIds would be used for tracking circular dependencies when inheritance is implemented
  // const visitedIds = new Set([template.id]);

  // For now, we don't have explicit parent-child relationships in the schema
  // This could be extended when we add inheritance metadata to the database
  
  return dependencyChain;
};

/**
 * Check if a template can be safely modified without breaking dependents
 */
export const canSafelyModifyTemplate = (
): { canModify: boolean; blockers: string[] } => {
  // Check for dependent templates (if we had explicit inheritance relationships)
  const blockers: string[] = [];
  
  // For now, all templates can be modified since we don't track dependencies
  // This would be enhanced when we add inheritance tracking
  
  return {
    canModify: true,
    blockers,
  };
};

// ===== TEMPLATE CUSTOMIZATION PERSISTENCE =====

/**
 * Serialize template customizations for storage
 */
export const serializeTemplateCustomization = (
  templateId: string,
  customizations: Record<string, unknown>
): string => {
  return JSON.stringify({
    templateId,
    customizations,
    version: '1.0',
    createdAt: new Date().toISOString(),
  });
};

/**
 * Deserialize template customizations from storage
 */
export const deserializeTemplateCustomization = (
  serialized: string
): TemplateCustomization | null => {
  try {
    const parsed = JSON.parse(serialized);
    return {
      id: parsed.id || `custom_${Date.now()}`,
      templateId: parsed.templateId,
      name: parsed.name || 'Custom Template',
      customizations: parsed.customizations || {},
      isActive: parsed.isActive !== false,
      createdAt: new Date(parsed.createdAt || Date.now()),
    };
  } catch (error) {
    console.error('Failed to deserialize template customization:', error);
    return null;
  }
};

// ===== TEMPLATE COMPARISON AND DIFF =====

/**
 * Compare two templates and return differences
 */
export const compareTemplates = (
  template1: ClassTemplate,
  template2: ClassTemplate
): {
  fieldDifferences: {
    added: ClassTemplateField[];
    removed: ClassTemplateField[];
    modified: Array<{
      field: string;
      changes: Record<string, { old: unknown; new: unknown }>;
    }>;
  };
  propertyDifferences: Record<string, { old: unknown; new: unknown }>;
} => {
  const result = {
    fieldDifferences: {
      added: [] as ClassTemplateField[],
      removed: [] as ClassTemplateField[],
      modified: [] as Array<{
        field: string;
        changes: Record<string, { old: unknown; new: unknown }>;
      }>,
    },
    propertyDifferences: {} as Record<string, { old: unknown; new: unknown }>,
  };

  // Compare basic properties
  const keys = new Set([...Object.keys(template1), ...Object.keys(template2)]);
  keys.forEach(key => {
    if (key === 'fields' || key === 'id' || key === 'createdAt' || key === 'updatedAt') return;
    
    const val1 = (template1 as unknown as Record<string, unknown>)[key];
    const val2 = (template2 as unknown as Record<string, unknown>)[key];
    
    if (val1 !== val2) {
      result.propertyDifferences[key] = { old: val1, new: val2 };
    }
  });

  // Compare fields
  const fields1Map = new Map(template1.fields.map(f => [f.name, f]));
  const fields2Map = new Map(template2.fields.map(f => [f.name, f]));

  // Find added fields
  template2.fields.forEach(field => {
    if (!fields1Map.has(field.name)) {
      result.fieldDifferences.added.push(field);
    }
  });

  // Find removed fields
  template1.fields.forEach(field => {
    if (!fields2Map.has(field.name)) {
      result.fieldDifferences.removed.push(field);
    }
  });

  // Find modified fields
  template1.fields.forEach(field1 => {
    const field2 = fields2Map.get(field1.name);
    if (field2) {
      const changes: Record<string, { old: unknown; new: unknown }> = {};
      
      if (field1.type !== field2.type) {
        changes.type = { old: field1.type, new: field2.type };
      }
      
      if (JSON.stringify(field1.values) !== JSON.stringify(field2.values)) {
        changes.values = { old: field1.values, new: field2.values };
      }
      
      if (field1.optional !== field2.optional) {
        changes.optional = { old: field1.optional, new: field2.optional };
      }
      
      if (Object.keys(changes).length > 0) {
        result.fieldDifferences.modified.push({
          field: field1.name,
          changes,
        });
      }
    }
  });

  return result;
};

// ===== TEMPLATE VALIDATION FOR INHERITANCE =====

/**
 * Validate that an inherited template maintains compatibility with its parent
 */
export const validateInheritance = (
  parentTemplate: ClassTemplate,
  childTemplate: ClassTemplate
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Check that essential fields are not removed
  const parentRequiredFields = parentTemplate.fields.filter(f => !f.optional);
  const childFieldNames = new Set(childTemplate.fields.map(f => f.name));

  parentRequiredFields.forEach(field => {
    if (!childFieldNames.has(field.name)) {
      errors.push(`Required field '${field.name}' from parent template cannot be removed`);
    }
  });

  // Check that field types remain compatible
  parentTemplate.fields.forEach(parentField => {
    const childField = childTemplate.fields.find(f => f.name === parentField.name);
    if (childField && parentField.type !== childField.type) {
      errors.push(`Field '${parentField.name}' type changed from '${parentField.type}' to '${childField.type}' - this may break compatibility`);
    }
  });

  // Check organization consistency
  if (parentTemplate.organization !== childTemplate.organization) {
    // This might be intentional for cross-organization templates
    // but worth noting
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};