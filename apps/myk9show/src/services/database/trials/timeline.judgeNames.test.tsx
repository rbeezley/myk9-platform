/**
 * MYK9-494 — read-to-render regression for the exhibitor's run schedule.
 *
 * `classes.judge_name` was dropped (MYK9-479) and every schedule row fell back to `Judge TBD`,
 * on all 1030 rows of the Heartland show, while the confirmed `judge_assignments` row was
 * sitting in the browser. The mechanism is authorization, not plumbing: `people_select` admits
 * only the caller's own row and show managers, so an ordinary exhibitor's
 * `judge_assignments(people!inner(...))` embed drops the assignment entirely — both in the
 * replication sync and in the timeline's PostgREST fallback. A null judge never throws, so the
 * fallback never fires either.
 *
 * These tests use the REAL rowToClass, the REAL judge resolvers and the REAL
 * getShowScheduleTimelineRows; only the transport (supabase) and the local replication stores
 * are stubbed, and the class rows are the actual restricted-exhibitor transport shape — the
 * assignment arrives, the people embed does not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/services/database/supabaseClient', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/database/supabaseClient')>();
  return {
    ...actual,
    supabase: {
      rpc: (...args: unknown[]) => mockRpc(...args),
      from: (...args: unknown[]) => mockFrom(...args),
    },
  };
});

const { rowToClass, replicatedClassesTable } =
  await import('@/services/replication/ReplicatedClassesTable');
const { replicatedEntriesTable } = await import('@/services/replication/ReplicatedEntriesTable');
const { replicatedTrialsTable } = await import('@/services/replication/ReplicatedTrialsTable');
const { resolveJudgeNamesForClassRows } =
  await import('@/services/replication/resolveClassJudgeNames');
const { getShowScheduleTimelineRows } = await import('./timeline');
const { CompactScheduleTimeline } = await import('@/components/schedule/CompactScheduleTimeline');

const SHOW_ID = 'show-heartland';
const TRIAL_ID = 'trial-saturday';
const JUDGE_PERSON_ID = 'person-test-judge';

/** The transport shape an ordinary exhibitor actually receives: no `people` embed. */
const RESTRICTED_CLASS_ROWS = [
  {
    id: 'class-interior-advanced',
    trial_id: TRIAL_ID,
    name: 'Interior Advanced',
    element: 'Interior',
    level: 'Advanced',
    status: 'scheduled',
    start_time: '09:00:00',
    deleted_at: null,
    judge_assignments: [{ person_id: JUDGE_PERSON_ID, status: 'confirmed' }],
  },
  {
    id: 'class-buried-master',
    trial_id: TRIAL_ID,
    name: 'Buried Master',
    element: 'Buried',
    level: 'Master',
    status: 'scheduled',
    start_time: '10:00:00',
    deleted_at: null,
    judge_assignments: [{ person_id: 'person-invited-judge', status: 'invited' }],
  },
  {
    id: 'class-container-novice',
    trial_id: TRIAL_ID,
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice A',
    status: 'scheduled',
    start_time: '11:00:00',
    deleted_at: null,
    judge_assignments: [],
  },
];

const TRIAL = {
  id: TRIAL_ID,
  showId: SHOW_ID,
  date: '2026-10-03',
  trialNumber: '1',
  plannedStartTime: '08:00:00',
};

/** get_show_judges returns EVERY assignment row, status included — the caller filters. */
const RPC_JUDGE_ROWS = [
  {
    assignment_id: 'a-1',
    person_id: JUDGE_PERSON_ID,
    first_name: 'Test',
    last_name: 'Judge',
    trial_id: TRIAL_ID,
    class_id: 'class-interior-advanced',
    status: 'confirmed',
  },
  {
    assignment_id: 'a-2',
    person_id: 'person-invited-judge',
    first_name: 'Invited',
    last_name: 'Judge',
    trial_id: TRIAL_ID,
    class_id: 'class-buried-master',
    status: 'invited',
  },
];

interface QueryContext {
  table: string;
  select: string;
  filters: Array<[string, ...unknown[]]>;
}

function filterValue(ctx: QueryContext, method: string, column: string): unknown {
  return ctx.filters.find(f => f[0] === method && f[1] === column)?.[2];
}

/** Resolves one PostgREST call. Every shape the timeline read can issue is enumerated here. */
function resolveQuery(ctx: QueryContext): { data: unknown; error: unknown; count?: number } {
  if (ctx.table === 'entries') {
    return { data: null, error: null, count: 4 };
  }
  if (ctx.table === 'trials' && ctx.select.includes('classes')) {
    // Cold PostgREST path: trials with their nested classes.
    return {
      data: [
        {
          id: TRIAL.id,
          date: TRIAL.date,
          trial_number: TRIAL.trialNumber,
          planned_start_time: TRIAL.plannedStartTime,
          classes: RESTRICTED_CLASS_ROWS,
        },
      ],
      error: null,
    };
  }
  if (ctx.table === 'trials') {
    const requested = (filterValue(ctx, 'in', 'id') as string[] | undefined) ?? [TRIAL_ID];
    return { data: requested.map(id => ({ id, show_id: SHOW_ID })), error: null };
  }
  throw new Error(`unexpected query on ${ctx.table} (${ctx.select})`);
}

function makeQueryBuilder(table: string): Record<string, unknown> {
  const ctx: QueryContext = { table, select: '', filters: [] };
  const builder: Record<string, unknown> = {};
  const chain =
    (method: string) =>
    (...args: unknown[]) => {
      if (method === 'select') ctx.select = String(args[0] ?? '');
      ctx.filters.push([method, ...args]);
      return builder;
    };
  for (const method of ['select', 'eq', 'in', 'is', 'gt', 'not', 'order', 'limit']) {
    builder[method] = chain(method);
  }
  const settle = () => Promise.resolve(resolveQuery(ctx));
  builder.maybeSingle = () =>
    settle().then(result => ({
      ...result,
      data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
    }));
  builder.single = builder.maybeSingle;
  builder.then = (onFulfilled: unknown, onRejected: unknown) =>
    settle().then(onFulfilled as never, onRejected as never);
  return builder;
}

/** Runs the sync's enrichment + mapper exactly as ReplicatedClassesTable does. */
async function hydrateReplicatedClasses() {
  const judgeByClassId = await resolveJudgeNamesForClassRows(RESTRICTED_CLASS_ROWS);
  return RESTRICTED_CLASS_ROWS.map(row =>
    rowToClass({ ...row, _judge: judgeByClassId.get(row.id) } as never)
  );
}

function stubWarmStores(classes: Awaited<ReturnType<typeof hydrateReplicatedClasses>>) {
  vi.spyOn(replicatedTrialsTable, 'getTrialsByShow').mockResolvedValue([TRIAL] as never);
  vi.spyOn(replicatedClassesTable, 'getClassesByTrial').mockResolvedValue(classes as never);
  vi.spyOn(replicatedEntriesTable, 'getEntriesByShow').mockResolvedValue(
    RESTRICTED_CLASS_ROWS.map(cls => ({ id: `entry-${cls.id}`, classId: cls.id })) as never
  );
  vi.spyOn(replicatedEntriesTable, 'getSyncMetadata').mockResolvedValue({
    totalRows: RESTRICTED_CLASS_ROWS.length,
  } as never);
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockFrom.mockImplementation((table: string) => makeQueryBuilder(table));
  mockRpc.mockImplementation(async (name: string) => {
    if (name === 'get_show_judges') return { data: RPC_JUDGE_ROWS, error: null };
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  });
});

describe('MYK9-494 — warm replication path supplies the confirmed judge', () => {
  it('maps the restricted transport shape to a named judge, pinned to the assigned person', async () => {
    const classes = await hydrateReplicatedClasses();
    const interior = classes.find(cls => cls.id === 'class-interior-advanced');

    expect(interior?.judgeName).toBe('Test Judge');
    expect(interior?.judgeId).toBe(JUDGE_PERSON_ID);
    expect(interior?.judgeFirstName).toBe('Test');
    expect(interior?.judgeLastName).toBe('Judge');

    // An invited assignment must never name a judge on a running order.
    expect(classes.find(cls => cls.id === 'class-buried-master')?.judgeName).toBeUndefined();
    expect(classes.find(cls => cls.id === 'class-container-novice')?.judgeName).toBeUndefined();
  });

  it('never embeds people — the RPC is the only name source', async () => {
    await hydrateReplicatedClasses();
    expect(mockRpc).toHaveBeenCalledWith('get_show_judges', { p_show_id: SHOW_ID });
  });

  it('returns timeline rows carrying the judge name parts', async () => {
    stubWarmStores(await hydrateReplicatedClasses());

    const { data, error } = await getShowScheduleTimelineRows(SHOW_ID);

    expect(error).toBeNull();
    const interior = data.find(row => row.classId === 'class-interior-advanced');
    expect(interior).toMatchObject({
      judgePersonId: JUDGE_PERSON_ID,
      judgeFirstName: 'Test',
      judgeLastName: 'Judge',
    });
    expect(data.find(row => row.classId === 'class-container-novice')).toMatchObject({
      judgePersonId: null,
      judgeFirstName: null,
      judgeLastName: null,
    });
  });

  it('keeps the name on a cold offline warm start, with the RPC unreachable', async () => {
    // Hydrate while online, then take the network away: the name is persisted on the local row.
    const classes = await hydrateReplicatedClasses();
    stubWarmStores(classes);
    mockRpc.mockRejectedValue(new Error('offline'));

    const { data } = await getShowScheduleTimelineRows(SHOW_ID);

    expect(data.find(row => row.classId === 'class-interior-advanced')).toMatchObject({
      judgeFirstName: 'Test',
      judgeLastName: 'Judge',
    });
  });
});

describe('MYK9-494 — cold PostgREST path supplies the confirmed judge', () => {
  beforeEach(() => {
    // A browser that has never hydrated this show: the replication read throws, so the
    // timeline falls back to PostgREST.
    vi.spyOn(replicatedTrialsTable, 'getTrialsByShow').mockResolvedValue([TRIAL] as never);
    vi.spyOn(replicatedEntriesTable, 'getEntriesByShow').mockResolvedValue([] as never);
    vi.spyOn(replicatedEntriesTable, 'getSyncMetadata').mockResolvedValue(undefined as never);
  });

  it('resolves names through get_show_judges, not a people embed', async () => {
    const { data, error } = await getShowScheduleTimelineRows(SHOW_ID);

    expect(error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('get_show_judges', { p_show_id: SHOW_ID });
    expect(data.find(row => row.classId === 'class-interior-advanced')).toMatchObject({
      judgePersonId: JUDGE_PERSON_ID,
      judgeFirstName: 'Test',
      judgeLastName: 'Judge',
    });
    expect(data.find(row => row.classId === 'class-buried-master')).toMatchObject({
      judgeFirstName: null,
      judgeLastName: null,
    });
    expect(data.find(row => row.classId === 'class-container-novice')).toMatchObject({
      judgeFirstName: null,
      judgeLastName: null,
    });
  });
});

describe('MYK9-494 — the exhibitor schedule renders the judge', () => {
  it('renders the confirmed judge and keeps TBD only where nobody is confirmed', async () => {
    stubWarmStores(await hydrateReplicatedClasses());

    render(<CompactScheduleTimeline showId={SHOW_ID} />);

    expect(await screen.findByText('Test Judge')).toBeInTheDocument();
    // Buried Master (invited only) and Container Novice A (unassigned) stay TBD.
    expect(screen.getAllByText('Judge TBD')).toHaveLength(2);
    expect(screen.queryByText('Invited Judge')).not.toBeInTheDocument();
  });
});
