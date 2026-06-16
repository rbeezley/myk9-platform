import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contract for migration 20260616120000 — the server-side gate for public/anon
 * scored results. The repo tests RLS/grants as source-text contracts (the
 * migration is the source of truth); this pins the security-critical structure
 * so a future edit that re-opens the leak fails CI.
 */
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260616120000_public_results_release_gate.sql'
  ),
  'utf8'
);

/** The scored/PII columns anon must NOT be able to read directly. */
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

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('public results release gate — RLS/grants contract', () => {
  it("revokes anon's broad SELECT on entries (from both anon and PUBLIC)", () => {
    expect(migration).toMatch(/REVOKE\s+SELECT\s+ON\s+public\.entries\s+FROM\s+anon/i);
    expect(migration).toMatch(/REVOKE\s+SELECT\s+ON\s+public\.entries\s+FROM\s+PUBLIC/i);
  });

  it('re-grants anon only a safe column allowlist that excludes every scored/PII column', () => {
    const grant = sliceBetween(migration, 'GRANT SELECT (', ') ON public.entries TO anon;');
    // Columns the public running-order display legitimately needs.
    expect(grant).toContain('armband');
    expect(grant).toContain('run_order');
    expect(grant).toContain('is_in_ring');
    // The leak guard: none of the withheld columns may be in the allowlist.
    for (const col of FORBIDDEN_ANON_COLUMNS) {
      expect(grant.includes(col)).toBe(false);
    }
  });

  it('keeps authenticated + service_role table reads intact', () => {
    expect(migration).toMatch(/GRANT\s+SELECT\s+ON\s+public\.entries\s+TO\s+authenticated/i);
    expect(migration).toMatch(/GRANT\s+SELECT\s+ON\s+public\.entries\s+TO\s+service_role/i);
  });

  it('exposes scored columns only through the owner-run, cascade-nulling public view', () => {
    const view = sliceBetween(
      migration,
      'CREATE VIEW public.view_public_entry_results',
      'GRANT EXECUTE ON FUNCTION public.resolve_class_result_visibility'
    );
    // Owner-run so it can null scored columns the anon role can no longer read.
    expect(view).toContain('security_invoker = false');
    // Each scored column is gated behind its resolved per-field visibility flag.
    expect(view).toMatch(
      /CASE\s+WHEN\s+vis\.placement_visible\s+THEN\s+e\.final_placement\s+END\s+AS\s+final_placement/i
    );
    expect(view).toMatch(
      /CASE\s+WHEN\s+vis\.qualification_visible\s+THEN\s+e\.result_status\s+END\s+AS\s+result_status/i
    );
    expect(view).toMatch(
      /CASE\s+WHEN\s+vis\.time_visible\s+THEN\s+e\.search_time_seconds\s+END\s+AS\s+search_time_seconds/i
    );
    expect(view).toMatch(
      /CASE\s+WHEN\s+vis\.faults_visible\s+THEN\s+e\.total_faults\s+END\s+AS\s+total_faults/i
    );
    // Owner-run view must embed its own row scope (RLS is bypassed).
    expect(view).toContain("sh.status IN ('published', 'upcoming', 'in_progress', 'completed')");
    expect(view).toContain('e.deleted_at IS NULL');
    expect(view).toContain('sh.deleted_at IS NULL');
  });

  it('grants the view + resolver to anon and authenticated', () => {
    expect(migration).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.resolve_class_result_visibility\(uuid\)\s+TO\s+anon,\s*authenticated/i
    );
    expect(migration).toMatch(
      /GRANT\s+SELECT\s+ON\s+public\.view_public_entry_results\s+TO\s+anon,\s*authenticated/i
    );
  });

  it('resolver is a hardened SECURITY DEFINER function with a locked search_path', () => {
    const fn = sliceBetween(
      migration,
      'CREATE OR REPLACE FUNCTION public.resolve_class_result_visibility',
      'CREATE VIEW public.view_public_entry_results'
    );
    expect(fn).toContain('SECURITY DEFINER');
    expect(fn).toContain('STABLE');
    expect(fn).toMatch(/SET\s+search_path\s*=\s*public\b/);
    // Fail closed for unknown classes.
    expect(fn).toMatch(/IF\s+NOT\s+FOUND\s+THEN[\s\S]*?SELECT\s+false,\s*false,\s*false,\s*false/i);
  });

  it('manual_release results require the released state (placement hidden until released)', () => {
    const timingFn = sliceBetween(
      migration,
      'CREATE OR REPLACE FUNCTION public._result_timing_visible',
      'CREATE OR REPLACE FUNCTION public.resolve_class_result_visibility'
    );
    expect(timingFn).toMatch(/WHEN\s+'immediate'\s+THEN\s+true/i);
    expect(timingFn).toMatch(
      /WHEN\s+'class_complete'\s+THEN\s+p_state\s+IN\s+\('completed',\s*'released'\)/i
    );
    expect(timingFn).toMatch(/WHEN\s+'manual_release'\s+THEN\s+p_state\s*=\s*'released'/i);
  });
});
