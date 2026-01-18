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
  showType: string; // e.g., 'Scent Work', 'Agility', 'Obedience', etc.
  description?: string;
  fields: ClassTemplateField[];
  classPattern: string; // Pattern for generating class names, e.g., "{element} {level} {section}"
  entryFeeDefault?: number;
  maxEntriesDefault?: number;
  requiresJumpHeight?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassTemplatePreset {
  template: Omit<ClassTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  generateClasses: () => GeneratedClass[];
}

export interface GeneratedClass {
  className: string;
  classNumber?: string | undefined;
  element?: string | undefined;
  level?: string | undefined;
  section?: string | undefined;
  entryFee?: number | undefined;
  maxEntries?: number | undefined;
  requiresJumpHeight?: boolean | undefined;
  customFields?: Record<string, string> | undefined;
}

// AKC Scent Work specific types
export interface AKCScentWorkClass {
  element: 'Interior' | 'Exterior' | 'Container' | 'Buried' | 'Handler Discrimination' | 'Detective';
  level?: 'Novice' | 'Advanced' | 'Excellent' | 'Masters';
  section?: 'A' | 'B';
}

export const AKC_SCENT_WORK_TEMPLATE: ClassTemplatePreset = {
  template: {
    name: 'AKC Scent Work',
    organization: 'AKC',
    showType: 'Scent Work',
    description: 'Standard AKC Scent Work trial classes',
    fields: [
      {
        name: 'element',
        type: 'element',
        values: ['Interior', 'Exterior', 'Container', 'Buried', 'Handler Discrimination', 'Detective']
      },
      {
        name: 'level',
        type: 'level',
        values: ['Novice', 'Advanced', 'Excellent', 'Masters'],
        optional: true
      },
      {
        name: 'section',
        type: 'section',
        values: ['A', 'B'],
        optional: true
      }
    ],
    classPattern: '{element} {level} {section}',
    entryFeeDefault: 30,
    maxEntriesDefault: 40,
    requiresJumpHeight: false
  },
  generateClasses: () => {
    const classes: GeneratedClass[] = [];
    const elements = ['Interior', 'Exterior', 'Container', 'Buried', 'Handler Discrimination'];
    const levels = ['Novice', 'Advanced', 'Excellent', 'Masters'];
    
    // Regular element classes
    elements.forEach(element => {
      levels.forEach(level => {
        if (level === 'Novice') {
          // Novice has A and B sections
          ['A', 'B'].forEach(section => {
            classes.push({
              className: `${element} ${level} ${section}`,
              element,
              level,
              section,
              entryFee: 30,
              maxEntries: 40
            });
          });
        } else {
          // Other levels don't have sections
          classes.push({
            className: `${element} ${level}`,
            element,
            level,
            entryFee: 30,
            maxEntries: 40
          });
        }
      });
    });
    
    // Detective class (no level or section)
    classes.push({
      className: 'Detective',
      element: 'Detective',
      entryFee: 35,
      maxEntries: 30
    });
    
    return classes;
  }
};

// Additional preset templates
export const CLASS_TEMPLATE_PRESETS: Record<string, ClassTemplatePreset> = {
  'akc-scent-work': AKC_SCENT_WORK_TEMPLATE,
  
  'akc-agility': {
    template: {
      name: 'AKC Agility',
      organization: 'AKC',
      showType: 'Agility',
      description: 'Standard AKC Agility trial classes',
      fields: [
        {
          name: 'course',
          type: 'custom',
          values: ['Standard', 'Jumpers with Weaves', 'FAST', 'Time 2 Beat', 'Premier']
        },
        {
          name: 'level',
          type: 'level',
          values: ['Novice A', 'Novice B', 'Open', 'Excellent', 'Masters']
        }
      ],
      classPattern: '{course} - {level}',
      entryFeeDefault: 25,
      maxEntriesDefault: 350,
      requiresJumpHeight: true
    },
    generateClasses: () => {
      const classes: GeneratedClass[] = [];
      const courses = ['Standard', 'Jumpers with Weaves'];
      const levels = ['Novice A', 'Novice B', 'Open', 'Excellent', 'Masters'];
      
      courses.forEach(course => {
        levels.forEach(level => {
          classes.push({
            className: `${course} - ${level}`,
            customFields: { course },
            level,
            entryFee: 25,
            maxEntries: 350,
            requiresJumpHeight: true
          });
        });
      });
      
      // FAST classes
      ['Novice', 'Open', 'Excellent', 'Masters'].forEach(level => {
        classes.push({
          className: `FAST - ${level}`,
          customFields: { course: 'FAST' },
          level,
          entryFee: 25,
          maxEntries: 350,
          requiresJumpHeight: true
        });
      });
      
      return classes;
    }
  }
};