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
      // Body runs to the next function declaration or end of file.
      const start = match.index;
      pattern.lastIndex = match.index + match[0].length;
      const nextIndex = sql
        .slice(pattern.lastIndex)
        .search(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s/i);
      const end = nextIndex === -1 ? sql.length : pattern.lastIndex + nextIndex;
      latest.set(name, { file, body: sql.slice(start, end) });
    }
  }
  return latest;
}

describe('club-scoped authorization helpers are never handed a bare club_id column', () => {
  const definitions = latestDefinitions();

  it('parses the migration set and finds the functions under test', () => {
    // Guards the guard: a parser that matched nothing would make every
    // assertion below pass vacuously.
    expect(definitions.size).toBeGreaterThan(50);
    expect(definitions.has('manageable_show_ids')).toBe(true);
    expect(definitions.has('can_manage_show')).toBe(true);
  });

  it('guards every argumented call with an IS NOT NULL test', () => {
    const offenders: string[] = [];

    for (const [name, { file, body }] of definitions) {
      // The helpers themselves legitimately compare against their own parameter.
      if (name === 'is_club_admin' || name === 'is_trial_secretary') continue;

      for (const call of body.matchAll(CLUB_HELPER_CALL)) {
        const argument = call[2];
        // The no-argument form is the intended "anywhere?" question.
        if (argument === '') continue;
        // Only a column reference can be NULL at runtime here; a literal or a
        // function parameter named check_club_id is the caller's own choice.
        if (!/^[a-z_][a-z0-9_]*\.club_id$/i.test(argument)) continue;

        const alias = argument.split('.')[0];
        const guarded =
          new RegExp(`${alias}\\.club_id\\s+IS\\s+NOT\\s+NULL`, 'i').test(body) ||
          new RegExp(`${alias}\\.club_id\\s+is\\s+not\\s+null`).test(body);
        if (!guarded) {
          offenders.push(`${name} (${file}) passes ${argument} to ${call[1]} unguarded`);
        }
      }
    }

    expect(offenders).toEqual([]);
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
