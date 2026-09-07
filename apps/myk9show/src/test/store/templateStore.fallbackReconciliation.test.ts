import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTemplateStore } from '@/store/templateStore';
import { initialState } from '@/store/templateStore.types';
import {
  AKC_SCENT_WORK_FALLBACK_TEMPLATE_ID,
  AKC_SCENT_WORK_TEMPLATE,
} from '@/data/templates/akcScentWorkTemplate';
import { Organization, TrialType } from '@/types/template.types';
import type { SportClassRuleRow, SportTemplateRow } from '@/types/sport-template-types';
import { fetchAllSportTemplatesWithRules } from '@/services/sportTemplateService';

vi.mock('@/services/sportTemplateService', () => ({
  fetchAllSportTemplatesWithRules: vi.fn(),
}));

const fetchMock = vi.mocked(fetchAllSportTemplatesWithRules);

/** The authoritative DB row for AKC Scent Work, under its real (uuid) id. */
const DB_TEMPLATE_ID = '657cda51-0000-4000-8000-000000000001';

function dbClassRule(overrides: Partial<SportClassRuleRow> = {}): SportClassRuleRow {
  return {
    id: 'rule-1',
    sport_template_id: DB_TEMPLATE_ID,
    element: 'Container',
    level: 'Novice',
    class_name: 'Container Novice',
    section: null,
    display_order: 1,
    max_time_seconds_fixed: 120,
    max_time_seconds_min: null,
    max_time_seconds_max: null,
    hide_count_fixed: 1,
    hide_count_min: null,
    hide_count_max: null,
    hides_known: true,
    area_count: 1,
    has_blank: false,
    distraction_count_min: 0,
    distraction_count_max: 0,
    timer_mode: 'single',
    odors: ['Birch'],
    default_entry_fee: 30,
    mrv_minutes: null,
    field_overrides: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function dbAkcScentWorkRow(): SportTemplateRow & { sport_class_rules: SportClassRuleRow[] } {
  return {
    id: DB_TEMPLATE_ID,
    organization: 'AKC',
    sport_name: 'Scent Work',
    sport_code: 'akc-scent-work',
    elements: ['Container'],
    levels: ['Novice'],
    section_mode: 'none',
    divisions: [],
    operational_config: {},
    export_config: {},
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    sport_class_rules: [dbClassRule()],
  };
}

/** The exact row a browser persists once it has taken the offline fallback path. */
function persistedFallbackTemplate() {
  return {
    ...AKC_SCENT_WORK_TEMPLATE,
    id: AKC_SCENT_WORK_FALLBACK_TEMPLATE_ID,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: 'system',
  };
}

function akcScentWorkTemplates() {
  return useTemplateStore
    .getState()
    .templates.filter(
      t => t.organization === Organization.AKC && t.trialType === TrialType.SCENT_WORK
    );
}

describe('templateStore — persisted fallback vs DB template (MYK9-432)', () => {
  beforeEach(() => {
    // O(1) reset: replace the whole slice rather than deleting rows one by one.
    useTemplateStore.setState({ ...initialState });
    fetchMock.mockReset();
  });

  afterEach(() => {
    useTemplateStore.setState({ ...initialState });
  });

  test('a browser holding the persisted fallback ends up with ONE AKC Scent Work template', async () => {
    // Precondition: this browser already took the offline path in an earlier session.
    useTemplateStore.setState({ templates: [persistedFallbackTemplate()], isInitialized: true });
    expect(akcScentWorkTemplates()).toHaveLength(1);

    fetchMock.mockResolvedValue([dbAkcScentWorkRow()]);

    await useTemplateStore.getState().refreshTemplatesFromDB({ force: true });

    const akc = akcScentWorkTemplates();
    expect(akc).toHaveLength(1);
    // ...and the survivor is the authoritative DB row, not the bundled fallback.
    expect(akc[0].id).toBe(DB_TEMPLATE_ID);
    expect(
      useTemplateStore.getState().templates.some(t => t.id === AKC_SCENT_WORK_FALLBACK_TEMPLATE_ID)
    ).toBe(false);
  });

  test('the same reconciliation runs on the initial DB load, not just a revalidation', async () => {
    useTemplateStore.setState({ templates: [persistedFallbackTemplate()], isInitialized: true });
    fetchMock.mockResolvedValue([dbAkcScentWorkRow()]);

    useTemplateStore.getState().loadTemplatesFromDB(true);

    await vi.waitFor(() => {
      expect(useTemplateStore.getState().templatesFetchedAt).not.toBeNull();
    });
    expect(akcScentWorkTemplates()).toHaveLength(1);
    expect(akcScentWorkTemplates()[0].id).toBe(DB_TEMPLATE_ID);
  });

  test('the offline fallback is still offered when the DB cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    useTemplateStore.getState().loadTemplatesFromDB(true);

    await vi.waitFor(() => {
      expect(useTemplateStore.getState().isInitialized).toBe(true);
    });

    const akc = akcScentWorkTemplates();
    expect(akc).toHaveLength(1);
    expect(akc[0].id).toBe(AKC_SCENT_WORK_FALLBACK_TEMPLATE_ID);
  });

  test('a failed revalidation never removes the cached fallback', async () => {
    useTemplateStore.setState({ templates: [persistedFallbackTemplate()], isInitialized: true });
    fetchMock.mockRejectedValue(new Error('network down'));

    await useTemplateStore.getState().refreshTemplatesFromDB({ force: true });

    expect(akcScentWorkTemplates()).toHaveLength(1);
    expect(akcScentWorkTemplates()[0].id).toBe(AKC_SCENT_WORK_FALLBACK_TEMPLATE_ID);
  });

  test('an unrelated DB template leaves the fallback in place', async () => {
    useTemplateStore.setState({ templates: [persistedFallbackTemplate()], isInitialized: true });
    fetchMock.mockResolvedValue([
      {
        ...dbAkcScentWorkRow(),
        id: 'ukc-row-id',
        organization: 'UKC',
        sport_name: 'Nosework',
        sport_code: 'ukc-nosework',
        sport_class_rules: [dbClassRule({ sport_template_id: 'ukc-row-id' })],
      },
    ]);

    await useTemplateStore.getState().refreshTemplatesFromDB({ force: true });

    expect(akcScentWorkTemplates()).toHaveLength(1);
    expect(akcScentWorkTemplates()[0].id).toBe(AKC_SCENT_WORK_FALLBACK_TEMPLATE_ID);
    expect(useTemplateStore.getState().templates).toHaveLength(2);
  });

  test('the bundled fallback and the DB mapper agree on the template name', () => {
    // One real-world template, one name — so neither path can show a second entry
    // that merely looks different (MYK9-432).
    const row = dbAkcScentWorkRow();
    expect(AKC_SCENT_WORK_TEMPLATE.templateName).toBe(
      `${row.organization} ${row.sport_name} - Official`
    );
  });
});
