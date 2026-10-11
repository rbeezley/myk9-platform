import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from } }));

import {
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

describe('timeLimitRuleRange (mirrors ringside_update_class)', () => {
  it('caps a fixed rule at its time, spans a judge-set range, else 1..900', () => {
    expect(timeLimitRuleRange({ fixed: 120 })).toEqual({ low: 1, high: 120 });
    expect(timeLimitRuleRange({ min: 60, max: 180 })).toEqual({ low: 60, high: 180 });
    expect(timeLimitRuleRange(undefined)).toEqual({ low: 1, high: 900 });
  });
});

describe('resolveTimeLimitRulesForClassRows', () => {
  beforeEach(() => from.mockReset());

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

    expect(rules.get('c-int')).toEqual({ fixed: undefined, min: 60, max: 180 });
    expect(rules.get('c-con')).toEqual({ fixed: 120, min: undefined, max: undefined });
    expect(rules.has('c-none')).toBe(false);
  });

  it('returns nothing (never throws) when a lookup fails', async () => {
    from.mockImplementation(() => query({ data: null, error: { message: 'boom' } }));
    const rules = await resolveTimeLimitRulesForClassRows([
      { id: 'c', trial_id: 't1', element: 'Interior', level: 'Novice' },
    ]);
    expect(rules.size).toBe(0);
  });
});
