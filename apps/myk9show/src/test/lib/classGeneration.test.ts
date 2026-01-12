import { describe, test, expect } from 'vitest';
import { logger } from '@/services/LoggingService';
import {
  generateClassesFromTemplate,
  validateClassGeneration
} from '@/lib/classGeneration';
import {
  createMockTemplate,
  createMockClassDefinition,
  createMockField,
  createAKCScentWorkTemplate
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
        createdBy: 'test-user'
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
      expect(firstClass.status).toBe('Pending');
    });

    test('applies field overrides correctly', () => {
      const template = createMockTemplate();
      const options = {
        trialId: 'trial-123',
        selectedClasses: [template.classDefinitions[0]],
        fieldOverrides: {
          maxEntries: 35,
          preEntryFee: 30,
          estimatedJudgingTime: 60
        },
        createdBy: 'test-user'
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
            dayOfShow: 30
          },
          judgingTimeEstimate: 45
        }
      });

      const options = {
        trialId: 'trial-123',
        selectedClasses: [template.classDefinitions[0]],
        fieldOverrides: {},
        createdBy: 'test-user'
      };

      const result = generateClassesFromTemplate(template, options);

      expect(result.success).toBe(true);
      const createdClass = result.classes[0];
      expect(createdClass.fieldValues.entryFees?.preEntry).toBe(20);
      expect(createdClass.fieldValues.entryFees?.dayOfShow).toBe(30);
    });

    test.skip('applies rule-based field values - needs update for new field system', () => {
      const ruleBasedClass = createMockClassDefinition({
        element: 'Container',
        level: 'Novice',
        fields: [
          createMockField({
            fieldName: 'searchAreas',
            fieldType: 'rule-based',
            ruleValue: 1
          }),
          createMockField({
            fieldName: 'hides',
            fieldType: 'rule-based',
            ruleValue: 1
          })
        ]
      });

      const template = createMockTemplate({
        classDefinitions: [ruleBasedClass]
      });

      const options = {
        trialId: 'trial-123',
        selectedClasses: [ruleBasedClass],
        fieldOverrides: {},
        createdBy: 'test-user'
      };

      const result = generateClassesFromTemplate(template, options);

      expect(result.success).toBe(true);
      const createdClass = result.classes[0];
      expect(createdClass.searchAreas).toBe(1);
      expect(createdClass.hideConfiguration.type).toBe('known');
      expect(createdClass.hideConfiguration.count).toBe(1);
    });

    test.skip('generates multiple time limits for multi-area classes - needs update for new field system', () => {
      const multiAreaClass = createMockClassDefinition({
        element: 'Interior',
        level: 'Excellent',
        fields: [
          createMockField({
            fieldName: 'searchAreas',
            fieldType: 'rule-based',
            ruleValue: 2
          }),
          createMockField({
            fieldName: 'timeLimit1',
            fieldType: 'rule-based',
            ruleValue: 180
          }),
          createMockField({
            fieldName: 'timeLimit2',
            fieldType: 'rule-based',
            ruleValue: 180
          })
        ]
      });

      const template = createMockTemplate({
        classDefinitions: [multiAreaClass]
      });

      const options = {
        trialId: 'trial-123',
        selectedClasses: [multiAreaClass],
        fieldOverrides: {},
        createdBy: 'test-user'
      };

      const result = generateClassesFromTemplate(template, options);

      expect(result.success).toBe(true);
      const createdClass = result.classes[0];
      expect(createdClass.searchAreas).toBe(2);
      expect(createdClass.timeLimits).toEqual([180, 180]);
    });

    test.skip('configures hide settings based on level - needs update for new field system', () => {
      const noviceClass = createMockClassDefinition({
        level: 'Novice',
        fields: [
          createMockField({
            fieldName: 'hides',
            fieldType: 'rule-based',
            ruleValue: 1
          })
        ]
      });

      const advancedClass = createMockClassDefinition({
        level: 'Advanced',
        fields: [
          createMockField({
            fieldName: 'hides',
            fieldType: 'judge-set',
            allowedRange: { min: 1, max: 3 }
          })
        ]
      });

      const template = createMockTemplate({
        classDefinitions: [noviceClass, advancedClass]
      });

      const options = {
        trialId: 'trial-123',
        selectedClasses: [noviceClass, advancedClass],
        fieldOverrides: { hides: 2 },
        createdBy: 'test-user'
      };

      const result = generateClassesFromTemplate(template, options);

      expect(result.success).toBe(true);
      
      // Novice should have known hide count
      const noviceCreated = result.classes.find(c => c.level === 'Novice');
      expect(noviceCreated?.hideConfiguration.type).toBe('known');
      expect(noviceCreated?.hideConfiguration.count).toBe(2);
      
      // Advanced should have unknown hide range
      const advancedCreated = result.classes.find(c => c.level === 'Advanced');
      expect(advancedCreated?.hideConfiguration.type).toBe('unknown');
      expect(advancedCreated?.hideConfiguration.range).toEqual({ min: 2, max: 2 });
    });

    test.skip('calculates distractions based on level - needs update for new field system', () => {
      const noviceClass = createMockClassDefinition({ level: 'Novice' });
      const advancedClass = createMockClassDefinition({ level: 'Advanced' });

      const template = createMockTemplate({
        classDefinitions: [noviceClass, advancedClass]
      });

      const options = {
        trialId: 'trial-123',
        selectedClasses: [noviceClass, advancedClass],
        fieldOverrides: {},
        createdBy: 'test-user'
      };

      const result = generateClassesFromTemplate(template, options);

      expect(result.success).toBe(true);
      
      // Novice should have no distractions
      const noviceCreated = result.classes.find(c => c.level === 'Novice');
      expect(noviceCreated?.distractions.required).toBe(0);
      
      // Advanced should require distractions
      const advancedCreated = result.classes.find(c => c.level === 'Advanced');
      expect(advancedCreated?.distractions.required).toBe(1);
    });

    test('generates sequential run orders', () => {
      const template = createMockTemplate();
      const options = {
        trialId: 'trial-123',
        selectedClasses: template.classDefinitions,
        fieldOverrides: {},
        runOrderStart: 5,
        createdBy: 'test-user'
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
        createdBy: 'test-user'
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
        createdBy: 'test-user'
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
        createdBy: 'test-user'
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
        createdBy: 'test-secretary'
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
        level: 'NonExistent'
      });

      const result = validateClassGeneration(template, foreignClassDef, {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Class definition not found in template');
    });

    test('prevents overriding rule-based fields', () => {
      const ruleBasedField = createMockField({
        fieldName: 'ruleField',
        fieldSource: 'rule-based',
        editable: false
      });

      const template = createMockTemplate({
        fieldSpecifications: [ruleBasedField],
        classDefinitions: [createMockClassDefinition()]
      });

      const result = validateClassGeneration(template, template.classDefinitions[0], {
        ruleField: 'attempt to override'
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Field ruleField is rule-based and cannot be overridden');
    });

    test('validates data type constraints', () => {
      const numberField = createMockField({
        fieldName: 'numericField',
        dataType: 'number'
      });

      const template = createMockTemplate({
        fieldSpecifications: [numberField],
        classDefinitions: [createMockClassDefinition()]
      });

      const result = validateClassGeneration(template, template.classDefinitions[0], {
        numericField: 'not a number'
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Field numericField must be a number');
    });
  });
});