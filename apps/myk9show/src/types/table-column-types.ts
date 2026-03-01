/**
 * Table Column Configuration Types
 * Defines column configurations for entry tables based on show type and template settings
 */

import { TrialType } from './template.types';

export type ColumnDataType =
  | 'string'
  | 'number'
  | 'time'
  | 'score'
  | 'status'
  | 'placement'
  | 'boolean'
  | 'armband';

export type ColumnAlignment = 'left' | 'center' | 'right';

export type ColumnFieldSource = 'registration' | 'competition' | 'calculated' | 'display';

export interface TableColumn {
  /** Unique identifier for the column */
  id: string;

  /** Display name in table header */
  label: string;

  /** Field name to extract data from entry object */
  fieldName: string;

  /** Where the data comes from in the entry object */
  fieldSource: ColumnFieldSource;

  /** Data type for formatting and validation */
  dataType: ColumnDataType;

  /** Column alignment */
  align: ColumnAlignment;

  /** Column width (CSS width value) */
  width?: string;

  /** Whether column is sortable */
  sortable: boolean;

  /** Whether column is always visible */
  required: boolean;

  /** Display order (lower numbers appear first) */
  displayOrder: number;

  /** Show types this column applies to */
  trialTypes: TrialType[];

  /** Whether column is visible by default */
  defaultVisible: boolean;

  /** Format string or function for displaying values */
  format?: string | ((value: unknown) => string);

  /** CSS classes for styling */
  className?: string;

  /** Help text for column header */
  helpText?: string;
}

export interface TrialTypeColumnConfig {
  /** Show type this configuration applies to */
  trialType: TrialType;

  /** Required columns that must always be shown */
  requiredColumns: string[];

  /** Default visible columns */
  defaultColumns: string[];

  /** All available columns for this show type */
  availableColumns: string[];

  /** Special formatting rules */
  formatRules?: {
    timeFormat?: 'MM:SS' | 'MM:SS.HH';
    scoreFormat?: 'points' | 'percentage' | 'raw';
    placementFormat?: 'ordinal' | 'numeric';
  };
}

export interface TableColumnConfiguration {
  /** Configuration name/identifier */
  name: string;

  /** Show type this configuration is for */
  trialType: TrialType;

  /** Organization (AKC, UKC, etc.) */
  organization?: string;

  /** Column configurations */
  columns: TableColumn[];

  /** Show type specific settings */
  trialTypeConfig: TrialTypeColumnConfig;

  /** Whether this is the default configuration for the show type */
  isDefault: boolean;

  /** Template ID this configuration is associated with */
  templateId?: string;

  /** Version for configuration management */
  version: string;
}

// Standard column definitions that can be used across different show types
export const STANDARD_COLUMNS: TableColumn[] = [
  {
    id: 'armband',
    label: 'Armband',
    fieldName: 'armband',
    fieldSource: 'registration',
    dataType: 'armband',
    align: 'center',
    width: '80px',
    sortable: true,
    required: true,
    displayOrder: 1,
    trialTypes: [
      TrialType.SCENT_WORK,
      TrialType.AGILITY,
      TrialType.OBEDIENCE,
      TrialType.RALLY,
      TrialType.CONFORMATION,
    ],
    defaultVisible: true,
    format: (value: unknown) => (value ? `#${value}` : ''),
    className: 'font-medium',
  },
  {
    id: 'handler',
    label: 'Handler',
    fieldName: 'handler',
    fieldSource: 'registration',
    dataType: 'string',
    align: 'left',
    sortable: true,
    required: true,
    displayOrder: 2,
    trialTypes: [
      TrialType.SCENT_WORK,
      TrialType.AGILITY,
      TrialType.OBEDIENCE,
      TrialType.RALLY,
      TrialType.CONFORMATION,
    ],
    defaultVisible: true,
    className: 'font-medium',
  },
  {
    id: 'dog',
    label: 'Dog',
    fieldName: 'dog',
    fieldSource: 'display',
    dataType: 'string',
    align: 'left',
    sortable: true,
    required: true,
    displayOrder: 3,
    trialTypes: [
      TrialType.SCENT_WORK,
      TrialType.AGILITY,
      TrialType.OBEDIENCE,
      TrialType.RALLY,
      TrialType.CONFORMATION,
    ],
    defaultVisible: true,
    className: 'font-medium text-muted-foreground',
  },
  {
    id: 'status',
    label: 'Status',
    fieldName: 'status',
    fieldSource: 'competition',
    dataType: 'status',
    align: 'center',
    sortable: true,
    required: true,
    displayOrder: 4,
    trialTypes: [
      TrialType.SCENT_WORK,
      TrialType.AGILITY,
      TrialType.OBEDIENCE,
      TrialType.RALLY,
      TrialType.CONFORMATION,
    ],
    defaultVisible: true,
  },
  {
    id: 'time',
    label: 'Time',
    fieldName: 'time',
    fieldSource: 'competition',
    dataType: 'time',
    align: 'center',
    width: '180px',
    sortable: true,
    required: false,
    displayOrder: 5,
    trialTypes: [TrialType.SCENT_WORK, TrialType.AGILITY, TrialType.RALLY],
    defaultVisible: true,
    className: 'font-mono',
  },
  {
    id: 'score',
    label: 'Score',
    fieldName: 'score',
    fieldSource: 'competition',
    dataType: 'score',
    align: 'center',
    width: '100px',
    sortable: true,
    required: false,
    displayOrder: 6,
    trialTypes: [TrialType.OBEDIENCE, TrialType.RALLY, TrialType.CONFORMATION],
    defaultVisible: true,
    className: 'font-mono',
  },
  {
    id: 'faults',
    label: 'Faults',
    fieldName: 'faults',
    fieldSource: 'competition',
    dataType: 'number',
    align: 'center',
    width: '80px',
    sortable: true,
    required: false,
    displayOrder: 7,
    trialTypes: [TrialType.SCENT_WORK, TrialType.AGILITY],
    defaultVisible: true,
    className: 'font-mono',
  },
  {
    id: 'qualification',
    label: 'Qualification',
    fieldName: 'qualification',
    fieldSource: 'competition',
    dataType: 'status',
    align: 'center',
    sortable: true,
    required: false,
    displayOrder: 8,
    trialTypes: [TrialType.SCENT_WORK, TrialType.AGILITY, TrialType.OBEDIENCE, TrialType.RALLY],
    defaultVisible: false, // Usually shown as status instead
  },
  {
    id: 'placement',
    label: 'Place',
    fieldName: 'placement',
    fieldSource: 'competition',
    dataType: 'placement',
    align: 'center',
    width: '80px',
    sortable: true,
    required: false,
    displayOrder: 9,
    trialTypes: [
      TrialType.SCENT_WORK,
      TrialType.AGILITY,
      TrialType.OBEDIENCE,
      TrialType.RALLY,
      TrialType.CONFORMATION,
    ],
    defaultVisible: true,
  },
  {
    id: 'notes',
    label: 'Notes',
    fieldName: 'notes',
    fieldSource: 'competition',
    dataType: 'string',
    align: 'left',
    sortable: false,
    required: false,
    displayOrder: 10,
    trialTypes: [
      TrialType.SCENT_WORK,
      TrialType.AGILITY,
      TrialType.OBEDIENCE,
      TrialType.RALLY,
      TrialType.CONFORMATION,
    ],
    defaultVisible: false, // Usually hidden in quick view tables
  },
];

// Predefined configurations for different show types
export const SHOW_TYPE_COLUMN_CONFIGS: TrialTypeColumnConfig[] = [
  {
    trialType: TrialType.SCENT_WORK,
    requiredColumns: ['armband', 'handler', 'dog', 'status'],
    defaultColumns: ['armband', 'handler', 'dog', 'status', 'time', 'faults', 'placement'],
    availableColumns: [
      'armband',
      'handler',
      'dog',
      'status',
      'time',
      'faults',
      'qualification',
      'placement',
      'notes',
    ],
    formatRules: {
      timeFormat: 'MM:SS.HH',
      placementFormat: 'ordinal',
    },
  },
  {
    trialType: TrialType.AGILITY,
    requiredColumns: ['armband', 'handler', 'dog', 'status'],
    defaultColumns: ['armband', 'handler', 'dog', 'status', 'time', 'faults', 'placement'],
    availableColumns: [
      'armband',
      'handler',
      'dog',
      'status',
      'time',
      'faults',
      'qualification',
      'placement',
      'notes',
    ],
    formatRules: {
      timeFormat: 'MM:SS',
      placementFormat: 'ordinal',
    },
  },
  {
    trialType: TrialType.OBEDIENCE,
    requiredColumns: ['armband', 'handler', 'dog', 'status'],
    defaultColumns: ['armband', 'handler', 'dog', 'status', 'score', 'placement'],
    availableColumns: [
      'armband',
      'handler',
      'dog',
      'status',
      'score',
      'qualification',
      'placement',
      'notes',
    ],
    formatRules: {
      scoreFormat: 'points',
      placementFormat: 'ordinal',
    },
  },
  {
    trialType: TrialType.RALLY,
    requiredColumns: ['armband', 'handler', 'dog', 'status'],
    defaultColumns: ['armband', 'handler', 'dog', 'status', 'score', 'time', 'placement'],
    availableColumns: [
      'armband',
      'handler',
      'dog',
      'status',
      'score',
      'time',
      'qualification',
      'placement',
      'notes',
    ],
    formatRules: {
      timeFormat: 'MM:SS',
      scoreFormat: 'points',
      placementFormat: 'ordinal',
    },
  },
  {
    trialType: TrialType.CONFORMATION,
    requiredColumns: ['armband', 'handler', 'dog', 'status'],
    defaultColumns: ['armband', 'handler', 'dog', 'status', 'placement'],
    availableColumns: ['armband', 'handler', 'dog', 'status', 'score', 'placement', 'notes'],
    formatRules: {
      scoreFormat: 'raw',
      placementFormat: 'ordinal',
    },
  },
];
