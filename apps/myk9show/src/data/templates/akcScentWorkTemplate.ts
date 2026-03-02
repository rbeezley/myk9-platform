import {
  ClassTemplate,
  Organization,
  TrialType,
  TemplateStatus,
  TemplateType,
} from '@/types/template.types';
import { AKC_SCENT_WORK_FIELDS } from './akcScentWorkFields';
import { generateAKCScentWorkClasses, AKC_SCENT_WORK_VALIDATION_RULES } from './akcScentWorkRules';

export const AKC_SCENT_WORK_TEMPLATE: Omit<ClassTemplate, 'id' | 'createdAt' | 'createdBy'> = {
  // Identity
  organization: Organization.AKC,
  trialType: TrialType.SCENT_WORK,
  templateName: 'AKC Scent Work - Official 2024 Rules',
  version: '2024.1.0',

  // Metadata
  description:
    "Official AKC Scent Work template based on 2024 Judge's Guidelines. Generates all 27 standard classes with proper rules and field configurations.",
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

  // Class definitions - all 27 classes
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

// Export class name list for easy reference
export const AKC_SCENT_WORK_CLASS_NAMES = [
  // Interior classes
  'Interior Novice A',
  'Interior Novice B',
  'Interior Advanced',
  'Interior Excellent',
  'Interior Master',

  // Exterior classes
  'Exterior Novice A',
  'Exterior Novice B',
  'Exterior Advanced',
  'Exterior Excellent',
  'Exterior Master',

  // Container classes
  'Container Novice A',
  'Container Novice B',
  'Container Advanced',
  'Container Excellent',
  'Container Master',

  // Buried classes
  'Buried Novice A',
  'Buried Novice B',
  'Buried Advanced',
  'Buried Excellent',
  'Buried Master',

  // Handler Discrimination classes
  'Handler Discrimination Novice A',
  'Handler Discrimination Novice B',
  'Handler Discrimination Advanced',
  'Handler Discrimination Excellent',
  'Handler Discrimination Master',

  // Detective class
  'Detective',
];

// Quick reference for class counts
export const AKC_SCENT_WORK_SUMMARY = {
  totalClasses: 27,
  elements: {
    Interior: 6,
    Exterior: 6,
    Container: 6,
    Buried: 6,
    'Handler Discrimination': 5,
    Detective: 1,
  },
  levels: {
    'Novice A': 5,
    'Novice B': 5,
    Advanced: 5,
    Excellent: 5,
    Master: 5,
    'None (Detective)': 1,
  },
};
