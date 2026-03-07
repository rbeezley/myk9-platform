import {
  ClassTemplate,
  TemplateFilter,
  TemplateStatus,
  TemplateType,
} from '@/types/template.types';

/**
 * Generates a unique template ID using timestamp and random suffix.
 */
export function generateTemplateId(): string {
  return `template-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Determines whether a template can be edited and provides a reason if not.
 */
export function checkCanEdit(template: ClassTemplate): { canEdit: boolean; reason?: string } {
  // Allow editing if explicitly allowed
  if (template.allowEditing) {
    return { canEdit: true };
  }

  // Allow editing of draft and custom templates
  if (template.status === TemplateStatus.DRAFT || template.type === TemplateType.CUSTOM) {
    return { canEdit: true };
  }

  // Allow editing of fork templates
  if (template.type === TemplateType.FORK) {
    return { canEdit: true };
  }

  // Official templates can be edited but with warning
  if (template.type === TemplateType.OFFICIAL) {
    return {
      canEdit: true,
      reason: 'This is an official template. Changes will affect all users of this template.',
    };
  }

  // Archived templates cannot be edited
  if (template.status === TemplateStatus.ARCHIVED) {
    return {
      canEdit: false,
      reason: 'Archived templates cannot be edited. Please create a new version or copy.',
    };
  }

  // Default to allowing edits
  return { canEdit: true };
}

/**
 * Filters templates based on a TemplateFilter object.
 * Used by the searchTemplates action.
 */
export function filterTemplates(
  templates: ClassTemplate[],
  filter: TemplateFilter
): ClassTemplate[] {
  let filtered = templates; // Show all templates, not just active ones

  if (filter.organization) {
    filtered = filtered.filter(t => {
      // Handle enum comparison properly
      const templateOrg =
        typeof t.organization === 'object'
          ? String(Object.values(t.organization)[0] || '')
          : String(t.organization || '');
      const filterOrg = String(filter.organization);
      return templateOrg === filterOrg;
    });
  }

  if (filter.trialType) {
    filtered = filtered.filter(t => {
      // Handle enum comparison properly
      const templateType =
        typeof t.trialType === 'object'
          ? String(Object.values(t.trialType)[0] || '')
          : String(t.trialType || '');
      const filterType = String(filter.trialType);
      return templateType === filterType;
    });
  }

  if (filter.isActive !== undefined) {
    filtered = filtered.filter(t => t.isActive === filter.isActive);
  }

  if (filter.isOfficial !== undefined) {
    filtered = filtered.filter(t => t.isOfficial === filter.isOfficial);
  }

  if (filter.searchTerm) {
    filtered = applySearchTerm(filtered, filter.searchTerm);
  }

  return filtered;
}

/**
 * Filters templates by search term against name, description, organization, and trial type.
 */
export function applySearchTerm(templates: ClassTemplate[], searchTerm: string): ClassTemplate[] {
  const term = searchTerm.toLowerCase();
  return templates.filter(
    t =>
      t.templateName.toLowerCase().includes(term) ||
      t.description?.toLowerCase().includes(term) ||
      t.organization.toLowerCase().includes(term) ||
      t.trialType.toLowerCase().includes(term)
  );
}

/**
 * Applies active filters (organization, trial type, search query) to a list of templates.
 * Used by the getFilteredTemplates action.
 */
export function applyActiveFilters(
  templates: ClassTemplate[],
  filterOrganization: string | null,
  filterTrialType: string | null,
  searchQuery: string
): ClassTemplate[] {
  let filtered = templates.filter(t => t.isActive);

  if (filterOrganization) {
    filtered = filtered.filter(t => t.organization === filterOrganization);
  }

  if (filterTrialType) {
    filtered = filtered.filter(t => t.trialType === filterTrialType);
  }

  if (searchQuery) {
    filtered = applySearchTerm(filtered, searchQuery);
  }

  return filtered;
}

/**
 * Migrates persisted state from version 0 to version 1.
 */
export function migrateV0ToV1(persistedState: unknown): unknown {
  if (persistedState && typeof persistedState === 'object') {
    const state = persistedState as Record<string, unknown>;
    if (state.templates && Array.isArray(state.templates)) {
      state.templates = state.templates.map((template: unknown) => {
        const t = template as Record<string, unknown>;
        return {
          ...t,
          status: t.status || 'active',
          type: t.type || (t.isOfficial ? 'official' : 'custom'),
          isLatestVersion: t.isLatestVersion !== false,
          allowEditing: t.allowEditing || !t.isOfficial,
        };
      });
    }
  }
  return persistedState;
}
