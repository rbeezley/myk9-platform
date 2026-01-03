// Comprehensive template system types supporting multiple organizations and show types
import { TemplateFieldConfiguration } from './field-definition-types';

// Organization types supported
export enum Organization {
  AKC = 'AKC',
  UKC = 'UKC',
  NACSW = 'NACSW',
  CPE = 'CPE',
  USDAA = 'USDAA',
  NADAC = 'NADAC',
  ASCA = 'ASCA',
  OTHER = 'OTHER'
}

// Show types across all organizations
export enum ShowType {
  SCENT_WORK = 'Scent Work',
  NOSEWORK = 'Nosework',
  AGILITY = 'Agility',
  CONFORMATION = 'Conformation',
  OBEDIENCE = 'Obedience',
  RALLY = 'Rally',
  OBEDIENCE_RALLY = 'Obedience & Rally',
  FASTCAT = 'FastCAT',
  COURSING_ABILITY_TEST = 'Coursing Ability Test',
  BARN_HUNT = 'Barn Hunt',
  TRACKING = 'Tracking',
  FIELD_TRIAL = 'Field Trial',
  HUNT_TEST = 'Hunt Test',
  HERDING = 'Herding',
  LURE_COURSING = 'Lure Coursing',
  DOCK_DIVING = 'Dock Diving',
  WEIGHT_PULL = 'Weight Pull',
  OTHER = 'Other'
}

// Class status tracking
export type ClassStatus = 'Pending' | 'In Progress' | 'Complete' | 'Cancelled';

// Field value sources
export type FieldSource = 'rule-based' | 'judge-set' | 'admin-set' | 'calculated' | 'fixed';

// Field data types
export type FieldDataType = 'string' | 'number' | 'boolean' | 'date' | 'time' | 'datetime' | 'select' | 'multi-select' | 'text' | 'rich-text';

// Conditional display rules
export interface ConditionalRule {
  dependsOn: string; // field name
  condition: 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'contains' | 'in' | 'notIn';
  value: string | number | boolean | string[]; // can be single value or array for 'in'/'notIn'
}

// Field specification with all metadata
export interface FieldSpecification {
  // Core field identity
  fieldName: string;
  displayName: string;
  description?: string;
  
  // Field behavior
  fieldSource: FieldSource;
  dataType: FieldDataType;
  required: boolean;
  editable: boolean;
  
  // Value configuration
  defaultValue?: string | number | boolean | Date | string[];
  ruleValue?: string | number | boolean | Date | string[]; // For rule-based fields
  calculationFormula?: string; // For calculated fields
  
  // Constraints and options
  options?: string[] | { label: string; value: string }[]; // For select fields
  allowedRange?: {
    min?: number | string;
    max?: number | string;
  };
  pattern?: string; // Regex validation
  
  // Conditional display
  showWhen?: ConditionalRule | ConditionalRule[]; // Can have multiple conditions
  
  // UI hints
  helpText?: string;
  placeholder?: string;
  validationMessage?: string;
  displayOrder?: number;
  groupName?: string; // For grouping related fields
  columnWidth?: 1 | 2 | 3 | 4; // Grid column span
}

// Validation rule types
export interface ValidationRule {
  ruleType: 'prohibited' | 'required' | 'conditional' | 'custom';
  fields: string[]; // Fields involved in validation
  condition?: string; // Custom validation expression
  message: string;
}

// Class definition within a template
export interface ClassDefinition {
  // Identity
  element: string;
  level?: string;
  section?: string;
  
  // Display
  className: string;
  classNumber?: string;
  displayOrder: number;
  description?: string; // Additional notes about the class
  
  // Field overrides for this specific class
  fieldOverrides?: Record<string, Partial<FieldSpecification>>;
  
  // Class-specific default values for fields marked as defaultVariesByClass
  classSpecificDefaults?: Record<string, string | number | boolean | Date | string[] | number[]>;
  
  // Class-specific settings
  settings?: {
    maxEntries?: number;
    minEntries?: number;
    allowWaitlist?: boolean;
    requiresQualification?: boolean;
  };
}

// Template status and lifecycle
export enum TemplateStatus {
  DRAFT = 'draft',           // Work in progress
  ACTIVE = 'active',         // Available for use
  DEPRECATED = 'deprecated', // Old version, still usable but not recommended
  ARCHIVED = 'archived'      // No longer available for new use
}

export enum TemplateType {
  OFFICIAL = 'official',     // Official organization template
  CUSTOM = 'custom',         // User/club created template
  FORK = 'fork'             // Copy of an official template
}

// Complete template definition
export interface ClassTemplate {
  // Identity
  id: string;
  organization: Organization;
  showType: ShowType;
  templateName: string;
  version: string;
  
  // Metadata
  description?: string;
  officialRulesReference?: string;
  effectiveDate?: Date;
  expirationDate?: Date;
  
  // NEW: Flexible status system
  status: TemplateStatus;
  type: TemplateType;
  
  // DEPRECATED: Legacy status fields (kept for backward compatibility)
  isActive: boolean;
  isOfficial: boolean; // Official templates from organizations
  isCustom: boolean; // Club-specific customizations
  
  // NEW: Template relationships and versioning
  sourceTemplateId?: string; // If this is a copy/fork of another template
  parentVersion?: string;     // Version of source template this was forked from
  successorId?: string;       // ID of newer version that replaces this one
  isLatestVersion?: boolean;  // True if this is the current version
  
  // NEW: Edit permissions and warnings
  allowEditing?: boolean;     // Can this template be edited?
  editWarning?: string;       // Warning message when editing
  
  // NEW: Field configurations - references predefined fields with visibility/requirement settings
  fieldConfigurations?: TemplateFieldConfiguration[];
  
  // NEW: Table column configuration for entry tables
  tableColumnConfig?: {
    /** Custom column configuration for this template */
    customColumns?: string[]; // Column IDs to show
    /** Whether to use default columns for the show type */
    useDefaults?: boolean;
    /** Hide specific columns that would normally be shown */
    hiddenColumns?: string[];
    /** Custom column ordering */
    columnOrder?: string[];
  };
  
  // DEPRECATED: Field definitions - defines all possible fields (kept for backward compatibility)
  fieldSpecifications: FieldSpecification[];
  
  // Class definitions - defines all classes in template
  classDefinitions: ClassDefinition[];
  
  // Validation rules
  validationRules: ValidationRule[];
  
  // Template-wide defaults
  defaults: {
    entryFees?: {
      preEntry: number;
      dayOfShow: number;
    };
    judgingTimeEstimate?: number; // minutes
    requiredPersonnel?: string[];
    minimumAge?: number; // months
  };
  
  // Audit
  createdBy: string;
  createdAt: Date;
  updatedBy?: string;
  updatedAt?: Date;
}

// Created class instance (from template)
export interface CreatedClass {
  // Identity
  id: string;
  templateId: string;
  templateVersion: string;
  trialId: string;
  
  // Class identity (from template)
  organization: Organization;
  showType: ShowType;
  element: string;
  level?: string;
  section?: string;
  className: string;
  classNumber: string;
  
  // Status and scheduling
  status: ClassStatus;
  runOrder: number;
  plannedStartTime?: Date;
  actualStartTime?: Date;
  completionTime?: Date;
  
  // All field values (merged from template + overrides)
  fieldValues: Record<string, string | number | boolean | Date | string[]>;
  
  // Personnel assignments
  personnel: {
    judgeId?: string;
    judgeName?: string;
    stewards: {
      gate?: string;
      table?: string;
      timer?: string;
      ring?: string[];
    };
  };
  
  // Entry tracking
  entries: {
    maxEntries: number;
    currentEntries: number;
    waitlistEntries: number;
  };
  
  // Audit
  createdBy: string;
  createdAt: Date;
  modifiedBy?: string;
  modifiedAt?: Date;
  cancelledBy?: string;
  cancelledAt?: Date;
  cancellationReason?: string;
}

// Template management
export interface TemplateFilter {
  organization?: Organization;
  showType?: ShowType;
  isActive?: boolean;
  isOfficial?: boolean;
  searchTerm?: string;
}

export interface TemplateImportExport {
  template: Omit<ClassTemplate, 'id' | 'createdAt' | 'createdBy'>;
  exportedAt: Date;
  exportedBy: string;
  exportFormat: '1.0';
}

// Personnel types
export interface Personnel {
  id: string;
  name: string;
  role: 'judge' | 'steward' | 'secretary' | 'other';
  email?: string;
  phone?: string;
  availability?: Date[];
}

// Helper types for UI
export interface FieldGroup {
  groupName: string;
  displayOrder: number;
  fields: FieldSpecification[];
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export interface ClassSelectionItem {
  classDefinition: ClassDefinition;
  selected: boolean;
  fieldOverrides: Record<string, string | number | boolean | Date | string[]>;
  validationErrors?: string[];
}

// For AKC Scent Work specific types
export interface AKCScentWorkHideConfiguration {
  searchType: 'Known' | 'Unknown';
  hideCount?: number;
  hideRange?: { min: number; max: number };
  description: string;
}

export interface AKCScentWorkTimeLimit {
  area: number; // 1, 2, or 3
  timeLimit: string; // Can be range like "2-4 minutes" or fixed like "2 minutes"
  setBy: 'Rules' | 'Judge';
}

// Re-export types from field-definition-types for convenience
export type { TemplateFieldConfiguration } from './field-definition-types';