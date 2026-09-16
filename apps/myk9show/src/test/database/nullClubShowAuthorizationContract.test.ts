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
  // Guarded by ur.club_id IS NOT NULL in 20260910181537 (MYK9-457).
  'get_visible_person_roles -> is_club_admin',
  'get_visible_person_roles -> is_trial_secretary',
  'get_visible_person_ids_by_role -> is_club_admin',
  'get_visible_person_ids_by_role -> is_trial_secretary',
  // Guarded by s.club_id IS NOT NULL in 20260912171500 (MYK9-470). The helper is the
  // secretary-only counterpart of manageable_show_ids(), and carries the same idiom:
  //   WHERE (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
  //      OR (SELECT public.is_site_admin())
  // so a club-less show reaches nobody but a site admin.
  'trial_secretary_show_ids -> is_trial_secretary',
  // Guarded by s.club_id IS NOT NULL in 20260912211500 (MYK9-474). Copied verbatim from
  // get_show_officials, which is this function's template:
  //   AND (s.status IN (...) OR (s.club_id IS NOT NULL AND is_club_admin(s.club_id)) OR ...)
  // so a club-less show reaches nobody through the club-admin arm.
  'get_show_judges -> is_club_admin',
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
 * MYK9-571 round 2 (P1-A/R2): the same trap in RLS-policy form. Round 1 of
 * the 20260915231500 migration dropped and recreated role_requests_select
 * with a third arm, `requested_role = 'secretary' AND is_club_admin(club_id)`
 * — club_id is nullable (insert_signup_role_requests never sets it), and
 * is_club_admin(NULL) answers "club admin anywhere?", so every club admin,
 * anywhere, could read every signup-generated secretary request. Round 2
 * removed the arm rather than guard it inline; this scanner is what stops a
 * future PR from re-adding an unguarded one on ANY policy, not just this
 * table's.
 */

/**
 * Every LIVE policy statement, latest wins: `CREATE`/`ALTER POLICY` (re)sets
 * a policy's tracked body, `DROP POLICY` (this codebase's own
 * drop-and-recreate convention — Postgres has no `CREATE OR REPLACE POLICY`)
 * removes it until a later `CREATE`/`ALTER` brings it back.
 *
 * MYK9-585 fixed two blind spots the first cut of this scanner had:
 *
 *   1. It matched ONLY quoted policy names (`"name"`). Most of this
 *      codebase's policies are declared unquoted (`create policy shows_select
 *      on public.shows ...`) — 74 of this migration set's LIVE policies, by
 *      count. A quoted `DROP POLICY "name"` followed by an unquoted
 *      `CREATE POLICY name` evicted the policy from the map entirely (the
 *      unquoted CREATE was invisible), and an unquoted `CREATE POLICY
 *      role_requests_select ... OR (select is_club_admin(club_id))` would
 *      have passed this scanner GREEN. Both forms are matched now.
 *
 *   2. It never recognised `ALTER POLICY`, which
 *      20260727130000_rls_initplan_wrap_auth_calls.sql uses (deliberately,
 *      per that file's own header, to avoid a drop-then-recreate window) to
 *      rewrite 71 policies' USING/WITH CHECK clauses. Untracked, the map
 *      held each of those policies' body from its ORIGINAL CREATE — stale
 *      text for the "what does this predicate say today" question the
 *      scanner exists to answer, even though that particular migration
 *      happens not to touch any is_club_admin/is_trial_secretary(club_id)
 *      call (its own header says so: column-argument helper calls are left
 *      exactly as-is). `ALTER POLICY ... USING (...) [WITH CHECK (...)]`
 *      fully REPLACES the previous predicate (Postgres semantics, not a
 *      merge), so it is tracked the same way CREATE is: the new span
 *      overwrites the map entry.
 *
 * Keyed on (table, name) — not name alone — so an ALTER or DROP naming a
 * policy on one table cannot evict or overwrite a same-named policy on a
 * different one; the two forms (quoted/bare) are normalised to lower case
 * for the key, matching Postgres's own case-insensitive unquoted-identifier
 * rule.
 */
/**
 * Strips `--` line comments and block comments before scanning. Without
 * this, a prose comment like "(rolled-back ALTER POLICY experiment on the
 * live Micro project)" (20260730170000_hashable_entries_manager_policy.sql)
 * parses as a real ALTER POLICY statement -- a false policy named
 * "experiment" on a table named "the". A real SQL parser would never see
 * it; this scanner is a regex, so it strips comments first instead of
 * pretending prose cannot look like DDL.
 */
function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function latestPolicyDefinitions(): Map<string, { file: string; body: string; name: string }> {
  const files = readdirSync(migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .sort();
  const latest = new Map<string, { file: string; body: string; name: string }>();

  const eventPattern =
    /\b(CREATE|ALTER|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))\s+ON\s+(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)/gi;

  for (const file of files) {
    const sql = stripSqlComments(readFileSync(resolve(migrationsDir, file), 'utf8'));
    eventPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = eventPattern.exec(sql)) !== null) {
      const keyword = match[1]!.toUpperCase();
      const name = (match[2] ?? match[3])!;
      const table = match[4]!;
      const key = `${table.toLowerCase()}::${name.toLowerCase()}`;

      if (keyword === 'DROP') {
        latest.delete(key);
        continue;
      }

      const start = match.index;
      // Policy bodies are not dollar-quoted, so the statement's own terminating
      // `;` is a safe boundary (unlike the function scanner above, which must
      // dodge dollar-quoted bodies that can themselves contain semicolons).
      const terminator = sql.indexOf(';', eventPattern.lastIndex);
      const end = terminator === -1 ? sql.length : terminator + 1;
      // CREATE and ALTER both fully (re)set the tracked body — Postgres's
      // ALTER POLICY USING/WITH CHECK REPLACES the predicate, it does not
      // merge into it.
      latest.set(key, { file, body: sql.slice(start, end), name });
      eventPattern.lastIndex = end;
    }
  }
  return latest;
}

/**
 * Call sites that pass a `club_id` column to a club-scoped helper from
 * inside an RLS policy body. Building this scanner for MYK9-571 round 2 (the
 * role_requests_select P0) surfaced PRE-EXISTING sites — none introduced by
 * this PR, and role_requests_select itself is NOT among them (its round-1
 * arm was removed, not guarded; see the migration header). They predate the
 * MYK9-258 remediation, which only ever covered the FUNCTIONS in
 * REVIEWED_CLUB_HELPER_CALL_SITES above (can_manage_show,
 * manageable_show_ids, etc.) — nobody had scanned RLS policy bodies for the
 * same trap called directly. MYK9-585 then fixed the scanner itself
 * (quoted-only names, ALTER POLICY, and a comment-semicolon truncating a
 * captured body early — see latestPolicyDefinitions() and
 * stripSqlComments()), which surfaced 11 MORE sites the first cut silently
 * missed. Three categories, each annotated below:
 *
 *   SAFE (NOT NULL) — the column can never be NULL, so the call is safe
 *   regardless of guard text:
 *     - club_premium_templates.club_id / premium_generations.club_id:
 *       `uuid not null` (188_premium_bridge_tables.sql).
 *     - club_members.club_id / club_officers.club_id: `uuid not null`
 *       (053_club_members_officers.sql).
 *     - club_stripe_accounts.club_id: `uuid not null unique`
 *       (20260609120000_stripe_connect_payouts.sql).
 *
 *   GUARDED — the predicate already carries a `club_id IS NOT NULL AND`
 *   (or equivalent) guard in the same boolean branch:
 *     - shows_select: `club_id is not null and (select is_club_admin(shows.club_id))`
 *       (latest body: 20260823190000_admin_soft_deleted_show_visibility.sql).
 *     - show_payouts_select: `s.club_id is not null and is_club_admin(s.club_id)`
 *       (20260611090000_pr625_round8_write_guards.sql — this migration's OWN
 *       header names the exact bug this scanner exists to catch).
 *     - entry_payment_links_select: `s.club_id IS NOT NULL AND (SELECT
 *       is_club_admin(s.club_id))` (20260620200000_entry_payment_links.sql).
 *
 *   UNGUARDED — genuinely unreviewed, e.g. classes_select
 *   (108_tv_display_anon_access.sql): `... OR (SELECT is_club_admin(s.club_id))
 *   ...` with no NULL check anywhere in the predicate, same shape as the
 *   shows/trials mutation/select policies below. Registered here so this
 *   scanner ships green without silently claiming they were checked;
 *   fixing them is a dedicated follow-up, out of scope for a role_requests
 *   fix. A truly NEW entry — one added by a later PR, not already in this
 *   list — still fails the test and must be guarded (or proven NOT NULL)
 *   before it can be registered.
 */
const REVIEWED_CLUB_HELPER_POLICY_SITES: readonly string[] = [
  // SAFE: club_id is `uuid not null` (188_premium_bridge_tables.sql).
  'club members can log premium generations -> is_club_admin',
  'club members can log premium generations -> is_trial_secretary',
  'club members can manage premium templates -> is_club_admin',
  'club members can manage premium templates -> is_trial_secretary',
  'club members can view premium generations -> is_club_admin',
  'club members can view premium generations -> is_trial_secretary',
  // SAFE: club_id is `uuid not null` (053_club_members_officers.sql).
  'club_members_delete -> is_club_admin',
  'club_members_insert -> is_club_admin',
  'club_members_select -> is_club_admin',
  'club_members_update -> is_club_admin',
  'club_officers_delete -> is_club_admin',
  'club_officers_insert -> is_club_admin',
  'club_officers_select -> is_club_admin',
  'club_officers_update -> is_club_admin',
  // SAFE: club_id is `uuid not null unique` (20260609120000_stripe_connect_payouts.sql).
  'club_stripe_accounts_select -> is_club_admin',
  // GUARDED: `club_id is not null and (select is_club_admin(...))`, or the
  // s.club_id-derived equivalent.
  'entry_payment_links_select -> is_club_admin',
  'show_payouts_select -> is_club_admin',
  'shows_select -> is_club_admin',
  // UNGUARDED, pre-existing, out of scope for MYK9-571. Flagged as a
  // follow-up security audit, not fixed here.
  'class_visibility_insert -> is_club_admin',
  'class_visibility_insert -> is_trial_secretary',
  'class_visibility_update -> is_club_admin',
  'class_visibility_update -> is_trial_secretary',
  'classes_select -> is_club_admin',
  'classes_select -> is_trial_secretary',
  'entry_status_history_select -> is_club_admin',
  'messages_insert -> is_club_admin',
  'messages_insert -> is_trial_secretary',
  'messages_select -> is_club_admin',
  'messages_select -> is_trial_secretary',
  'messages_update_read -> is_club_admin',
  'messages_update_read -> is_trial_secretary',
  'show_templates_select -> is_club_admin',
  'show_templates_select -> is_trial_secretary',
  'show_visibility_insert -> is_club_admin',
  'show_visibility_insert -> is_trial_secretary',
  'show_visibility_update -> is_club_admin',
  'show_visibility_update -> is_trial_secretary',
  'shows_delete -> is_club_admin',
  'shows_insert -> is_club_admin',
  'shows_insert -> is_trial_secretary',
  'shows_update -> is_club_admin',
  'shows_update -> is_trial_secretary',
  'threads_insert -> is_club_admin',
  'threads_insert -> is_trial_secretary',
  'threads_select -> is_club_admin',
  'threads_select -> is_trial_secretary',
  'trial_visibility_insert -> is_club_admin',
  'trial_visibility_insert -> is_trial_secretary',
  'trial_visibility_update -> is_club_admin',
  'trial_visibility_update -> is_trial_secretary',
  'trials_select -> is_club_admin',
  'trials_select -> is_trial_secretary',
];

describe('club-scoped authorization helpers are never handed a bare club_id column in an RLS policy', () => {
  const policies = latestPolicyDefinitions();

  it('parses the migration set and finds exactly the live policies (MYK9-585)', () => {
    // An exact count, not a floor: `toBeGreaterThan` let the quoted-only /
    // ALTER-blind parser silently under-count for months (MYK9-585) while
    // still passing. This number must be updated DELIBERATELY — recompute it
    // (log `policies.size`) whenever a migration adds, drops, or renames a
    // policy, and explain the change in the same PR that touches this line.
    expect(policies.size).toBe(373);
  });

  it('surfaces any NEW policy call site for review', () => {
    const found = new Set<string>();

    for (const { body, name } of policies.values()) {
      for (const call of body.matchAll(CLUB_HELPER_CALL)) {
        const argument = call[2];
        if (argument === '') continue;
        // Unlike a function body (always an aliased subquery, e.g. s.club_id), a
        // policy's USING/WITH CHECK clause reads its OWN table's columns bare —
        // "club_id" with no alias IS the row's own (possibly nullable) column, so
        // both forms count here.
        if (!/^(?:[a-z_][a-z0-9_]*\.)?club_id$/i.test(argument)) continue;
        found.add(`${name} -> ${call[1]}`);
      }
    }

    expect([...found].sort()).toEqual([...REVIEWED_CLUB_HELPER_POLICY_SITES].sort());
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
