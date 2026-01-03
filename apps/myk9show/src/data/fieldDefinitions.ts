import { 
  FieldDefinition, 
  FieldCategory, 
  FieldDataType, 
  ShowTypeField,
  FieldOption 
} from '@/types/field-definition-types';
import { ShowType } from '@/types/template.types';

// Predefined options for select fields
const ELEMENT_OPTIONS: FieldOption[] = [
  { value: 'Container', label: 'Container' },
  { value: 'Buried', label: 'Buried' },
  { value: 'Interior', label: 'Interior' },
  { value: 'Exterior', label: 'Exterior' },
  { value: 'Handler Discrimination', label: 'Handler Discrimination' },
  { value: 'Detective', label: 'Detective' },
  // Agility elements
  { value: 'Standard', label: 'Standard', showTypes: [ShowType.AGILITY] },
  { value: 'Jumpers', label: 'Jumpers with Weaves', showTypes: [ShowType.AGILITY] },
  { value: 'FAST', label: 'FAST', showTypes: [ShowType.AGILITY] },
  { value: 'Time 2 Beat', label: 'Time 2 Beat', showTypes: [ShowType.AGILITY] },
  // Conformation elements
  { value: 'Breed', label: 'Breed', showTypes: [ShowType.CONFORMATION] },
  { value: 'Group', label: 'Group', showTypes: [ShowType.CONFORMATION] },
  { value: 'Best in Show', label: 'Best in Show', showTypes: [ShowType.CONFORMATION] }
];

const LEVEL_OPTIONS: FieldOption[] = [
  { value: 'Novice', label: 'Novice' },
  { value: 'Advanced', label: 'Advanced' },
  { value: 'Excellent', label: 'Excellent' },
  { value: 'Master', label: 'Master' },
  { value: 'Open', label: 'Open' },
  { value: 'Utility', label: 'Utility' },
  { value: 'Premier', label: 'Premier', showTypes: [ShowType.AGILITY] }
];

const JUMP_HEIGHT_OPTIONS: FieldOption[] = [
  { value: '4', label: '4"' },
  { value: '8', label: '8"' },
  { value: '12', label: '12"' },
  { value: '16', label: '16"' },
  { value: '20', label: '20"' },
  { value: '24', label: '24"' },
  { value: '24C', label: '24C"' }
];

const SEX_OPTIONS: FieldOption[] = [
  { value: 'Dogs', label: 'Dogs (Males)' },
  { value: 'Bitches', label: 'Bitches (Females)' }
];

// Field Definitions - All possible fields in the system
export const FIELD_DEFINITIONS: FieldDefinition[] = [
  // ========== IDENTITY FIELDS ==========
  {
    id: 'field-element',
    fieldName: ShowTypeField.ELEMENT,
    displayName: 'Element/Class Type',
    description: 'The type of competition element or class',
    category: FieldCategory.IDENTITY,
    dataType: FieldDataType.SELECT,
    showTypes: [ShowType.SCENT_WORK, ShowType.AGILITY, ShowType.CONFORMATION, ShowType.OBEDIENCE, ShowType.RALLY],
    options: ELEMENT_OPTIONS,
    required: true
  },
  {
    id: 'field-level',
    fieldName: ShowTypeField.LEVEL,
    displayName: 'Competition Level',
    description: 'The difficulty level of the class',
    category: FieldCategory.IDENTITY,
    dataType: FieldDataType.SELECT,
    showTypes: [ShowType.SCENT_WORK, ShowType.AGILITY, ShowType.OBEDIENCE, ShowType.RALLY],
    options: LEVEL_OPTIONS,
    required: true
  },
  {
    id: 'field-section',
    fieldName: ShowTypeField.SECTION,
    displayName: 'Section',
    description: 'Class section (A, B, C)',
    category: FieldCategory.IDENTITY,
    dataType: FieldDataType.SELECT,
    showTypes: [ShowType.SCENT_WORK, ShowType.AGILITY, ShowType.OBEDIENCE],
    options: [
      { value: 'A', label: 'A' },
      { value: 'B', label: 'B' },
      { value: 'C', label: 'C' }
    ],
    required: false
  },
  {
    id: 'field-class-name',
    fieldName: ShowTypeField.CLASS_NAME,
    displayName: 'Class Name',
    description: 'Full name of the class',
    category: FieldCategory.IDENTITY,
    dataType: FieldDataType.STRING,
    showTypes: ['all'],
    required: true
  },
  {
    id: 'field-division',
    fieldName: ShowTypeField.DIVISION,
    displayName: 'Division',
    description: 'Competition division',
    category: FieldCategory.IDENTITY,
    dataType: FieldDataType.SELECT,
    showTypes: [ShowType.SCENT_WORK, ShowType.AGILITY],
    options: [
      { value: 'Regular', label: 'Regular' },
      { value: 'Preferred', label: 'Preferred' }
    ],
    required: false
  },

  // ========== SCHEDULING FIELDS ==========
  {
    id: 'field-scheduled-date',
    fieldName: ShowTypeField.SCHEDULED_DATE,
    displayName: 'Scheduled Date',
    description: 'Date when the class is scheduled',
    category: FieldCategory.SCHEDULING,
    dataType: FieldDataType.DATE,
    showTypes: ['all'],
    required: false
  },
  {
    id: 'field-start-time',
    fieldName: ShowTypeField.START_TIME,
    displayName: 'Start Time',
    description: 'Scheduled start time',
    category: FieldCategory.SCHEDULING,
    dataType: FieldDataType.TIME,
    showTypes: ['all'],
    required: false
  },
  {
    id: 'field-ring-number',
    fieldName: ShowTypeField.RING_NUMBER,
    displayName: 'Ring Number',
    description: 'Competition ring assignment',
    category: FieldCategory.SCHEDULING,
    dataType: FieldDataType.NUMBER,
    showTypes: ['all'],
    minValue: 1,
    maxValue: 20,
    required: false
  },
  {
    id: 'field-estimated-duration',
    fieldName: ShowTypeField.ESTIMATED_DURATION,
    displayName: 'Estimated Duration',
    description: 'Estimated class duration in minutes',
    category: FieldCategory.SCHEDULING,
    dataType: FieldDataType.NUMBER,
    showTypes: ['all'],
    unit: 'minutes',
    minValue: 15,
    maxValue: 480,
    defaultValue: 60,
    required: false
  },
  {
    id: 'field-estimated-judging-time',
    fieldName: ShowTypeField.ESTIMATED_JUDGING_TIME,
    displayName: 'Estimated Judging Time',
    description: 'Estimated time per entry (MM:SS)',
    category: FieldCategory.SCHEDULING,
    dataType: FieldDataType.DURATION,
    showTypes: ['all'],
    defaultValue: '3:00',
    required: false
  },
  {
    id: 'field-class-setup-time',
    fieldName: ShowTypeField.CLASS_SETUP_TIME,
    displayName: 'Class Setup Time',
    description: 'One-time setup time in minutes (added to total duration)',
    category: FieldCategory.SCHEDULING,
    dataType: FieldDataType.NUMBER,
    showTypes: ['all'],
    unit: 'minutes',
    minValue: 0,
    maxValue: 60,
    defaultValue: 5,
    required: false
  },

  // ========== PERSONNEL FIELDS ==========
  {
    id: 'field-judge-name',
    fieldName: ShowTypeField.JUDGE_NAME,
    displayName: 'Judge Name',
    description: 'Name of the assigned judge',
    category: FieldCategory.PERSONNEL,
    dataType: FieldDataType.STRING,
    showTypes: ['all'],
    required: false
  },
  {
    id: 'field-judge-id',
    fieldName: ShowTypeField.JUDGE_ID,
    displayName: 'Judge ID',
    description: 'Judge identifier',
    category: FieldCategory.PERSONNEL,
    dataType: FieldDataType.STRING,
    showTypes: ['all'],
    required: false
  },

  // ========== FINANCIAL FIELDS ==========
  {
    id: 'field-pre-entry-fee',
    fieldName: ShowTypeField.PRE_ENTRY_FEE,
    displayName: 'Pre-Entry Fee',
    description: 'Entry fee if paid before closing date',
    category: FieldCategory.FINANCIAL,
    dataType: FieldDataType.CURRENCY,
    showTypes: ['all'],
    unit: '$',
    minValue: 0,
    maxValue: 500,
    defaultValue: 25,
    required: false
  },
  {
    id: 'field-day-of-show-fee',
    fieldName: ShowTypeField.DAY_OF_SHOW_FEE,
    displayName: 'Day of Show Fee',
    description: 'Entry fee if paid at the show',
    category: FieldCategory.FINANCIAL,
    dataType: FieldDataType.CURRENCY,
    showTypes: ['all'],
    unit: '$',
    minValue: 0,
    maxValue: 500,
    defaultValue: 30,
    required: false
  },

  // ========== SCENT WORK SPECIFIC ==========
  {
    id: 'field-search-areas',
    fieldName: ShowTypeField.SEARCH_AREAS,
    displayName: 'Number of Search Areas',
    description: 'Number of separate search areas in this class',
    category: FieldCategory.COMPETITION,
    dataType: FieldDataType.NUMBER,
    showTypes: [ShowType.SCENT_WORK],
    minValue: 1,
    maxValue: 5,
    defaultValue: 1,
    required: true
  },
  {
    id: 'field-hide-count',
    fieldName: ShowTypeField.HIDE_COUNT,
    displayName: 'Hide Count',
    description: 'Number of hides to find',
    category: FieldCategory.COMPETITION,
    dataType: FieldDataType.NUMBER,
    showTypes: [ShowType.SCENT_WORK],
    minValue: 0,
    maxValue: 10,
    defaultValue: 1,
    required: true
  },
  {
    id: 'field-search-time-limit',
    fieldName: ShowTypeField.SEARCH_TIME_LIMIT,
    displayName: 'Search Time Limit',
    description: 'Maximum time allowed for search in MM:SS.HH format (single area)',
    category: FieldCategory.COMPETITION,
    dataType: FieldDataType.DURATION,
    showTypes: [ShowType.SCENT_WORK],
    unit: 'MM:SS.HH',
    minValue: 60000,   // 1:00.00 in milliseconds
    maxValue: 900000,  // 15:00.00 in milliseconds
    defaultValue: 180000, // 3:00.00 in milliseconds
    required: true
  },
  {
    id: 'field-search-time-limits',
    fieldName: ShowTypeField.SEARCH_TIME_LIMITS,
    displayName: 'Search Time Limits per Area',
    description: 'Time limits for each search area (when multiple areas)',
    category: FieldCategory.COMPETITION,
    dataType: FieldDataType.DURATION_ARRAY,
    showTypes: [ShowType.SCENT_WORK],
    unit: 'MM:SS.HH',
    minValue: 60000,   // 1:00.00 in milliseconds
    maxValue: 900000,  // 15:00.00 in milliseconds
    defaultValue: [180000], // Default to one area with 3:00.00
    required: false
  },
  {
    id: 'field-search-environment',
    fieldName: ShowTypeField.SEARCH_ENVIRONMENT,
    displayName: 'Search Environment',
    description: 'Type of search environment',
    category: FieldCategory.COMPETITION,
    dataType: FieldDataType.SELECT,
    showTypes: [ShowType.SCENT_WORK],
    options: [
      { value: 'containers', label: 'Containers' },
      { value: 'vehicles', label: 'Vehicles' },
      { value: 'indoor', label: 'Indoor Room' },
      { value: 'outdoor', label: 'Outdoor Area' }
    ],
    required: false
  },

  // ========== AGILITY SPECIFIC ==========
  {
    id: 'field-jump-height',
    fieldName: ShowTypeField.JUMP_HEIGHT,
    displayName: 'Jump Height',
    description: 'Height of jumps for this class',
    category: FieldCategory.COMPETITION,
    dataType: FieldDataType.SELECT,
    showTypes: [ShowType.AGILITY],
    options: JUMP_HEIGHT_OPTIONS,
    required: true
  },
  {
    id: 'field-course-yards',
    fieldName: ShowTypeField.COURSE_YARDS,
    displayName: 'Course Yards',
    description: 'Total yardage of the course',
    category: FieldCategory.COMPETITION,
    dataType: FieldDataType.NUMBER,
    showTypes: [ShowType.AGILITY],
    minValue: 50,
    maxValue: 300,
    required: false
  },
  {
    id: 'field-standard-course-time',
    fieldName: ShowTypeField.STANDARD_COURSE_TIME,
    displayName: 'Standard Course Time',
    description: 'SCT in seconds',
    category: FieldCategory.COMPETITION,
    dataType: FieldDataType.NUMBER,
    showTypes: [ShowType.AGILITY],
    unit: 'seconds',
    minValue: 30,
    maxValue: 120,
    required: false
  },

  // ========== CONFORMATION SPECIFIC ==========
  {
    id: 'field-sex',
    fieldName: ShowTypeField.SEX,
    displayName: 'Sex',
    description: 'Sex division for the class',
    category: FieldCategory.COMPETITION,
    dataType: FieldDataType.SELECT,
    showTypes: [ShowType.CONFORMATION],
    options: SEX_OPTIONS,
    required: true
  },
  {
    id: 'field-breed',
    fieldName: ShowTypeField.BREED,
    displayName: 'Breed',
    description: 'Breed for breed-specific classes',
    category: FieldCategory.COMPETITION,
    dataType: FieldDataType.STRING,
    showTypes: [ShowType.CONFORMATION],
    required: false
  },
  {
    id: 'field-minimum-age',
    fieldName: ShowTypeField.MINIMUM_AGE,
    displayName: 'Minimum Age',
    description: 'Minimum age for the class in months',
    category: FieldCategory.COMPETITION,
    dataType: FieldDataType.NUMBER,
    showTypes: [ShowType.CONFORMATION],
    unit: 'months',
    minValue: 0,
    maxValue: 240,
    defaultValue: 6,
    required: false
  },

  // ========== ADMINISTRATIVE FIELDS ==========
  {
    id: 'field-entry-limit',
    fieldName: ShowTypeField.ENTRY_LIMIT,
    displayName: 'Entry Limit',
    description: 'Maximum number of entries allowed',
    category: FieldCategory.ADMINISTRATIVE,
    dataType: FieldDataType.NUMBER,
    showTypes: ['all'],
    minValue: 1,
    maxValue: 500,
    required: false
  },
  {
    id: 'field-current-entries',
    fieldName: ShowTypeField.CURRENT_ENTRIES,
    displayName: 'Current Entries',
    description: 'Number of entries currently registered',
    category: FieldCategory.ADMINISTRATIVE,
    dataType: FieldDataType.NUMBER,
    showTypes: ['all'],
    minValue: 0,
    maxValue: 500,
    defaultValue: 0,
    required: false
  },
  {
    id: 'field-notes',
    fieldName: ShowTypeField.NOTES,
    displayName: 'Notes',
    description: 'Additional notes or instructions',
    category: FieldCategory.ADMINISTRATIVE,
    dataType: FieldDataType.TEXT,
    showTypes: ['all'],
    required: false
  },
  {
    id: 'field-status',
    fieldName: ShowTypeField.STATUS,
    displayName: 'Status',
    description: 'Current status of the class',
    category: FieldCategory.ADMINISTRATIVE,
    dataType: FieldDataType.SELECT,
    showTypes: ['all'],
    options: [
      { value: 'Open', label: 'Open for Entries' },
      { value: 'Closed', label: 'Closed' },
      { value: 'Full', label: 'Full' },
      { value: 'Cancelled', label: 'Cancelled' }
    ],
    defaultValue: 'Open',
    required: false
  }
];

// Helper function to get fields for a specific show type
export function getFieldsForShowType(showType: ShowType): FieldDefinition[] {
  return FIELD_DEFINITIONS.filter(field => 
    field.showTypes.includes('all') || field.showTypes.includes(showType)
  );
}

// Helper function to get a specific field definition
export function getFieldDefinition(fieldName: ShowTypeField): FieldDefinition | undefined {
  return FIELD_DEFINITIONS.find(field => field.fieldName === fieldName);
}

// Helper function to get fields by category
export function getFieldsByCategory(category: FieldCategory, showType?: ShowType): FieldDefinition[] {
  let fields = FIELD_DEFINITIONS.filter(field => field.category === category);
  
  if (showType) {
    fields = fields.filter(field => 
      field.showTypes.includes('all') || field.showTypes.includes(showType)
    );
  }
  
  return fields;
}