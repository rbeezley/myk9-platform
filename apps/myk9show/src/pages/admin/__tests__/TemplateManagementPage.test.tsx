import { describe, expect, it, vi } from 'vitest';
import { screen } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import TemplateManagementPage from '../TemplateManagementPage';
import type { ClassTemplate } from '@/types/template.types';

const clearError = vi.hoisted(() => vi.fn());

const templates = vi.hoisted<ClassTemplate[]>(() => [
  {
    id: 'template-1',
    organization: 'AKC' as ClassTemplate['organization'],
    trialType: 'Scent Work' as ClassTemplate['trialType'],
    templateName: 'AKC Scent Work',
    version: '1.0',
    status: 'active' as ClassTemplate['status'],
    type: 'official' as ClassTemplate['type'],
    isActive: true,
    isOfficial: true,
    isCustom: false,
    fieldSpecifications: [],
    classDefinitions: [],
    validationRules: [],
    defaults: {},
    createdBy: 'system',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  },
]);

vi.mock('@/store/templateStore', () => ({
  useTemplateStore: () => ({
    error: null,
    clearError,
  }),
}));

vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({
    templates,
    isLoading: false,
  }),
}));

describe('TemplateManagementPage', () => {
  it('lists the seeded sport rules', () => {
    render(<TemplateManagementPage />);

    expect(screen.getByRole('heading', { name: /sport rules/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByText('AKC Scent Work')).toBeInTheDocument();
  });

  it('explains that rules are changed by migration, not here', () => {
    render(<TemplateManagementPage />);

    expect(screen.getByRole('note', { name: /how sport rules are changed/i })).toHaveTextContent(
      /read-only/i
    );
  });

  // INTENT: this page must never regain authoring controls. Sport rules are
  // reference data — a bad row affects every future show, so they change by
  // reviewed migration. See docs/plan-template-authoring-removal.md.
  it('offers no authoring affordances', () => {
    render(<TemplateManagementPage />);

    for (const label of [
      /create template/i,
      /new template/i,
      /edit template/i,
      /test template/i,
      /delete/i,
      /import/i,
      /export/i,
      /advanced maintenance/i,
      /reload defaults/i,
      /reset templates/i,
      /clean duplicates/i,
    ]) {
      expect(
        screen.queryByRole('button', { name: label }),
        `"${label}" must not be offered on a read-only page`
      ).toBeNull();
    }
  });
});
