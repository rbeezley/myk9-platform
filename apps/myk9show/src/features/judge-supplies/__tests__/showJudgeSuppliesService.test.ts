import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShowJudgeSupplyRow } from '../types';

const table: { rows: ShowJudgeSupplyRow[]; nextId: number } = { rows: [], nextId: 1 };
const fromSpy = vi.fn();
const insertSpy = vi.fn();

/** A just-enough PostgREST builder over an in-memory `show_judge_supplies`. */
function builder() {
  const eqs: [string, unknown][] = [];
  const nulls: string[] = [];
  let mode: 'select' | 'insert' = 'select';
  let inserted: Partial<ShowJudgeSupplyRow>[] = [];

  const matches = (r: ShowJudgeSupplyRow) =>
    eqs.every(([k, v]) => r[k as keyof ShowJudgeSupplyRow] === v) &&
    nulls.every(k => r[k as keyof ShowJudgeSupplyRow] === null);

  const api = {
    select: () => api,
    eq: (k: string, v: unknown) => (eqs.push([k, v]), api),
    is: (k: string) => (nulls.push(k), api),
    order: () => api,
    insert: (rows: Partial<ShowJudgeSupplyRow>[]) => {
      mode = 'insert';
      inserted = rows;
      insertSpy(rows);
      for (const r of rows) {
        table.rows.push({
          id: `id-${table.nextId++}`,
          note: null,
          created_at: 'x',
          updated_at: 'x',
          ...r,
        } as ShowJudgeSupplyRow);
      }
      return api;
    },
    then: (resolve: (v: unknown) => void) =>
      resolve(
        mode === 'insert'
          ? { data: inserted, error: null }
          : { data: table.rows.filter(matches), error: null }
      ),
  };
  return api;
}

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (name: string) => {
      fromSpy(name);
      return builder();
    },
  },
}));

import { showJudgeSuppliesService } from '../showJudgeSuppliesService';

describe('showJudgeSuppliesService (MYK9-1728)', () => {
  beforeEach(() => {
    table.rows = [];
    table.nextId = 1;
    vi.clearAllMocks();
  });

  it('reads and writes show_judge_supplies keyed by show_id', async () => {
    await showJudgeSuppliesService.ensureSeededForJudge({
      show_id: 'show-1',
      person_id: 'p1',
      judge_name: 'Alice',
      registry_id: 'AKC',
    });

    expect(fromSpy).toHaveBeenCalledWith('show_judge_supplies');
    expect(fromSpy).not.toHaveBeenCalledWith('trial_judge_supplies');
    const rows = insertSpy.mock.calls[0]![0] as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.show_id === 'show-1' && r.person_id === 'p1')).toBe(true);
    expect(rows.every(r => !('trial_id' in r))).toBe(true);
  });

  it('seeds a judge once per show, however many trials they judge', async () => {
    const args = {
      show_id: 'show-1',
      person_id: 'p1',
      judge_name: 'Alice',
      registry_id: 'AKC',
    };
    const first = await showJudgeSuppliesService.ensureSeededForJudge(args);
    // Opening the same judge again (from the second trial's row, say) finds the list.
    const second = await showJudgeSuppliesService.ensureSeededForJudge(args);

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(second).toHaveLength(first.length);
    expect(table.rows).toHaveLength(first.length);
  });

  it('keeps two judges and two shows apart', async () => {
    await showJudgeSuppliesService.ensureSeededForJudge({
      show_id: 'show-1',
      person_id: 'p1',
      judge_name: 'Alice',
      registry_id: 'AKC',
    });
    await showJudgeSuppliesService.ensureSeededForJudge({
      show_id: 'show-1',
      person_id: null,
      judge_name: 'Bob',
      registry_id: 'AKC',
    });
    await showJudgeSuppliesService.ensureSeededForJudge({
      show_id: 'show-2',
      person_id: 'p1',
      judge_name: 'Alice',
      registry_id: 'AKC',
    });

    const alice = await showJudgeSuppliesService.listForJudge('show-1', {
      person_id: 'p1',
      judge_name: 'Alice',
    });
    const bob = await showJudgeSuppliesService.listForJudge('show-1', {
      person_id: null,
      judge_name: 'Bob',
    });
    const showOne = await showJudgeSuppliesService.listForShow('show-1');

    expect(alice.every(r => r.judge_name === 'Alice' && r.show_id === 'show-1')).toBe(true);
    expect(bob.every(r => r.judge_name === 'Bob')).toBe(true);
    expect(showOne).toHaveLength(alice.length + bob.length);
  });
});
