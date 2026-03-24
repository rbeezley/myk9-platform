/**
 * Hook to fetch class requirements from the database based on organization, element, and level.
 * Used to auto-fill requirement fields in class edit forms (ClassEditPanel).
 *
 * NOTE: For read-only requirements display (ClassRequirementsPanel), use the
 * React Query version at `hooks/queries/useClassRequirements.ts` instead.
 * This hook provides auto-fill metadata; the query hook provides raw display data.
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/services/database/supabaseClient';
import { useShowStore } from '@/store/showStore';
import { logger } from '@/services/LoggingService';

/** Requirements data from the class_requirements table */
export interface ClassRequirementsData {
  id: number;
  organization: string;
  element: string;
  level: string;
  hides: string;
  distractions: string;
  height: string;
  area_count: number;
  time_limit_text: string;
  area_size: string;
  has_30_second_warning?: boolean;
  time_type?: 'fixed' | 'range' | 'dictated';
  warning_notes?: string;
  required_calls?: string;
  final_response?: string;
  containers_items?: string;
}

/** Describes whether a field value comes from rules or is set by the judge */
export interface RequirementFieldMeta {
  /** The value dictated by rules, if any */
  ruleValue: string;
  /** Whether the judge can override/set this value */
  isJudgeSettable: boolean;
  /** Placeholder text for judge-settable fields showing the valid range */
  placeholder: string;
}

/** Auto-fill result with field metadata for the form */
export interface ClassRequirementsAutoFill {
  hidesUsed: RequirementFieldMeta;
  distractionsUsed: RequirementFieldMeta;
  itemsUsed: RequirementFieldMeta;
  timeLimitText: RequirementFieldMeta;
}

/**
 * Determine the organization type string for querying class_requirements.
 * The show's organization field may contain values like "AKC Scent Work"
 * but the class_requirements table uses simple "AKC", "UKC", "ASCA".
 */
function normalizeOrganization(orgString: string): string | null {
  const lower = orgString.toLowerCase();
  if (lower.includes('akc')) return 'AKC';
  if (lower.includes('ukc')) return 'UKC';
  if (lower.includes('asca')) return 'ASCA';
  return null;
}

/**
 * Check if a time_limit_text represents a range (judge-settable) vs a fixed value.
 */
function isTimeRange(text: string): boolean {
  return text.includes(' - ') || text.toLowerCase().includes(' to ') || /\d+\s*-\s*\d+/.test(text);
}

/**
 * Build the auto-fill metadata from raw requirements data.
 */
function buildAutoFill(
  requirements: ClassRequirementsData | null
): ClassRequirementsAutoFill | null {
  if (!requirements) return null;

  const hidesValue = requirements.hides || '';
  const distractionsValue = requirements.distractions || '';
  const itemsValue = requirements.containers_items || '';
  const timeLimitText = requirements.time_limit_text || '';

  // Hides: dictated by rules (e.g., "1", "1-3", "2-4")
  const hidesIsRange = hidesValue.includes('-') || hidesValue.toLowerCase().includes(' to ');

  // Distractions: dictated by rules (e.g., "0", "0-3")
  const distractionsIsRange =
    distractionsValue.includes('-') || distractionsValue.toLowerCase().includes(' to ');

  // Time limit: may be fixed, range, or dictated
  const timeIsJudgeSettable =
    requirements.time_type === 'range' ||
    requirements.time_type === 'dictated' ||
    isTimeRange(timeLimitText);

  return {
    hidesUsed: {
      ruleValue: hidesValue,
      isJudgeSettable: hidesIsRange,
      placeholder: hidesIsRange
        ? `Set by judge (${hidesValue})`
        : hidesValue || 'Enter number of hides',
    },
    distractionsUsed: {
      ruleValue: distractionsValue,
      isJudgeSettable: distractionsIsRange,
      placeholder: distractionsIsRange
        ? `Set by judge (${distractionsValue})`
        : distractionsValue || 'Enter distractions',
    },
    itemsUsed: {
      ruleValue: itemsValue,
      isJudgeSettable: false,
      placeholder: itemsValue || 'Enter items used',
    },
    timeLimitText: {
      ruleValue: timeLimitText,
      isJudgeSettable: timeIsJudgeSettable,
      placeholder: timeIsJudgeSettable
        ? `Set by judge (${timeLimitText})`
        : timeLimitText || 'Not specified',
    },
  };
}

interface UseClassRequirementsOptions {
  element: string;
  level: string;
  showId?: string | undefined;
}

interface UseClassRequirementsResult {
  requirements: ClassRequirementsData | null;
  autoFill: ClassRequirementsAutoFill | null;
  loading: boolean;
  organization: string | null;
}

/**
 * Fetches class requirements based on the show's organization and the class's element/level.
 * Returns auto-fill metadata for requirement fields.
 */
export function useClassRequirements({
  element,
  level,
  showId,
}: UseClassRequirementsOptions): UseClassRequirementsResult {
  const { shows } = useShowStore();
  const [requirements, setRequirements] = useState<ClassRequirementsData | null>(null);
  const [loading, setLoading] = useState(false);

  // Resolve the organization from the show
  const organization = useMemo(() => {
    if (!showId) return null;
    const show = shows.find(s => s.id === showId);
    if (show?.organization) {
      return normalizeOrganization(show.organization);
    }
    return null;
  }, [shows, showId]);

  useEffect(() => {
    if (!organization || !element || !level) {
      setRequirements(null);
      return;
    }

    let cancelled = false;

    const fetchRequirements = async () => {
      setLoading(true);
      try {
        // class_requirements table is not in the typed Database schema;
        // use an untyped client reference to query it.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const untypedSupabase = supabase as any;
        const { data, error } = (await untypedSupabase
          .from('class_requirements')
          .select('*')
          .eq('organization', organization)
          .eq('element', element)
          .eq('level', level)
          .single()) as {
          data: ClassRequirementsData | null;
          error: { message: string } | null;
        };

        if (!cancelled) {
          if (error) {
            logger.debug(
              `No requirements found for ${organization} ${element} ${level}`,
              'classes',
              {}
            );
            setRequirements(null);
          } else {
            setRequirements(data as ClassRequirementsData);
          }
        }
      } catch (err) {
        if (!cancelled) {
          logger.warn('Error fetching class requirements', 'classes', {}, err as Error);
          setRequirements(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRequirements();

    return () => {
      cancelled = true;
    };
  }, [organization, element, level]);

  const autoFill = useMemo(() => buildAutoFill(requirements), [requirements]);

  return { requirements, autoFill, loading, organization };
}
