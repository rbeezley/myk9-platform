export interface ClassTemplateField {
  name: string;
  type: 'element' | 'level' | 'section' | 'custom';
  values: string[];
  optional?: boolean;
}

export interface ClassTemplate {
  id: string;
  name: string;
  organization: 'AKC' | 'UKC' | 'NACSW' | 'CPE' | 'USDAA' | 'NADAC' | 'OTHER';
  trialType: string; // e.g., 'Scent Work', 'Agility', 'Obedience', etc.
  description?: string;
  fields: ClassTemplateField[];
  classPattern: string; // Pattern for generating class names, e.g., "{element} {level} {section}"
  maxEntriesDefault?: number;
  requiresJumpHeight?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GeneratedClass {
  className: string;
  classNumber?: string | undefined;
  element?: string | undefined;
  level?: string | undefined;
  section?: string | undefined;
  maxEntries?: number | undefined;
  requiresJumpHeight?: boolean | undefined;
  customFields?: Record<string, string> | undefined;
}

// AKC Scent Work specific types
export interface AKCScentWorkClass {
  element:
    'Interior' | 'Exterior' | 'Container' | 'Buried' | 'Handler Discrimination' | 'Detective';
  level?: 'Novice' | 'Advanced' | 'Excellent' | 'Masters';
  section?: 'A' | 'B';
}
