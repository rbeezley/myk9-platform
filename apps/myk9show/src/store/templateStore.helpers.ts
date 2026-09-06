import { ClassTemplate, TemplateFilter } from '@/types/template.types';
import { AKC_SCENT_WORK_FALLBACK_TEMPLATE_ID } from '@/data/templates/akcScentWorkTemplate';

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
 * Ids of the locally bundled templates the store injects only when the DB fetch
 * fails (offline / transient PostgREST error). They are the ONLY templates
 * `dropSupersededFallbacks` is allowed to remove: DB rows and user-created custom
 * templates are never touched.
 */
export const LOCAL_FALLBACK_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  AKC_SCENT_WORK_FALLBACK_TEMPLATE_ID,
]);

/** Identity of a real-world official template, independent of its id. */
function templateIdentityKey(template: ClassTemplate): string {
  return `${template.organization}|${template.trialType}`;
}

/**
 * Removes locally bundled fallback templates that an authoritative DB template has
 * superseded (MYK9-432).
 *
 * The store is persisted, so a single failed fetch writes the hardcoded fallback to
 * a browser forever. Because the DB row carries a different (uuid) id, a plain
 * replace-by-id upsert appends it ALONGSIDE the fallback and that browser is offered
 * two near-identically named AKC Scent Work templates from then on. A fallback is
 * dropped only when the incoming DB batch actually contains a template for the same
 * organization + trial type, so the offline path is untouched: with nothing incoming
 * (fetch failed, or returned no rows) nothing is removed and the fallback keeps
 * serving show-day traffic.
 */
export function dropSupersededFallbacks(
  existing: ClassTemplate[],
  incoming: ClassTemplate[]
): ClassTemplate[] {
  if (incoming.length === 0) return existing;

  const incomingIds = new Set(incoming.map(t => t.id));
  const incomingIdentities = new Set(incoming.map(templateIdentityKey));

  return existing.filter(
    t =>
      !(
        LOCAL_FALLBACK_TEMPLATE_IDS.has(t.id) &&
        !incomingIds.has(t.id) &&
        incomingIdentities.has(templateIdentityKey(t))
      )
  );
}

/**
 * Merges freshly-fetched DB templates into the existing (possibly persisted) list.
 *
 * Unlike a naive append, this REPLACES any existing template whose id matches an
 * incoming one, then appends incoming templates that are genuinely new. This is
 * what lets a stale client converge: e.g. a cached ASCA template holding 16 class
 * definitions is overwritten by the fresh 32-definition version (same id) rather
 * than being kept because "the id already exists". Templates not present in
 * `incoming` (user-created custom templates) are preserved untouched — except for
 * the local fallbacks a DB template supersedes, see `dropSupersededFallbacks`.
 */
export function upsertTemplates(
  existing: ClassTemplate[],
  incoming: ClassTemplate[]
): ClassTemplate[] {
  // Retire any local fallback the incoming DB batch now supersedes, so the two
  // never coexist in a browser that once took the offline path (MYK9-432).
  const kept = dropSupersededFallbacks(existing, incoming);

  const incomingById = new Map(incoming.map(t => [t.id, t]));
  // Replace in place where a fresh version exists, preserving order + custom entries.
  const merged = kept.map(t => incomingById.get(t.id) ?? t);
  // Append incoming templates that weren't already present.
  const keptIds = new Set(kept.map(t => t.id));
  const added = incoming.filter(t => !keptIds.has(t.id));
  return [...merged, ...added];
}

/**
 * Decides whether the persisted template cache should be revalidated against the DB.
 *
 * Returns true when the cache has never been fetched (`fetchedAt == null`) or when
 * it is older than `ttlMs`. With `ttlMs === 0` this always returns true, giving
 * "revalidate on every load" behavior — the current configured default. The knob
 * exists so freshness can be traded against network chatter without touching call
 * sites. Callers must still gate on connectivity (offline-first): a `true` here
 * only means "refetch is due", not "refetch regardless of network".
 */
export function shouldRevalidate(
  fetchedAt: number | null | undefined,
  ttlMs: number,
  now: number
): boolean {
  if (fetchedAt == null) return true;
  return now - fetchedAt >= ttlMs;
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
