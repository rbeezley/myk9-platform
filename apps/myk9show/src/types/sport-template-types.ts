// Types for the sport_templates DB tables and mapper to ClassTemplate
import type { ClassDefinition, FieldSpecification } from './template.types';
import {
  type ClassTemplate,
  Organization,
  TrialType,
  TemplateStatus,
  TemplateType,
} from './template.types';

// ---------------------------------------------------------------------------
// DB row types (match supabase/migrations/029_sport_templates.sql)
// ---------------------------------------------------------------------------

export interface SportTemplateRow {
  id: string;
  organization: string;
  sport_name: string;
  sport_code: string;
  elements: string[];
  levels: string[];
  section_mode: 'none' | 'novice-only' | 'all-levels';
  divisions: string[];
  operational_config: Record<string, unknown>;
  export_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SportClassRuleRow {
  id: string;
  sport_template_id: string;
  element: string;
  level: string | null;
  class_name: string;
  section: string | null;
  display_order: number;
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
  timer_mode: 'single' | 'dual';
  odors: string[];
  default_entry_fee: number | null;
  mrv_minutes: number | null;
  field_overrides: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SportTitleRow {
  id: string;
  sport_template_id: string;
  abbreviation: string;
  full_name: string;
  title_type: 'element' | 'level' | 'elite' | 'champion' | 'grand_champion' | 'continuation';
  required_legs: number;
  required_elements: string[];
  prerequisite_title_id: string | null;
  supersedes_title_ids: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

const ORG_MAP: Record<string, Organization> = {
  AKC: Organization.AKC,
  UKC: Organization.UKC,
  ASCA: Organization.ASCA,
  NACSW: Organization.NACSW,
  CPE: Organization.CPE,
  USDAA: Organization.USDAA,
  NADAC: Organization.NADAC,
};

const TRIAL_TYPE_MAP: Record<string, TrialType> = {
  'akc-scent-work': TrialType.SCENT_WORK,
  'ukc-nosework': TrialType.NOSEWORK,
  'asca-scent-detection': TrialType.SCENT_DETECTION,
};

function formatTimeRange(fixed: number | null, min: number | null, max: number | null): string {
  if (fixed != null) {
    const mins = fixed / 60;
    return mins === Math.floor(mins) ? `${mins} minutes` : `${mins.toFixed(1)} minutes`;
  }
  if (min != null && max != null) {
    return `${min / 60}-${max / 60} minutes`;
  }
  return '';
}

function formatHideDescription(rule: SportClassRuleRow): string {
  if (rule.hide_count_fixed != null) {
    const known = rule.hides_known ? 'Rules' : 'Judge';
    return `Set by ${known}: ${rule.hide_count_fixed}`;
  }
  if (rule.hide_count_min != null && rule.hide_count_max != null) {
    const known = rule.hides_known ? 'Rules' : 'Judge';
    return `Set by ${known}: ${rule.hide_count_min}-${rule.hide_count_max}`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Mapper: DB rows → ClassTemplate (consumed by templateStore)
// ---------------------------------------------------------------------------

export function mapSportTemplateToClassTemplate(
  template: SportTemplateRow,
  rules: SportClassRuleRow[]
): ClassTemplate {
  const org = ORG_MAP[template.organization] ?? Organization.OTHER;
  const trialType = TRIAL_TYPE_MAP[template.sport_code] ?? TrialType.OTHER;

  const classDefinitions: ClassDefinition[] = rules.map(rule => {
    const fieldOverrides: Record<string, Partial<FieldSpecification>> = {};

    // Time limits
    const timeStr = formatTimeRange(
      rule.max_time_seconds_fixed,
      rule.max_time_seconds_min,
      rule.max_time_seconds_max
    );
    if (timeStr) {
      const isFixed = rule.max_time_seconds_fixed != null;
      fieldOverrides.timeLimit1 = {
        ruleValue: timeStr,
        fieldSource: isFixed ? 'rule-based' : 'judge-set',
      };
    }

    // Search areas
    if (rule.area_count > 0) {
      fieldOverrides.searchAreas = { ruleValue: rule.area_count };
    }

    // Hides
    const hideDesc = formatHideDescription(rule);
    if (hideDesc) {
      fieldOverrides.hides = { ruleValue: hideDesc };
    }

    // Distractions
    if (rule.distraction_count_max > 0) {
      const val =
        rule.distraction_count_min === rule.distraction_count_max
          ? rule.distraction_count_min
          : `${rule.distraction_count_min}-${rule.distraction_count_max}`;
      fieldOverrides.distractions = { ruleValue: val };
    } else {
      fieldOverrides.distractions = { ruleValue: 0 };
    }

    // MRV / estimated judging time
    if (rule.mrv_minutes != null) {
      fieldOverrides.estimatedJudgingTime = { defaultValue: Number(rule.mrv_minutes) };
    }

    // Entry fee override (when different from template default)
    if (rule.default_entry_fee != null) {
      fieldOverrides.preEntryFee = { defaultValue: Number(rule.default_entry_fee) };
    }

    // Merge any additional field_overrides from DB JSONB column
    if (rule.field_overrides && Object.keys(rule.field_overrides).length > 0) {
      Object.assign(fieldOverrides, rule.field_overrides);
    }

    return {
      element: rule.element,
      level: rule.level ?? undefined,
      section: rule.section ?? undefined,
      className: rule.class_name,
      displayOrder: rule.display_order,
      fieldOverrides,
    };
  });

  const opCfg = template.operational_config as Record<string, unknown>;

  return {
    id: template.id,
    organization: org,
    trialType,
    templateName: `${template.organization} ${template.sport_name} - Official`,
    version: '1.0.0',

    description: `Official ${template.organization} ${template.sport_name} template`,
    status: TemplateStatus.ACTIVE,
    type: TemplateType.OFFICIAL,
    isActive: template.is_active,
    isOfficial: true,
    isCustom: false,
    isLatestVersion: true,
    allowEditing: false,
    editWarning: `This is an official ${template.organization} template. Changes affect all users.`,

    fieldSpecifications: [],
    classDefinitions,
    validationRules: [],

    defaults: {
      entryFees: {
        preEntry: 30,
        dayOfShow: 35,
      },
      requiredPersonnel: (opCfg.requiredPersonnel as string[] | undefined) ?? [],
    },

    createdBy: 'system',
    createdAt: new Date(template.created_at),
    updatedAt: new Date(template.updated_at),
  };
}
