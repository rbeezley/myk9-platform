import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveVisibilityForClassRows } from '../resolveClassVisibility';
import { supabase } from '@/services/database/supabaseClient';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));

const tables: Record<string, Record<string, unknown>[]> = {
  trials: [
    { id: 't1', show_id: 's1' },
    { id: 't2', show_id: 's1' },
    { id: 't3', show_id: 's2' },
  ],
  show_visibility_settings: [
    { show_id: 's1', preset: 'standard', self_checkin_enabled: false },
    { show_id: 's2', preset: 'open', self_checkin_enabled: true },
  ],
  trial_visibility_overrides: [{ trial_id: 't2', preset: 'review', self_checkin_enabled: true }],
  class_visibility_overrides: [{ class_id: 'c2', preset: 'open', self_checkin_enabled: false }],
};
const filters: Array<{ table: string; column: string; values: string[] }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  filters.length = 0;
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    let rows = tables[table] ?? [];
    const query = {
      select: () => query,
      eq: (column: string, value: string) => {
        rows = rows.filter(row => row[column] === value);
        return query;
      },
      in: (column: string, values: string[]) => {
        filters.push({ table, column, values });
        rows = rows.filter(row => values.includes(String(row[column])));
        return query;
      },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }),
    };
    return query as never;
  });
});

describe('class visibility request budget', () => {
  it('resolves multiple trials and shows in four reads, preserving each cascade', async () => {
    const result = await resolveVisibilityForClassRows([
      { id: 'c1', trial_id: 't1' },
      { id: 'c2', trial_id: 't2' },
      { id: 'c3', trial_id: 't2' },
      { id: 'c4', trial_id: 't3' },
      { id: 'skip', trial_id: null },
    ]);
    expect(supabase.from).toHaveBeenCalledTimes(4);
    expect(result.get('c1')).toEqual({ visibilityPreset: 'standard', selfCheckinEnabled: false });
    expect(result.get('c2')).toEqual({ visibilityPreset: 'open', selfCheckinEnabled: false });
    expect(result.get('c3')).toEqual({ visibilityPreset: 'review', selfCheckinEnabled: true });
    expect(result.get('c4')).toEqual({ visibilityPreset: 'open', selfCheckinEnabled: true });
    expect(result.has('skip')).toBe(false);
    expect(filters).toContainEqual({ table: 'trials', column: 'id', values: ['t1', 't2', 't3'] });
    expect(filters).toContainEqual({
      table: 'show_visibility_settings',
      column: 'show_id',
      values: ['s1', 's2'],
    });
  });

  it('bounds large batches and deduplicates repeated class IDs', async () => {
    const rows = Array.from({ length: 201 }, (_, index) => ({ id: `c${index}`, trial_id: 't1' }));
    const result = await resolveVisibilityForClassRows([...rows, rows[0]]);
    expect(result.size).toBe(201);
    expect(supabase.from).toHaveBeenCalledTimes(12);
    expect(filters.every(filter => filter.values.length <= 100)).toBe(true);
    expect(
      filters
        .filter(filter => filter.table === 'class_visibility_overrides')
        .map(filter => filter.values.length)
    ).toEqual([100, 100, 1]);
  });

  it('uses defaults only for absent rows, including a missing trial', async () => {
    const result = await resolveVisibilityForClassRows([{ id: 'unknown', trial_id: 'missing' }]);
    expect(result.get('unknown')).toEqual({ visibilityPreset: 'open', selfCheckinEnabled: true });
    expect(supabase.from).not.toHaveBeenCalledWith('show_visibility_settings');
  });

  it.each([
    'trials',
    'show_visibility_settings',
    'trial_visibility_overrides',
    'class_visibility_overrides',
  ])('does not turn a failed %s read into permissive defaults', async table => {
    const original = vi.mocked(supabase.from).getMockImplementation()!;
    vi.mocked(supabase.from).mockImplementation(name =>
      name === table
        ? ({
            select: () => ({ in: () => Promise.resolve({ data: null, error: { code: '503' } }) }),
          } as never)
        : original(name)
    );
    await expect(resolveVisibilityForClassRows([{ id: 'c1', trial_id: 't1' }])).rejects.toThrow(
      `Class visibility read failed: ${table}`
    );
  });

  it('reads fresh data for each sync instead of sharing settings across sessions', async () => {
    const rows = [{ id: 'c1', trial_id: 't1' }];
    await resolveVisibilityForClassRows(rows);
    await resolveVisibilityForClassRows(rows);
    expect(supabase.from).toHaveBeenCalledTimes(8);
  });
});
