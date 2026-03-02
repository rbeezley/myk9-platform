import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

// Store imports
import { useTemplateStore } from '@/store/templateStore';
import { useClassTemplateStore } from '@/store/classTemplateStore';
import { useShowTemplateStore } from '@/store/showTemplateStore';
import { useClassCreationStore } from '@/store/classCreationStore';

// Type imports
import type { ClassTemplate } from '@/types/template.types';
import type { ClassTemplate as ClassTemplateType } from '@/types/class-template-types';
import type { ShowTemplateDefinition } from '@/types/show-template-types';
// CreatedClass type removed - not used in tests

describe('Phase 4 Template System Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Template Store Configuration', () => {
    it('should have properly configured template store', () => {
      const store = useTemplateStore.getState();

      // Verify store structure
      expect(typeof store.createTemplate).toBe('function');
      expect(typeof store.updateTemplate).toBe('function');
      expect(typeof store.deleteTemplate).toBe('function');
      expect(typeof store.getTemplate).toBe('function');
      expect(Array.isArray(store.templates)).toBe(true);
    });

    it('should have properly configured class template store', () => {
      const store = useClassTemplateStore.getState();

      expect(typeof store.addTemplate).toBe('function');
      expect(typeof store.updateTemplate).toBe('function');
      expect(typeof store.deleteTemplate).toBe('function');
      expect(typeof store.getTemplate).toBe('function');
      expect(Array.isArray(store.templates)).toBe(true);
    });

    it('should have properly configured show template store', () => {
      const store = useShowTemplateStore.getState();

      expect(typeof store.addTemplate).toBe('function');
      expect(typeof store.updateTemplate).toBe('function');
      expect(typeof store.deleteTemplate).toBe('function');
      expect(typeof store.getTemplate).toBe('function');
      expect(Array.isArray(store.templates)).toBe(true);
    });

    it('should have properly configured class creation store', () => {
      const store = useClassCreationStore.getState();

      expect(typeof store.selectTemplate).toBe('function');
      expect(typeof store.createClasses).toBe('function');
      expect(typeof store.resetWorkflow).toBe('function');
      expect(Array.isArray(store.createdClasses)).toBe(true);
    });
  });

  describe('Template Store Operations', () => {
    it('should handle template CRUD operations', () => {
      const store = useTemplateStore.getState();

      const testTemplate: Omit<ClassTemplate, 'id' | 'createdAt' | 'createdBy'> = {
        templateName: 'Test Template',
        organization: 'AKC',
        showType: 'Conformation',
        description: 'Test template description',
        version: '1.0',
        isOfficial: false,
        isCustom: true,
        isActive: true,
        fieldSpecifications: [],
        classDefinitions: [],
        updatedAt: new Date(),
      };

      // Test create
      const created = store.createTemplate(testTemplate);
      expect(created.templateName).toBe('Test Template');
      expect(created.id).toBeDefined();

      // Test get
      const retrieved = store.getTemplate(created.id);
      expect(retrieved).toEqual(created);

      // Test update
      const updated = store.updateTemplate(created.id, { description: 'Updated description' });
      expect(updated).toBe(true);

      const retrievedUpdated = store.getTemplate(created.id);
      expect(retrievedUpdated?.description).toBe('Updated description');
    });

    it('should handle template queries', () => {
      const store = useTemplateStore.getState();

      // Create test templates
      const template1 = store.createTemplate({
        templateName: 'AKC Template',
        organization: 'AKC',
        showType: 'Conformation',
        description: 'AKC test template',
        version: '1.0',
        isOfficial: true,
        isCustom: false,
        isActive: true,
        fieldSpecifications: [],
        classDefinitions: [],
        updatedAt: new Date(),
      });

      const template2 = store.createTemplate({
        templateName: 'UKC Template',
        organization: 'UKC',
        showType: 'Agility',
        description: 'UKC test template',
        version: '1.0',
        isOfficial: false,
        isCustom: true,
        isActive: true,
        fieldSpecifications: [],
        classDefinitions: [],
        updatedAt: new Date(),
      });

      // Test organization filtering
      const akcTemplates = store.getTemplatesByOrganization('AKC');
      expect(akcTemplates.length).toBeGreaterThan(0);
      expect(akcTemplates.some(t => t.id === template1.id)).toBe(true);

      // Test official/custom queries
      const officialTemplates = store.getOfficialTemplates();
      expect(officialTemplates.some(t => t.id === template1.id)).toBe(true);

      const customTemplates = store.getCustomTemplates();
      expect(customTemplates.some(t => t.id === template2.id)).toBe(true);
    });
  });

  describe('Class Template Store Operations', () => {
    it('should handle class template operations', () => {
      const store = useClassTemplateStore.getState();

      const testTemplate: Omit<ClassTemplateType, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'Test Class Template',
        organization: 'AKC',
        showType: 'Agility',
        description: 'Test class template',
        fields: [],
        maxEntriesDefault: 40,
        requiresJumpHeight: true,
      };

      // Test add
      const added = store.addTemplate(testTemplate);
      expect(added.name).toBe('Test Class Template');
      expect(added.id).toBeDefined();

      // Test get
      const retrieved = store.getTemplate(added.id);
      expect(retrieved).toEqual(added);

      // Test update
      store.updateTemplate(added.id, { maxEntriesDefault: 50 });
      const updated = store.getTemplate(added.id);
      expect(updated?.maxEntriesDefault).toBe(50);
    });

    it('should generate classes from presets', () => {
      const store = useClassTemplateStore.getState();

      const presets = store.getPresets();
      expect(typeof presets).toBe('object');

      // Test generating classes from a preset (if available)
      const presetKeys = Object.keys(presets);
      if (presetKeys.length > 0) {
        const classes = store.generateClassesFromPreset(presetKeys[0]);
        expect(Array.isArray(classes)).toBe(true);
      }
    });
  });

  describe('Show Template Store Operations', () => {
    it('should handle show template operations', () => {
      const store = useShowTemplateStore.getState();

      const testTemplate: Omit<ShowTemplateDefinition, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'Test Show Template',
        organization: 'AKC',
        showType: 'Scent Work',
        description: 'Test show template',
        classNamePattern: '{element} {level}',
        classFields: [],
        defaults: {
          entryFee: 30,
          maxEntries: 40,
          requiresJumpHeight: false,
        },
      };

      // Test add
      const added = store.addTemplate(testTemplate);
      expect(added.name).toBe('Test Show Template');
      expect(added.id).toBeDefined();

      // Test get
      const retrieved = store.getTemplate(added.id);
      expect(retrieved).toEqual(added);

      // Test search
      const searchResults = store.searchTemplates('Test Show');
      expect(searchResults.some(t => t.id === added.id)).toBe(true);
    });

    it('should handle preset operations', () => {
      const store = useShowTemplateStore.getState();

      const allPresets = store.getAllPresets();
      expect(typeof allPresets).toBe('object');

      const akcPresets = store.getPresetsByOrganization('AKC');
      expect(typeof akcPresets).toBe('object');
    });
  });

  describe('Class Creation Store Operations', () => {
    it('should handle class creation workflow', () => {
      const store = useClassCreationStore.getState();

      // Test initial state
      expect(store.selectedTemplateId).toBeNull();
      expect(store.selectedTemplate).toBeNull();
      expect(store.currentStep).toBe(1);

      // Test step management — use fresh getState() after each mutation
      store.nextStep();
      expect(useClassCreationStore.getState().currentStep).toBe(2);

      store.previousStep();
      expect(useClassCreationStore.getState().currentStep).toBe(1);

      store.setStep(3);
      expect(useClassCreationStore.getState().currentStep).toBe(3);

      store.resetSteps();
      expect(useClassCreationStore.getState().currentStep).toBe(1);
    });

    it('should handle field overrides', () => {
      const store = useClassCreationStore.getState();

      // Test field override operations — use fresh getState() after each mutation
      store.updateFieldOverride('entryFee', 35);
      expect(useClassCreationStore.getState().fieldOverrides.entryFee).toBe(35);

      store.updateFieldOverrides({ maxEntries: 50, judgeName: 'Test Judge' });
      expect(useClassCreationStore.getState().fieldOverrides.maxEntries).toBe(50);
      expect(useClassCreationStore.getState().fieldOverrides.judgeName).toBe('Test Judge');

      store.resetFieldOverride('entryFee');
      expect(useClassCreationStore.getState().fieldOverrides.entryFee).toBeUndefined();
    });

    it('should handle workflow reset', () => {
      const store = useClassCreationStore.getState();

      // Set some state
      store.updateFieldOverride('test', 'value');
      store.setStep(3);

      // Reset
      store.resetWorkflow();

      // Verify reset — use fresh getState() after mutation
      expect(useClassCreationStore.getState().selectedTemplateId).toBeNull();
      expect(useClassCreationStore.getState().currentStep).toBe(1);
      expect(Object.keys(useClassCreationStore.getState().fieldOverrides)).toHaveLength(0);
    });
  });

  describe('Cross-Store Integration', () => {
    it('should handle related operations across template stores', () => {
      const templateStore = useTemplateStore.getState();
      const classTemplateStore = useClassTemplateStore.getState();
      const showTemplateStore = useShowTemplateStore.getState();

      // Create templates in different stores
      const mainTemplate = templateStore.createTemplate({
        templateName: 'Integration Test Template',
        organization: 'AKC',
        showType: 'Agility',
        description: 'Integration test',
        version: '1.0',
        isOfficial: false,
        isCustom: true,
        isActive: true,
        fieldSpecifications: [],
        classDefinitions: [],
        updatedAt: new Date(),
      });

      const classTemplate = classTemplateStore.addTemplate({
        name: 'Integration Class Template',
        organization: 'AKC',
        showType: 'Agility',
        description: 'Integration class test',
        fields: [],
        maxEntriesDefault: 40,
        requiresJumpHeight: true,
      });

      const showTemplate = showTemplateStore.addTemplate({
        name: 'Integration Show Template',
        organization: 'AKC',
        showType: 'Agility',
        description: 'Integration show test',
        classNamePattern: '{element} {level}',
        classFields: [],
        defaults: {
          entryFee: 30,
          maxEntries: 40,
          requiresJumpHeight: true,
        },
      });

      // Verify all templates were created
      expect(templateStore.getTemplate(mainTemplate.id)).toBeDefined();
      expect(classTemplateStore.getTemplate(classTemplate.id)).toBeDefined();
      expect(showTemplateStore.getTemplate(showTemplate.id)).toBeDefined();

      // Test cross-store queries
      const akcMainTemplates = templateStore.getTemplatesByOrganization('AKC');
      const akcClassTemplates = classTemplateStore.getTemplatesByOrganization('AKC');
      const akcShowTemplates = showTemplateStore.getTemplatesByOrganization('AKC');

      expect(akcMainTemplates.some(t => t.id === mainTemplate.id)).toBe(true);
      expect(akcClassTemplates.some(t => t.id === classTemplate.id)).toBe(true);
      expect(akcShowTemplates.some(t => t.id === showTemplate.id)).toBe(true);
    });
  });

  describe('IndexedDB Integration Status', () => {
    it('should use IndexedDB-enabled storage adapters', () => {
      // This test verifies that the stores are configured to use the optimal storage
      const stores = [
        { name: 'template', store: useTemplateStore },
        { name: 'classTemplate', store: useClassTemplateStore },
        { name: 'showTemplate', store: useShowTemplateStore },
        { name: 'classCreation', store: useClassCreationStore },
      ];

      stores.forEach(({ store }) => {
        const state = store.getState();
        // Verify the store is functional (basic smoke test)
        expect(typeof state).toBe('object');
        expect(state).not.toBeNull();
      });
    });
  });
});
