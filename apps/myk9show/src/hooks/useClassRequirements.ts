/**
 * Hook to fetch class requirements from sport_class_rules (joined with
 * sport_templates) based on organization, element, and level.
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
import {
  mapRowToRequirements,
  normalizeOrganization,
  type ClassRequirements,
  type SportClassRuleRow,
} from '@/hooks/queries/useClassRequirements';

/** @deprecated Use ClassRequirements from queries/useClassRequirements instead */
export type ClassRequirementsData = ClassRequirements;

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
  timeLimitText: RequirementFieldMeta;
}

/**
 * Build the auto-fill metadata from raw requirements data.
 */
function buildAutoFill(requirements: ClassRequirements | null): ClassRequirementsAutoFill | null {
  if (!requirements) return null;

  const hidesValue = requirements.hides || '';
  const distractionsValue = requirements.distractions || '';
  const timeLimitText = requirements.time_limit_text || '';

  // Hides: if the string contains an en-dash it's a range — judge picks exact count
  const hidesIsRange = hidesValue.includes('\u2013');

  // Distractions: same logic
  const distractionsIsRange = distractionsValue.includes('\u2013');

  // Time limit: range type means judge sets
  const timeIsJudgeSettable = requirements.time_type === 'range';

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
  requirements: ClassRequirements | null;
  autoFill: ClassRequirementsAutoFill | null;
  loading: boolean;
  organization: string | null;
}

/**
 * Fetches class requirements from sport_class_rules (joined with sport_templates)
 * based on the show's organization and the class's element/level.
 * Returns auto-fill metadata for requirement fields.
 */
export function useClassRequirements({
  element,
  level,
  showId,
}: UseClassRequirementsOptions): UseClassRequirementsResult {
  const { shows } = useShowStore();
  const [requirements, setRequirements] = useState<ClassRequirements | null>(null);
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
        // Parse section from level if present (e.g., "Novice A" → level "Novice", section "A")
        const sectionMatch = level.match(/^(.+?)\s+([AB])$/i);
        const dbLevel = sectionMatch ? sectionMatch[1] : level;
        const dbSection = sectionMatch ? sectionMatch[2].toUpperCase() : null;

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
          .eq('sport_templates.organization', organization)
          .eq('element', element)
          .eq('level', dbLevel);

        if (dbSection) {
          query = query.eq('section', dbSection);
        } else {
          query = query.is('section', null);
        }

        const { data, error } = await query.limit(1);

        if (!cancelled) {
          if (error) {
            logger.debug(
              `No requirements found for ${organization} ${element} ${level}`,
              'classes',
              {}
            );
            setRequirements(null);
          } else if (!data || data.length === 0) {
            setRequirements(null);
          } else {
            setRequirements(mapRowToRequirements(data[0] as unknown as SportClassRuleRow));
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
