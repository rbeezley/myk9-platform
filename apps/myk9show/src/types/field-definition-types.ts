/**
 * Structured Field System Types
 * These types define all possible fields across all show types
 */

export enum FieldCategory {
  IDENTITY = 'identity',
  SCHEDULING = 'scheduling',
  COMPETITION = 'competition',
  PERSONNEL = 'personnel',
  FINANCIAL = 'financial',
  ADMINISTRATIVE = 'administrative',
}

export enum FieldDataType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  TIME = 'time',
  DATETIME = 'datetime',
  SELECT = 'select',
  MULTI_SELECT = 'multi-select',
  TEXT = 'text',
  CURRENCY = 'currency',
  DURATION = 'duration', // For time durations in MM:SS format
  DURATION_ARRAY = 'duration-array', // For multiple time durations (per search area)
}

export enum TrialTypeField {
  // Common fields across all show types
  ELEMENT = 'element',
  LEVEL = 'level',
  SECTION = 'section',
  CLASS_NAME = 'className',
  DIVISION = 'division',

  // Scheduling fields
  SCHEDULED_DATE = 'scheduledDate',
  START_TIME = 'startTime',
  END_TIME = 'endTime',
  RING_NUMBER = 'ringNumber',
  RUN_ORDER = 'runOrder',
  ESTIMATED_DURATION = 'estimatedDuration',
  ESTIMATED_JUDGING_TIME = 'estimatedJudgingTime',
  CLASS_SETUP_TIME = 'classSetupTime',

  // Personnel fields
  JUDGE_NAME = 'judgeName',
  JUDGE_ID = 'judgeId',
  STEWARD_NAME = 'stewardName',
  STEWARD_ID = 'stewardId',
  TIMER_NAME = 'timerName',
  TIMER_ID = 'timerId',

  // Financial fields
  PRE_ENTRY_FEE = 'preEntryFee',
  DAY_OF_SHOW_FEE = 'dayOfShowFee',

  // Scent Work specific
  SEARCH_AREAS = 'searchAreas',
  HIDE_COUNT = 'hideCount',
  DISTRACTION_COUNT = 'distractionCount',
  SEARCH_TIME_LIMIT = 'searchTimeLimit',
  SEARCH_TIME_LIMITS = 'searchTimeLimits', // Array of time limits per search area
  SEARCH_ENVIRONMENT = 'searchEnvironment',

  // Agility specific
  JUMP_HEIGHT = 'jumpHeight',
  COURSE_YARDS = 'courseYards',
  OBSTACLES = 'obstacles',
  STANDARD_COURSE_TIME = 'standardCourseTime',
  COURSE_TYPE = 'courseType',

  // Conformation specific
  CLASS_TYPE = 'classType',
  SEX = 'sex',
  AGE_GROUP = 'ageGroup',
  VARIETY = 'variety',
  BREED = 'breed',
  MINIMUM_AGE = 'minimumAge',

  // Obedience specific
  EXERCISE_LIST = 'exerciseList',
  MAX_POINTS = 'maxPoints',

  // Rally specific
  COURSE_DESIGN = 'courseDesign',
  SIGN_COUNT = 'signCount',

  // Administrative
  ENTRY_LIMIT = 'entryLimit',
  CURRENT_ENTRIES = 'currentEntries',
  NOTES = 'notes',
  STATUS = 'status',
}

export interface FieldDefinition {
  id: string;
  fieldName: TrialTypeField;
  displayName: string;
  description?: string;
  category: FieldCategory;
  dataType: FieldDataType;
  showTypes: string[]; // Which show types this field applies to
  options?: FieldOption[]; // For select/multi-select fields
  validationRules?: FieldValidationRule[];
  defaultValue?: string | number | boolean | Date | string[] | number[]; // Added number[] for duration arrays
  unit?: string; // e.g., "minutes", "inches", "$"
  minValue?: number;
  maxValue?: number;
  required?: boolean; // Default requirement, can be overridden by templates
}

export interface FieldOption {
  value: string;
  label: string;
  showTypes?: string[]; // Optionally limit this option to specific show types
}

export interface FieldValidationRule {
  type: 'min' | 'max' | 'pattern' | 'custom';
  value: string | number | RegExp;
  message: string;
}

export interface ValueConstraint {
  type: 'range' | 'enum' | 'pattern';
  // For range constraints
  min?: number | undefined;
  max?: number | undefined;
  unit?: string | undefined;
  // For enum constraints
  allowedValues?: string[] | undefined;
  // For pattern constraints
  pattern?: RegExp | undefined;
  // Display helper text
  hint?: string | undefined;
}

export interface TemplateFieldConfiguration {
  fieldName: TrialTypeField;
  required: boolean;
  visible: boolean;
  editable: boolean;
  defaultValue?: string | number | boolean | Date | string[] | number[] | undefined; // Added number[] for duration arrays
  displayOrder: number;
  conditionalRules?: ConditionalRule[] | undefined;
  overrideOptions?: FieldOption[] | undefined; // Template can override field options
  defaultVariesByClass?: boolean | undefined; // Whether default can be customized per class
  valueConstraints?: ValueConstraint | undefined; // Value restrictions and hints
}

export interface ConditionalRule {
  type: 'show' | 'hide' | 'require';
  when: {
    field: TrialTypeField;
    operator: 'equals' | 'notEquals' | 'contains' | 'in';
    value: string | number | boolean | string[];
  };
}

// Helper type for field values in a class
export type ClassFieldValues = {
  [key in TrialTypeField]?: string | number | boolean | Date | string[] | number[]; // Added number[] for duration arrays
};

// Type for the actual class data with all fields
export interface StructuredClassData {
  // Identity fields
  element?: string;
  level?: string;
  section?: string;
  className: string;
  division?: string;

  // Scheduling fields
  scheduledDate?: Date;
  startTime?: string;
  endTime?: string;
  ringNumber?: number;
  runOrder?: number;
  estimatedDuration?: number;
  estimatedJudgingTime?: string; // In MM:SS format

  // Personnel fields
  judgeName?: string;
  judgeId?: string;
  stewardName?: string;
  stewardId?: string;
  timerName?: string;
  timerId?: string;

  // Financial fields
  preEntryFee?: number;
  dayOfShowFee?: number;

  // Scent Work fields
  searchAreas?: string[];
  hideCount?: number;
  distractionCount?: number;
  searchTimeLimit?: number; // Single time limit (legacy)
  searchTimeLimits?: number[]; // Array of time limits per search area (milliseconds)
  searchEnvironment?: string;

  // Agility fields
  jumpHeight?: string;
  courseYards?: number;
  obstacles?: number;
  standardCourseTime?: number;
  courseType?: string;

  // Conformation fields
  classType?: string;
  sex?: string;
  ageGroup?: string;
  variety?: string;
  breed?: string;
  minimumAge?: number; // In months

  // Obedience fields
  exerciseList?: string[];
  maxPoints?: number;

  // Rally fields
  courseDesign?: string;
  signCount?: number;

  // Administrative fields
  entryLimit?: number;
  currentEntries?: number;
  notes?: string | undefined;
  status?: string;

  // For any truly custom fields that don't fit the schema
  customFields?: Record<string, string | number | boolean | Date | string[] | number[]>;
}
