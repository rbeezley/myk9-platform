// Comprehensive show template system supporting multiple organizations and show types

export type Organization = 'AKC' | 'UKC' | 'NACSW' | 'CPE' | 'USDAA' | 'NADAC' | 'ASCA' | 'OTHER';

export type TrialType =
  | 'Scent Work'
  | 'Agility'
  | 'Conformation'
  | 'Obedience'
  | 'Rally'
  | 'FastCAT'
  | 'Coursing Ability Test'
  | 'Barn Hunt'
  | 'Tracking'
  | 'Field Trial'
  | 'Hunt Test'
  | 'Herding'
  | 'Lure Coursing'
  | 'Dock Diving'
  | 'Weight Pull'
  | 'Other';

export interface ShowFieldDefinition {
  name: string;
  type: 'select' | 'text' | 'number' | 'boolean';
  options?: string[]; // For select fields
  required: boolean;
  defaultValue?: string | number | boolean | string[];
  description?: string;
  // Field dependencies - show only if other field has specific value
  showWhen?: {
    field: string;
    value: string | number | boolean | string[];
  };
}

export interface ShowTemplateDefinition {
  id: string;
  name: string;
  organization: Organization;
  trialType: TrialType;
  description?: string;
  version: string;

  // Define the structure of classes for this show type
  classFields: ShowFieldDefinition[];

  // Class naming pattern using field placeholders
  classNamePattern: string; // e.g., "{element} {level} {division}"

  // Default values
  defaults: {
    entryFee?: number;
    maxEntries?: number;
    timeLimit?: string;
    requiresJumpHeight?: boolean;
    requiresArmband?: boolean;
    allowsMultipleRuns?: boolean;
  };

  // Validation rules
  validation?: {
    minimumAge?: number; // in months
    requiredTitles?: string[];
    prohibitedCombinations?: Array<{
      field: string;
      values: string[];
      message: string;
    }>;
  };

  // Custom fields specific to this show type
  customFields?: ShowFieldDefinition[];

  createdAt: Date;
  updatedAt: Date;
}

// Specific field definitions for common show types
export const SCENT_WORK_FIELDS: ShowFieldDefinition[] = [
  {
    name: 'element',
    type: 'select',
    options: ['Interior', 'Exterior', 'Container', 'Buried', 'Handler Discrimination', 'Detective'],
    required: true,
    description: 'The scent work element being tested',
  },
  {
    name: 'level',
    type: 'select',
    options: ['Novice', 'Advanced', 'Excellent', 'Masters'],
    required: false,
    description:
      'Competition level - Novice: 1 hide basic search, Advanced: 2 simple hides, Excellent: complex with unknown number (interiors), Masters: ultimate teamwork test',
    showWhen: {
      field: 'element',
      value: ['Interior', 'Exterior', 'Container', 'Buried', 'Handler Discrimination'],
    },
  },
  {
    name: 'division',
    type: 'select',
    options: ['A', 'B'],
    required: false,
    description: 'Division within Novice level only',
    showWhen: {
      field: 'level',
      value: 'Novice',
    },
  },
];

export const AGILITY_FIELDS: ShowFieldDefinition[] = [
  {
    name: 'course',
    type: 'select',
    options: ['Standard', 'Jumpers with Weaves', 'FAST', 'Time 2 Beat', 'Premier', 'Preferred'],
    required: true,
    description: 'Type of agility course',
  },
  {
    name: 'level',
    type: 'select',
    options: ['Novice A', 'Novice B', 'Open', 'Excellent', 'Masters'],
    required: true,
    description: 'Competition level',
  },
  {
    name: 'jumpHeight',
    type: 'select',
    options: ['8"', '12"', '16"', '20"', '24"', '26"'],
    required: true,
    description: 'Jump height division',
  },
];

export const CONFORMATION_FIELDS: ShowFieldDefinition[] = [
  {
    name: 'classType',
    type: 'select',
    options: ['Puppy', 'Junior', 'Senior', 'Open', 'Winners', 'Best of Breed', 'Best in Show'],
    required: true,
    description: 'Type of conformation class',
  },
  {
    name: 'sex',
    type: 'select',
    options: ['Dogs', 'Bitches'],
    required: true,
    description: 'Sex division',
  },
  {
    name: 'ageGroup',
    type: 'select',
    options: ['6-9 months', '9-12 months', '12-18 months', '18-24 months'],
    required: false,
    description: 'Age group for puppy classes',
    showWhen: {
      field: 'classType',
      value: 'Puppy',
    },
  },
];

export const OBEDIENCE_FIELDS: ShowFieldDefinition[] = [
  {
    name: 'level',
    type: 'select',
    options: ['Novice A', 'Novice B', 'Open A', 'Open B', 'Utility A', 'Utility B'],
    required: true,
    description: 'Obedience level and division',
  },
];

export const RALLY_FIELDS: ShowFieldDefinition[] = [
  {
    name: 'level',
    type: 'select',
    options: [
      'Novice A',
      'Novice B',
      'Intermediate',
      'Advanced A',
      'Advanced B',
      'Excellent A',
      'Excellent B',
      'Masters',
    ],
    required: true,
    description: 'Rally level and division',
  },
];

export const FASTCAT_FIELDS: ShowFieldDefinition[] = [
  {
    name: 'category',
    type: 'select',
    options: ['Open', 'Veterans', 'Junior Handler'],
    required: true,
    description: 'FastCAT category',
  },
];

// Template presets for common show types
export const SHOW_TEMPLATE_PRESETS: Record<
  string,
  Omit<ShowTemplateDefinition, 'id' | 'createdAt' | 'updatedAt'>
> = {
  'akc-scent-work': {
    name: 'AKC Scent Work',
    organization: 'AKC',
    trialType: 'Scent Work',
    description: 'American Kennel Club Scent Work trials - Official rules-based template',
    version: '2024.1',
    classFields: SCENT_WORK_FIELDS,
    classNamePattern: '{element} {level} {division}',
    defaults: {
      entryFee: 30, // Typical entry fee from rules
      maxEntries: 40, // Varies by venue
      timeLimit: 'Varies by level', // Set by judge after demo dog
      requiresJumpHeight: false,
      requiresArmband: true,
      allowsMultipleRuns: false,
    },
    validation: {
      minimumAge: 6, // 6 months minimum per AKC rules
      prohibitedCombinations: [
        {
          field: 'element',
          values: ['Detective'],
          message:
            'Detective class does not have levels or divisions - it is a standalone complex search combining interiors and exteriors',
        },
      ],
    },
    customFields: [
      {
        name: 'searchType',
        type: 'text',
        required: false,
        description:
          'Type of search: Known number (Novice/Advanced) or Unknown number (Excellent/Masters/Detective)',
      },
      {
        name: 'hideCount',
        type: 'text',
        required: false,
        description: 'Number of hides: Novice=1, Advanced=2, Excellent/Masters/Detective=Unknown',
      },
      {
        name: 'distractionsRequired',
        type: 'text',
        required: false,
        description: 'Number of distractions required per class level',
      },
      {
        name: 'offLeashOption',
        type: 'boolean',
        required: false,
        defaultValue: true,
        description: 'Whether off-leash option is available',
      },
    ],
  },

  'akc-agility': {
    name: 'AKC Agility',
    organization: 'AKC',
    trialType: 'Agility',
    description: 'American Kennel Club Agility trials',
    version: '1.0',
    classFields: AGILITY_FIELDS,
    classNamePattern: '{course} - {level} ({jumpHeight})',
    defaults: {
      entryFee: 25,
      maxEntries: 300,
      timeLimit: 'varies',
      requiresJumpHeight: true,
      requiresArmband: true,
      allowsMultipleRuns: false,
    },
    validation: {
      minimumAge: 15, // 15 months for most agility
    },
  },

  'akc-conformation': {
    name: 'AKC Conformation',
    organization: 'AKC',
    trialType: 'Conformation',
    description: 'American Kennel Club Conformation shows',
    version: '1.0',
    classFields: CONFORMATION_FIELDS,
    classNamePattern: '{classType} {sex} {ageGroup}',
    defaults: {
      entryFee: 35,
      maxEntries: 100,
      requiresJumpHeight: false,
      requiresArmband: true,
      allowsMultipleRuns: false,
    },
    validation: {
      minimumAge: 6,
    },
  },

  'akc-obedience': {
    name: 'AKC Obedience',
    organization: 'AKC',
    trialType: 'Obedience',
    description: 'American Kennel Club Obedience trials',
    version: '1.0',
    classFields: OBEDIENCE_FIELDS,
    classNamePattern: '{level}',
    defaults: {
      entryFee: 28,
      maxEntries: 150,
      requiresJumpHeight: false,
      requiresArmband: true,
      allowsMultipleRuns: false,
    },
    validation: {
      minimumAge: 6,
    },
  },

  'akc-rally': {
    name: 'AKC Rally',
    organization: 'AKC',
    trialType: 'Rally',
    description: 'American Kennel Club Rally trials',
    version: '1.0',
    classFields: RALLY_FIELDS,
    classNamePattern: 'Rally {level}',
    defaults: {
      entryFee: 25,
      maxEntries: 200,
      requiresJumpHeight: false,
      requiresArmband: true,
      allowsMultipleRuns: false,
    },
    validation: {
      minimumAge: 6,
    },
  },

  'akc-fastcat': {
    name: 'AKC FastCAT',
    organization: 'AKC',
    trialType: 'FastCAT',
    description: 'American Kennel Club Fast Coursing Ability Test',
    version: '1.0',
    classFields: FASTCAT_FIELDS,
    classNamePattern: 'FastCAT {category}',
    defaults: {
      entryFee: 15,
      maxEntries: 100,
      requiresJumpHeight: false,
      requiresArmband: false,
      allowsMultipleRuns: true,
    },
    validation: {
      minimumAge: 12,
    },
  },
};

// UKC specific presets (placeholder - would need UKC rules)
export const UKC_TEMPLATE_PRESETS: Record<
  string,
  Omit<ShowTemplateDefinition, 'id' | 'createdAt' | 'updatedAt'>
> = {
  'ukc-agility': {
    name: 'UKC Agility',
    organization: 'UKC',
    trialType: 'Agility',
    description: 'United Kennel Club Agility trials',
    version: '1.0',
    classFields: [
      {
        name: 'level',
        type: 'select',
        options: ['Novice', 'Started', 'Advanced', 'Championship'],
        required: true,
        description: 'UKC Agility level',
      },
    ],
    classNamePattern: 'UKC {level}',
    defaults: {
      entryFee: 20,
      maxEntries: 200,
      requiresJumpHeight: true,
    },
    validation: {
      minimumAge: 18,
    },
  },
};
