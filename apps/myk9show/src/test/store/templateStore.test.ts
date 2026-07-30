import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useTemplateStore } from '@/store/templateStore';
import {
  createMockTemplate,
  createMockTemplates,
  createAKCScentWorkTemplate,
} from '@/test/utils/mockData';
import { Organization, TrialType } from '@/types/template.types';

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

describe('Template Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useTemplateStore.setState({
      templates: [],
      activeTemplate: null,
      searchQuery: '',
      filterOrganization: null,
      filterTrialType: null,
    });

    // Clear localStorage mocks
    vi.clearAllMocks();
  });

  describe('Read-only contract', () => {
    // Sport rules are reference data changed by migration. The store must expose no
    // way to mutate them from the client — see docs/plan-template-authoring-removal.md.
    test('exposes no mutation actions', () => {
      const store = useTemplateStore.getState() as unknown as Record<string, unknown>;

      for (const action of [
        'createTemplate',
        'updateTemplate',
        'deleteTemplate',
        'duplicateTemplate',
        'createEditableCopy',
        'promoteToOfficial',
        'deprecateTemplate',
        'createNewVersion',
        'importTemplate',
        'exportTemplate',
        'clearCorruptedData',
      ]) {
        expect(store[action], `${action} must not exist on the read-only store`).toBeUndefined();
      }
    });

    test('loadTemplatesFromDB is the only load entry point', () => {
      const store = useTemplateStore.getState();
      expect(typeof store.loadTemplatesFromDB).toBe('function');
      expect(typeof store.ensureTemplatesLoaded).toBe('function');
      expect(typeof store.refreshTemplatesFromDB).toBe('function');
    });
  });

  describe('Active Template', () => {
    test('sets active template', () => {
      const template = createMockTemplate();
      useTemplateStore.setState({ templates: [template] });

      useTemplateStore.getState().setActiveTemplate(template.id);

      expect(useTemplateStore.getState().activeTemplate?.id).toBe(template.id);
    });

    test('clears active template', () => {
      const template = createMockTemplate();
      useTemplateStore.setState({ templates: [template] });

      const store = useTemplateStore.getState();
      store.setActiveTemplate(template.id);
      expect(useTemplateStore.getState().activeTemplate).toBeTruthy();

      store.clearActiveTemplate();
      expect(useTemplateStore.getState().activeTemplate).toBeNull();
    });
  });

  describe('Template Queries', () => {
    beforeEach(() => {
      const templates = [
        createMockTemplate({
          id: 'akc-1',
          organization: Organization.AKC,
          trialType: TrialType.SCENT_WORK,
          templateName: 'AKC Scent Work',
        }),
        createMockTemplate({
          id: 'akc-2',
          organization: Organization.AKC,
          trialType: TrialType.AGILITY,
          templateName: 'AKC Agility',
        }),
        createMockTemplate({
          id: 'ukc-1',
          organization: Organization.UKC,
          trialType: TrialType.SCENT_WORK,
          templateName: 'UKC Scent Work',
        }),
      ];

      useTemplateStore.setState({ templates, error: null });
    });

    test('gets templates by organization', () => {
      const store = useTemplateStore.getState();
      const akcTemplates = store.getTemplatesByOrganization(Organization.AKC);

      expect(akcTemplates).toHaveLength(2);
      expect(akcTemplates.every(t => t.organization === Organization.AKC)).toBe(true);
    });

    test('gets templates by show type', () => {
      const store = useTemplateStore.getState();
      const scentWorkTemplates = store.getTemplatesByTrialType(TrialType.SCENT_WORK);

      expect(scentWorkTemplates).toHaveLength(2);
      expect(scentWorkTemplates.every(t => t.trialType === TrialType.SCENT_WORK)).toBe(true);
    });

    test('gets templates by organization and show type', () => {
      const store = useTemplateStore.getState();
      const filtered = store.getTemplatesByOrgAndType(Organization.AKC, TrialType.SCENT_WORK);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].organization).toBe(Organization.AKC);
      expect(filtered[0].trialType).toBe(TrialType.SCENT_WORK);
    });

    test('searches templates by name', () => {
      const store = useTemplateStore.getState();
      store.setSearchQuery('Agility');

      const filtered = store.getFilteredTemplates();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].templateName).toContain('Agility');
    });

    test('filters by organization', () => {
      const store = useTemplateStore.getState();
      store.setFilterOrganization(Organization.UKC);

      const filtered = store.getFilteredTemplates();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].organization).toBe(Organization.UKC);
    });

    test('combines search and filters', () => {
      const store = useTemplateStore.getState();
      store.setSearchQuery('Scent');
      store.setFilterOrganization(Organization.AKC);

      const filtered = store.getFilteredTemplates();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].organization).toBe(Organization.AKC);
      expect(filtered[0].templateName).toContain('Scent');
    });

    test('clears search and filters', () => {
      const store = useTemplateStore.getState();
      store.setSearchQuery('test');
      store.setFilterOrganization(Organization.AKC);

      store.clearFilters();

      const state = useTemplateStore.getState();
      expect(state.searchQuery).toBe('');
      expect(state.filterOrganization).toBeNull();
      expect(state.filterTrialType).toBeNull();
    });
  });

  describe('Seeded template shape', () => {
    test('holds distinct entries that share a name across registries', () => {
      // The AKC and UKC seeds both carry a "Scent Work" sport; the store must keep
      // them as separate rows rather than collapsing them by name.
      const templates = [
        createMockTemplate({
          id: 'akc-same-name',
          templateName: 'Same Name',
          organization: Organization.AKC,
          trialType: TrialType.SCENT_WORK,
        }),
        createMockTemplate({
          id: 'ukc-same-name',
          templateName: 'Same Name',
          organization: Organization.UKC,
          trialType: TrialType.SCENT_WORK,
        }),
      ];

      useTemplateStore.setState({ templates, error: null });

      const store = useTemplateStore.getState();
      expect(store.templates).toHaveLength(2);
      expect(store.getTemplatesByOrganization(Organization.AKC)).toHaveLength(1);
      expect(store.getTemplatesByOrganization(Organization.UKC)).toHaveLength(1);
    });

    test('carries the seeded AKC Scent Work class definitions', () => {
      const akcTemplate = createAKCScentWorkTemplate();
      useTemplateStore.setState({ templates: [akcTemplate], error: null });

      const loaded = useTemplateStore.getState().getTemplate(akcTemplate.id);

      expect(loaded?.organization).toBe(Organization.AKC);
      expect(loaded?.trialType).toBe(TrialType.SCENT_WORK);
      expect(loaded?.classDefinitions.length).toBeGreaterThan(0);
    });
  });

  describe('Performance with Large Templates', () => {
    test('searches large template sets efficiently', () => {
      useTemplateStore.setState({ templates: createMockTemplates(100), error: null });
      const store = useTemplateStore.getState();

      const startTime = performance.now();
      store.setSearchQuery('Template 5');
      const filtered = store.getFilteredTemplates();
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
      expect(filtered.length).toBeGreaterThan(0);
    });
  });
});
