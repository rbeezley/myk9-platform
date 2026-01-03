import { FieldSpecification } from '@/types/template.types';

// AKC Scent Work field specifications based on official rules and CSV data
export const AKC_SCENT_WORK_FIELDS: FieldSpecification[] = [
  // ===== IDENTITY FIELDS =====
  {
    fieldName: 'organization',
    displayName: 'Organization',
    fieldSource: 'fixed',
    dataType: 'string',
    required: true,
    editable: false,
    defaultValue: 'AKC',
    ruleValue: 'AKC',
    displayOrder: 1,
    groupName: 'Basic Information',
    columnWidth: 1
  },
  {
    fieldName: 'showType',
    displayName: 'Show Type',
    fieldSource: 'fixed',
    dataType: 'string',
    required: true,
    editable: false,
    defaultValue: 'Scent Work',
    ruleValue: 'Scent Work',
    displayOrder: 2,
    groupName: 'Basic Information',
    columnWidth: 1
  },
  {
    fieldName: 'element',
    displayName: 'Element',
    description: 'The scent work element being tested',
    fieldSource: 'rule-based',
    dataType: 'select',
    required: true,
    editable: false,
    options: ['Interior', 'Exterior', 'Container', 'Buried', 'Handler Discrimination (HD)', 'Detective'],
    displayOrder: 3,
    groupName: 'Basic Information',
    columnWidth: 2
  },
  {
    fieldName: 'level',
    displayName: 'Level',
    description: 'Competition level',
    fieldSource: 'rule-based',
    dataType: 'select',
    required: false,
    editable: false,
    options: ['Novice', 'Advanced', 'Excellent', 'Master'],
    showWhen: {
      dependsOn: 'element',
      condition: 'notEquals',
      value: 'Detective'
    },
    displayOrder: 4,
    groupName: 'Basic Information',
    columnWidth: 1
  },
  {
    fieldName: 'section',
    displayName: 'Section',
    description: 'Division within Novice level only',
    fieldSource: 'rule-based',
    dataType: 'select',
    required: false,
    editable: false,
    options: ['A', 'B'],
    showWhen: {
      dependsOn: 'level',
      condition: 'equals',
      value: 'Novice'
    },
    displayOrder: 5,
    groupName: 'Basic Information',
    columnWidth: 1
  },

  // ===== STATUS AND SCHEDULING FIELDS =====
  {
    fieldName: 'classStatus',
    displayName: 'Class Status',
    fieldSource: 'admin-set',
    dataType: 'select',
    required: true,
    editable: true,
    defaultValue: 'Pending',
    options: ['Pending', 'In Progress', 'Complete', 'Cancelled'],
    displayOrder: 6,
    groupName: 'Status & Schedule',
    columnWidth: 1
  },
  {
    fieldName: 'runOrder',
    displayName: 'Class Run Order',
    description: 'Initial default value, can be changed via drag and drop',
    fieldSource: 'admin-set',
    dataType: 'number',
    required: true,
    editable: true,
    displayOrder: 7,
    groupName: 'Status & Schedule',
    columnWidth: 1
  },
  {
    fieldName: 'plannedStartTime',
    displayName: 'Planned Start Time',
    description: 'Set at class creation if known',
    fieldSource: 'admin-set',
    dataType: 'datetime',
    required: false,
    editable: true,
    displayOrder: 8,
    groupName: 'Status & Schedule',
    columnWidth: 2
  },

  // ===== TIME LIMIT FIELDS =====
  {
    fieldName: 'timeLimit1',
    displayName: 'Time Limit (Area 1)',
    description: 'Primary search area time limit',
    fieldSource: 'calculated', // Will be rule-based or judge-set depending on element
    dataType: 'string',
    required: true,
    editable: true,
    displayOrder: 9,
    groupName: 'Time Limits',
    columnWidth: 1,
    helpText: 'Set by rules for some elements, by judge for others'
  },
  {
    fieldName: 'timeLimit2',
    displayName: 'Time Limit (Area 2)',
    description: 'Second search area time limit',
    fieldSource: 'calculated',
    dataType: 'string',
    required: false,
    editable: true,
    showWhen: [
      {
        dependsOn: 'element',
        condition: 'equals',
        value: 'Interior'
      },
      {
        dependsOn: 'level',
        condition: 'in',
        value: ['Excellent', 'Master']
      }
    ],
    displayOrder: 10,
    groupName: 'Time Limits',
    columnWidth: 1
  },
  {
    fieldName: 'timeLimit3',
    displayName: 'Time Limit (Area 3)',
    description: 'Third search area time limit',
    fieldSource: 'calculated',
    dataType: 'string',
    required: false,
    editable: true,
    showWhen: [
      {
        dependsOn: 'element',
        condition: 'equals',
        value: 'Interior'
      },
      {
        dependsOn: 'level',
        condition: 'equals',
        value: 'Master'
      }
    ],
    displayOrder: 11,
    groupName: 'Time Limits',
    columnWidth: 1
  },

  // ===== SEARCH CONFIGURATION FIELDS =====
  {
    fieldName: 'searchAreas',
    displayName: 'Search Areas',
    description: 'Number of search areas',
    fieldSource: 'rule-based',
    dataType: 'number',
    required: true,
    editable: false,
    displayOrder: 12,
    groupName: 'Search Configuration',
    columnWidth: 1
  },
  {
    fieldName: 'hides',
    displayName: 'Number of Hides',
    description: 'Hide configuration for this class',
    fieldSource: 'calculated', // Mix of rule-based and judge-set
    dataType: 'string',
    required: true,
    editable: true,
    displayOrder: 13,
    groupName: 'Search Configuration',
    columnWidth: 2,
    helpText: 'Known number for Novice/Advanced, judge determines for higher levels'
  },
  {
    fieldName: 'distractions',
    displayName: 'Required Distractions',
    description: 'Number of distractions required',
    fieldSource: 'rule-based',
    dataType: 'number',
    required: true,
    editable: false,
    displayOrder: 14,
    groupName: 'Search Configuration',
    columnWidth: 1
  },

  // ===== OPERATIONAL FIELDS =====
  {
    fieldName: 'estimatedJudgingTime',
    displayName: 'Estimated Judging Time',
    description: 'Minutes per dog, can be adjusted',
    fieldSource: 'admin-set',
    dataType: 'number',
    required: true,
    editable: true,
    displayOrder: 15,
    groupName: 'Operations',
    columnWidth: 1,
    helpText: 'Used for scheduling calculations'
  },
  {
    fieldName: 'judgeName',
    displayName: 'Judge Name',
    description: 'Assigned judge for this class',
    fieldSource: 'admin-set',
    dataType: 'string',
    required: false,
    editable: true,
    displayOrder: 16,
    groupName: 'Personnel',
    columnWidth: 2
  },
  {
    fieldName: 'hitExclude',
    displayName: 'Exclude from HIT',
    description: 'Exclude from High in Trial calculations',
    fieldSource: 'admin-set',
    dataType: 'boolean',
    required: true,
    editable: true,
    defaultValue: false,
    displayOrder: 17,
    groupName: 'Operations',
    columnWidth: 1
  },
  {
    fieldName: 'hcdExclude',
    displayName: 'Exclude from HCD',
    description: 'Exclude from Handler Discrimination awards',
    fieldSource: 'admin-set',
    dataType: 'boolean',
    required: true,
    editable: true,
    defaultValue: false,
    displayOrder: 18,
    groupName: 'Operations',
    columnWidth: 1
  },

  // ===== PERSONNEL FIELDS =====
  {
    fieldName: 'gateSteward',
    displayName: 'Gate Steward',
    fieldSource: 'admin-set',
    dataType: 'string',
    required: false,
    editable: true,
    displayOrder: 19,
    groupName: 'Personnel',
    columnWidth: 1
  },
  {
    fieldName: 'tableSteward',
    displayName: 'Table Steward',
    fieldSource: 'admin-set',
    dataType: 'string',
    required: false,
    editable: true,
    displayOrder: 20,
    groupName: 'Personnel',
    columnWidth: 1
  },
  {
    fieldName: 'timerSteward',
    displayName: 'Timer Steward',
    fieldSource: 'admin-set',
    dataType: 'string',
    required: false,
    editable: true,
    displayOrder: 21,
    groupName: 'Personnel',
    columnWidth: 1
  },
  {
    fieldName: 'ringSteward1',
    displayName: 'Ring Steward 1',
    fieldSource: 'admin-set',
    dataType: 'string',
    required: false,
    editable: true,
    displayOrder: 22,
    groupName: 'Personnel',
    columnWidth: 1
  },
  {
    fieldName: 'ringSteward2',
    displayName: 'Ring Steward 2',
    fieldSource: 'admin-set',
    dataType: 'string',
    required: false,
    editable: true,
    displayOrder: 23,
    groupName: 'Personnel',
    columnWidth: 1
  },
  {
    fieldName: 'ringSteward3',
    displayName: 'Ring Steward 3',
    fieldSource: 'admin-set',
    dataType: 'string',
    required: false,
    editable: true,
    displayOrder: 24,
    groupName: 'Personnel',
    columnWidth: 1
  },

  // ===== FINANCIAL FIELDS =====
  {
    fieldName: 'preEntryFee',
    displayName: 'Pre-Entry Fee',
    description: 'Fee for entries before closing date',
    fieldSource: 'admin-set',
    dataType: 'number',
    required: true,
    editable: true,
    displayOrder: 25,
    groupName: 'Fees',
    columnWidth: 1,
    defaultValue: 30
  },
  {
    fieldName: 'dayOfShowFee',
    displayName: 'Day of Show Fee',
    description: 'Fee for day-of entries if allowed',
    fieldSource: 'admin-set',
    dataType: 'number',
    required: true,
    editable: true,
    displayOrder: 26,
    groupName: 'Fees',
    columnWidth: 1,
    defaultValue: 35
  },

  // ===== ADDITIONAL FIELDS =====
  {
    fieldName: 'maxEntries',
    displayName: 'Maximum Entries',
    description: 'Entry limit for this class',
    fieldSource: 'admin-set',
    dataType: 'number',
    required: false,
    editable: true,
    displayOrder: 27,
    groupName: 'Entries',
    columnWidth: 1,
    defaultValue: 40
  },
  {
    fieldName: 'notes',
    displayName: 'Notes',
    description: 'Additional information or special instructions',
    fieldSource: 'admin-set',
    dataType: 'text',
    required: false,
    editable: true,
    displayOrder: 28,
    groupName: 'Additional Information',
    columnWidth: 4
  }
];

// Field groups for UI organization
export const AKC_SCENT_WORK_FIELD_GROUPS = [
  { groupName: 'Basic Information', displayOrder: 1, defaultExpanded: true },
  { groupName: 'Status & Schedule', displayOrder: 2, defaultExpanded: true },
  { groupName: 'Time Limits', displayOrder: 3, defaultExpanded: true },
  { groupName: 'Search Configuration', displayOrder: 4, defaultExpanded: true },
  { groupName: 'Personnel', displayOrder: 5, defaultExpanded: false },
  { groupName: 'Operations', displayOrder: 6, defaultExpanded: false },
  { groupName: 'Fees', displayOrder: 7, defaultExpanded: false },
  { groupName: 'Entries', displayOrder: 8, defaultExpanded: false },
  { groupName: 'Additional Information', displayOrder: 9, defaultExpanded: false }
];