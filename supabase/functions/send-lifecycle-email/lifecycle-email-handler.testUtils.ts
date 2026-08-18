import { vi } from 'vitest';

type Row = Record<string, unknown>;

function makeQuery(
  table: string,
  rows: Row[],
  calls: Array<{ table: string; action: string; value?: unknown }>
) {
  let resultRows = [...rows];
  let inserted: unknown;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      resultRows = resultRows.filter(row => row[column] === value);
      return query;
    }),
    or: vi.fn(() => query),
    in: vi.fn((column: string, values: readonly unknown[]) => {
      resultRows = resultRows.filter(row => values.includes(row[column]));
      return query;
    }),
    order: vi.fn((column: string, options?: { ascending?: boolean }) => {
      const direction = options?.ascending === false ? -1 : 1;
      resultRows = [...resultRows].sort((left, right) => {
        const leftValue = String(left[column] ?? '');
        const rightValue = String(right[column] ?? '');
        return leftValue.localeCompare(rightValue) * direction;
      });
      return query;
    }),
    insert: vi.fn((value: unknown) => {
      inserted = value;
      calls.push({ table, action: 'insert', value });
      return query;
    }),
    update: vi.fn((value: unknown) => {
      calls.push({ table, action: 'update', value });
      return query;
    }),
    single: vi.fn(async () => {
      if (table === 'email_log' && inserted) return { data: { id: 'email-log-1' }, error: null };
      if (table === 'show_lifecycle_email_jobs' && inserted) {
        if ((inserted as Row).idempotency_key === 'duplicate') {
          return { data: null, error: { message: 'duplicate key value', code: '23505' } };
        }
        return { data: { id: 'inserted-job-1' }, error: null };
      }
      return { data: resultRows[0] ?? null, error: null };
    }),
    // Mirrors `PromiseLike.then` exactly — optional params (its `onfulfilled`
    // admits `undefined`) and generic in the result, so the fake is assignable
    // to the handler's `Query extends PromiseLike<QueryResult>`.
    then: <TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
      resolve?:
        ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> =>
      Promise.resolve({ data: resultRows, error: null }).then(resolve, reject),
  };
  return query;
}

export function makeSupabase(tables: Record<string, Row[]>) {
  const calls: Array<{ table: string; action: string; value?: unknown }> = [];
  return {
    calls,
    supabase: {
      from: vi.fn((table: string) => makeQuery(table, tables[table] ?? [], calls)),
    },
  };
}

export const readyJob = {
  id: 'job-1',
  show_id: 'show-1',
  step_type: 'accepted',
  status: 'ready',
  recipient_email: 'jamie@example.com',
  recipient_name: 'Jamie',
  subject: 'Entry accepted',
  body: 'You are accepted.',
  secretary_note: null,
  rendered_subject: null,
  rendered_body: null,
  rendered_secretary_note: null,
  email_log_id: null,
  idempotency_key: 'idem-job-1',
};

export function baseTables(overrides: Record<string, Row[]> = {}) {
  return {
    shows: [{ id: 'show-1', club_id: 'club-1' }],
    user_roles: [
      {
        auth_user_id: 'secretary-1',
        is_active: true,
        club_id: 'club-1',
        show_id: null,
        roles: { name: 'trial_secretary' },
      },
    ],
    show_lifecycle_email_steps: [{ id: 'step-1', show_id: 'show-1', step_type: 'accepted' }],
    show_lifecycle_email_jobs: [readyJob],
    entries: [
      {
        id: 'entry-1',
        show_id: 'show-1',
        registration_id: 'reg-1',
        dog_id: 'dog-1',
        handler: 'Jamie Handler',
      },
    ],
    dogs: [{ id: 'dog-1', owner_id: 'person-1' }],
    people: [
      {
        id: 'person-1',
        first_name: 'Jamie',
        last_name: 'Handler',
        email: 'jamie@example.com',
      },
    ],
    ...overrides,
  };
}
