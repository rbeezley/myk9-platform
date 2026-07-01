import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Control the DB fetch; identity-map the rows straight into the store so tests
// assert on exactly the ClassTemplate objects they provide.
vi.mock('@/services/sportTemplateService', () => ({
  fetchAllSportTemplatesWithRules: vi.fn(),
}));
vi.mock('@/types/sport-template-types', () => ({
  mapSportTemplateToClassTemplate: (row: unknown) => row,
}));

import { fetchAllSportTemplatesWithRules } from '@/services/sportTemplateService';
import { useTemplateStore } from './templateStore';
import { initialState } from './templateStore.types';
import {
  type ClassDefinition,
  type ClassTemplate,
  Organization,
  TemplateStatus,
  TemplateType,
  TrialType,
} from '@/types/template.types';

// Disable the onRehydrateStorage auto-revalidation (which only fires when online)
// so it can't add stray fetches mid-test. Our direct refreshTemplatesFromDB() calls
// don't consult connectivity, so they still exercise the real code path.
Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

const mockFetch = vi.mocked(fetchAllSportTemplatesWithRules);

function ascaTemplate(classCount: number): ClassTemplate {
  const classDefinitions: ClassDefinition[] = Array.from({ length: classCount }, (_, i) => ({
    element: 'Container',
    level: i >= 16 ? 'Level C' : 'Novice',
    section: i >= 16 ? 'C' : undefined,
    className: `Class ${i}`,
    displayOrder: i,
    fieldOverrides: {},
  }));

  return {
    id: 'asca-uuid',
    organization: Organization.OTHER,
    trialType: TrialType.SCENT_WORK,
    templateName: 'ASCA Scent Work - Official',
    version: '1.0.0',
    description: '',
    status: TemplateStatus.ACTIVE,
    type: TemplateType.OFFICIAL,
    isActive: true,
    isOfficial: true,
    isCustom: false,
    isLatestVersion: true,
    allowEditing: false,
    fieldSpecifications: [],
    classDefinitions,
    validationRules: [],
    defaults: { entryFees: { preEntry: 30, dayOfShow: 35 }, requiredPersonnel: [] },
    createdBy: 'system',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}

describe('refreshTemplatesFromDB (stale-while-revalidate)', () => {
  beforeEach(() => {
    useTemplateStore.setState({ ...initialState });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converges a stale 16-class ASCA cache to the fresh 32-class DB version', async () => {
    // Pre-#1066 persisted snapshot.
    useTemplateStore.setState({
      templates: [ascaTemplate(16)],
      isInitialized: true,
      templatesFetchedAt: 1,
    });
    mockFetch.mockResolvedValue([ascaTemplate(32)] as never);

    await useTemplateStore.getState().refreshTemplatesFromDB();

    const { templates } = useTemplateStore.getState();
    expect(templates).toHaveLength(1);
    expect(templates[0].classDefinitions).toHaveLength(32);
    // Level C definitions are present after convergence.
    expect(templates[0].classDefinitions.filter(c => c.section === 'C')).toHaveLength(16);
  });

  it('stamps templatesFetchedAt on a successful refresh', async () => {
    mockFetch.mockResolvedValue([ascaTemplate(32)] as never);
    expect(useTemplateStore.getState().templatesFetchedAt).toBeNull();

    await useTemplateStore.getState().refreshTemplatesFromDB();

    expect(useTemplateStore.getState().templatesFetchedAt).not.toBeNull();
  });

  it('preserves the cached templates when the DB fetch fails (offline-first)', async () => {
    useTemplateStore.setState({
      templates: [ascaTemplate(16)],
      isInitialized: true,
      templatesFetchedAt: 5,
    });
    mockFetch.mockRejectedValue(new Error('offline'));

    await useTemplateStore.getState().refreshTemplatesFromDB();

    const { templates, templatesFetchedAt } = useTemplateStore.getState();
    expect(templates[0].classDefinitions).toHaveLength(16);
    // Timestamp not advanced — a failed revalidation must not look "fresh".
    expect(templatesFetchedAt).toBe(5);
  });

  it('coalesces concurrent revalidations into a single DB fetch', async () => {
    mockFetch.mockResolvedValue([ascaTemplate(32)] as never);
    const store = useTemplateStore.getState();

    await Promise.all([
      store.refreshTemplatesFromDB(),
      store.refreshTemplatesFromDB(),
      store.refreshTemplatesFromDB(),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not clobber unrelated custom templates', async () => {
    const custom = { ...ascaTemplate(2), id: 'template-custom-1', isCustom: true };
    useTemplateStore.setState({ templates: [custom], templatesFetchedAt: 1 });
    mockFetch.mockResolvedValue([ascaTemplate(32)] as never);

    await useTemplateStore.getState().refreshTemplatesFromDB();

    const ids = useTemplateStore.getState().templates.map(t => t.id);
    expect(ids).toContain('template-custom-1');
    expect(ids).toContain('asca-uuid');
  });
});
