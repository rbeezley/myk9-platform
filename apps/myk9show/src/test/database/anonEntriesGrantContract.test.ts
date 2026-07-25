import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-93 regression guard.
 *
 * `publicResultsReleaseGateRlsContract.test.ts` pins migration 20260616120000 in
 * isolation, so it stayed green while a LATER migration (20260725160000) undid the
 * invariant it protects — first with `REVOKE ALL ON ALL TABLES ... FROM anon`, which
 * silently drops column grants, then with a table-wide `GRANT SELECT ON public.entries
 * TO anon`. Anon could read total_score, payment_status and stripe_payment_intent_id
 * directly, routing around view_public_entry_results.
 *
 * This test replays every migration in apply order and asserts the FINAL anon grant
 * state on public.entries, so no future migration can re-open it.
 */
const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations');

/**
 * The exact 14-column security boundary established by the release gate
 * (20260616120000) and restored by 20260725170000. Asserted as an exact set: a
 * denylist only catches the sensitive columns someone remembered to enumerate.
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

type AnonGrant = { kind: 'none' } | { kind: 'table-wide' } | { kind: 'columns'; columns: string[] };

/** Replay every migration in filename (= apply) order and fold anon's grant state. */
function finalAnonGrantOnEntries(): { state: AnonGrant; tableWideSources: string[] } {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let state: AnonGrant = { kind: 'none' };
  const tableWideSources: string[] = [];

  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');

    // Strip line comments AND single-quoted literals, so prose *about* a statement
    // — a `--` note, or a COMMENT ON ... 'never GRANT ...' string — is never parsed
    // as the statement itself. Dollar-quoted bodies are left alone; no DO block in
    // this repo grants on entries.
    const statements = sql
      .replace(/--[^\n]*/g, '')
      .replace(/'(?:[^']|'')*'/g, "''")
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      const normalized = statement.replace(/\s+/g, ' ');

      if (
        /REVOKE\s+ALL\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM\s+(anon|PUBLIC)/i.test(
          normalized
        )
      ) {
        // Blanket revokes drop column grants too — the trap that caused this bug.
        state = { kind: 'none' };
        continue;
      }
      if (
        /REVOKE\s+(SELECT|ALL)[^]*?\bON\s+(TABLE\s+)?(public\.)?entries\s+FROM\s+(anon|PUBLIC)/i.test(
          normalized
        )
      ) {
        state = { kind: 'none' };
        continue;
      }

      const columnGrant = normalized.match(
        /GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+(?:TABLE\s+)?(?:public\.)?entries\s+TO\s+[^;]*\b(anon|PUBLIC)\b/i
      );
      if (columnGrant) {
        // Postgres UNIONs column grants; it does not replace them. Accumulate, so an
        // unsafe grant followed by the safe allowlist cannot hide behind the last write.
        const added = columnGrant[1]
          .split(',')
          .map(c => c.trim())
          .filter(Boolean);
        const existing: string[] = state.kind === 'columns' ? state.columns : [];
        state = { kind: 'columns', columns: [...new Set([...existing, ...added])] };
        continue;
      }

      // Any table-wide route to anon, including inheritance via the PUBLIC pseudo-role
      // and schema-wide grants. Each of these re-opens the hole.
      if (
        /GRANT\s+(SELECT|ALL)(\s+PRIVILEGES)?\s+ON\s+(?:TABLE\s+)?(?:public\.)?entries\s+TO\s+[^;]*\b(anon|PUBLIC)\b/i.test(
          normalized
        ) ||
        /GRANT\s+(SELECT|ALL)(\s+PRIVILEGES)?\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+TO\s+[^;]*\b(anon|PUBLIC)\b/i.test(
          normalized
        )
      ) {
        state = { kind: 'table-wide' };
        tableWideSources.push(file);
      }
    }
  }

  return { state, tableWideSources };
}

describe('anon grant contract on public.entries', () => {
  const { state, tableWideSources } = finalAnonGrantOnEntries();

  it('leaves anon with a column-scoped grant, never a table-wide one', () => {
    expect(
      state.kind,
      `anon must end with a column-scoped SELECT on public.entries. ` +
        `Table-wide grants seen in: ${tableWideSources.join(', ') || '(none)'}`
    ).toBe('columns');
  });

  it('matches the release gate allowlist EXACTLY — no column added, none dropped', () => {
    expect(state.kind).toBe('columns');
    if (state.kind !== 'columns') return;

    // Exact-set equality, not a sample. A denylist can only catch the sensitive
    // columns someone thought to enumerate; this catches any column at all.
    expect([...state.columns].sort()).toEqual([...ANON_ENTRY_COLUMN_ALLOWLIST].sort());
  });

  it('excludes every known scored/PII column (redundant with the exact check, kept explicit)', () => {
    expect(state.kind).toBe('columns');
    if (state.kind !== 'columns') return;

    for (const column of FORBIDDEN_ANON_COLUMNS) {
      expect(state.columns, `anon must not reach public.entries.${column}`).not.toContain(column);
    }
  });
});

/**
 * The other half of the MYK9-93 regression: PostgREST requires table-level SELECT on
 * every EMBEDDED relation, so a missing column grant on dogs/people is a hard 42501
 * that fails the whole anon request. This got shipped wrong twice — once for dogs and
 * people entirely, then again for people.email — so pin the granted sets.
 *
 * These grants convey no data today: dogs_select and people_select are TO authenticated,
 * so anon matches zero rows. They exist only so the embed resolves to null.
 */
describe('anon embed grants on dogs / people', () => {
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');

  function grantedColumns(table: string): string[] {
    const columns = new Set<string>();
    const pattern = new RegExp(
      `GRANT\\s+SELECT\\s*\\(([^)]*)\\)\\s*ON\\s+(?:TABLE\\s+)?public\\.${table}\\s+TO\\s+anon`,
      'gi'
    );
    for (const match of migrations.replace(/--[^\n]*/g, '').matchAll(pattern)) {
      for (const column of match[1].split(',')) {
        const trimmed = column.trim();
        if (trimmed) columns.add(trimmed);
      }
    }
    return [...columns];
  }

  it('covers every dogs column embedded by the public TV board', () => {
    // services/database/tv-display/postgrest.ts — entries(... dogs(...))
    for (const column of ['id', 'name', 'call_name', 'breed', 'image_url']) {
      expect(grantedColumns('dogs')).toContain(column);
    }
  });

  it('covers every people column embedded by the public show pages', () => {
    // hooks/queries/useShowJudges.ts — people!inner(id, first_name, last_name)
    // services/database/shows/reads.postgrest.ts — judge:people!...(id, first_name,
    // last_name, email). The email column was missed on the first repair.
    for (const column of ['id', 'first_name', 'last_name', 'email']) {
      expect(grantedColumns('people')).toContain(column);
    }
  });

  it('keeps those grants column-scoped — never table-wide', () => {
    for (const table of ['dogs', 'people']) {
      const tableWide = new RegExp(
        `GRANT\\s+(SELECT|ALL)(\\s+PRIVILEGES)?\\s+ON\\s+(?:TABLE\\s+)?public\\.${table}\\s+TO\\s+[^;]*\\banon\\b`,
        'i'
      );
      expect(
        tableWide.test(migrations.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''")),
        `${table} must never carry a table-wide anon grant`
      ).toBe(false);
    }
  });
});
