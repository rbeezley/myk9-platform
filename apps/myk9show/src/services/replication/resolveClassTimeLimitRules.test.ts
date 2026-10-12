import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from } }));

import {
  isRuleCurrent,
  resolveTimeLimitRulesForClassRows,
  timeLimitRuleRange,
} from './resolveClassTimeLimitRules';

function query(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    in: () => Promise.resolve(result),
  };
  return chain;
}

describe('isRuleCurrent', () => {
  it("accepts a rule only for the class's current element and level", () => {
    const rule = { min: 60, max: 180, forElement: 'Interior', forLevel: 'Novice' };
    expect(isRuleCurrent(rule, { element: 'Interior', level: 'Novice' })).toBe(true);
    expect(isRuleCurrent(rule, { element: 'Exterior', level: 'Novice' })).toBe(false);
    expect(isRuleCurrent(rule, { element: 'Interior', level: 'Advanced' })).toBe(false);
    expect(isRuleCurrent(undefined, { element: 'Interior', level: 'Novice' })).toBe(false);
  });
});

describe('timeLimitRuleRange (mirrors ringside_update_class)', () => {
  it('caps a fixed rule at its time, spans a judge-set range, else 1..900', () => {
    expect(timeLimitRuleRange({ fixed: 120 })).toEqual({ low: 1, high: 120 });
    expect(timeLimitRuleRange({ min: 60, max: 180 })).toEqual({ low: 60, high: 180 });
    expect(timeLimitRuleRange(undefined)).toEqual({ low: 1, high: 900 });
  });
});

describe('resolveTimeLimitRulesForClassRows', () => {
  beforeEach(() => {
    from.mockReset();
  });

  it('aggregates section rows and maps each class by registry, element and level', async () => {
    from.mockImplementation((table: string) =>
      table === 'trials'
        ? query({ data: [{ id: 't1', registry_id: 'AKC' }], error: null })
        : query({
            data: [
              {
                element: 'Interior',
                level: 'Novice',
                max_time_seconds_fixed: null,
                max_time_seconds_min: 60,
                max_time_seconds_max: 180,
                sport_templates: { organization: 'AKC' },
              },
              {
                element: 'Interior',
                level: 'Novice',
                max_time_seconds_fixed: null,
                max_time_seconds_min: 60,
                max_time_seconds_max: 180,
                sport_templates: { organization: 'AKC' },
              },
              {
                element: 'Container',
                level: 'Novice',
                max_time_seconds_fixed: 120,
                max_time_seconds_min: null,
                max_time_seconds_max: null,
                sport_templates: [{ organization: 'AKC' }],
              },
            ],
            error: null,
          })
    );

    const rules = await resolveTimeLimitRulesForClassRows([
      { id: 'c-int', trial_id: 't1', element: 'Interior', level: 'Novice' },
      { id: 'c-con', trial_id: 't1', element: 'Container', level: 'Novice' },
      { id: 'c-none', trial_id: 't1', element: 'Buried', level: 'Novice' },
    ]);

    expect(rules?.get('c-int')).toMatchObject({
      min: 60,
      max: 180,
      forElement: 'Interior',
      forLevel: 'Novice',
    });
    expect(rules?.get('c-con')).toMatchObject({ fixed: 120, forElement: 'Container' });
    // Resolved with no rule: an explicit entry with no limits, NOT a missing one.
    expect(rules?.get('c-none')).toEqual({ forElement: 'Buried', forLevel: 'Novice' });
  });

  it('caches the rule requirement values for the offline Requirements dialog (MYK9-1100)', async () => {
    from.mockImplementation((table: string) =>
      table === 'trials'
        ? query({ data: [{ id: 't1', registry_id: 'AKC' }], error: null })
        : query({
            data: [
              {
                element: 'Interior',
                level: 'Master',
                max_time_seconds_fixed: null,
                max_time_seconds_min: 60,
                max_time_seconds_max: 180,
                hide_count_fixed: null,
                hide_count_min: 2,
                hide_count_max: 6,
                hides_known: false,
                distraction_count_min: 1,
                distraction_count_max: 2,
                area_count: 3,
                has_blank: true,
                timer_mode: 'single',
                odors: ['Birch'],
                sport_templates: { organization: 'AKC' },
              },
            ],
            error: null,
          })
    );
    const rules = await resolveTimeLimitRulesForClassRows([
      { id: 'c', trial_id: 't1', element: 'Interior', level: 'Master' },
    ]);
    expect(rules?.get('c')?.display).toEqual({
      hideFixed: null,
      hideMin: 2,
      hideMax: 6,
      hidesKnown: false,
      distractionMin: 1,
      distractionMax: 2,
      areaCount: 3,
      hasBlank: true,
      timerMode: 'single',
      odors: ['Birch'],
    });
  });

  it('withholds the 30-second warning when any section rule does (MYK9-1102)', async () => {
    const row = (has: boolean | null) => ({
      element: 'Interior',
      level: 'Master',
      max_time_seconds_fixed: null,
      max_time_seconds_min: 60,
      max_time_seconds_max: 180,
      has_30_second_warning: has,
      sport_templates: { organization: 'AKC' },
    });
    for (const [rows, expected] of [
      [[row(true), row(false)], false],
      [[row(true), row(null)], true],
    ] as const) {
      from.mockImplementation((table: string) =>
        table === 'trials'
          ? query({ data: [{ id: 't1', registry_id: 'AKC' }], error: null })
          : query({ data: rows, error: null })
      );
      const rules = await resolveTimeLimitRulesForClassRows([
        { id: 'c', trial_id: 't1', element: 'Interior', level: 'Master' },
      ]);
      expect(rules?.get('c')?.thirtySecondWarning).toBe(expected);
    }
  });

  it('returns null -- never "no rule" -- when a lookup fails', async () => {
    from.mockImplementation(() => query({ data: null, error: { message: 'boom' } }));
    const rules = await resolveTimeLimitRulesForClassRows([
      { id: 'c', trial_id: 't1', element: 'Interior', level: 'Novice' },
    ]);
    expect(rules).toBeNull();
  });
});
