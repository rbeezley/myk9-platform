import {
  ClassTemplate,
  ClassDefinition,
  FieldSpecification,
  CreatedClass,
  Organization,
  TrialType,
} from '@/types/template.types';

// Mock field specifications
export const createMockField = (
  overrides: Partial<FieldSpecification> = {}
): FieldSpecification => ({
  fieldName: 'testField',
  fieldSource: 'admin-set',
  dataType: 'string',
  displayName: 'Test Field',
  required: false,
  editable: true,
  defaultValue: 'test value',
  ...overrides,
});

// Mock class definition
export const createMockClassDefinition = (
  overrides: Partial<ClassDefinition> = {}
): ClassDefinition => ({
  element: 'Container',
  level: 'Novice',
  section: 'A',
  className: 'Container Novice A',
  displayOrder: 1,
  fieldOverrides: {
    searchAreas: { defaultValue: 1 },
    timeLimit1: { defaultValue: 180 },
    maxEntries: { defaultValue: 30 },
  },
  ...overrides,
});

// Mock template
export const createMockTemplate = (overrides: Partial<ClassTemplate> = {}): ClassTemplate => ({
  id: 'test-template-1',
  organization: Organization.AKC,
  trialType: TrialType.SCENT_WORK,
  templateName: 'Test Template',
  version: '1.0.0',
  description: 'A test template for unit testing',
  createdBy: 'test-user',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  isActive: true,
  isOfficial: false,
  isCustom: false,
  fieldSpecifications: [
    createMockField({ fieldName: 'searchAreas', fieldSource: 'rule-based', dataType: 'number' }),
    createMockField({ fieldName: 'timeLimit1', fieldSource: 'judge-set', dataType: 'number' }),
    createMockField({ fieldName: 'maxEntries', fieldSource: 'admin-set', dataType: 'number' }),
  ],
  classDefinitions: [
    createMockClassDefinition(),
    createMockClassDefinition({
      element: 'Buried',
      level: 'Advanced',
      className: 'Buried Advanced',
    }),
  ],
  defaults: {
    entryFees: {
      preEntry: 25,
      dayOfShow: 35,
    },
  },
  validationRules: [],
  ...overrides,
});

// Mock created class
export const createMockCreatedClass = (overrides: Partial<CreatedClass> = {}): CreatedClass => ({
  id: 'created-class-1',
  templateId: 'test-template-1',
  templateVersion: '1.0.0',
  trialId: 'trial-123',
  organization: Organization.AKC,
  trialType: TrialType.SCENT_WORK,
  className: 'Container Novice A',
  classNumber: 'C1',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  status: 'Pending',
  runOrder: 1,
  plannedStartTime: new Date('2024-06-01T09:00:00'),
  fieldValues: {
    searchAreas: 1,
    timeLimit1: 180,
    maxEntries: 30,
    hideConfiguration: 'Known',
    distractions: 0,
    preEntryFee: 25,
    dayOfShowFee: 35,
  },
  personnel: {
    judgeName: 'John Doe',
    stewards: {
      gate: 'Jane Smith',
      table: 'Bob Johnson',
      timer: 'Alice Williams',
    },
  },
  entries: {
    maxEntries: 30,
    currentEntries: 0,
    waitlistEntries: 0,
  },
  createdBy: 'test-user',
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

// Mock AKC Scent Work template with real data
export const createAKCScentWorkTemplate = (): ClassTemplate => ({
  id: 'akc-scent-work-2024',
  organization: Organization.AKC,
  trialType: TrialType.SCENT_WORK,
  templateName: 'AKC Scent Work Official Classes',
  version: '2024.1',
  description: 'Official AKC Scent Work class template based on 2024 regulations',
  createdBy: 'system',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  isActive: true,
  isOfficial: true,
  isCustom: false,
  fieldSpecifications: [
    createMockField({ fieldName: 'searchAreas', fieldSource: 'rule-based', dataType: 'number' }),
    createMockField({ fieldName: 'timeLimit1', fieldSource: 'judge-set', dataType: 'number' }),
    createMockField({ fieldName: 'maxEntries', fieldSource: 'admin-set', dataType: 'number' }),
    createMockField({
      fieldName: 'preEntryFee',
      fieldSource: 'admin-set',
      dataType: 'number',
      defaultValue: 25,
    }),
  ],
  classDefinitions: [
    // Container classes
    createMockClassDefinition({
      element: 'Container',
      level: 'Novice',
      section: 'A',
      className: 'Container Novice A',
      displayOrder: 1,
    }),
    createMockClassDefinition({
      element: 'Container',
      level: 'Advanced',
      section: 'A',
      className: 'Container Advanced A',
      displayOrder: 2,
    }),
    // Buried classes
    createMockClassDefinition({
      element: 'Buried',
      level: 'Novice',
      section: 'A',
      className: 'Buried Novice A',
      displayOrder: 3,
    }),
    // Interior classes
    createMockClassDefinition({
      element: 'Interior',
      level: 'Excellent',
      section: 'A',
      className: 'Interior Excellent A',
      displayOrder: 4,
    }),
  ],
  defaults: {
    entryFees: {
      preEntry: 25,
      dayOfShow: 35,
    },
    judgingTimeEstimate: 45,
  },
  validationRules: [],
});

// Helper to create multiple templates
export const createMockTemplates = (count: number): ClassTemplate[] => {
  return Array.from({ length: count }, (_, i) =>
    createMockTemplate({
      id: `template-${i + 1}`,
      templateName: `Template ${i + 1}`,
      organization: i % 2 === 0 ? Organization.AKC : Organization.UKC,
    })
  );
};

// Helper to create multiple classes
export const createMockClasses = (count: number): CreatedClass[] => {
  return Array.from({ length: count }, (_, i) =>
    createMockCreatedClass({
      id: `class-${i + 1}`,
      className: `Class ${i + 1}`,
      runOrder: i + 1,
      plannedStartTime: new Date(`2024-06-01T${9 + Math.floor(i / 2)}:${(i % 2) * 30}:00`),
    })
  );
};
