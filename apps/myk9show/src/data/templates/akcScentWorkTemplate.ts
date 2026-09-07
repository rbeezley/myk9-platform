import {
  ClassTemplate,
  Organization,
  TrialType,
  TemplateStatus,
  TemplateType,
} from '@/types/template.types';
import { AKC_SCENT_WORK_FIELDS } from './akcScentWorkFields';
import { generateAKCScentWorkClasses, AKC_SCENT_WORK_VALIDATION_RULES } from './akcScentWorkRules';

/**
 * Stable id for the locally bundled AKC Scent Work fallback (MYK9-432).
 *
 * The fallback is only injected when the DB template fetch fails, but the template
 * store is persisted — so once a browser takes that path the row survives forever.
 * `upsertTemplates` reconciles it away as soon as the authoritative DB template for
 * the same organization + trial type loads; that reconciliation keys off this id.
 */
export const AKC_SCENT_WORK_FALLBACK_TEMPLATE_ID = 'akc-scent-work-official-2024';

export const AKC_SCENT_WORK_TEMPLATE: Omit<ClassTemplate, 'id' | 'createdAt' | 'createdBy'> = {
  // Identity
  organization: Organization.AKC,
  trialType: TrialType.SCENT_WORK,
  // MYK9-432: matches the name the DB mapper synthesizes for the same real-world
  // template (`${organization} ${sport_name} - Official`). The two denote one thing;
  // the 2024 rules edition is carried in `version` / `officialRulesReference` below.
  templateName: 'AKC Scent Work - Official',
  version: '2024.1.0',

  // Metadata
  description:
    "Official AKC Scent Work template based on 2024 Judge's Guidelines. Generates all 26 standard classes with proper rules and field configurations.",
  officialRulesReference: "AKC Scent Work Judge's Guidelines (2024)",
  effectiveDate: new Date('2024-01-01'),

  // NEW: Flexible status system
  status: TemplateStatus.ACTIVE,
  type: TemplateType.OFFICIAL,
  allowEditing: false,
  editWarning: 'This is an official AKC template. Changes will affect all users.',
  isLatestVersion: true,

  // Legacy status fields (for backward compatibility)
  isActive: true,
  isOfficial: true,
  isCustom: false,

  // Field definitions
  fieldSpecifications: AKC_SCENT_WORK_FIELDS,

  // Class definitions - all 26 classes
  classDefinitions: generateAKCScentWorkClasses(),

  // Validation rules
  validationRules: AKC_SCENT_WORK_VALIDATION_RULES,

  // Template defaults
  defaults: {
    entryFees: {
      preEntry: 30,
      dayOfShow: 35,
    },
    judgingTimeEstimate: 3, // Average across all classes
    requiredPersonnel: ['Judge', 'Gate Steward', 'Table Steward', 'Timer'],
    minimumAge: 6, // 6 months per AKC rules
  },

  // Will be set when created
  updatedAt: new Date(),
};

// Helper function to create a customized version of the template
export const createCustomAKCScentWorkTemplate = (customizations: {
  templateName: string;
  entryFees?: { preEntry: number; dayOfShow: number };
  maxEntries?: number;
  excludedClasses?: string[];
}): Omit<ClassTemplate, 'id' | 'createdAt' | 'createdBy'> => {
  const template = { ...AKC_SCENT_WORK_TEMPLATE };

  // Apply customizations
  template.templateName = customizations.templateName;
  template.isCustom = true;
  template.isOfficial = false;

  if (customizations.entryFees) {
    template.defaults.entryFees = customizations.entryFees;
  }

  // Filter out excluded classes if specified
  if (customizations.excludedClasses && customizations.excludedClasses.length > 0) {
    template.classDefinitions = template.classDefinitions.filter(
      classDef => !customizations.excludedClasses!.includes(classDef.className)
    );
  }

  // Apply max entries override to all classes if specified
  if (customizations.maxEntries !== undefined) {
    const maxEntries = customizations.maxEntries;
    template.classDefinitions = template.classDefinitions.map(classDef => ({
      ...classDef,
      fieldOverrides: {
        ...classDef.fieldOverrides,
        maxEntries: { defaultValue: maxEntries },
      },
    }));
  }

  return template;
};

// Reference exports derived from the generated catalog so they can't drift from it (Phase 2b).
const AKC_CLASS_DEFINITIONS = AKC_SCENT_WORK_TEMPLATE.classDefinitions;

// Class name list for easy reference (canonical registry order).
export const AKC_SCENT_WORK_CLASS_NAMES = AKC_CLASS_DEFINITIONS.map(c => c.className);

// Quick reference for class counts.
export const AKC_SCENT_WORK_SUMMARY = {
  totalClasses: AKC_CLASS_DEFINITIONS.length,
  elements: AKC_CLASS_DEFINITIONS.reduce<Record<string, number>>((counts, c) => {
    counts[c.element] = (counts[c.element] ?? 0) + 1;
    return counts;
  }, {}),
  levels: AKC_CLASS_DEFINITIONS.reduce<Record<string, number>>((counts, c) => {
    const key = c.level ? (c.section ? `${c.level} ${c.section}` : c.level) : 'None (Detective)';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {}),
};
