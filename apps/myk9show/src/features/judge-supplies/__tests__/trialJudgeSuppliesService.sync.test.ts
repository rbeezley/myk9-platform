import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrialJudgeSupplyRow } from '../types';

type Filter = (row: TrialJudgeSupplyRow) => boolean;

const table: { rows: TrialJudgeSupplyRow[]; nextId: number } = { rows: [], nextId: 1 };

/** A just-enough PostgREST builder over an in-memory `trial_judge_supplies`. */
function builder() {
  const filters: Filter[] = [];
  let op: 'select' | 'update' | 'delete' | 'insert' = 'select';
  let patch: Partial<TrialJudgeSupplyRow> = {};
  let inserted: Partial<TrialJudgeSupplyRow>[] = [];
  const matching = () => table.rows.filter(row => filters.every(f => f(row)));
  const run = () => {
    if (op === 'update') {
      const hit = matching();
      hit.forEach(row => Object.assign(row, patch));
      return { data: hit[0] ?? null, error: null };
    }
    if (op === 'delete') {
      const gone = new Set(matching().map(r => r.id));
      table.rows = table.rows.filter(r => !gone.has(r.id));
      return { data: null, error: null };
    }
    if (op === 'insert') {
      for (const item of inserted) {
        table.rows.push({
          id: `row-${table.nextId++}`,
          note: null,
          created_at: '',
          updated_at: '',
          ...item,
        } as TrialJudgeSupplyRow);
      }
      return { data: null, error: null };
    }
    return { data: matching().sort((a, b) => a.sort_order - b.sort_order), error: null };
  };
  const api: Record<string, unknown> = {
    select: () => api,
    order: () => api,
    single: () => Promise.resolve(run()),
    eq: (col: string, value: unknown) => {
      filters.push(row => (row as unknown as Record<string, unknown>)[col] === value);
      return api;
    },
    is: (col: string, value: unknown) => {
      filters.push(row => (row as unknown as Record<string, unknown>)[col] === value);
      return api;
    },
    in: (col: string, values: unknown[]) => {
      filters.push(row => values.includes((row as unknown as Record<string, unknown>)[col]));
      return api;
    },
    update: (next: Partial<TrialJudgeSupplyRow>) => {
      op = 'update';
      patch = next;
      return api;
    },
    delete: () => {
      op = 'delete';
      return api;
    },
    insert: (rows: Partial<TrialJudgeSupplyRow> | Partial<TrialJudgeSupplyRow>[]) => {
      op = 'insert';
      inserted = Array.isArray(rows) ? rows : [rows];
      return api;
    },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return api;
}

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(() => builder()) },
}));

import { trialJudgeSuppliesService as service } from '../trialJudgeSuppliesService';
import { getSupplyTemplate } from '../templates';

const judge = { person_id: 'judge-1', judge_name: 'Jane Judge' };
const labelsOf = (trialId: string) =>
  table.rows.filter(r => r.trial_id === trialId && r.person_id === 'judge-1');
const find = (trialId: string, label: string) =>
  labelsOf(trialId).find(r => r.item_label === label);

describe('syncJudgeAcrossTrials (MYK9-1728)', () => {
  beforeEach(() => {
    table.rows = [];
    table.nextId = 1;
  });

  it('copies toggle, note, added custom item and deletion from trial A onto trial B', async () => {
    const template = getSupplyTemplate('AKC');
    const first = template[0]!.label;
    await service.ensureSeededForJudge({ trial_id: 'A', ...judge, registry_id: 'AKC' });
    await service.ensureSeededForJudge({ trial_id: 'B', ...judge, registry_id: 'AKC' });

    // Trial A edits: exclude one template item, add a note, add a custom item.
    await service.updateRow(find('A', first)!.id, { included: false, note: 'bring two' });
    await service.addCustomRow({
      trial_id: 'A',
      ...judge,
      item_label: 'Sunscreen',
      sort_order: 999,
    });
    await service.syncJudgeAcrossTrials({
      sourceTrialId: 'A',
      targetTrialIds: ['B'],
      judge,
      registryId: 'AKC',
    });

    expect(find('B', first)).toMatchObject({ included: false, note: 'bring two' });
    expect(find('B', 'Sunscreen')).toMatchObject({
      is_custom: true,
      included: true,
      sort_order: 999,
      trial_id: 'B',
      person_id: 'judge-1',
    });
    expect(
      labelsOf('B')
        .map(r => r.item_label.toLowerCase())
        .sort()
    ).toEqual(
      labelsOf('A')
        .map(r => r.item_label.toLowerCase())
        .sort()
    );

    // Trial A deletes the custom item: B loses it too, template rows all stay.
    await service.deleteCustomRow(find('A', 'Sunscreen')!.id);
    await service.syncJudgeAcrossTrials({
      sourceTrialId: 'A',
      targetTrialIds: ['B'],
      judge,
      registryId: 'AKC',
    });
    expect(find('B', 'Sunscreen')).toBeUndefined();
    expect(labelsOf('B')).toHaveLength(template.length);
  });

  it('seeds a target that has no list yet and matches labels case-insensitively', async () => {
    await service.ensureSeededForJudge({ trial_id: 'A', ...judge, registry_id: 'AKC' });
    await service.addCustomRow({
      trial_id: 'A',
      ...judge,
      item_label: 'Hand Warmers',
      sort_order: 500,
    });
    await service.syncJudgeAcrossTrials({
      sourceTrialId: 'A',
      targetTrialIds: ['B'],
      judge,
      registryId: 'AKC',
    });
    // A custom row already on B under a different case is matched, not duplicated.
    await service.addCustomRow({ trial_id: 'B', ...judge, item_label: 'extra', sort_order: 600 });
    await service.syncJudgeAcrossTrials({
      sourceTrialId: 'A',
      targetTrialIds: ['B'],
      judge,
      registryId: 'AKC',
    });
    expect(labelsOf('B').filter(r => r.item_label.toLowerCase() === 'hand warmers')).toHaveLength(
      1
    );
    // B's own custom row the source never had is removed: B now mirrors A.
    expect(find('B', 'extra')).toBeUndefined();
  });

  it('never touches another judge or the source trial, and ignores the source in targets', async () => {
    await service.ensureSeededForJudge({ trial_id: 'A', ...judge, registry_id: 'AKC' });
    await service.ensureSeededForJudge({
      trial_id: 'B',
      person_id: 'judge-2',
      judge_name: 'Other',
      registry_id: 'AKC',
    });
    const before = JSON.stringify(table.rows);
    await service.syncJudgeAcrossTrials({
      sourceTrialId: 'A',
      targetTrialIds: ['A'],
      judge,
      registryId: 'AKC',
    });
    expect(JSON.stringify(table.rows)).toBe(before);
  });
});
