import {
  TemplateFieldConfiguration,
  FieldDefinition,
  FieldCategory,
  TrialTypeField,
} from '@/types/field-definition-types';

/** Group fields by their category */
export function groupFieldsByCategory(
  fields: FieldDefinition[]
): Record<FieldCategory, FieldDefinition[]> {
  const grouped: Record<FieldCategory, FieldDefinition[]> = {
    [FieldCategory.IDENTITY]: [],
    [FieldCategory.SCHEDULING]: [],
    [FieldCategory.COMPETITION]: [],
    [FieldCategory.PERSONNEL]: [],
    [FieldCategory.FINANCIAL]: [],
    [FieldCategory.ADMINISTRATIVE]: [],
  };

  fields.forEach(field => {
    grouped[field.category].push(field);
  });

  return grouped;
}

/** Filter fields by category and search term */
export function filterFields(
  fields: FieldDefinition[],
  category: FieldCategory | 'all',
  searchTerm: string
): FieldDefinition[] {
  let filtered = fields;

  if (category !== 'all') {
    filtered = filtered.filter(f => f.category === category);
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(
      f =>
        f.displayName.toLowerCase().includes(term) ||
        f.fieldName.toLowerCase().includes(term) ||
        f.description?.toLowerCase().includes(term)
    );
  }

  return filtered;
}

/** Check if a field is present in the configurations */
export function isFieldConfigured(
  fieldName: TrialTypeField,
  configs: TemplateFieldConfiguration[]
): boolean {
  return configs.some(config => config.fieldName === fieldName);
}

/** Get configuration for a specific field */
export function getFieldConfig(
  fieldName: TrialTypeField,
  configs: TemplateFieldConfiguration[]
): TemplateFieldConfiguration | undefined {
  return configs.find(config => config.fieldName === fieldName);
}

/** Create a default configuration for a newly toggled field */
export function createDefaultFieldConfig(
  field: FieldDefinition,
  displayOrder: number
): TemplateFieldConfiguration {
  return {
    fieldName: field.fieldName,
    required: field.required || false,
    visible: true,
    editable: true,
    displayOrder,
    defaultValue: field.defaultValue,
  };
}

/** Count how many fields in a category are configured */
export function getConfiguredCount(
  availableFields: FieldDefinition[],
  category: FieldCategory,
  configs: TemplateFieldConfiguration[]
): number {
  return availableFields
    .filter(f => f.category === category)
    .filter(f => isFieldConfigured(f.fieldName, configs)).length;
}

/** Count total fields in a category */
export function getTotalCount(availableFields: FieldDefinition[], category: FieldCategory): number {
  return availableFields.filter(f => f.category === category).length;
}
