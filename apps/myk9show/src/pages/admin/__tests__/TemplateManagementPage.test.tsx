import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import TemplateManagementPage from '../TemplateManagementPage';
import type { ClassTemplate, TemplateFilter } from '@/types/template.types';

const initializeDefaultTemplates = vi.hoisted(() => vi.fn());
const clearCorruptedData = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const clearError = vi.hoisted(() => vi.fn());
const deleteTemplate = vi.hoisted(() => vi.fn());
const searchTemplates = vi.hoisted(() => vi.fn());
const cleanupDuplicateTemplates = vi.hoisted(() => vi.fn());

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

vi.mock('@/services/LoggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/store/templateStore', () => ({
  useTemplateStore: () => ({
    searchTemplates,
    clearError,
    error: null,
    clearCorruptedData,
    initializeDefaultTemplates,
    deleteTemplate,
  }),
}));

vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({
    templates,
    isLoading: false,
  }),
}));

vi.mock('@/utils/cleanup-duplicate-templates', () => ({
  cleanupDuplicateTemplates,
}));

describe('TemplateManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchTemplates.mockImplementation((_filter: TemplateFilter) => templates);
    cleanupDuplicateTemplates.mockReturnValue(1);
  });

  it('keeps template maintenance actions behind advanced maintenance copy', async () => {
    const { user } = render(<TemplateManagementPage />);

    expect(screen.getByRole('button', { name: /create template/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /force initialize/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset templates/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clean duplicates/i })).not.toBeInTheDocument();

    await user.click(screen.getByText('Advanced maintenance'));

    expect(screen.getByText('Reload defaults')).toBeInTheDocument();
    expect(screen.getByText(/Use only when template data is corrupted/i)).toBeInTheDocument();
    expect(screen.getByText(/without changing the canonical template list/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /force initialize/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset templates/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clean duplicates/i })).toBeInTheDocument();
  });

  it('runs advanced maintenance actions from the disclosure', async () => {
    const { user } = render(<TemplateManagementPage />);

    await user.click(screen.getByText('Advanced maintenance'));
    await user.click(screen.getByRole('button', { name: /force initialize/i }));
    await user.click(screen.getByRole('button', { name: /clean duplicates/i }));
    await user.click(screen.getByRole('button', { name: /reset templates/i }));

    expect(initializeDefaultTemplates).toHaveBeenCalledWith(true);
    expect(cleanupDuplicateTemplates).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Reset All Templates')).toBeInTheDocument();
  });
});
