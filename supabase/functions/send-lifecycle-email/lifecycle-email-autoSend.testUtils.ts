import { vi } from 'vitest';

type Row = Record<string, unknown>;

const JOBS = 'show_lifecycle_email_jobs';

/**
 * An in-memory Supabase fake whose writes stick, with the two RPCs the automatic drain
 * calls: `claim_due_auto_email_jobs` (ready jobs with no live lease, a fresh attempt_id
 * minted per claim, like the SQL function) and `show_person_has_live_entry`.
 */
export function makeAutoSendSupabase(
  initial: Record<string, Row[]>,
  options: { liveEntryPeople?: string[]; liveEntryClasses?: Record<string, string[]> } = {}
) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(initial).map(([name, rows]) => [name, rows.map(row => ({ ...row }))])
  );
  // The step is switched on unless a test says otherwise.
  tables.show_lifecycle_email_steps ??= [
    { show_id: 'show-1', step_type: 'show_changed', is_enabled: true },
    { show_id: 'show-1', step_type: 'judge_changed', is_enabled: true },
  ];
  // person-1's current address, unless a test says otherwise.
  tables.people ??= [];
  if (!tables.people.some(person => person.id === 'person-1')) {
    tables.people.push({ id: 'person-1', email: 'jamie@example.com', deleted_at: null });
  }
  // The fake's wall clock: attempts are stamped with it and the claim honours it.
  const clock = { at: new Date('2026-11-17T12:00:00.000Z') };
  let nextId = 0;
  let nextAttempt = 0;

  function makeQuery(table: string) {
    tables[table] ??= [];
    const filters: Array<[string, unknown]> = [];
    const inFilters: Array<[string, readonly unknown[]]> = [];
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    const matching = () =>
      tables[table].filter(
        row =>
          filters.every(([c, v]) => row[c] === v) &&
          inFilters.every(([c, values]) => values.includes(row[c]))
      );
    const exec = (): Row[] => {
      if (op === 'insert') {
        const row = {
          id: `${table}-${(nextId += 1)}`,
          ...(table === 'show_lifecycle_email_attempts'
            ? { attempted_at: clock.at.toISOString() }
            : {}),
          ...payload,
        };
        tables[table].push(row);
        return [row];
      }
      if (op === 'update') {
        const rows = matching();
        for (const row of rows) Object.assign(row, payload);
        return rows;
      }
      return matching();
    };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      }),
      or: vi.fn(() => query),
      in: vi.fn((column: string, values: readonly unknown[]) => {
        inFilters.push([column, values]);
        return query;
      }),
      order: vi.fn(() => query),
      insert: vi.fn((value: Row) => {
        op = 'insert';
        payload = value;
        return query;
      }),
      update: vi.fn((value: Row) => {
        op = 'update';
        payload = value;
        return query;
      }),
      single: vi.fn(async () => {
        const row = exec()[0];
        return row
          ? { data: row, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      }),
      then: <TResult1 = { data: Row[]; error: null }, TResult2 = never>(
        resolve?:
          ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ): Promise<TResult1 | TResult2> =>
        Promise.resolve({ data: exec(), error: null }).then(resolve, reject),
    };
    return query;
  }

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'claim_due_auto_email_jobs') {
      const at = clock.at.toISOString();
      const claimed = tables[JOBS].filter(
        job =>
          job.status === 'ready' &&
          job.auto_send &&
          !job.attempt_id &&
          String(job.due_at) <= at &&
          (!job.claimed_until || String(job.claimed_until) <= at)
      )
        .slice(0, Number(args.p_limit))
        .map(job => {
          job.attempt_id = `attempt-${(nextAttempt += 1)}`;
          job.claimed_until = args.p_lease_until;
          return { ...job, job_id: job.id };
        });
      return { data: claimed, error: null };
    }
    if (fn === 'show_person_has_live_entry') {
      return {
        data: (options.liveEntryPeople ?? []).includes(String(args.p_person_id)),
        error: null,
      };
    }
    if (fn === 'person_live_entry_class_ids') {
      return { data: options.liveEntryClasses?.[String(args.p_person_id)] ?? [], error: null };
    }
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  });

  return { tables, clock, supabase: { from: vi.fn(makeQuery), rpc }, rpc };
}

export const publishedShow = {
  id: 'show-1',
  name: 'Spring Scent Trial',
  status: 'published',
  deleted_at: null,
  venue_name: 'Riverside Barn',
  address: '12 River Road',
  city: 'Fairfield',
  state: 'OH',
  zip_code: '45014',
  trials: [
    { name: 'Saturday Trial', date: '2026-11-21', deleted_at: null },
    { name: 'Sunday Trial', date: '2026-11-22', deleted_at: null },
  ],
};

export function autoJob(overrides: Row = {}): Row {
  return {
    id: 'job-1',
    show_id: 'show-1',
    step_type: 'show_changed',
    status: 'ready',
    auto_send: true,
    attempt_id: null,
    claimed_until: null,
    due_at: '2026-11-17T11:55:00.000Z',
    recipient_person_id: 'person-1',
    recipient_email: 'jamie@example.com',
    recipient_name: 'Jamie Handler',
    idempotency_key: 'show-lifecycle-email:show-1:show_changed:person:person-1:abc',
    ...overrides,
  };
}

/** A judge_changed job: person-1 was entered where the judge changed, per `judgeChanges`. */
export function judgeChangedJob(overrides: Row = {}): Row {
  return autoJob({
    step_type: 'judge_changed',
    idempotency_key: 'show-lifecycle-email:show-1:judge_changed:person:person-1:abc',
    judge_changes: { 'class-1': 'judge-old' },
    ...overrides,
  });
}

export function judgeChangedTables(registryId: string | null = 'AKC'): Record<string, Row[]> {
  return {
    shows: [publishedShow],
    show_lifecycle_email_jobs: [judgeChangedJob()],
    classes: [
      {
        id: 'class-1',
        name: 'Container Novice A',
        element: 'Container',
        level: 'Novice',
        section: 'A',
        deleted_at: null,
        trials: {
          name: 'Saturday Trial',
          date: '2026-11-21',
          registry_id: registryId,
          timezone: 'America/New_York',
          deleted_at: null,
        },
      },
    ],
    judge_assignments: [
      {
        class_id: 'class-1',
        status: 'confirmed',
        person_id: 'judge-new',
        person: { first_name: 'Bea', last_name: 'Newjudge', deleted_at: null },
      },
    ],
    people: [{ id: 'judge-old', first_name: 'Olly', last_name: 'Oldjudge' }],
  };
}
