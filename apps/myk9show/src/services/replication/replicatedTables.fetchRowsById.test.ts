/**
 * MYK9-771: every table that queues full-row UPDATEs can re-read ONE row by id,
 * so a write rejected for a stale OCC token re-fetches its row and rebases or
 * surfaces. The by-id read must use the same source and columns as that
 * table's sync, or the re-fetched row would read as a server change (or fail
 * on a column-allowlisted table).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutationManager, RowRefetchAdapter } from '@myk9/replication';

const { calls, response } = vi.hoisted(() => ({
  calls: [] as Array<[string, ...unknown[]]>,
  response: { data: [] as unknown[] | null, error: null as { message: string } | null },
}));

/** Records every builder call; awaiting the builder resolves `response`. */
function makeBuilder(): Record<string, unknown> {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'in', 'gt', 'order', 'range', 'or']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: typeof response) => unknown) => resolve(response);
  return builder;
}

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: (table: string) => {
      calls.push(['from', table]);
      return makeBuilder();
    },
  },
}));

vi.mock('./resolveClassVisibility', async importOriginal => ({
  ...(await importOriginal<typeof import('./resolveClassVisibility')>()),
  resolveVisibilityForClassRows: vi.fn(
    async () => new Map([['c1', { selfCheckinEnabled: true, visibilityPreset: 'open' }]])
  ),
}));
vi.mock('./resolveClassHideCounts', () => ({
  resolveHideCountsForClassRows: vi.fn(async () => new Map([['c1', 4]])),
}));
vi.mock('./resolveClassJudgeNames', () => ({
  resolveJudgeNamesForClassRows: vi.fn(
    async () => new Map([['c1', { firstName: 'Pat', lastName: 'Judge' }]])
  ),
}));

import { ReplicatedArmbandsTable } from './ReplicatedArmbandsTable';
import { CLASS_AUTHENTICATED_COLUMN_SELECT } from '@/services/database/classes/reads';
import { ReplicatedClassesTable } from './ReplicatedClassesTable';
import { ReplicatedClubsTable } from './ReplicatedClubsTable';
import { ReplicatedDogsTable } from './ReplicatedDogsTable';
import { ReplicatedEntriesTable } from './ReplicatedEntriesTable';
import { ReplicatedJudgeAssignmentsTable } from './ReplicatedJudgeAssignmentsTable';
import { JUDGE_ASSIGNMENT_SELECT } from './ReplicatedJudgeAssignmentsTable';
import { ReplicatedPaperworkPrintsTable } from './ReplicatedPaperworkPrintsTable';
import { ReplicatedShowsTable } from './ReplicatedShowsTable';
import { ReplicatedTrialsTable } from './ReplicatedTrialsTable';

type AnyTable = { getTableName(): string; setMutationManager(manager: MutationManager): void };

function refetchAdapterOf(table: AnyTable): RowRefetchAdapter<unknown, { id: string }> {
  return (
    table as unknown as { getRowRefetchAdapter(): RowRefetchAdapter<unknown, { id: string }> }
  ).getRowRefetchAdapter();
}

const cases: Array<{
  name: string;
  make: () => AnyTable;
  expected: Array<[string, ...unknown[]]>;
}> = [
  {
    name: 'entries',
    make: () => new ReplicatedEntriesTable(),
    expected: [
      ['from', 'view_authenticated_entry_results_replication'],
      ['select', '*'],
      ['in', 'id', ['r1', 'r2']],
    ],
  },
  {
    name: 'classes',
    make: () => new ReplicatedClassesTable(),
    expected: [
      ['from', 'classes'],
      [
        'select',
        `${CLASS_AUTHENTICATED_COLUMN_SELECT}, judge_assignments!judge_assignments_class_id_fkey(id, person_id, status)`,
      ],
      ['in', 'id', ['r1', 'r2']],
    ],
  },
  {
    name: 'shows',
    make: () => new ReplicatedShowsTable(),
    expected: [
      ['from', 'shows'],
      ['select', '*'],
      ['is', 'deleted_at', null],
      ['in', 'id', ['r1', 'r2']],
    ],
  },
  {
    name: 'clubs',
    make: () => new ReplicatedClubsTable(),
    expected: [
      ['from', 'clubs'],
      ['select', '*'],
      ['is', 'deleted_at', null],
      ['in', 'id', ['r1', 'r2']],
    ],
  },
  {
    name: 'trials',
    make: () => new ReplicatedTrialsTable(),
    expected: [
      ['from', 'trials'],
      ['select', '*'],
      ['in', 'id', ['r1', 'r2']],
    ],
  },
  {
    name: 'dogs',
    make: () => new ReplicatedDogsTable(),
    expected: [
      ['from', 'dogs'],
      ['select', '*'],
      ['in', 'id', ['r1', 'r2']],
    ],
  },
  {
    name: 'judge_assignments',
    make: () => new ReplicatedJudgeAssignmentsTable(),
    expected: [
      ['from', 'judge_assignments'],
      ['select', JUDGE_ASSIGNMENT_SELECT],
      ['in', 'id', ['r1', 'r2']],
    ],
  },
  {
    name: 'armbands',
    make: () => new ReplicatedArmbandsTable(),
    expected: [
      ['from', 'armbands'],
      ['select', '*'],
      ['eq', 'is_available', false],
      ['in', 'id', ['r1', 'r2']],
    ],
  },
  {
    name: 'paperwork_prints',
    make: () => new ReplicatedPaperworkPrintsTable(),
    expected: [
      ['from', 'paperwork_prints'],
      ['select', '*'],
      ['in', 'id', ['r1', 'r2']],
    ],
  },
];

describe.each(cases)('$name fetchRowsById (MYK9-771)', ({ name, make, expected }) => {
  beforeEach(() => {
    calls.length = 0;
    response.data = [];
    response.error = null;
  });

  it('reads exactly the requested rows from the source its sync uses', async () => {
    const table = make();
    expect(table.getTableName()).toBe(name);

    await refetchAdapterOf(table).fetchRowsById(['r1', 'r2']);

    expect(calls).toEqual(expected);
  });

  it('throws on a query error, so the write stays queued for the next rejection', async () => {
    response.error = { message: 'permission denied' };

    await expect(refetchAdapterOf(make()).fetchRowsById(['r1'])).rejects.toThrow(
      'permission denied'
    );
  });

  it('registers with the mutation manager when wired, so a rejection can ask for it', () => {
    const table = make();
    const register = vi.fn(() => () => undefined);

    table.setMutationManager({ rowRefetchers: { register } } as unknown as MutationManager);

    expect(register).toHaveBeenCalledWith(name, expect.any(Function));
  });
});

describe('classes fetchRowsById enrichment', () => {
  it('carries the same judge, hide-count and visibility enrichment as its sync', async () => {
    calls.length = 0;
    response.error = null;
    response.data = [{ id: 'c1', trial_id: 't1', name: 'Novice Container' }];

    const [row] = (await refetchAdapterOf(new ReplicatedClassesTable()).fetchRowsById([
      'c1',
    ])) as Array<Record<string, unknown>>;

    expect(row).toMatchObject({
      id: 'c1',
      num_hides: 4,
      _judge: { firstName: 'Pat', lastName: 'Judge' },
      _judgeResolved: true,
      _selfCheckinEnabled: true,
      _visibilityPreset: 'open',
    });
  });
});
