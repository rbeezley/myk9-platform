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

/**
 * The scent-work hide secrets anon must never reach on `classes` (MYK9-116).
 *
 * Asserted as a denylist rather than an exact allowlist: unlike `entries`, the anon
 * allowlist on `classes` is "every column except these three", so it grows whenever a
 * genuinely public column is added. What must never drift is the exclusion.
 */
const FORBIDDEN_ANON_CLASS_COLUMNS = ['num_hides', 'has_blank', 'hides_known'];

/**
 * Columns the anon-reachable class readers DO select, so a future migration cannot
 * quietly narrow the allowlist and 42501 the public show pages. Sourced from
 * `services/database/classes/reads.ts` (CLASS_COLUMNS) and
 * `services/database/classes/publicReads.ts` (PUBLIC_CLASS_SELECT), plus the TV board
 * columns in `services/database/tv-display/postgrest.ts`.
 */
const REQUIRED_ANON_CLASS_COLUMNS = [
  'id',
  'trial_id',
  'name',
  'status',
  'start_time',
  'description',
  'class_number',
  'element',
  'level',
  'section',
  'entry_fee',
  'max_entries',
  'jump_heights',
  'display_order',
  'results_released_at',
  'created_at',
  'updated_at',
  'deleted_at',
  'total_entries_count',
  'scored_count',
  'is_scoring_finalized',
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
/** One or more comma-separated table refs: `public.entries`, `TABLE dogs, public.people`. */
const TABLE_LIST = String.raw`(?:TABLE\s+)?[A-Za-z0-9_".]+(?:\s*,\s*[A-Za-z0-9_".]+)*`;

/** Does a captured table list name this table, qualified or not? */
function namesTable(tableList: string, table: string): boolean {
  return tableList
    .replace(/^\s*TABLE\s+/i, '')
    .split(',')
    .map(t => t.trim().replace(/"/g, '').toLowerCase())
    .some(t => t === table || t === `public.${table}`);
}

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
  unmodelled: string[];
} {
  const state = new Map<string, TableGrant>(
    tables.map(t => [t, { tableWide: false, columns: new Set<string>() }])
  );
  const tableWideSources = new Map<string, string[]>(tables.map(t => [t, []]));
  const unmodelled: string[] = [];

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    for (const statement of statementsOf(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'))) {
      let recognised = false;

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
          recognised = true;
          continue;
        }

        // Column-scoped SELECT, anywhere in the privilege list — `GRANT SELECT (a, b)`
        // but also `GRANT UPDATE, SELECT (total_score)`. The table list may name several
        // tables: `GRANT SELECT (a) ON public.entries, public.dogs TO anon`.
        const columnGrant = statement.match(
          new RegExp(
            String.raw`GRANT\s+[^;]*?\bSELECT\s*\(([^)]*)\)[^;]*?\s+ON\s+(${TABLE_LIST})\s+TO\s+[^;]*\b${ANON_GRANTEE}\b`,
            'i'
          )
        );
        if (columnGrant && namesTable(columnGrant[2], table)) {
          // Postgres UNIONs column grants; it does not replace them.
          for (const column of columnGrant[1].split(',')) {
            const trimmed = column.trim();
            if (trimmed) entry.columns.add(trimmed);
          }
          recognised = true;
          continue;
        }

        // Table-wide, including a multi-privilege list, `ON TABLE`, an unqualified name,
        // a multi-table list, a schema-wide grant, or inheritance via PUBLIC. Persists
        // until a revoke — a later column grant does NOT narrow an existing table-wide one.
        const tableWideGrant = statement.match(
          new RegExp(
            String.raw`GRANT\s+${SELECTISH}\s+ON\s+(${TABLE_LIST})\s+TO\s+[^;]*\b${ANON_GRANTEE}\b`,
            'i'
          )
        );
        if (
          (tableWideGrant && namesTable(tableWideGrant[1], table)) ||
          new RegExp(
            String.raw`GRANT\s+${SELECTISH}\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+TO\s+[^;]*\b${ANON_GRANTEE}\b`,
            'i'
          ).test(statement)
        ) {
          entry.tableWide = true;
          tableWideSources.get(table)?.push(file);
          recognised = true;
        }
      }

      // Anything that grants or revokes on a tracked table but matched none of the
      // shapes above is a SQL form this evaluator does not model. Fail loud rather than
      // model it wrong — silent false negatives are exactly how this bug shipped twice.
      // Only statements whose GRANTEE is anon-reachable matter — the role list after
      // TO/FROM, matched with a character class that cannot run past it into a USING
      // clause, so the `public.` schema prefix is never read as the PUBLIC role.
      if (
        /\b(GRANT|REVOKE)\b/i.test(statement) &&
        new RegExp(String.raw`\b(?:public\.)?(?:${tables.join('|')})\b`, 'i').test(statement) &&
        /\b(?:TO|FROM)\s+[A-Za-z0-9_",\s]*\b(?:anon|PUBLIC)\b/i.test(statement) &&
        !recognised
      ) {
        unmodelled.push(`${file}: ${statement.slice(0, 160)}`);
      }
    }
  }

  return { state, tableWideSources, unmodelled };
}

/**
 * The final `CREATE POLICY <name> ON <table>` text across all migrations.
 *
 * The schema qualifier is OPTIONAL: this repo already writes unqualified
 * `CREATE POLICY "dogs_select" ON dogs` (006_rls_policies.sql), so requiring `public.`
 * would silently skip a future migration recreating the policy in that established form.
 * Uses the same statement splitter as the grant fold, so a policy created inside an
 * EXECUTE payload is seen too.
 */
function finalPolicyDefinition(policy: string, table: string): string | null {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let latest: string | null = null;
  const pattern = new RegExp(
    String.raw`(?:CREATE|ALTER)\s+POLICY\s+"?${policy}"?\s+ON\s+(?:public\.)?${table}\b.*`,
    'i'
  );
  for (const file of files) {
    for (const statement of statementsOf(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'))) {
      const match = statement.match(pattern);
      if (match) latest = match[0];
    }
  }
  return latest;
}

/**
 * Every SELECT policy on a table, in apply order — because Postgres ORs permissive
 * policies together. Pinning only `dogs_select` misses a NEW policy like
 * `CREATE POLICY dogs_public ON dogs FOR SELECT TO anon USING (true)`, which would
 * expose the granted columns while the named-policy check stayed green.
 */
function selectPoliciesAdmittingAnon(table: string): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const live = new Map<string, string>();
  for (const file of files) {
    for (const statement of statementsOf(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'))) {
      const dropped = statement.match(
        new RegExp(
          String.raw`DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z0-9_ ]+?)"?\s+ON\s+(?:public\.)?${table}\b`,
          'i'
        )
      );
      if (dropped) {
        live.delete(dropped[1].trim().toLowerCase());
        continue;
      }

      const created = statement.match(
        new RegExp(
          String.raw`CREATE\s+POLICY\s+"?([A-Za-z0-9_ ]+?)"?\s+ON\s+(?:public\.)?${table}\b(.*)`,
          'i'
        )
      );
      if (!created) continue;

      const body = created[2];
      // Only SELECT-capable policies matter: FOR SELECT, FOR ALL, or no FOR clause.
      if (/\bFOR\s+(INSERT|UPDATE|DELETE)\b/i.test(body)) {
        live.delete(created[1].trim().toLowerCase());
        continue;
      }
      live.set(created[1].trim().toLowerCase(), `${created[1].trim()} — ${body.trim()}`);
    }
  }

  return [...live.values()].filter(definition => {
    const roleClause = definition.match(/\bTO\s+([A-Za-z0-9_", ]+?)\s*(?:USING|WITH\s+CHECK|$)/i);
    // No TO clause defaults to the PUBLIC role, which anon inherits.
    if (!roleClause) return true;
    return roleClause[1]
      .split(',')
      .map(r => r.trim().replace(/"/g, '').toLowerCase())
      .some(r => r === 'anon' || r === 'public');
  });
}

const TRACKED = ['entries', 'dogs', 'people', 'classes'];
const { state, tableWideSources, unmodelled } = foldAnonGrants(TRACKED);
const entries = state.get('entries');
const classes = state.get('classes');

describe('the evaluator itself', () => {
  /**
   * This is a regex model of Postgres privilege semantics, not Postgres. Rather than
   * silently mis-modelling a SQL form it does not recognise — which is exactly how this
   * regression shipped twice — it collects them and fails here. If this trips, either
   * teach the evaluator that form or rewrite the statement in a shape it understands.
   */
  it('models every GRANT/REVOKE touching a tracked table', () => {
    expect(
      unmodelled,
      `Unrecognised GRANT/REVOKE on ${TRACKED.join('/')}. The evaluator cannot vouch for ` +
        `these, so it refuses to pass:\n${unmodelled.join('\n')}`
    ).toEqual([]);
  });
});

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
 * MYK9-116 / SA-2026-07-29-01. Unlike dogs/people below, `classes_select` DOES admit anon
 * (published shows are public), so the column grant here is a live data path — the
 * exclusion is the only thing standing between a competitor and the hide count.
 */
describe('anon grant contract on public.classes', () => {
  it('leaves anon with a column-scoped grant, never a table-wide one', () => {
    expect(
      classes?.tableWide,
      `anon must not hold a table-wide SELECT on public.classes — that reaches ` +
        `${FORBIDDEN_ANON_CLASS_COLUMNS.join('/')}. Table-wide grants seen in: ` +
        `${tableWideSources.get('classes')?.join(', ') || '(none)'}`
    ).toBe(false);
    expect(
      classes && classes.columns.size > 0,
      'anon must retain a column grant or every public show page 42501s'
    ).toBe(true);
  });

  it('withholds the scent-work hide secrets', () => {
    for (const column of FORBIDDEN_ANON_CLASS_COLUMNS) {
      expect(
        [...(classes?.columns ?? [])],
        `anon must not reach classes.${column} — a competitor could learn it before running`
      ).not.toContain(column);
    }
  });

  it('keeps every column the anon-reachable class readers select', () => {
    // A narrower allowlist is not "safer" here: PostgREST 42501s the whole request, and
    // getAllClasses swallows that into a silently empty public class list.
    for (const column of REQUIRED_ANON_CLASS_COLUMNS) {
      expect(
        [...(classes?.columns ?? [])],
        `classes.${column} must stay granted or the public show/class pages break`
      ).toContain(column);
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

  it('has no OTHER SELECT policy on dogs or people admitting anon', () => {
    // Postgres ORs permissive policies. A new policy admitting anon would expose the
    // granted columns even with dogs_select/people_select untouched.
    for (const table of ['dogs', 'people']) {
      const admitting = selectPoliciesAdmittingAnon(table);
      expect(
        admitting,
        `No SELECT policy on ${table} may admit anon or PUBLIC while anon holds column ` +
          `grants there:\n${admitting.join('\n')}`
      ).toEqual([]);
    }
  });
});
