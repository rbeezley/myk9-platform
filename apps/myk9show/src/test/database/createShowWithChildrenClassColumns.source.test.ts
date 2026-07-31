import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contract for the classes INSERT inside create_show_with_children.
 *
 * Two regressions this pins against:
 *
 *  1. Dropped scoring columns. `public.classes` gives num_hides, num_areas,
 *     hides_known and distraction_count non-null DEFAULTs, so a column the RPC
 *     forgets does not surface as NULL — it silently persists the default. That
 *     is how every wizard-created class shipped `num_hides = 1` regardless of
 *     registry or level, printing "Hides: 1" on Master scoresheets.
 *  2. Rebuilding the function from a stale base. The RPC has been re-created
 *     from an older migration twice (see 20260726150000's header), each time
 *     reverting columns added in between. Resolving the LATEST migration that
 *     re-creates the function — rather than pinning one filename — is what makes
 *     this test catch that class of revert.
 */
const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations');
const RECREATE_MARKER = 'CREATE OR REPLACE FUNCTION public.create_show_with_children';

function readLatestRpcMigration(): { file: string; body: string } {
  const candidates = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .reverse();
  for (const file of candidates) {
    const text = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    if (text.includes(RECREATE_MARKER)) {
      // Only the function definition counts — header comments legitimately
      // mention columns the body may not set.
      return { file, body: text.slice(text.indexOf(RECREATE_MARKER)) };
    }
  }
  throw new Error(`No migration re-creates create_show_with_children`);
}

/**
 * Every column the classes INSERT must list. Each has a DB DEFAULT or is
 * rule-derived, so omitting one produces silently wrong data rather than a NULL.
 */
const REQUIRED_CLASS_COLUMNS = [
  'id',
  'trial_id',
  'name',
  'level',
  'element',
  'section',
  'entry_fee',
  'max_entries',
  'status',
  'start_time',
  'timer_mode',
  'hides_known',
  'distraction_count',
  'num_areas',
  'num_hides',
  'time_limit_seconds',
];

describe('create_show_with_children classes INSERT (latest migration)', () => {
  const { file, body } = readLatestRpcMigration();

  it(`lists every rule-derived class column (${file})`, () => {
    const insertMatch = body.match(/INSERT INTO public\.classes\s*\(([^)]*)\)/);
    expect(insertMatch).not.toBeNull();
    const columns = insertMatch![1]!.split(',').map(c => c.trim());
    for (const col of REQUIRED_CLASS_COLUMNS) {
      expect(columns).toContain(col);
    }
  });

  it('reads num_hides from the payload so a fixed rule count reaches the class', () => {
    expect(body).toContain("NULLIF(v_class->>'num_hides', '')::int");
  });

  it('keeps the registry_id and class-level judge handling that earlier rebuilds reverted', () => {
    expect(body).toContain("COALESCE(NULLIF(v_trial->>'registry_id', ''), 'AKC')");
    expect(body).toContain('INSERT INTO public.judge_assignments');
    expect(body).toContain('person_id');
  });
});
