import { describe, test, expect } from 'vitest';
import {
  validateTemplate,
  validateClassDefinition,
  validateField,
  shouldShowField,
  generateClassName,
  validateFieldOverrides
} from '@/lib/templateValidation';
import {
  createMockTemplate,
  createMockClassDefinition,
  createMockField,
  createAKCScentWorkTemplate
} from '@/test/utils/mockData';

describe('Template Validation', () => {
  describe('validateTemplate', () => {
    test('validates a complete valid template', () => {
      const template = createMockTemplate();
      const result = validateTemplate(template);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('fails validation when required fields are missing', () => {
      const template = createMockTemplate({
        templateName: '',
        organization: undefined as unknown as Organization,
        trialType: undefined as unknown as TrialType
      });
      
      const result = validateTemplate(template);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Template name is required');
      expect(result.errors).toContain('Organization is required');
      expect(result.errors).toContain('Show type is required');
    });

    test('fails validation when no class definitions exist', () => {
      const template = createMockTemplate({
        classDefinitions: []
      });
      
      const result = validateTemplate(template);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Template must contain at least one class definition');
    });

    test('detects duplicate class definitions', () => {
      const duplicateClass = createMockClassDefinition({
        element: 'Container',
        level: 'Novice',
        section: 'A'
      });
      
      const template = createMockTemplate({
        classDefinitions: [duplicateClass, duplicateClass]
      });
      
      const result = validateTemplate(template);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Duplicate class definition'))).toBe(true);
    });

    test('validates AKC Scent Work template successfully', () => {
      const template = createAKCScentWorkTemplate();
      const result = validateTemplate(template);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateClassDefinition', () => {
    test('validates a complete valid class definition', () => {
      const classDef = createMockClassDefinition();
      const result = validateClassDefinition(classDef);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('fails validation when required fields are missing', () => {
      const classDef = createMockClassDefinition({
        element: '',
        level: '',
        className: ''
      });
      
      const result = validateClassDefinition(classDef);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Element is required');
      expect(result.errors).toContain('Level is required');
      expect(result.errors).toContain('Class name is required');
    });

    test('warns when class has no fields', () => {
      const classDef = createMockClassDefinition({
        fieldOverrides: {}
      });
      
      const result = validateClassDefinition(classDef);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Class has no field overrides');
    });
  });

  describe('validateField', () => {
    test('validates a complete valid field', () => {
      const field = createMockField();
      const result = validateField(field);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('fails validation when required properties are missing', () => {
      const field = createMockField({
        fieldName: '',
        fieldSource: undefined as unknown as FieldSource,
        dataType: undefined as unknown as FieldDataType,
        displayName: ''
      });
      
      const result = validateField(field);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Field name is required');
      expect(result.errors).toContain('Field source is required');
      expect(result.errors).toContain('Data type is required');
      expect(result.errors).toContain('Display name is required');
    });

    test('fails validation when rule-based field has no rule value', () => {
      const field = createMockField({
        fieldSource: 'rule-based',
        ruleValue: undefined
      });
      
      const result = validateField(field);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Rule-based fields must have a rule value');
    });

    test('warns about judge-set fields without ranges', () => {
      const field = createMockField({
        fieldSource: 'judge-set',
        allowedRange: undefined
      });
      
      const result = validateField(field);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Judge-set fields should have allowed range or options');
    });

    test('validates data type consistency for number fields', () => {
      const field = createMockField({
        dataType: 'number',
        defaultValue: 'not a number'
      });
      
      const result = validateField(field);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Default value must be a number for numeric fields');
    });

    test('validates data type consistency for boolean fields', () => {
      const field = createMockField({
        dataType: 'boolean',
        defaultValue: 'not a boolean'
      });
      
      const result = validateField(field);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Default value must be a boolean for boolean fields');
    });
  });

  describe('shouldShowField', () => {
    test('shows field when no conditions exist', () => {
      const field = createMockField();
      const result = shouldShowField(field, {});
      
      expect(result).toBe(true);
    });

    test('shows field when equals condition is met', () => {
      const field = createMockField({
        showWhen: {
          dependsOn: 'element',
          condition: 'equals',
          value: 'Interior'
        }
      });
      
      const result = shouldShowField(field, { element: 'Interior' });
      
      expect(result).toBe(true);
    });

    test('hides field when equals condition is not met', () => {
      const field = createMockField({
        showWhen: {
          dependsOn: 'element',
          condition: 'equals',
          value: 'Interior'
        }
      });
      
      const result = shouldShowField(field, { element: 'Container' });
      
      expect(result).toBe(false);
    });

    test('handles notEquals condition', () => {
      const field = createMockField({
        showWhen: {
          dependsOn: 'level',
          condition: 'notEquals',
          value: 'Novice'
        }
      });
      
      expect(shouldShowField(field, { level: 'Advanced' })).toBe(true);
      expect(shouldShowField(field, { level: 'Novice' })).toBe(false);
    });

    test('handles greaterThan condition', () => {
      const field = createMockField({
        showWhen: {
          dependsOn: 'searchAreas',
          condition: 'greaterThan',
          value: 1
        }
      });
      
      expect(shouldShowField(field, { searchAreas: 2 })).toBe(true);
      expect(shouldShowField(field, { searchAreas: 1 })).toBe(false);
    });

    test('handles multiple conditions (AND logic)', () => {
      const field = createMockField({
        showWhen: [
          { dependsOn: 'element', condition: 'equals', value: 'Interior' },
          { dependsOn: 'level', condition: 'notEquals', value: 'Novice' }
        ]
      });
      
      expect(shouldShowField(field, { element: 'Interior', level: 'Advanced' })).toBe(true);
      expect(shouldShowField(field, { element: 'Interior', level: 'Novice' })).toBe(false);
      expect(shouldShowField(field, { element: 'Container', level: 'Advanced' })).toBe(false);
    });
  });

  describe('generateClassName', () => {
    test('generates basic class name from pattern', () => {
      const classDef = createMockClassDefinition({
        element: 'Container',
        level: 'Novice',
        section: 'A',
        className: '{element} {level} {section}'
      });
      
      const result = generateClassName(classDef);
      
      expect(result).toBe('Container Novice A');
    });

    test('handles missing properties in pattern', () => {
      const classDef = createMockClassDefinition({
        element: 'Container',
        level: 'Novice',
        section: undefined,
        className: '{element} {level} {section}'
      });
      
      const result = generateClassName(classDef);
      
      expect(result).toBe('Container Novice');
    });

    test('replaces context values in pattern', () => {
      const classDef = createMockClassDefinition({
        element: 'Container',
        level: 'Novice',
        className: '{element} {level} - {customField}'
      });
      
      const result = generateClassName(classDef, { customField: 'Special' });
      
      expect(result).toBe('Container Novice - Special');
    });

    test('cleans up extra whitespace', () => {
      const classDef = createMockClassDefinition({
        element: 'Container',
        level: 'Novice',
        section: '',
        className: '{element}   {level}  {section}   Extra'
      });
      
      const result = generateClassName(classDef);
      
      expect(result).toBe('Container Novice Extra');
    });
  });

  describe('validateFieldOverrides', () => {
    test('allows valid overrides for editable fields', () => {
      const field = createMockField({
        fieldName: 'maxEntries',
        dataType: 'number',
        editable: true
      });
      
      const result = validateFieldOverrides(field, 25);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('prevents overrides for non-editable fields', () => {
      const field = createMockField({
        editable: false
      });
      
      const result = validateFieldOverrides(field, 'any value');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Field is not editable');
    });

    test('validates data type for number fields', () => {
      const field = createMockField({
        dataType: 'number',
        editable: true
      });
      
      const result = validateFieldOverrides(field, 'not a number');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Value must be a number');
    });

    test('validates range constraints for judge-set fields', () => {
      const field = createMockField({
        fieldSource: 'judge-set',
        dataType: 'number',
        editable: true,
        allowedRange: { min: 1, max: 5 }
      });
      
      // Valid range
      expect(validateFieldOverrides(field, 3).isValid).toBe(true);
      
      // Below minimum
      const belowMin = validateFieldOverrides(field, 0);
      expect(belowMin.isValid).toBe(false);
      expect(belowMin.errors).toContain('Value must be at least 1');
      
      // Above maximum
      const aboveMax = validateFieldOverrides(field, 10);
      expect(aboveMax.isValid).toBe(false);
      expect(aboveMax.errors).toContain('Value must be at most 5');
    });

    test('validates option constraints for select fields', () => {
      const field = createMockField({
        fieldSource: 'judge-set',
        dataType: 'select',
        editable: true,
        options: ['Option A', 'Option B', 'Option C']
      });
      
      // Valid option
      expect(validateFieldOverrides(field, 'Option A').isValid).toBe(true);
      
      // Invalid option
      const invalid = validateFieldOverrides(field, 'Option D');
      expect(invalid.isValid).toBe(false);
      expect(invalid.errors).toContain('Value must be one of: Option A, Option B, Option C');
    });

    test('validates required field constraints', () => {
      const field = createMockField({
        required: true,
        editable: true
      });
      
      // Valid value
      expect(validateFieldOverrides(field, 'some value').isValid).toBe(true);
      
      // Missing values
      expect(validateFieldOverrides(field, undefined).isValid).toBe(false);
      expect(validateFieldOverrides(field, null).isValid).toBe(false);
      expect(validateFieldOverrides(field, '').isValid).toBe(false);
    });
  });
});