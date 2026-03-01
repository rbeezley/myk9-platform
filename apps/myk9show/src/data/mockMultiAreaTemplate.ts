import {
  ClassTemplate,
  TrialType,
  Organization,
  TemplateStatus,
  TemplateType,
} from '@/types/template.types';
import { TrialTypeField } from '@/types/field-definition-types';

/**
 * Mock template demonstrating the new field configuration system
 * including multiple search time limits per area
 */
export const MOCK_SCENT_WORK_TEMPLATE_WITH_FIELDS: ClassTemplate = {
  id: 'template-scent-work-multi-area',

  // Identity
  organization: Organization.AKC,
  trialType: TrialType.SCENT_WORK,
  templateName: 'AKC Scent Work - Multi-Area Template (Demo)',
  version: '1.0.0',

  // Metadata
  description:
    'Demonstration template showing multiple search area time limits for Interior Master classes',
  officialRulesReference: 'AKC Scent Work Rules 2024',
  effectiveDate: new Date('2024-01-01'),

  // Status
  status: TemplateStatus.ACTIVE,
  type: TemplateType.CUSTOM,
  allowEditing: true,
  isLatestVersion: true,

  // Legacy status fields
  isActive: true,
  isOfficial: false,
  isCustom: true,

  // NEW: Field configurations using the structured system
  fieldConfigurations: [
    // Basic identity fields
    {
      fieldName: TrialTypeField.ELEMENT,
      required: true,
      visible: true,
      editable: false,
      defaultValue: 'Interior',
      displayOrder: 1,
    },
    {
      fieldName: TrialTypeField.LEVEL,
      required: true,
      visible: true,
      editable: false,
      defaultValue: 'Master',
      displayOrder: 2,
    },
    {
      fieldName: TrialTypeField.CLASS_NAME,
      required: true,
      visible: true,
      editable: true,
      displayOrder: 3,
    },

    // Search configuration
    {
      fieldName: TrialTypeField.SEARCH_AREAS,
      required: true,
      visible: true,
      editable: true,
      defaultValue: 3, // Interior Master typically has 3 areas
      displayOrder: 4,
      valueConstraints: {
        type: 'range',
        min: 1,
        max: 3,
        hint: 'Interior Master classes typically have 3 search areas',
      },
    },

    // NEW: Multi-area time limits
    {
      fieldName: TrialTypeField.SEARCH_TIME_LIMITS,
      required: true,
      visible: true,
      editable: true,
      defaultValue: [120000, 180000, 240000], // 2:00, 3:00, 4:00 in milliseconds
      displayOrder: 5,
      defaultVariesByClass: true,
      valueConstraints: {
        type: 'range',
        min: 60000, // 1:00 minimum
        max: 300000, // 5:00 maximum
        hint: 'Judge sets time limits for each search area (typically 2:00-4:00 range)',
      },
    },

    // Hide configuration
    {
      fieldName: TrialTypeField.HIDE_COUNT,
      required: true,
      visible: true,
      editable: true,
      defaultValue: 3, // Master level - judge determines
      displayOrder: 6,
      valueConstraints: {
        type: 'range',
        min: 1,
        max: 5,
        hint: 'Master level: Judge determines number of hides',
      },
    },

    // Personnel
    {
      fieldName: TrialTypeField.JUDGE_NAME,
      required: false,
      visible: true,
      editable: true,
      displayOrder: 10,
    },

    // Financial
    {
      fieldName: TrialTypeField.PRE_ENTRY_FEE,
      required: true,
      visible: true,
      editable: true,
      defaultValue: 30,
      displayOrder: 15,
    },
    {
      fieldName: TrialTypeField.DAY_OF_SHOW_FEE,
      required: true,
      visible: true,
      editable: true,
      defaultValue: 35,
      displayOrder: 16,
    },

    // Administrative
    {
      fieldName: TrialTypeField.ENTRY_LIMIT,
      required: false,
      visible: true,
      editable: true,
      defaultValue: 40,
      displayOrder: 20,
    },
    {
      fieldName: TrialTypeField.NOTES,
      required: false,
      visible: true,
      editable: true,
      displayOrder: 25,
    },
  ],

  // Example class definitions with different time limits per area
  classDefinitions: [
    {
      element: 'Interior',
      level: 'Master',
      className: 'Interior Master',
      displayOrder: 1,
      description: 'Interior Master class with 3 search areas',

      // Class-specific defaults - different time limits per area
      classSpecificDefaults: {
        searchTimeLimits: [120000, 180000, 240000], // 2:00, 3:00, 4:00
        hideCount: 3,
        notes: 'Judge determines hide placement and exact count within rules',
      },
    },
    {
      element: 'Interior',
      level: 'Excellent',
      className: 'Interior Excellent',
      displayOrder: 2,
      description: 'Interior Excellent class with 2 search areas',

      // Different configuration for Excellent level
      classSpecificDefaults: {
        searchTimeLimits: [150000, 210000], // 2:30, 3:30
        hideCount: 2,
      },
    },
  ],

  // Required properties with minimal implementation
  fieldSpecifications: [],
  validationRules: [],
  defaults: {
    entryFees: {
      preEntry: 25,
      dayOfShow: 30,
    },
    judgingTimeEstimate: 5,
    requiredPersonnel: ['Judge'],
    minimumAge: 6,
  },

  // Timestamps
  createdAt: new Date('2024-01-01'),
  createdBy: 'system',
  updatedAt: new Date(),
};
