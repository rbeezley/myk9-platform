// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';
import { fetchShowJudgeAffiliationEditor } from './judgeAffiliations';

const holder = vi.hoisted(() => ({ rows: [] as unknown[], error: null as unknown, showId: '' }));

vi.mock('../supabaseClient', () => {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (_column: string, value: string) => {
    holder.showId = value;
    return builder;
  };
  builder.order = () => builder;
  builder.range = () => Promise.resolve({ data: holder.rows, error: holder.error });
  return { supabase: { from: () => builder }, createDatabaseError };
});

const person = (id: string, judge_affiliation: string | null = null) => ({
  id,
  first_name: 'A',
  last_name: 'Judge',
  judge_affiliation,
});

describe('fetchShowJudgeAffiliationEditor (MYK9-2294)', () => {
  it('marks a judge ready when any assignment on the show is live, whatever its order', async () => {
    holder.error = null;
    holder.rows = [
      { trial_id: null, class_id: null, status: 'confirmed', person: person('p1', ' Region 4 ') },
      { trial_id: null, class_id: 'c1', status: 'declined', person: person('p1', ' Region 4 ') },
      { trial_id: null, class_id: null, status: 'cancelled', person: person('p2') },
      { trial_id: null, class_id: null, status: null, person: person('p3') },
      { trial_id: null, class_id: null, status: 'invited', person: null },
    ];
    await expect(fetchShowJudgeAffiliationEditor('show-1')).resolves.toEqual({
      p1: { status: 'ready', affiliation: 'Region 4' },
      p2: { status: 'inactive', affiliation: null },
      p3: { status: 'ready', affiliation: null },
    });
    expect(holder.showId).toBe('show-1');
  });

  it('throws on a failed read instead of reporting no judges', async () => {
    holder.rows = [];
    holder.error = { message: 'denied', code: '42501' };
    await expect(fetchShowJudgeAffiliationEditor('show-1')).rejects.toBeTruthy();
  });
});
