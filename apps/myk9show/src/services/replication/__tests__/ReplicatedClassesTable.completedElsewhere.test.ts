// @vitest-environment jsdom
/**
 * MYK9-1104: the secretary scores a class's last dog, the server completes the
 * class itself, and the device's queued "Mark Complete" (built on the stale
 * version) is rejected by the OCC check. Runs the real class table, mutation
 * manager and dirty-row decision; only Supabase and the row fetch are stubbed.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureConflictSurfacing,
  MutationManager,
  type RowRefetchAdapter,
} from '@myk9/replication';
import type { Database } from '@/types/supabase';

vi.mock('@myk9/core', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));

import {
  ReplicatedClassesTable,
  rowToClass,
  type ReplicatedClass,
} from '../ReplicatedClassesTable';

type ClassRow = Database['public']['Tables']['classes']['Row'];
type Enriched = ClassRow & { version: number };

const USER = 'secretary-1';

/** A class table whose row fetch returns the "server" row instead of querying. */
class ProbeClassesTable extends ReplicatedClassesTable {
  server: Enriched | undefined;
  protected override getRowRefetchAdapter() {
    const real = super.getRowRefetchAdapter();
    return {
      ...real,
      fetchRowsById: async () => (this.server ? [this.server] : []),
    } as unknown as RowRefetchAdapter<never, ReplicatedClass>;
  }
}

function serverRow(overrides: Partial<ClassRow> & { version: number; id: string }): Enriched {
  return {
    trial_id: 'trial-1',
    name: 'Novice A',
    allow_waitlist: false,
    status: 'in_progress',
    status_source: 'derived',
    actual_end_time: null,
    created_at: '2026-10-12T08:00:00Z',
    updated_at: '2026-10-12T08:00:00Z',
    ...overrides,
  } as unknown as Enriched;
}

/** One-row fake server with a real OCC precondition on `version`. */
function fakeClient(row: () => Enriched) {
  const uploads: Array<{ payload: Record<string, unknown>; expectedVersion: unknown }> = [];
  const from = vi.fn(() => ({
    update: (payload: Record<string, unknown>) => {
      const call = { payload, expectedVersion: undefined as unknown };
      uploads.push(call);
      const builder = {
        eq(column: string, value: unknown) {
          if (column === 'version') call.expectedVersion = value;
          return builder;
        },
        async select() {
          if (call.expectedVersion !== row().version) return { data: [], error: null };
          return { data: [{ id: payload.id, version: row().version + 1 }], error: null };
        },
      };
      return builder;
    },
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { version: row().version }, error: null }) }),
    }),
  }));
  return { client: { from } as unknown as SupabaseClient, uploads };
}

describe('Mark Complete after the server already completed the class (MYK9-1104)', () => {
  let manager: MutationManager | undefined;
  let classId: string;
  let table: ProbeClassesTable;
  let conflicts: Array<{ fields: string[] }>;
  const onConflict = (event: Event) => conflicts.push((event as CustomEvent).detail);

  beforeEach(() => {
    classId = `class-${crypto.randomUUID()}`;
    conflicts = [];
    configureConflictSurfacing(true);
    window.addEventListener('replication:conflict', onConflict);
  });

  afterEach(async () => {
    window.removeEventListener('replication:conflict', onConflict);
    await manager?.clearAllMutations();
    manager?.destroy();
    await table.delete(classId);
    vi.restoreAllMocks();
  });

  async function markCompleteOnStaleVersion(server: Enriched) {
    table = new ProbeClassesTable();
    table.server = server;
    const { client, uploads } = fakeClient(() => table.server!);
    manager = new MutationManager(client, {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => USER,
      getCurrentUploadContext: async () => ({ authUserId: USER, supabaseClient: client }),
    });
    table.setMutationManager(manager);
    // The device last synced the class in progress at version 3.
    const base = rowToClass(serverRow({ id: classId, version: 3 }));
    await table.set(classId, base, false, undefined, 3);
    // What the Results tab's "Mark Complete" writes (classStatusMutations.ts).
    await table.updateClass(classId, {
      classStatus: 'Completed',
      statusSource: 'manual',
      reopenedAfterCloseoutAt: null,
      actual_end_time: '2026-10-12T10:00:00.000Z',
    });
    await manager.uploadPendingMutations();
    return uploads;
  }

  it('raises no prompt, takes the server end time, and the class row syncs', async () => {
    const uploads = await markCompleteOnStaleVersion(
      serverRow({
        id: classId,
        version: 8,
        status: 'completed',
        actual_end_time: '2026-10-12T09:59:30+00:00',
      })
    );

    await vi.waitFor(async () => {
      const queued = await manager!.getPendingMutationsForRow('classes', classId);
      expect(queued[0]?.serverVersion).toBe(8);
    });

    expect(conflicts).toHaveLength(0);
    const row = await table.getReplicatedRow(classId);
    expect(row?.syncStatus).not.toBe('conflict');
    expect(row?.data.classStatus).toBe('completed');
    expect(row?.data.actual_end_time).toBe('2026-10-12T09:59:30+00:00');
    const [queued] = await manager!.getPendingMutationsForRow('classes', classId);
    expect(queued?.data).toMatchObject({
      status: 'completed',
      status_source: 'manual',
      actual_end_time: '2026-10-12T09:59:30+00:00',
    });
    expect(uploads[0]?.expectedVersion).toBe(3);
  });

  it('still prompts when the server reopened the class', async () => {
    await markCompleteOnStaleVersion(
      serverRow({ id: classId, version: 8, status: 'upcoming', actual_end_time: null })
    );

    await vi.waitFor(async () =>
      expect((await table.getReplicatedRow(classId))?.syncStatus).toBe('conflict')
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.fields).toEqual(['classStatus']);
  });
});
