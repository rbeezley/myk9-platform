import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-258: a club-scoped authorization helper must never be handed a nullable
 * `club_id` column unguarded.
 *
 * `is_trial_secretary(check_club_id)` and `is_club_admin(check_club_id)` treat a
 * NULL argument as "no club filter", because the NO-ARGUMENT form answers "is
 * this user a secretary anywhere?" and ~115 call sites rely on that. But
 * `shows.club_id` is nullable, so passing it positionally means a club-less show
 * matches EVERY active secretary and club admin on the platform.
 *
 * Five functions had that shape and were fixed in 20260828230000; two
 * (`get_show_officials`, `can_manage_show_lifecycle_email`) already carried the
 * guard, which is where the idiom comes from.
 *
 * This is a source contract rather than a behavioural one on purpose. The
 * behavioural test (`supabase/tests/null_club_show_authorization_test.sql`)
 * proves the five fixed callers behave; it cannot prove anything about a SIXTH
 * caller nobody has written yet. Only reading the migration text catches that,
 * and the defect's whole character is that it is invisible until someone
 * queries for it.
 */

const migrationsDir = resolve(process.cwd(), '../../supabase/migrations');

/** Every `is_club_admin(x)` / `is_trial_secretary(x)` call with an argument. */
const CLUB_HELPER_CALL = /(is_club_admin|is_trial_secretary)\s*\(\s*([^)\s]+)\s*\)/g;

/**
 * Latest definition wins: several migrations replace these functions, and only
 * the last one to touch a given function describes live behaviour.
 */
function latestDefinitions(): Map<string, { file: string; body: string }> {
  const files = readdirSync(migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .sort();
  const latest = new Map<string, { file: string; body: string }>();

  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
    // Every declaration form in this migration set: 52 omit the `public.`
    // schema prefix and 12 use CREATE FUNCTION without OR REPLACE. Requiring
    // both made can_manage_show and can_manage_trial invisible to this check —
    // exactly the blind spot it exists to close.
    const pattern = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sql)) !== null) {
      const name = match[1];
      const start = match.index;
      pattern.lastIndex = match.index + match[0].length;

      // Terminate at the function's own dollar-quoted body, NOT at the next
      // function declaration. Running to the next declaration swept in whatever
      // followed — on the first run this attributed a trailing
      // `entry_status_history_select` POLICY to record_entry_status_history,
      // which calls no helper at all.
      const rest = sql.slice(pattern.lastIndex);
      const tagMatch = /AS\s+(\$[a-zA-Z_]*\$)/.exec(rest);
      let end: number;
      if (tagMatch) {
        const tag = tagMatch[1];
        const bodyStart = pattern.lastIndex + tagMatch.index + tagMatch[0].length;
        const closing = sql.indexOf(tag, bodyStart);
        end = closing === -1 ? sql.length : closing + tag.length;
      } else {
        const nextIndex = rest.search(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s/i);
        end = nextIndex === -1 ? sql.length : pattern.lastIndex + nextIndex;
      }
      latest.set(name, { file, body: sql.slice(start, end) });
    }
  }
  return latest;
}

/**
 * Call sites that pass a nullable `club_id` column to a club-scoped helper, and
 * have been reviewed.
 *
 * A REGISTRY, not a heuristic. Three text heuristics were tried and each was
 * wrong in one direction or the other:
 *
 *   * whole-body search  — a guarded is_club_admin call satisfied the check on
 *     behalf of an UNguarded is_trial_secretary call in the same function
 *   * fixed window before the call — the window reached back into the previous
 *     conjunct, which carries its own guard
 *   * nearest-OR conjunct — flagged can_manage_show_lifecycle_email, which is
 *     correctly guarded with the test placed before the whole (a OR b) group
 *
 * SQL boolean structure needs a parser, and a half-right parser on an
 * authorization check is worse than none: it produces confident wrong answers
 * in both directions. So this asserts something a regex CAN decide — WHICH call
 * sites exist. A new one fails the test, and a human reads the actual SQL and
 * adds it here. That is the protection that matters, because the defect's
 * character is that nobody notices the call site at all.
 */
const REVIEWED_CLUB_HELPER_CALL_SITES: readonly string[] = [
  // Guarded by 20260828230000 (MYK9-258).
  'can_manage_show -> is_club_admin',
  'can_manage_show -> is_trial_secretary',
  'can_manage_trial -> is_club_admin',
  'can_manage_trial -> is_trial_secretary',
  'manageable_show_ids -> is_club_admin',
  'manageable_show_ids -> is_trial_secretary',
  'is_show_office_manager -> is_club_admin',
  'is_show_office_manager -> is_trial_secretary',
  'get_entries_for_export -> is_trial_secretary',
  // Already guarded before MYK9-258; the source of the idiom.
  'get_show_officials -> is_club_admin',
  'can_manage_show_lifecycle_email -> is_club_admin',
  'can_manage_show_lifecycle_email -> is_trial_secretary',
];

describe('club-scoped authorization helpers are never handed a bare club_id column', () => {
  const definitions = latestDefinitions();

  it('parses the migration set and finds the functions under test', () => {
    // Guards the guard: a parser that matched nothing would make every
    // assertion below pass vacuously.
    expect(definitions.size).toBeGreaterThan(50);
    expect(definitions.has('manageable_show_ids')).toBe(true);
    expect(definitions.has('can_manage_show')).toBe(true);
  });

  it('surfaces any NEW call site for review', () => {
    const found = new Set<string>();

    for (const [name, { body }] of definitions) {
      // The helpers themselves legitimately compare against their own parameter.
      if (name === 'is_club_admin' || name === 'is_trial_secretary') continue;

      for (const call of body.matchAll(CLUB_HELPER_CALL)) {
        const argument = call[2];
        // The no-argument form is the intended "anywhere?" question.
        if (argument === '') continue;
        // Only a column reference can be NULL at runtime; a literal or a
        // parameter named check_club_id is the caller's own choice.
        if (!/^[a-z_][a-z0-9_]*\.club_id$/i.test(argument)) continue;
        found.add(`${name} -> ${call[1]}`);
      }
    }

    // Read the SQL before adding an entry: the guard belongs in the call's own
    // boolean branch, as `<alias>.club_id IS NOT NULL AND …`.
    expect([...found].sort()).toEqual([...REVIEWED_CLUB_HELPER_CALL_SITES].sort());
  });

  it('still finds the guard on the two callers that always had it', () => {
    // If the detector stopped recognising the established idiom, the assertion
    // above would pass for the wrong reason.
    for (const name of ['get_show_officials', 'can_manage_show_lifecycle_email']) {
      const definition = definitions.get(name);
      expect(definition, `${name} should exist in the migration set`).toBeDefined();
      expect(definition?.body.toLowerCase()).toContain('club_id is not null');
    }
  });
});

/**
 * MYK9-329: the owner-run view had the same collapse in prose form. Its
 * `can_manage` flag carried `(sh.club_id IS NULL AND ctx.has_manager_role)`,
 * which no `is_club_admin(x)` scan can see because it never calls the helper.
 * Only the LATEST migration that defines the view describes live behaviour.
 */
function latestViewDefinition(viewName: string): { file: string; body: string } {
  const marker = `CREATE OR REPLACE VIEW public.${viewName}`;
  const files = readdirSync(migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .sort();
  let latest: { file: string; body: string } | undefined;
  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
    const start = sql.lastIndexOf(marker);
    if (start === -1) continue;
    latest = { file, body: sql.slice(start) };
  }
  if (!latest) throw new Error(`no migration defines ${viewName}`);
  return latest;
}

describe('view_authenticated_entry_results does not admit managers to club-less shows', () => {
  const view = latestViewDefinition('view_authenticated_entry_results');

  it('reads the live definition, not history', () => {
    // Guards the guard: if the marker stopped matching, the assertion below
    // would pass against an empty string.
    expect(view.body).toContain('AS can_manage');
    expect(view.file >= '20260902130000').toBe(true);
  });

  it('has no club-less-show manager arm in can_manage (MYK9-329)', () => {
    const canManage = view.body.slice(0, view.body.indexOf('AS can_manage'));
    expect(canManage).not.toMatch(/club_id\s+IS\s+NULL\s+AND\s+ctx\.has_manager_role/i);
    // ...while the arms that SHOULD be there still are.
    expect(canManage).toContain('ctx.is_site_admin');
    expect(canManage).toContain('sh.club_id = ANY(ctx.managed_club_ids)');
  });
});
