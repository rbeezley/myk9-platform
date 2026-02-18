import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useClassCreationStore } from '@/store/classCreationStore';
import { useTemplateStore } from '@/store/templateStore';
import { createMockTemplate, createAKCScentWorkTemplate } from '@/test/utils/mockData';

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

describe('Class Creation Store', () => {
  beforeEach(() => {
    // Reset both stores before each test
    useClassCreationStore.setState({
      selectedTemplate: null,
      selectedClasses: [],
      fieldOverrides: {},
      createdClasses: [],
      currentStep: 1,
      trialId: null,
    });

    useTemplateStore.setState({
      templates: [],
      activeTemplate: null,
      searchQuery: '',
      filterOrganization: null,
      filterShowType: null,
    });

    vi.clearAllMocks();
  });

  // Use setTemplateData() to bypass the require('./templateStore') circular dependency
  describe('Template Selection', () => {
    test('selects a template by providing data directly', () => {
      const template = createMockTemplate();
      const creationStore = useClassCreationStore.getState();

      creationStore.setTemplateData(template);

      const state = useClassCreationStore.getState();
      expect(state.selectedTemplate?.id).toBe(template.id);
    });

    test('clears template selection', () => {
      const template = createMockTemplate();
      const creationStore = useClassCreationStore.getState();

      creationStore.setTemplateData(template);
      expect(useClassCreationStore.getState().selectedTemplate).toBeTruthy();

      creationStore.clearTemplateSelection();
      expect(useClassCreationStore.getState().selectedTemplate).toBeNull();
    });
  });

  describe('Class Selection', () => {
    beforeEach(() => {
      const template = createAKCScentWorkTemplate();
      const creationStore = useClassCreationStore.getState();
      creationStore.setTemplateData(template);
    });

    test('toggles class selection', () => {
      const creationStore = useClassCreationStore.getState();
      const classToSelect = creationStore.selectedTemplate!.classDefinitions[0];

      // Select class
      creationStore.toggleClass(classToSelect);
      const selectedState = useClassCreationStore.getState();
      const selectedItem = selectedState.selectedClasses.find(
        item => item.classDefinition.className === classToSelect.className
      );
      expect(selectedItem?.selected).toBe(true);

      // Deselect class
      creationStore.toggleClass(classToSelect);
      const deselectedState = useClassCreationStore.getState();
      const deselectedItem = deselectedState.selectedClasses.find(
        item => item.classDefinition.className === classToSelect.className
      );
      expect(deselectedItem?.selected).toBe(false);
    });

    test('selects all classes', () => {
      const creationStore = useClassCreationStore.getState();

      creationStore.selectAllClasses();

      const state = useClassCreationStore.getState();
      const allSelected = state.selectedClasses.every(item => item.selected);
      expect(allSelected).toBe(true);
    });

    test('deselects all classes', () => {
      const creationStore = useClassCreationStore.getState();

      // First select some classes
      creationStore.selectAllClasses();
      const afterSelect = useClassCreationStore.getState();
      expect(afterSelect.selectedClasses.some(item => item.selected)).toBe(true);

      // Then deselect all
      creationStore.deselectAllClasses();
      const afterDeselect = useClassCreationStore.getState();
      const allDeselected = afterDeselect.selectedClasses.every(item => !item.selected);
      expect(allDeselected).toBe(true);
    });

    test('gets available elements from template', () => {
      const creationStore = useClassCreationStore.getState();

      const elements = creationStore.getAvailableElements();

      expect(elements).toContain('Container');
      expect(elements).toContain('Buried');
      expect(elements).toContain('Interior');
      expect(Array.from(new Set(elements))).toEqual(elements); // No duplicates
    });

    test('gets available levels from template', () => {
      const creationStore = useClassCreationStore.getState();

      const levels = creationStore.getAvailableLevels();

      expect(levels).toContain('Novice');
      expect(levels).toContain('Advanced');
      expect(Array.from(new Set(levels))).toEqual(levels); // No duplicates
    });
  });

  describe('Field Overrides', () => {
    beforeEach(() => {
      const template = createMockTemplate();
      const creationStore = useClassCreationStore.getState();
      creationStore.setTemplateData(template);
    });

    test('updates field override', () => {
      const creationStore = useClassCreationStore.getState();

      creationStore.updateFieldOverride('maxEntries', 35);

      const state = useClassCreationStore.getState();
      expect(state.fieldOverrides.maxEntries).toBe(35);
    });

    test('removes field override when value is null', () => {
      const creationStore = useClassCreationStore.getState();

      creationStore.updateFieldOverride('maxEntries', 35);
      expect(useClassCreationStore.getState().fieldOverrides.maxEntries).toBe(35);

      creationStore.updateFieldOverride('maxEntries', null);
      expect(useClassCreationStore.getState().fieldOverrides.maxEntries).toBe(null);
    });

    test('updates multiple field overrides', () => {
      const creationStore = useClassCreationStore.getState();

      creationStore.updateFieldOverrides({
        maxEntries: 40,
        preEntryFee: 30,
        estimatedJudgingTime: 50,
      });

      const state = useClassCreationStore.getState();
      expect(state.fieldOverrides.maxEntries).toBe(40);
      expect(state.fieldOverrides.preEntryFee).toBe(30);
      expect(state.fieldOverrides.estimatedJudgingTime).toBe(50);
    });

    test('resets specific field override', () => {
      const creationStore = useClassCreationStore.getState();

      creationStore.updateFieldOverrides({
        maxEntries: 40,
        preEntryFee: 30,
      });

      creationStore.resetFieldOverride('maxEntries');

      const state = useClassCreationStore.getState();
      expect(state.fieldOverrides.maxEntries).toBeUndefined();
      expect(state.fieldOverrides.preEntryFee).toBe(30);
    });
  });

  describe('Class Creation Workflow', () => {
    beforeEach(() => {
      const template = createAKCScentWorkTemplate();
      const creationStore = useClassCreationStore.getState();
      creationStore.setTemplateData(template);

      // Select some classes manually
      const state = useClassCreationStore.getState();
      const containerClasses = state.selectedTemplate!.classDefinitions.filter(
        c => c.element === 'Container'
      );
      containerClasses.forEach(classDef => {
        creationStore.toggleClass(classDef);
      });
    });

    test('validates selection before creation', () => {
      const creationStore = useClassCreationStore.getState();

      const validation = creationStore.validateSelection();

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('fails validation when no template selected', () => {
      const creationStore = useClassCreationStore.getState();

      creationStore.clearTemplateSelection();
      const validation = creationStore.validateSelection();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('No template selected');
    });

    test('fails validation when no classes selected', () => {
      const creationStore = useClassCreationStore.getState();

      creationStore.deselectAllClasses();
      const validation = creationStore.validateSelection();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('No classes selected');
    });

    test('creates classes from selection', () => {
      const creationStore = useClassCreationStore.getState();

      const result = creationStore.createClasses('trial-123', 'test-user');

      expect(result.success).toBe(true);
      expect(result.classes.length).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);

      // Check created classes are stored
      const state = useClassCreationStore.getState();
      expect(state.createdClasses).toHaveLength(result.classes.length);
    });

    test('applies field overrides during creation', () => {
      // Re-set up state since createClasses resets selection
      const template = createAKCScentWorkTemplate();
      useClassCreationStore.getState().setTemplateData(template);
      const freshStore = useClassCreationStore.getState();
      const containerClasses = freshStore.selectedTemplate!.classDefinitions.filter(
        c => c.element === 'Container'
      );
      containerClasses.forEach(classDef => {
        freshStore.toggleClass(classDef);
      });

      freshStore.updateFieldOverrides({
        maxEntries: 45,
        preEntryFee: 28,
      });

      const result = freshStore.createClasses('trial-123', 'test-user');

      expect(result.success).toBe(true);
      result.classes.forEach(cls => {
        expect(cls.entries.maxEntries).toBe(45);
        expect(cls.fieldValues.preEntryFee).toBe(28);
      });
    });

    test('assigns sequential run orders', () => {
      // Re-set up state since createClasses resets selection
      const template = createAKCScentWorkTemplate();
      useClassCreationStore.getState().setTemplateData(template);
      const freshStore = useClassCreationStore.getState();
      const containerClasses = freshStore.selectedTemplate!.classDefinitions.filter(
        c => c.element === 'Container'
      );
      containerClasses.forEach(classDef => {
        freshStore.toggleClass(classDef);
      });

      const result = freshStore.createClasses('trial-123', 'test-user');

      expect(result.success).toBe(true);
      const runOrders = result.classes.map(c => c.runOrder);
      const sortedOrders = [...runOrders].sort((a, b) => a - b);
      expect(runOrders).toEqual(sortedOrders); // Should be in order

      // Should be sequential starting from 1
      for (let i = 0; i < runOrders.length; i++) {
        expect(runOrders[i]).toBe(i + 1);
      }
    });
  });

  describe('Step Management', () => {
    test('advances to next step', () => {
      const creationStore = useClassCreationStore.getState();

      creationStore.nextStep();

      expect(useClassCreationStore.getState().currentStep).toBe(2);
    });

    test('goes back to previous step', () => {
      const creationStore = useClassCreationStore.getState();

      creationStore.nextStep();
      creationStore.nextStep();
      expect(useClassCreationStore.getState().currentStep).toBe(3);

      creationStore.previousStep();
      expect(useClassCreationStore.getState().currentStep).toBe(2);
    });

    test('sets specific step', () => {
      const creationStore = useClassCreationStore.getState();

      creationStore.setStep(4);

      expect(useClassCreationStore.getState().currentStep).toBe(4);
    });

    test('resets to first step', () => {
      const creationStore = useClassCreationStore.getState();

      creationStore.setStep(3);
      expect(useClassCreationStore.getState().currentStep).toBe(3);

      creationStore.resetSteps();
      expect(useClassCreationStore.getState().currentStep).toBe(1);
    });

    test('prevents going below step 1', () => {
      const creationStore = useClassCreationStore.getState();

      creationStore.previousStep();

      expect(useClassCreationStore.getState().currentStep).toBe(1);
    });

    test('prevents going above step 4', () => {
      const creationStore = useClassCreationStore.getState();

      creationStore.setStep(4);
      creationStore.nextStep();

      expect(useClassCreationStore.getState().currentStep).toBe(4);
    });
  });

  describe('Workflow Reset', () => {
    test('resets entire workflow', () => {
      const template = createMockTemplate();
      const creationStore = useClassCreationStore.getState();

      // Set up some state
      creationStore.setTemplateData(template);
      creationStore.toggleClass(template.classDefinitions[0]);
      creationStore.updateFieldOverride('maxEntries', 25);
      creationStore.setStep(3);

      // Reset
      creationStore.resetWorkflow();

      const state = useClassCreationStore.getState();
      expect(state.selectedTemplate).toBeNull();
      expect(state.selectedClasses).toHaveLength(0);
      expect(state.fieldOverrides).toEqual({});
      expect(state.currentStep).toBe(1);
      expect(state.trialId).toBeNull();
    });
  });

  describe('Created Classes Management', () => {
    test('gets classes by trial ID', () => {
      const template = createMockTemplate();
      useClassCreationStore.getState().setTemplateData(template);
      const creationStore = useClassCreationStore.getState();
      creationStore.selectAllClasses();

      // Create classes for trial-123
      creationStore.createClasses('trial-123', 'test-user');

      const trialClasses = useClassCreationStore.getState().getClassesByTrial('trial-123');
      expect(trialClasses.length).toBeGreaterThan(0);
      expect(trialClasses.every(c => c.trialId === 'trial-123')).toBe(true);
    });

    test('updates class run order', () => {
      const template = createMockTemplate();
      useClassCreationStore.getState().setTemplateData(template);
      const creationStore = useClassCreationStore.getState();
      creationStore.selectAllClasses();

      const result = creationStore.createClasses('trial-123', 'test-user');
      const classId = result.classes[0].id;

      useClassCreationStore.getState().updateClassRunOrder(classId, 10);

      const updatedClass = useClassCreationStore
        .getState()
        .getClassesByTrial('trial-123')
        .find(c => c.id === classId);
      expect(updatedClass?.runOrder).toBe(10);
    });

    test('updates class time', () => {
      const template = createMockTemplate();
      useClassCreationStore.getState().setTemplateData(template);
      const creationStore = useClassCreationStore.getState();
      creationStore.selectAllClasses();

      const result = creationStore.createClasses('trial-123', 'test-user');
      const classId = result.classes[0].id;
      const newTime = new Date('2024-06-01T10:30:00');

      useClassCreationStore.getState().updateClassTime(classId, newTime);

      const updatedClass = useClassCreationStore
        .getState()
        .getClassesByTrial('trial-123')
        .find(c => c.id === classId);
      expect(updatedClass?.plannedStartTime).toEqual(newTime);
    });

    test('updates class judge', () => {
      const template = createMockTemplate();
      useClassCreationStore.getState().setTemplateData(template);
      const creationStore = useClassCreationStore.getState();
      creationStore.selectAllClasses();

      const result = creationStore.createClasses('trial-123', 'test-user');
      const classId = result.classes[0].id;

      useClassCreationStore.getState().updateClassJudge(classId, 'judge-456');

      const updatedClass = useClassCreationStore
        .getState()
        .getClassesByTrial('trial-123')
        .find(c => c.id === classId);
      expect(updatedClass?.personnel.judgeId).toBe('judge-456');
    });
  });
});
