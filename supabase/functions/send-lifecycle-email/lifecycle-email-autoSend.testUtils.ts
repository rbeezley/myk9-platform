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
  options: { liveEntryPeople?: string[] } = {}
) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(initial).map(([name, rows]) => [name, rows.map(row => ({ ...row }))])
  );
  // The step is switched on unless a test says otherwise.
  tables.show_lifecycle_email_steps ??= [
    { show_id: 'show-1', step_type: 'show_changed', is_enabled: true },
  ];
  let nextId = 0;
  let nextAttempt = 0;

  function makeQuery(table: string) {
    tables[table] ??= [];
    const filters: Array<[string, unknown]> = [];
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    const matching = () => tables[table].filter(row => filters.every(([c, v]) => row[c] === v));
    const exec = (): Row[] => {
      if (op === 'insert') {
        const row = { id: `${table}-${(nextId += 1)}`, ...payload };
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
      in: vi.fn(() => query),
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
      maybeSingle: vi.fn(async () => ({ data: exec()[0] ?? null, error: null })),
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
      const claimed = tables[JOBS].filter(
        job => job.status === 'ready' && job.auto_send && !job.attempt_id
      ).map(job => {
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
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  });

  return { tables, supabase: { from: vi.fn(makeQuery), rpc }, rpc };
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
    recipient_person_id: 'person-1',
    recipient_email: 'jamie@example.com',
    recipient_name: 'Jamie Handler',
    idempotency_key: 'show-lifecycle-email:show-1:show_changed:person:person-1:abc',
    ...overrides,
  };
}
