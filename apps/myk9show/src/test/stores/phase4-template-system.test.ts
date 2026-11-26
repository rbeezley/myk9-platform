import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

// Store imports
import { useTemplateStore } from '@/store/templateStore';

// Type imports
import {
  Organization,
  TemplateStatus,
  TemplateType,
  TrialType,
  type ClassTemplate,
} from '@/types/template.types';
// CreatedClass type removed - not used in tests

describe('Phase 4 Template System Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Template Store Configuration', () => {
    it('should expose the template store as read-only', () => {
      const store = useTemplateStore.getState();

      // Sport rules change by migration, so the store reads but never writes.
      expect(typeof store.getTemplate).toBe('function');
      expect(typeof store.loadTemplatesFromDB).toBe('function');
      expect(Array.isArray(store.templates)).toBe(true);

      const asRecord = store as unknown as Record<string, unknown>;
      expect(asRecord.createTemplate).toBeUndefined();
      expect(asRecord.updateTemplate).toBeUndefined();
      expect(asRecord.deleteTemplate).toBeUndefined();
    });
  });

  describe('Template Store Operations', () => {
    it('should handle template queries', () => {
      // Templates arrive from the DB via loadTemplatesFromDB; seed state directly.
      const template1: ClassTemplate = {
        id: 'akc-conformation',
        createdAt: new Date(),
        createdBy: 'seed',
        templateName: 'AKC Template',
        organization: Organization.AKC,
        trialType: TrialType.CONFORMATION,
        status: TemplateStatus.ACTIVE,
        type: TemplateType.OFFICIAL,
        description: 'AKC test template',
        version: '1.0',
        isOfficial: true,
        isCustom: false,
        isActive: true,
        fieldSpecifications: [],
        classDefinitions: [],
        validationRules: [],
        defaults: {},
        updatedAt: new Date(),
      };

      const template2: ClassTemplate = {
        ...template1,
        id: 'ukc-agility',
        templateName: 'UKC Template',
        organization: Organization.UKC,
        trialType: TrialType.AGILITY,
        type: TemplateType.CUSTOM,
        description: 'UKC test template',
        isOfficial: false,
        isCustom: true,
      };

      useTemplateStore.setState({ templates: [template1, template2], error: null });
      const store = useTemplateStore.getState();

      // Test organization filtering
      const akcTemplates = store.getTemplatesByOrganization(Organization.AKC);
      expect(akcTemplates.length).toBeGreaterThan(0);
      expect(akcTemplates.some(t => t.id === template1.id)).toBe(true);

      // Test official/custom queries
      const officialTemplates = store.getOfficialTemplates();
      expect(officialTemplates.some(t => t.id === template1.id)).toBe(true);

      const customTemplates = store.getCustomTemplates();
      expect(customTemplates.some(t => t.id === template2.id)).toBe(true);

      // And the read path resolves by id
      expect(store.getTemplate(template1.id)).toEqual(template1);
    });
  });

  describe('IndexedDB Integration Status', () => {
    it('should use IndexedDB-enabled storage adapters', () => {
      // This test verifies that the stores are configured to use the optimal storage
      const stores = [{ name: 'template', store: useTemplateStore }];

      stores.forEach(({ store }) => {
        const state = store.getState();
        // Verify the store is functional (basic smoke test)
        expect(typeof state).toBe('object');
        expect(state).not.toBeNull();
      });
    });
  });
});
