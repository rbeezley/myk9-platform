/**
 * MYK9-1220 on the real entries mapper: the base an acknowledged ringside score
 * leaves behind is the old base plus the columns the RPC wrote, under the row's
 * own field names (camelCase and snake_case copies both).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MutationManager } from '@myk9/replication';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('ReplicatedEntriesTable written-field overlay (MYK9-1220)', () => {
  let manager: MutationManager | undefined;

  afterEach(() => {
    manager?.destroy();
    manager = undefined;
  });

  it('lays the written ringside columns over the base and leaves every other field alone', () => {
    manager = new MutationManager({} as SupabaseClient);
    new ReplicatedEntriesTable().setMutationManager(manager);
    const overlay = manager.writtenOverlays.get('entries');
    expect(overlay).toBeDefined();
    const base = {
      id: 'e1',
      showId: 's1',
      classId: 'c1',
      armband: 7,
      resultStatus: 'abs',
      result_status: 'abs',
      disqualification_reason: 'R0',
    } as unknown as ReplicatedEntry;

    const next = overlay!(base, {
      result_status: 'qualified',
      disqualification_reason: null,
    }) as Record<string, unknown>;

    expect(next).toMatchObject({
      id: 'e1',
      showId: 's1',
      classId: 'c1',
      armband: 7,
      resultStatus: 'qualified',
      result_status: 'qualified',
    });
    expect(next.disqualification_reason ?? null).toBeNull();
  });
});
