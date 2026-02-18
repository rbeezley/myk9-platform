import { describe, test, expect } from 'vitest';
import { generateClassesFromTemplate, validateClassGeneration } from '@/lib/classGeneration';
import {
  createMockTemplate,
  createMockClassDefinition,
  createMockField,
  createAKCScentWorkTemplate,
} from '@/test/utils/mockData';

describe('Class Generation', () => {
  describe('generateClassesFromTemplate', () => {
    test('generates classes successfully from valid template', () => {
      const template = createMockTemplate();
      const options = {
        trialId: 'trial-123',
        selectedClasses: template.classDefinitions.slice(0, 2),
        fieldOverrides: { maxEntries: 25 },
        runOrderStart: 1,
        createdBy: 'test-user',
      };

      const result = generateClassesFromTemplate(template, options);

      expect(result.success).toBe(true);
      expect(result.classes).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      // Check first class properties
      const firstClass = result.classes[0];
      expect(firstClass.templateId).toBe(template.id);
      expect(firstClass.templateVersion).toBe(template.version);
      expect(firstClass.trialId).toBe('trial-123');
      expect(firstClass.runOrder).toBe(1);
      expect(firstClass.entries.maxEntries).toBe(25); // Override applied
      expect(firstClass.createdBy).toBe('test-user');
      expect(firstClass.status).toBe('Scheduled');
    });

    test('applies field overrides correctly', () => {
      const template = createMockTemplate();
      const options = {
        trialId: 'trial-123',
        selectedClasses: [template.classDefinitions[0]],
        fieldOverrides: {
          maxEntries: 35,
          preEntryFee: 30,
          estimatedJudgingTime: 60,
        },
        createdBy: 'test-user',
      };

      const result = generateClassesFromTemplate(template, options);

      expect(result.success).toBe(true);
      const createdClass = result.classes[0];
      expect(createdClass.entries.maxEntries).toBe(35);
      expect(createdClass.fieldValues.preEntryFee).toBe(30);
      expect(createdClass.fieldValues.estimatedJudgingTime).toBe(60);
    });

    test('uses template shared defaults when no overrides', () => {
      const template = createMockTemplate({
        defaults: {
          entryFees: {
            preEntry: 20,
            dayOfShow: 30,
          },
          judgingTimeEstimate: 45,
        },
      });

      const options = {
        trialId: 'trial-123',
        selectedClasses: [template.classDefinitions[0]],
        fieldOverrides: {},
        createdBy: 'test-user',
      };

      const result = generateClassesFromTemplate(template, options);

      expect(result.success).toBe(true);
      const createdClass = result.classes[0];
      expect(createdClass.fieldValues.entryFees?.preEntry).toBe(20);
      expect(createdClass.fieldValues.entryFees?.dayOfShow).toBe(30);
    });

    test('generates sequential run orders', () => {
      const template = createMockTemplate();
      const options = {
        trialId: 'trial-123',
        selectedClasses: template.classDefinitions,
        fieldOverrides: {},
        runOrderStart: 5,
        createdBy: 'test-user',
      };

      const result = generateClassesFromTemplate(template, options);

      expect(result.success).toBe(true);
      expect(result.classes[0].runOrder).toBe(5);
      expect(result.classes[1].runOrder).toBe(6);
    });

    test('generates unique class numbers', () => {
      const template = createMockTemplate();
      const options = {
        trialId: 'trial-123',
        selectedClasses: template.classDefinitions,
        fieldOverrides: {},
        createdBy: 'test-user',
      };

      const result = generateClassesFromTemplate(template, options);

      expect(result.success).toBe(true);

      const classNumbers = result.classes.map(c => c.classNumber);
      const uniqueNumbers = new Set(classNumbers);
      expect(uniqueNumbers.size).toBe(classNumbers.length); // All unique

      // Check format (ElementLevelSection-RunOrder)
      expect(result.classes[0].classNumber).toMatch(/^[A-Z]+[A-Z]*[A-Z]*-\d+$/);
    });

    test('fails when template is missing', () => {
      const result = generateClassesFromTemplate(null as unknown as ClassTemplate, {
        trialId: 'trial-123',
        selectedClasses: [],
        fieldOverrides: {},
        createdBy: 'test-user',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Template is required');
    });

    test('fails when no classes are selected', () => {
      const template = createMockTemplate();
      const result = generateClassesFromTemplate(template, {
        trialId: 'trial-123',
        selectedClasses: [],
        fieldOverrides: {},
        createdBy: 'test-user',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('At least one class must be selected');
    });

    test('works with real AKC Scent Work template', () => {
      const template = createAKCScentWorkTemplate();
      const options = {
        trialId: 'trial-123',
        selectedClasses: template.classDefinitions.slice(0, 3),
        fieldOverrides: { maxEntries: 40 },
        createdBy: 'test-secretary',
      };

      const result = generateClassesFromTemplate(template, options);

      expect(result.success).toBe(true);
      expect(result.classes).toHaveLength(3);
      expect(result.errors).toHaveLength(0);

      // Check that all classes have proper structure
      result.classes.forEach(cls => {
        expect(cls.templateId).toBe(template.id);
        expect(cls.templateVersion).toBe(template.version);
        expect(cls.trialId).toBe('trial-123');
        expect(cls.entries.maxEntries).toBe(40);
        expect(cls.className).toBeTruthy();
        expect(cls.classNumber).toBeTruthy();
      });
    });
  });

  describe('validateClassGeneration', () => {
    test('validates successful class generation', () => {
      const template = createMockTemplate();
      const classDef = template.classDefinitions[0];
      const overrides = { maxEntries: 25 };

      const result = validateClassGeneration(template, classDef, overrides);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('fails when class definition not in template', () => {
      const template = createMockTemplate();
      const foreignClassDef = createMockClassDefinition({
        element: 'Unknown',
        level: 'NonExistent',
      });

      const result = validateClassGeneration(template, foreignClassDef, {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Class definition not found in template');
    });

    test('prevents overriding rule-based fields', () => {
      const ruleBasedField = createMockField({
        fieldName: 'ruleField',
        fieldSource: 'rule-based',
        editable: false,
      });

      const template = createMockTemplate({
        fieldSpecifications: [ruleBasedField],
        classDefinitions: [createMockClassDefinition()],
      });

      const result = validateClassGeneration(template, template.classDefinitions[0], {
        ruleField: 'attempt to override',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Field ruleField is rule-based and cannot be overridden');
    });

    test('validates data type constraints', () => {
      const numberField = createMockField({
        fieldName: 'numericField',
        dataType: 'number',
      });

      const template = createMockTemplate({
        fieldSpecifications: [numberField],
        classDefinitions: [createMockClassDefinition()],
      });

      const result = validateClassGeneration(template, template.classDefinitions[0], {
        numericField: 'not a number',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Field numericField must be a number');
    });
  });
});
