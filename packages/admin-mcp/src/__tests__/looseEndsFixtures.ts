/**
 * In-memory Supabase fake for the loose-ends diagnostic: it APPLIES the filters
 * the code asks for (eq / is / in / gte / lte / order / range), so a fixture row
 * only appears when the real query would have returned it.
 */
import type { AdminMcpConfig } from '../config';
import type { AdminSupabaseClient } from '../db/supabaseAdmin';
import type { ToolContext } from '../tools/index';

export const CONFIG: AdminMcpConfig = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseServiceRoleKey: 'service-role-key',
  appBaseUrl: 'https://app.myk9show.com',
  envLabel: 'staging',
  defaultLimit: 25,
  maxLimit: 50,
};

type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

export function makeCtx(
  tables: Tables,
  opts: { failTable?: string; config?: AdminMcpConfig } = {}
): ToolContext & { selects: string[] } {
  const selects: string[] = [];
  const supabase = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const sorts: string[] = [];
      let range: [number, number] | null = null;
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      const run = () => {
        if (opts.failTable === table) return { data: null, error: { message: 'boom' } };
        let rows = (tables[table] ?? []).filter(row => filters.every(f => f(row)));
        for (const col of [...sorts].reverse()) {
          rows = [...rows].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')));
        }
        if (range) rows = rows.slice(range[0], range[1] + 1);
        // PostgREST max_rows (supabase/config.toml): a response never exceeds 1000 rows.
        rows = rows.slice(0, 1000);
        return { data: rows, error: null };
      };
      builder.select = (columns: string) => {
        selects.push(`${table}: ${columns}`);
        return builder;
      };
      builder.eq = (col: string, val: unknown) => (filters.push(r => r[col] === val), builder);
      builder.is = (col: string, val: unknown) => (
        filters.push(r => (r[col] ?? null) === val),
        builder
      );
      builder.in = (col: string, vals: unknown[]) => (
        filters.push(r => vals.includes(r[col])),
        builder
      );
      builder.gte = (col: string, val: string) => (
        filters.push(r => String(r[col]) >= val),
        builder
      );
      builder.lte = (col: string, val: string) => (
        filters.push(r => String(r[col]) <= val),
        builder
      );
      builder.order = (col: string) => (sorts.push(col), builder);
      builder.range = (from: number, to: number) => ((range = [from, to]), builder);
      builder.returns = self;
      builder.maybeSingle = () => {
        const result = run();
        return Promise.resolve({ data: result.data?.[0] ?? null, error: result.error });
      };
      builder.then = (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject);
      return builder;
    },
  };
  return {
    config: opts.config ?? CONFIG,
    supabase: supabase as unknown as AdminSupabaseClient,
    selects,
  };
}

export const SHOW_ID = '6349d047-34fe-4307-b29a-c1ae6d7750c7';
export const OTHER_SHOW = 'cccccccc-3333-4333-8333-cccccccccccc';

const entry = (id: string, over: Row): Row => ({
  id,
  show_id: SHOW_ID,
  dog_id: null,
  class_id: null,
  registration_id: 'en1',
  handler_id: 'pAnn',
  entry_status: 'confirmed',
  confirmation_email_status: 'sent',
  created_at: '2026-10-01T10:00:00Z',
  deleted_at: null,
  ...over,
});
const dog = (id: string, name: string, over: Row): Row => ({
  id,
  call_name: name,
  owner_id: 'pAnn',
  created_at: '2026-09-01T00:00:00Z',
  created_by: null,
  created_from_show_id: null,
  deleted_at: null,
  ...over,
});
const person = (id: string, first: string, over: Row): Row => ({
  id,
  first_name: first,
  last_name: 'Tester',
  email: `${first.toLowerCase()}@example.com`,
  created_at: '2026-09-01T00:00:00Z',
  created_by: null,
  created_from_show_id: null,
  auth_user_id: null,
  deleted_at: null,
  ...over,
});

/** One show with every loose-end category and the decoys that must NOT be reported. */
export function looseEndsTables(): Tables {
  const SESSION = '2026-10-01T10:';
  return {
    shows: [{ id: SHOW_ID, name: 'Fall Trial' }],
    classes: [
      { id: 'c1', name: 'Novice Interior', class_number: '101' },
      { id: 'c2', name: 'Open Exterior', class_number: '202' },
      { id: 'c3', name: 'Master Vehicle', class_number: '303' },
    ],
    people: [
      person('pAnn', 'Ann', { created_at: '2026-08-01T00:00:00Z' }),
      // attributed, never entered
      person('pBob', 'Bob', {
        created_from_show_id: SHOW_ID,
        created_by: 'auth-1',
        created_at: `${SESSION}05:00Z`,
      }),
      // attributed to ANOTHER show: not this show's loose end
      person('pOther', 'Olive', {
        created_from_show_id: OTHER_SHOW,
        created_at: `${SESSION}06:00Z`,
      }),
      // guess candidates
      person('pZed', 'Zed', { created_at: `${SESSION}12:00Z` }),
      person('pAcct', 'Acct', { created_at: `${SESSION}13:00Z`, auth_user_id: 'auth-9' }),
      person('pOld', 'Olga', { created_at: '2026-01-01T00:00:00Z' }),
      // accountless, in the window, but in use at ANOTHER show: not abandoned
      person('pHandler', 'Hank', { created_at: `${SESSION}17:00Z` }),
      person('pOwner', 'Owen', { created_at: `${SESSION}18:00Z` }),
    ],
    dogs: [
      dog('dA', 'Anchor', {}),
      dog('dB', 'Berkeley', {
        created_from_show_id: SHOW_ID,
        created_by: 'auth-1',
        created_at: `${SESSION}07:00Z`,
      }),
      dog('dSoft', 'Softie', {
        created_from_show_id: SHOW_ID,
        created_at: `${SESSION}08:00Z`,
        deleted_at: '2026-10-02T00:00:00Z',
      }),
      dog('dOtherShow', 'Elsewhere', {
        created_from_show_id: OTHER_SHOW,
        created_at: `${SESSION}09:00Z`,
      }),
      // guess candidates: created in the session, no attribution
      dog('dLiddle', 'Liddle', { owner_id: 'pZed', created_at: '2026-10-01T10:40:00Z' }),
      dog('dUsed', 'Used', { created_at: `${SESSION}15:00Z` }),
      dog('dFar', 'Faraway', { created_at: '2026-10-01T14:00:00Z' }),
      dog('dEnteredHere', 'Veteran', { created_at: `${SESSION}16:00Z` }),
      dog('dOwned', 'Owned', { owner_id: 'pOwner', created_at: '2026-08-01T00:00:00Z' }),
    ],
    enrollments: [
      {
        id: 'en1',
        show_id: SHOW_ID,
        confirmation_number: 'C-1',
        handler_id: 'pAnn',
        payment_status: 'paid',
        created_at: `${SESSION}00:00Z`,
      },
      {
        id: 'en2',
        show_id: SHOW_ID,
        confirmation_number: 'C-2',
        handler_id: 'pBob',
        payment_status: 'pending',
        created_at: `${SESSION}01:00Z`,
      },
    ],
    entries: [
      entry('e1', { dog_id: 'dA', class_id: 'c1' }),
      // duplicate of e1
      entry('e2', {
        dog_id: 'dA',
        class_id: 'c1',
        entry_status: 'paid',
        created_at: `${SESSION}30:00Z`,
      }),
      // no enrollment + draft
      entry('e3', { dog_id: 'dA', class_id: 'c2', registration_id: null, entry_status: 'draft' }),
      // withdrawn twin of e3: must not make a duplicate
      entry('e5', { dog_id: 'dA', class_id: 'c2', entry_status: 'withdrawn' }),
      entry('e6', { dog_id: 'dEnteredHere', class_id: 'c3', confirmation_email_status: 'failed' }),
      entry('e7', { dog_id: 'dEnteredHere', class_id: 'c1', entry_status: 'pending-payment' }),
      // soft-deleted: dB still has NO live entry
      entry('e8', { dog_id: 'dB', class_id: 'c1', deleted_at: '2026-10-02T00:00:00Z' }),
      // in use at another show: not abandoned
      entry('eX', { show_id: OTHER_SHOW, dog_id: 'dUsed', class_id: 'c1' }),
      entry('eH', { show_id: OTHER_SHOW, dog_id: 'dA', class_id: 'c9', handler_id: 'pHandler' }),
      entry('eO', { show_id: OTHER_SHOW, dog_id: 'dOwned', class_id: 'c9', handler_id: 'pAnn' }),
    ],
  };
}
