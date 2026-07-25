import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-93 regression guard for anon's effective grants on public tables.
 *
 * `publicResultsReleaseGateRlsContract.test.ts` pins migration 20260616120000 in
 * isolation, so it stayed green while a LATER migration (20260725160000) undid the
 * invariant it protects — first with `REVOKE ALL ON ALL TABLES ... FROM anon`, which
 * silently drops column grants, then with a table-wide `GRANT SELECT ON public.entries
 * TO anon`. Anon could read total_score, payment_status and stripe_payment_intent_id.
 *
 * The same class of bug then shipped a second time on the embed side: PostgREST needs
 * table-level SELECT on every EMBEDDED relation, so a missing dogs/people column grant
 * is a hard 42501 that fails the whole anon request.
 *
 * So this file replays EVERY migration in apply order, folding grants and revokes, and
 * asserts the final effective state. Deliberately conservative: anything it cannot prove
 * safe, it treats as unsafe.
 */
const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations');

/**
 * The exact 14-column security boundary established by the release gate
 * (20260616120000) and restored by 20260725170000. Asserted as an exact set: a
 * denylist can only catch the sensitive columns someone remembered to enumerate.
 */
const ANON_ENTRY_COLUMN_ALLOWLIST = [
  'id',
  'class_id',
  'trial_id',
  'show_id',
  'dog_id',
  'armband',
  'handler',
  'run_order',
  'is_in_ring',
  'is_scored',
  'check_in_status',
  'entry_status',
  'jump_height',
  'created_at',
];

/** The scored/PII columns anon must never be able to read directly. */
const FORBIDDEN_ANON_COLUMNS = [
  'final_placement',
  'result_status',
  'search_time_seconds',
  'total_faults',
  'total_score',
  'special_requests',
  'payment_status',
  'payment_method',
  'entry_fee',
  'stripe_payment_intent_id',
  'judge_notes',
];

/** Grantees through which anon receives privileges: itself, or the PUBLIC pseudo-role. */
const ANON_GRANTEE = String.raw`(?:anon|PUBLIC)`;
/** Optional `TABLE` keyword and optional `public.` schema qualifier. */
const TABLE_REF = (table: string) => String.raw`(?:TABLE\s+)?(?:public\.)?${table}`;
/** A privilege list containing SELECT or ALL, e.g. `SELECT`, `ALL PRIVILEGES`, `INSERT, SELECT`. */
const SELECTISH = String.raw`(?:[A-Z]+\s*,\s*)*(?:SELECT|ALL)(?:\s+PRIVILEGES)?(?:\s*,\s*[A-Z]+)*`;

type TableGrant = { tableWide: boolean; columns: Set<string> };

/**
 * Split a migration into analysable statements.
 *
 * Two things matter for correctness here:
 *  - `EXECUTE '...'` payloads inside DO blocks are real statements. This repo's own
 *    migrations use that idiom for ALTER DEFAULT PRIVILEGES, so a future migration could
 *    plausibly grant from inside one. They are extracted and analysed.
 *  - Everywhere else, single-quoted literals are prose, not statements. A COMMENT ON
 *    ... 'never GRANT SELECT ON public.entries TO anon' must not read as a grant.
 */
function statementsOf(sql: string): string[] {
  const withoutLineComments = sql.replace(/--[^\n]*/g, '');

  const executed: string[] = [];
  for (const match of withoutLineComments.matchAll(/\bEXECUTE\s+((?:'(?:[^']|'')*'\s*)+)/gi)) {
    // Concatenate the adjacent string literals making up one EXECUTE payload.
    const payload = [...match[1].matchAll(/'((?:[^']|'')*)'/g)]
      .map(m => m[1].replace(/''/g, "'"))
      .join('');
    if (payload.trim()) executed.push(payload);
  }

  const plain = withoutLineComments
    .replace(/'(?:[^']|'')*'/g, "''")
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);

  return [...plain, ...executed].map(s => s.replace(/\s+/g, ' '));
}

/** Replay every migration in filename (= apply) order and fold anon's effective grants. */
function foldAnonGrants(tables: string[]): {
  state: Map<string, TableGrant>;
  tableWideSources: Map<string, string[]>;
} {
  const state = new Map<string, TableGrant>(
    tables.map(t => [t, { tableWide: false, columns: new Set<string>() }])
  );
  const tableWideSources = new Map<string, string[]>(tables.map(t => [t, []]));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    for (const statement of statementsOf(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'))) {
      // Blanket revoke: drops column grants too. This is the trap that caused the bug.
      if (
        new RegExp(
          String.raw`REVOKE\s+.*\bON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM\s+[^;]*\b${ANON_GRANTEE}\b`,
          'i'
        ).test(statement)
      ) {
        for (const entry of state.values()) {
          entry.tableWide = false;
          entry.columns.clear();
        }
        continue;
      }

      for (const table of tables) {
        const entry = state.get(table);
        if (!entry) continue;

        // Any revoke touching this table resets it. Conservative: a column-scoped revoke
        // is treated as clearing everything, which can only make the test stricter.
        if (
          new RegExp(
            String.raw`REVOKE\s+.*\bON\s+${TABLE_REF(table)}\s+FROM\s+[^;]*\b${ANON_GRANTEE}\b`,
            'i'
          ).test(statement)
        ) {
          entry.tableWide = false;
          entry.columns.clear();
          continue;
        }

        const columnGrant = statement.match(
          new RegExp(
            String.raw`GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+${TABLE_REF(table)}\s+TO\s+[^;]*\b${ANON_GRANTEE}\b`,
            'i'
          )
        );
        if (columnGrant) {
          // Postgres UNIONs column grants; it does not replace them.
          for (const column of columnGrant[1].split(',')) {
            const trimmed = column.trim();
            if (trimmed) entry.columns.add(trimmed);
          }
          continue;
        }

        // Table-wide, including a multi-privilege list, `ON TABLE`, an unqualified name,
        // a schema-wide grant, or inheritance via PUBLIC. Persists until a revoke —
        // adding a column grant afterwards does NOT narrow an existing table-wide grant.
        if (
          new RegExp(
            String.raw`GRANT\s+${SELECTISH}\s+ON\s+${TABLE_REF(table)}\s+TO\s+[^;]*\b${ANON_GRANTEE}\b`,
            'i'
          ).test(statement) ||
          new RegExp(
            String.raw`GRANT\s+${SELECTISH}\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+TO\s+[^;]*\b${ANON_GRANTEE}\b`,
            'i'
          ).test(statement)
        ) {
          entry.tableWide = true;
          tableWideSources.get(table)?.push(file);
        }
      }
    }
  }

  return { state, tableWideSources };
}

/** The final `CREATE POLICY <name> ON public.<table>` text across all migrations. */
function finalPolicyDefinition(policy: string, table: string): string | null {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let latest: string | null = null;
  const pattern = new RegExp(
    String.raw`CREATE\s+POLICY\s+"?${policy}"?\s+ON\s+public\.${table}\b[^;]*`,
    'gi'
  );
  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8').replace(/--[^\n]*/g, '');
    for (const match of sql.matchAll(pattern)) latest = match[0].replace(/\s+/g, ' ');
  }
  return latest;
}

const TRACKED = ['entries', 'dogs', 'people'];
const { state, tableWideSources } = foldAnonGrants(TRACKED);
const entries = state.get('entries');

describe('anon grant contract on public.entries', () => {
  it('leaves anon with a column-scoped grant, never a table-wide one', () => {
    expect(
      entries?.tableWide,
      `anon must not hold a table-wide SELECT on public.entries. ` +
        `Table-wide grants seen in: ${tableWideSources.get('entries')?.join(', ') || '(none)'}`
    ).toBe(false);
    expect(entries && entries.columns.size > 0, 'anon must retain the board column grant').toBe(
      true
    );
  });

  it('matches the release gate allowlist EXACTLY — no column added, none dropped', () => {
    expect([...(entries?.columns ?? [])].sort()).toEqual([...ANON_ENTRY_COLUMN_ALLOWLIST].sort());
  });

  it('excludes every known scored/PII column (redundant with the exact check, kept explicit)', () => {
    for (const column of FORBIDDEN_ANON_COLUMNS) {
      expect([...(entries?.columns ?? [])], `anon must not reach entries.${column}`).not.toContain(
        column
      );
    }
  });
});

/**
 * The other half of the MYK9-93 regression. These grants convey no data today: dogs_select
 * and people_select are TO authenticated, so anon matches zero rows. They exist only so an
 * anon PostgREST embed resolves to null instead of 42501.
 */
describe('anon embed grants on dogs / people', () => {
  it('covers every dogs column embedded by the public TV board', () => {
    // services/database/tv-display/postgrest.ts — entries(... dogs(...))
    const dogs = [...(state.get('dogs')?.columns ?? [])];
    for (const column of ['id', 'name', 'call_name', 'breed', 'image_url']) {
      expect(dogs, `dogs.${column} must stay granted or the TV board 42501s`).toContain(column);
    }
  });

  it('covers every people column embedded by the public show pages', () => {
    // hooks/queries/useShowJudges.ts — people!inner(id, first_name, last_name)
    // services/database/shows/reads.postgrest.ts — judge:people!...(id, first_name,
    // last_name, email). `email` was missed on the first repair and 42501'd /shows/:id.
    const people = [...(state.get('people')?.columns ?? [])];
    for (const column of ['id', 'first_name', 'last_name', 'email']) {
      expect(people, `people.${column} must stay granted or /shows/:id 42501s`).toContain(column);
    }
  });

  it('keeps those grants column-scoped — never table-wide', () => {
    for (const table of ['dogs', 'people']) {
      expect(
        state.get(table)?.tableWide,
        `${table} must never carry a table-wide anon grant. Seen in: ` +
          `${tableWideSources.get(table)?.join(', ') || '(none)'}`
      ).toBe(false);
    }
  });

  /**
   * The column grants above are only safe because RLS admits no anon rows. If either
   * policy is ever recreated admitting anon or PUBLIC, these grants become a live leak —
   * judge email addresses, dog names and photos. Pin the policies themselves.
   */
  it('keeps dogs_select and people_select restricted to authenticated', () => {
    for (const [policy, table] of [
      ['dogs_select', 'dogs'],
      ['people_select', 'people'],
    ]) {
      const definition = finalPolicyDefinition(policy, table);
      expect(definition, `${policy} must be defined by a migration`).toBeTruthy();

      // Only the role list directly after TO — not the whole statement, or the
      // `public.` schema prefix inside USING would read as the PUBLIC role.
      const roleClause = definition?.match(
        /\bTO\s+([A-Za-z0-9_", ]+?)\s*(?:USING|WITH\s+CHECK|$)/i
      );
      expect(roleClause, `${policy} must carry an explicit TO clause`).toBeTruthy();

      const roles = (roleClause?.[1] ?? '')
        .split(',')
        .map(r => r.trim().replace(/"/g, '').toLowerCase())
        .filter(Boolean);
      expect(roles, `${policy} must be TO authenticated — anon must match zero rows`).toEqual([
        'authenticated',
      ]);
    }
  });
});
