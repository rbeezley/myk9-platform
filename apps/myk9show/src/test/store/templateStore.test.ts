import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useTemplateStore } from '@/store/templateStore';
import {
  createMockTemplate,
  createMockTemplates,
  createAKCScentWorkTemplate,
} from '@/test/utils/mockData';
import { Organization, ShowType } from '@/types/template.types';

const TEST_USER = 'test-user';

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
      filterShowType: null,
    });

    // Clear localStorage mocks
    vi.clearAllMocks();
  });

  describe('Template CRUD Operations', () => {
    test('creates a new template', () => {
      const store = useTemplateStore.getState();
      const template = createMockTemplate();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, createdBy, ...templateData } = template;

      const createdTemplate = store.createTemplate(templateData, TEST_USER);

      const state = useTemplateStore.getState();
      expect(state.templates).toHaveLength(1);
      expect(state.templates[0].templateName).toBe(template.templateName);
      expect(state.templates[0].organization).toBe(template.organization);
      expect(state.templates[0].id).toBe(createdTemplate.id);
    });

    test('updates an existing template', () => {
      const store = useTemplateStore.getState();
      const template = createMockTemplate({ templateName: 'Original Name' });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, createdBy, ...templateData } = template;

      const createdTemplate = store.createTemplate(templateData, TEST_USER);
      store.updateTemplate(createdTemplate.id, { templateName: 'Updated Name' }, TEST_USER);

      const state = useTemplateStore.getState();
      const updatedTemplate = state.templates.find(t => t.id === createdTemplate.id);
      expect(updatedTemplate?.templateName).toBe('Updated Name');
      expect(updatedTemplate?.updatedAt).toBeDefined();
    });

    test('deletes a template', () => {
      const store = useTemplateStore.getState();
      const template = createMockTemplate();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, createdBy, ...templateData } = template;

      const createdTemplate = store.createTemplate(templateData, TEST_USER);
      expect(useTemplateStore.getState().templates).toHaveLength(1);

      store.deleteTemplate(createdTemplate.id);
      expect(useTemplateStore.getState().templates).toHaveLength(0);
    });

    test('duplicates a template with new ID and version', () => {
      const store = useTemplateStore.getState();
      const original = createMockTemplate({
        templateName: 'Original Template',
        version: '1.0.0',
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, createdBy, ...templateData } = original;

      const createdOriginal = store.createTemplate(templateData, TEST_USER);
      const duplicated = store.duplicateTemplate(
        createdOriginal.id,
        'Duplicated Template',
        TEST_USER
      );

      // Ensure duplication was successful
      expect(duplicated).not.toBeNull();

      const state = useTemplateStore.getState();
      expect(state.templates).toHaveLength(2);

      // Find the duplicated template in the store
      const duplicate = duplicated ? state.templates.find(t => t.id === duplicated.id) : null;
      expect(duplicate?.templateName).toBe('Duplicated Template');
      expect(duplicate?.isOfficial).toBe(false);
      expect(duplicate?.isCustom).toBe(true);
      expect(duplicate?.id).not.toBe(createdOriginal.id); // IDs should be different
    });

    test('sets active template', () => {
      const store = useTemplateStore.getState();
      const template = createMockTemplate();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, createdBy, ...templateData } = template;

      const createdTemplate = store.createTemplate(templateData, TEST_USER);
      store.setActiveTemplate(createdTemplate.id);

      const state = useTemplateStore.getState();
      expect(state.activeTemplate?.id).toBe(createdTemplate.id);
    });

    test('clears active template', () => {
      const store = useTemplateStore.getState();
      const template = createMockTemplate();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, createdBy, ...templateData } = template;

      const createdTemplate = store.createTemplate(templateData, TEST_USER);
      store.setActiveTemplate(createdTemplate.id);
      expect(useTemplateStore.getState().activeTemplate).toBeTruthy();

      store.clearActiveTemplate();
      expect(useTemplateStore.getState().activeTemplate).toBeNull();
    });
  });

  describe('Template Queries', () => {
    beforeEach(() => {
      const store = useTemplateStore.getState();
      const templates = [
        createMockTemplate({
          id: 'akc-1',
          organization: Organization.AKC,
          showType: ShowType.SCENT_WORK,
          templateName: 'AKC Scent Work',
        }),
        createMockTemplate({
          id: 'akc-2',
          organization: Organization.AKC,
          showType: ShowType.AGILITY,
          templateName: 'AKC Agility',
        }),
        createMockTemplate({
          id: 'ukc-1',
          organization: Organization.UKC,
          showType: ShowType.SCENT_WORK,
          templateName: 'UKC Scent Work',
        }),
      ];

      templates.forEach(template => store.createTemplate(template, TEST_USER));
    });

    test('gets templates by organization', () => {
      const store = useTemplateStore.getState();
      const akcTemplates = store.getTemplatesByOrganization(Organization.AKC);

      expect(akcTemplates).toHaveLength(2);
      expect(akcTemplates.every(t => t.organization === Organization.AKC)).toBe(true);
    });

    test('gets templates by show type', () => {
      const store = useTemplateStore.getState();
      const scentWorkTemplates = store.getTemplatesByShowType(ShowType.SCENT_WORK);

      expect(scentWorkTemplates).toHaveLength(2);
      expect(scentWorkTemplates.every(t => t.showType === ShowType.SCENT_WORK)).toBe(true);
    });

    test('gets templates by organization and show type', () => {
      const store = useTemplateStore.getState();
      const filtered = store.getTemplatesByOrgAndType(Organization.AKC, ShowType.SCENT_WORK);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].organization).toBe(Organization.AKC);
      expect(filtered[0].showType).toBe(ShowType.SCENT_WORK);
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
      expect(state.filterShowType).toBeNull();
    });
  });

  describe('Template Import/Export', () => {
    test('imports template data', () => {
      const store = useTemplateStore.getState();
      const templateData = createMockTemplate();

      // Create a proper TemplateImportExport object
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, createdBy, ...exportData } = templateData;
      const importData = {
        template: exportData,
        exportedAt: new Date(),
        exportedBy: TEST_USER,
        exportFormat: '1.0' as const,
      };

      const importedTemplate = store.importTemplate(importData, TEST_USER);

      // Ensure import was successful
      expect(importedTemplate).not.toBeNull();

      if (importedTemplate) {
        expect(importedTemplate.templateName).toBe(templateData.templateName);
        expect(importedTemplate.id).not.toBe(templateData.id);
      }
    });

    test('exports template data', () => {
      const store = useTemplateStore.getState();
      const template = createMockTemplate();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, createdBy, ...templateData } = template;

      const createdTemplate = store.createTemplate(templateData, TEST_USER);
      const exported = store.exportTemplate(createdTemplate.id, TEST_USER);

      // The exported data should contain the template without id, createdAt, and createdBy
      // and include exportedAt, exportedBy, and exportFormat
      expect(exported).toBeDefined();
      expect(exported?.template.templateName).toBe(template.templateName);
      expect(exported?.exportFormat).toBe('1.0');
    });

    test('imports AKC Scent Work template successfully', () => {
      const store = useTemplateStore.getState();
      const akcTemplate = createAKCScentWorkTemplate();

      // Create a proper TemplateImportExport object
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, createdBy, ...exportData } = akcTemplate;
      const importData = {
        template: exportData,
        exportedAt: new Date(),
        exportedBy: TEST_USER,
        exportFormat: '1.0' as const,
      };

      const importedTemplate = store.importTemplate(importData, TEST_USER);

      // Ensure import was successful
      expect(importedTemplate).not.toBeNull();

      if (importedTemplate) {
        expect(importedTemplate.organization).toBe(Organization.AKC);
        expect(importedTemplate.showType).toBe(ShowType.SCENT_WORK);
        expect(importedTemplate.classDefinitions.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Template Validation', () => {
    test('allows duplicate names across different org/type', () => {
      const store = useTemplateStore.getState();
      const template1 = createMockTemplate({
        templateName: 'Same Name',
        organization: Organization.AKC,
        showType: ShowType.SCENT_WORK,
      });
      const template2 = createMockTemplate({
        templateName: 'Same Name',
        organization: Organization.UKC,
        showType: ShowType.SCENT_WORK,
      });

      store.createTemplate(template1, TEST_USER);
      expect(() => store.createTemplate(template2, TEST_USER)).not.toThrow();

      expect(useTemplateStore.getState().templates).toHaveLength(2);
    });
  });

  describe('Performance with Large Templates', () => {
    test('handles large number of templates efficiently', () => {
      const store = useTemplateStore.getState();
      const templates = createMockTemplates(100);

      const startTime = performance.now();
      templates.forEach(template => store.createTemplate(template, TEST_USER));
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
      expect(useTemplateStore.getState().templates).toHaveLength(100);
    });

    test('searches large template sets efficiently', () => {
      const store = useTemplateStore.getState();
      const templates = createMockTemplates(100);
      templates.forEach(template => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, createdAt, createdBy, ...templateData } = template;
        store.createTemplate(templateData, TEST_USER);
      });

      const startTime = performance.now();
      store.setSearchQuery('Template 5');
      const filtered = store.getFilteredTemplates();
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
      expect(filtered.length).toBeGreaterThan(0);
    });
  });
});
