/**
 * React Query hook for fetching class requirements from the sport_class_rules table.
 *
 * Joins sport_class_rules with sport_templates to resolve organization/element/level.
 * Used by the ClassRequirementsPanel to display requirements in a slide-out panel.
 * This is a read-only query hook; the existing useClassRequirements hook in
 * src/hooks/useClassRequirements.ts handles auto-fill logic for ClassEditForm.
 */

import { useQuery } from '@tanstack/react-query';
import { formatTimeLimitSeconds } from '@myk9/core';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { supabase } from '@/services/database/supabaseClient';

/** Raw row shape from the sport_class_rules + sport_templates join. */
interface SportClassRuleRow {
  element: string;
  level: string | null;
  class_name: string;
  section: string | null;
  max_time_seconds_fixed: number | null;
  max_time_seconds_min: number | null;
  max_time_seconds_max: number | null;
  hide_count_fixed: number | null;
  hide_count_min: number | null;
  hide_count_max: number | null;
  hides_known: boolean;
  area_count: number;
  has_blank: boolean;
  distraction_count_min: number;
  distraction_count_max: number;
  timer_mode: string;
  odors: string[];
  sport_templates: {
    organization: string;
  };
}

/** Display-ready requirements data derived from sport_class_rules. */
export interface ClassRequirements {
  organization: string;
  element: string;
  level: string;
  hides: string;
  distractions: string;
  time_limit_text: string;
  time_type: 'fixed' | 'range' | null;
  area_count: number;
  hides_known: boolean;
  has_blank: boolean;
  timer_mode: string;
  odors: string[];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format an integer range (fixed, min/max, or min-only) into a display string. */
function formatIntRange(fixed: number | null, min: number | null, max: number | null): string {
  if (fixed != null) return String(fixed);
  if (min != null && max != null) {
    return min === max ? String(min) : `${min}\u2013${max}`;
  }
  if (min != null) return `${min}+`;
  return '';
}

/** Build a human-readable time limit string from the time columns. */
function formatTimeLimit(fixed: number | null, min: number | null, max: number | null): string {
  if (fixed != null) return formatTimeLimitSeconds(fixed) || '0:00';
  if (min != null && max != null) {
    const minStr = formatTimeLimitSeconds(min) || '0:00';
    const maxStr = formatTimeLimitSeconds(max) || '0:00';
    if (min === max) return minStr;
    return `${minStr}\u2013${maxStr}`;
  }
  if (min != null) return `${formatTimeLimitSeconds(min) || '0:00'}+`;
  return '';
}

/** Determine time_type from the raw columns. */
function deriveTimeType(
  fixed: number | null,
  min: number | null,
  max: number | null
): 'fixed' | 'range' | null {
  if (fixed != null) return 'fixed';
  if (min != null || max != null) return 'range';
  return null;
}

/** Map a raw sport_class_rules row to the display ClassRequirements shape. */
function mapRowToRequirements(row: SportClassRuleRow): ClassRequirements {
  const org =
    row.sport_templates && typeof row.sport_templates === 'object'
      ? row.sport_templates.organization
      : '';

  return {
    organization: org,
    element: row.element,
    level: row.level ?? '',
    hides: formatIntRange(row.hide_count_fixed, row.hide_count_min, row.hide_count_max),
    distractions: formatIntRange(null, row.distraction_count_min, row.distraction_count_max),
    time_limit_text: formatTimeLimit(
      row.max_time_seconds_fixed,
      row.max_time_seconds_min,
      row.max_time_seconds_max
    ),
    time_type: deriveTimeType(
      row.max_time_seconds_fixed,
      row.max_time_seconds_min,
      row.max_time_seconds_max
    ),
    area_count: row.area_count,
    hides_known: row.hides_known,
    has_blank: row.has_blank,
    timer_mode: row.timer_mode,
    odors: row.odors ?? [],
  };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize an organization string to the canonical short form used in
 * sport_templates ('AKC', 'UKC', 'ASCA').
 *
 * Shows may store values like "AKC Scent Work" or "AKC" — both map to 'AKC'.
 * Returns null when the organization is unrecognized so the query stays disabled.
 */
export function normalizeOrganization(org: string): string | null {
  const lower = org.toLowerCase();
  if (lower.includes('akc')) return 'AKC';
  if (lower.includes('ukc')) return 'UKC';
  if (lower.includes('asca')) return 'ASCA';
  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseClassRequirementsOptions {
  organization: string | null;
  element: string;
  level: string;
  /** When false, the query won't fire (e.g., panel is closed). Defaults to true. */
  enabled?: boolean;
}

interface UseClassRequirementsResult {
  requirements: ClassRequirements | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Fetches class requirements from the sport_class_rules table, joined with
 * sport_templates to resolve organization.
 *
 * The query is only enabled when all three params (organization, element, level)
 * are truthy. Uses static caching since requirements don't change during a session.
 *
 * For classes with sections (e.g., Novice A/B), the level param may include the
 * section suffix. We strip it to match the DB level, then filter by section if
 * present.
 *
 * The organization param is normalized before querying so that values like
 * "AKC Scent Work" (stored in shows) resolve to "AKC" (used in sport_templates).
 */
export function useClassRequirements({
  organization,
  element,
  level,
  enabled: externalEnabled = true,
}: UseClassRequirementsOptions): UseClassRequirementsResult {
  const normalizedOrg = organization ? normalizeOrganization(organization) : null;
  const enabled = externalEnabled && !!normalizedOrg && !!element && !!level;

  const { data, isLoading, error } = useQuery<ClassRequirements | null>({
    queryKey: queryKeys.classRequirements(normalizedOrg ?? '', element, level),
    queryFn: async () => {
      // Parse section from level if present (e.g., "Novice A" → level "Novice", section "A")
      const sectionMatch = level.match(/^(.+?)\s+([AB])$/i);
      const dbLevel = sectionMatch ? sectionMatch[1] : level;
      const dbSection = sectionMatch ? sectionMatch[2].toUpperCase() : null;

      // Build the query against sport_class_rules joined with sport_templates
      let query = supabase
        .from('sport_class_rules')
        .select(
          `
          element,
          level,
          class_name,
          section,
          max_time_seconds_fixed,
          max_time_seconds_min,
          max_time_seconds_max,
          hide_count_fixed,
          hide_count_min,
          hide_count_max,
          hides_known,
          area_count,
          has_blank,
          distraction_count_min,
          distraction_count_max,
          timer_mode,
          odors,
          sport_templates!inner ( organization )
        `
        )
        .eq('sport_templates.organization', normalizedOrg!)
        .eq('element', element)
        .eq('level', dbLevel);

      if (dbSection) {
        query = query.eq('section', dbSection);
      } else {
        query = query.is('section', null);
      }

      const { data: rows, error: queryError } = await query.limit(1);

      if (queryError) {
        throw new Error(queryError.message);
      }

      if (!rows || rows.length === 0) {
        return null;
      }

      return mapRowToRequirements(rows[0] as unknown as SportClassRuleRow);
    },
    enabled,
    ...cacheStrategies.static,
  });

  return {
    requirements: data ?? null,
    isLoading: enabled ? isLoading : false,
    error: error as Error | null,
  };
}

// Export formatting helpers for reuse by the auto-fill hook
export { formatIntRange, formatTimeLimit, deriveTimeType, mapRowToRequirements };
export type { SportClassRuleRow };
