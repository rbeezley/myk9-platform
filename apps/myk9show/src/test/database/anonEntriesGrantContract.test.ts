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
        /REVOKE\s+ALL\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM\s+anon/i.test(normalized)
      ) {
        // Blanket revokes drop column grants too — the trap that caused this bug.
        state = { kind: 'none' };
        continue;
      }
      if (
        /REVOKE\s+(SELECT|ALL)[^]*?\bON\s+public\.entries\s+FROM\s+(anon|PUBLIC)/i.test(normalized)
      ) {
        state = { kind: 'none' };
        continue;
      }

      const columnGrant = normalized.match(
        /GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+public\.entries\s+TO\s+anon/i
      );
      if (columnGrant) {
        state = {
          kind: 'columns',
          columns: columnGrant[1]
            .split(',')
            .map(c => c.trim())
            .filter(Boolean),
        };
        continue;
      }

      if (/GRANT\s+SELECT\s+ON\s+public\.entries\s+TO\s+[^;]*\banon\b/i.test(normalized)) {
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

  it('excludes every scored/PII column from the final allowlist', () => {
    expect(state.kind).toBe('columns');
    if (state.kind !== 'columns') return;

    for (const column of FORBIDDEN_ANON_COLUMNS) {
      expect(state.columns, `anon must not reach public.entries.${column}`).not.toContain(column);
    }
  });

  it('still exposes the columns the public running-order board needs', () => {
    expect(state.kind).toBe('columns');
    if (state.kind !== 'columns') return;

    for (const column of ['armband', 'run_order', 'is_in_ring', 'is_scored', 'handler']) {
      expect(state.columns).toContain(column);
    }
  });
});
