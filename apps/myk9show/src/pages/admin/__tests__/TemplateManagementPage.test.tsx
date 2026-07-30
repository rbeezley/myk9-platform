import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import TemplateManagementPage from '../TemplateManagementPage';
import type { SportTemplateRow, SportClassRuleRow } from '@/types/sport-template-types';

const useSportTemplatesWithRulesQuery = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useSportTemplates', () => ({
  useSportTemplatesWithRulesQuery,
}));

const rule: SportClassRuleRow = {
  id: 'rule-1',
  sport_template_id: 'akc-sw',
  element: 'Container',
  level: 'Novice',
  class_name: 'Container Novice',
  section: 'A',
  display_order: 1,
  max_time_seconds_fixed: 180,
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
  default_entry_fee: null,
  mrv_minutes: null,
  field_overrides: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

const template: SportTemplateRow & { sport_class_rules: SportClassRuleRow[] } = {
  id: 'akc-sw',
  organization: 'AKC',
  sport_name: 'Scent Work',
  sport_code: 'akc-scent-work',
  elements: ['Container', 'Interior'],
  levels: ['Novice', 'Advanced'],
  section_mode: 'novice-only',
  divisions: [],
  operational_config: {},
  export_config: {},
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  sport_class_rules: [rule],
};

const refetch = vi.hoisted(() => vi.fn());

const loaded = {
  data: [template],
  isLoading: false,
  isError: false,
  error: null,
  isFetching: false,
  refetch,
};

describe('TemplateManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSportTemplatesWithRulesQuery.mockReturnValue(loaded);
  });

  it('lists the seeded sport rules', () => {
    render(<TemplateManagementPage />);

    expect(screen.getByRole('heading', { name: /sport rules/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Scent Work')).toBeInTheDocument();
    expect(screen.getByText('1 class rules')).toBeInTheDocument();
  });

  it('explains that rules are changed by migration, not here', () => {
    render(<TemplateManagementPage />);

    expect(screen.getByRole('note', { name: /how sport rules are changed/i })).toHaveTextContent(
      /read-only/i
    );
  });

  // INTENT: this page exists to prove a migration landed, so it must read the DATABASE,
  // never the templateStore — that store falls back to bundled fixtures on fetch failure
  // and would present mock data as seeded truth. See
  // docs/plan-template-authoring-removal.md.
  it('shows nothing and reports the failure when the database read fails', () => {
    useSportTemplatesWithRulesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('permission denied for table sport_templates'),
    });

    render(<TemplateManagementPage />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/could not read sport rules/i);
    expect(alert).toHaveTextContent(/permission denied/i);

    // Critically: no template cards, rather than a plausible-looking fallback.
    expect(screen.queryByText('Scent Work')).toBeNull();
  });

  it('distinguishes "nothing seeded" from "filtered to nothing"', () => {
    useSportTemplatesWithRulesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<TemplateManagementPage />);

    expect(screen.getByText(/no sport rules are seeded/i)).toBeInTheDocument();
  });

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

  it('lets an admin re-read the database after running a migration', async () => {
    const { user } = render(<TemplateManagementPage />);

    await user.click(screen.getByRole('button', { name: /re-read database/i }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // A background refetch can fail while TanStack Query still holds the previous data.
  // The detail view must not keep showing rules that may no longer match the database.
  it('drops out of a selected rule table when a later read fails', async () => {
    const { user, rerender } = render(<TemplateManagementPage />);

    await user.click(
      screen.getByRole('button', { name: /view 1 class rules for AKC Scent Work/i })
    );
    expect(screen.getByRole('rowheader', { name: 'Container Novice' })).toBeInTheDocument();

    // Data retained, but the refetch failed — exactly TanStack's behaviour.
    useSportTemplatesWithRulesQuery.mockReturnValue({
      ...loaded,
      isError: true,
      error: new Error('connection lost'),
    });
    rerender(<TemplateManagementPage />);

    expect(screen.queryByRole('rowheader', { name: 'Container Novice' })).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not read sport rules/i);
  });

  it('opens the rule table with the real seeded columns', async () => {
    const { user } = render(<TemplateManagementPage />);

    await user.click(
      screen.getByRole('button', { name: /view 1 class rules for AKC Scent Work/i })
    );

    expect(screen.getByRole('rowheader', { name: 'Container Novice' })).toBeInTheDocument();
    // Columns the mapped ClassTemplate shape cannot express — the reason this page
    // reads raw sport_class_rules rows rather than mapSportTemplateToClassTemplate.
    expect(screen.getByRole('columnheader', { name: /timer/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /odors/i })).toBeInTheDocument();
    expect(screen.getByText('Birch')).toBeInTheDocument();
    expect(screen.getByText('180s')).toBeInTheDocument();
  });
});
