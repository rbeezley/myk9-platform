import { describe, expect, it } from 'vitest';

import {
  CLUB_HELPER_CALL,
  isCallGuarded,
  latestDefinitions,
  latestPolicyDefinitions,
  latestViewDefinition,
} from './migrationTextScanners';

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
  'entry_enrollment_select_show_ids -> is_trial_secretary',
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
 * Call sites that pass a `club_id` column to a club-scoped helper from
 * inside an RLS policy body.
 *
 * HISTORY. Building this scanner for MYK9-571 round 2 (the
 * role_requests_select P0) surfaced PRE-EXISTING sites — none introduced by
 * that PR, and role_requests_select itself is NOT among them (its round-1
 * arm was removed, not guarded; see the migration header). They predate the
 * MYK9-258 remediation, which only ever covered the FUNCTIONS in
 * REVIEWED_CLUB_HELPER_CALL_SITES above (can_manage_show,
 * manageable_show_ids, etc.) — nobody had scanned RLS policy bodies for the
 * same trap called directly. MYK9-585 then fixed the scanner itself
 * (quoted-only names, ALTER POLICY, and a comment-semicolon truncating a
 * captured body early — see latestPolicyDefinitions() and
 * stripSqlComments()), which surfaced 11 MORE sites the first cut silently
 * missed, and registered all 34 UNGUARDED so the scanner could ship green.
 *
 * Registration was not remediation. Migration 20260916015300 (MYK9-585) is.
 * Every entry below is now in one of two states, and there is no third:
 *
 *   SAFE (NOT NULL) — the column can never be NULL, so the call is safe
 *   regardless of guard text. Verified against
 *   `information_schema.columns.is_nullable` on the linked database as well
 *   as the declaring migration:
 *     - club_premium_templates.club_id / premium_generations.club_id:
 *       `uuid not null` (188_premium_bridge_tables.sql).
 *     - club_members.club_id / club_officers.club_id: `uuid not null`
 *       (053_club_members_officers.sql).
 *     - club_stripe_accounts.club_id: `uuid not null unique`
 *       (20260609120000_stripe_connect_payouts.sql).
 *
 *   GUARDED — the predicate carries `club_id IS NOT NULL AND` in the helper
 *   call's own boolean branch, so a club-less row reaches nobody but a site
 *   admin. Three policies always had it (shows_select, show_payouts_select,
 *   entry_payment_links_select); two more (entry_status_history_select,
 *   show_templates_select) had it and were mis-annotated as unguarded in the
 *   MYK9-571 cut of this list; migration 20260916015300 added it to the
 *   remaining sixteen.
 *
 * `shows.club_id` is nullable (`information_schema.columns.is_nullable` =
 * YES), which is why every shows-derived site needed the guard and why the
 * NOT-NULL tables did not.
 *
 * A NEW entry — one a later PR adds that is not already in this list — still
 * fails the test and must be guarded (or proven NOT NULL) before it is
 * registered. What is new in MYK9-585 is that being listed here is no longer
 * enough: the `every registered policy site carries the guard` case below
 * reads the migration text, so an entry added WITHOUT a guard fails even if
 * someone adds the line here.
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
  // GUARDED before MYK9-585: the idiom's original sites.
  'entry_payment_links_select -> is_club_admin',
  'show_payouts_select -> is_club_admin',
  'shows_select -> is_club_admin',
  // GUARDED before MYK9-585, but mis-annotated as unguarded by MYK9-571.
  'entry_status_history_select -> is_club_admin',
  'show_templates_select -> is_club_admin',
  'show_templates_select -> is_trial_secretary',
  // GUARDED by 20260917163900 (MYK9-636). show_announcements' three mutation
  // policies had NO show or club predicate at all until then -- any
  // authenticated account could post a show-wide announcement onto any club's
  // show, and the show's own secretary could not delete it. The predicate is
  // copied from messages_insert above. Behavioural coverage:
  // supabase/tests/show_announcements_scope_test.sql.
  'Authenticated users can create announcements -> is_club_admin',
  'Authenticated users can create announcements -> is_trial_secretary',
  'Author or admin can delete announcements -> is_club_admin',
  'Author or admin can delete announcements -> is_trial_secretary',
  'Author or admin can update announcements -> is_club_admin',
  'Author or admin can update announcements -> is_trial_secretary',
  // GUARDED by 20260916015300 (MYK9-585). Behavioural coverage:
  // supabase/tests/null_club_policy_authorization_test.sql.
  'class_visibility_insert -> is_club_admin',
  'class_visibility_insert -> is_trial_secretary',
  'class_visibility_update -> is_club_admin',
  'class_visibility_update -> is_trial_secretary',
  'classes_select -> is_club_admin',
  'classes_select -> is_trial_secretary',
  'messages_insert -> is_club_admin',
  'messages_insert -> is_trial_secretary',
  'messages_select -> is_club_admin',
  'messages_select -> is_trial_secretary',
  'messages_update_read -> is_club_admin',
  'messages_update_read -> is_trial_secretary',
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

/**
 * Tables whose `club_id` is declared `NOT NULL`, so a policy on them can hand
 * the column to a club-scoped helper with no guard. Verified against
 * `information_schema.columns.is_nullable` on the linked database
 * (sojmvhhwsjxmfistvzbe) as well as the declaring migrations, 2026-09-16.
 *
 * This is the ONE thing the guard assertion below cannot read out of the
 * migration set cheaply — column nullability can be set by a CREATE TABLE, an
 * ALTER TABLE, or a later ALTER ... DROP NOT NULL, in any file. Everything
 * else it decides from the policy text itself.
 */
const NOT_NULL_CLUB_ID_TABLES: readonly string[] = [
  'club_members',
  'club_officers',
  'club_premium_templates',
  'club_stripe_accounts',
  'premium_generations',
];

describe('club-scoped authorization helpers are never handed a bare club_id column in an RLS policy', () => {
  const policies = latestPolicyDefinitions();

  it('parses every declaration form in the migration set (MYK9-585)', () => {
    // This was `expect(policies.size).toBe(373)`. An exact count is a brittle
    // proxy for what it was standing in for: any PR that adds or drops a policy
    // turns it red for a reason unrelated to this contract, and the reviewer
    // then updates the number without re-deriving it — which is the moment a
    // magic number stops being evidence of anything.
    //
    // What the count actually guarded was the three parser blind spots MYK9-585
    // fixed (quoted-only names, ALTER POLICY, comment-truncated bodies). So
    // assert those directly, by name, plus a floor that a silently
    // under-counting parser cannot clear.
    expect(policies.size).toBeGreaterThan(300);

    // Unquoted CREATE POLICY — the majority form, and the one the quoted-only
    // parser dropped on the floor.
    expect(policies.get('shows::shows_select')?.body).toMatch(/create\s+policy\s+shows_select/i);
    // Quoted CREATE POLICY.
    expect(policies.get('entry_status_history::entry_status_history_select')?.body).toMatch(
      /create\s+policy\s+"entry_status_history_select"/i
    );
    // ALTER POLICY tracked as a full redefinition, not ignored in favour of the
    // original CREATE.
    expect(policies.get('show_messages::messages_select')?.body).toMatch(/alter\s+policy/i);

    // Every policy the registry names must resolve, or the registry is
    // asserting against a map that no longer contains it.
    const registered = new Set(
      REVIEWED_CLUB_HELPER_POLICY_SITES.map(entry =>
        entry.slice(0, entry.indexOf(' ->')).toLowerCase()
      )
    );
    const parsed = new Set([...policies.values()].map(policy => policy.name.toLowerCase()));
    expect([...registered].filter(name => !parsed.has(name))).toEqual([]);
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

  it('every registered policy CALL carries a club_id IS NOT NULL guard (MYK9-585)', () => {
    // Per CALL, not per policy. The first cut of this case asked whether the
    // policy BODY mentioned `club_id IS NOT NULL` anywhere, and review round 1
    // broke it in two lines: keep the guard on trials_select's
    // is_club_admin(s.club_id) arm, drop it from the is_trial_secretary(s.club_id)
    // arm beside it, and the body still matches while half the policy is
    // exploitable. isCallGuarded() answers the narrower question — does some
    // enclosing parenthesis group AND this guard onto THIS call — and its own
    // header explains why that is decidable when "is this predicate correct" is
    // not.
    //
    // Division of labour, unchanged: the registry above catches a NEW call site,
    // this catches a listed site that is not actually guarded, and
    // supabase/tests/null_club_policy_authorization_test.sql is the only one of
    // the three that executes SQL against the real schema.
    const unguarded: string[] = [];

    for (const [key, { body, name, file }] of policies) {
      const table = key.slice(0, key.indexOf('::'));
      if (NOT_NULL_CLUB_ID_TABLES.includes(table)) continue;

      for (const call of body.matchAll(CLUB_HELPER_CALL)) {
        const argument = call[2];
        if (!/^(?:[a-z_][a-z0-9_]*\.)?club_id$/i.test(argument)) continue;
        if (isCallGuarded(body, call.index, argument, table)) continue;
        unguarded.push(`${table}.${name} -> ${call[1]}(${argument}) (${file})`);
      }
    }

    expect(unguarded).toEqual([]);
  });

  it('the per-call guard detector is not vacuous', () => {
    // Guards the guard twice over. The assertion above is an absence check, so
    // it would pass against a detector that returned true unconditionally, or
    // against an empty `policies` map.
    //
    // A real guarded body and a real unguarded one, both in trials_select's
    // exact shape (sibling OR arms inside an IN-subquery) — which is the shape
    // that defeated the body-level heuristic.
    const guarded = `create policy p on public.trials using (
      trials.show_id in (
        select s.id from public.shows s
        where s.status = 'published'
          or (s.club_id is not null and (select public.is_club_admin(s.club_id)))
          or (s.club_id is not null and (select public.is_trial_secretary(s.club_id)))
      )
    );`;
    const halfGuarded = guarded.replace(
      'or (s.club_id is not null and (select public.is_trial_secretary(s.club_id)))',
      'or (select public.is_trial_secretary(s.club_id))'
    );

    const verdicts = (body: string) =>
      [...body.matchAll(CLUB_HELPER_CALL)].map(call =>
        isCallGuarded(body, call.index, call[2], 'trials')
      );

    expect(verdicts(guarded)).toEqual([true, true]);
    // The half-guarded body is what a whole-body `/club_id is not null/` test
    // called clean: the surviving arm's guard is a sibling, not this call's.
    expect(halfGuarded).toMatch(/club_id is not null/i);
    expect(verdicts(halfGuarded)).toEqual([true, false]);
  });

  it("does not let another alias's guard vouch for a bare club_id (MYK9-585 round 2)", () => {
    // Review round 2's probe. The bare-form guard is accepted only when the call
    // passes the policy's OWN table's column — but an unanchored
    // `club_id IS NOT NULL` also matches INSIDE `t.club_id IS NOT NULL`, so a
    // joined table's guard read as this call's. No live policy reaches it (all
    // 16 pass `s.club_id` or `shows.club_id`), which is why it can only be
    // pinned here: nothing in the migration set would go red if the lookbehind
    // were dropped.
    const borrowed = `create policy p on public.classes using (
      exists (
        select 1 from public.trials t
        where t.id = classes.trial_id
          and t.club_id is not null
          and (select public.is_club_admin(club_id))
      )
    );`;
    const [borrowedCall] = [...borrowed.matchAll(CLUB_HELPER_CALL)];
    expect(borrowedCall).toBeDefined();
    expect(borrowedCall![2]).toBe('club_id');
    expect(isCallGuarded(borrowed, borrowedCall!.index, 'club_id', 'classes')).toBe(false);

    // ...while the genuine bare guard on the policy's own column still counts,
    // so the anchor did not simply turn the bare form off (show_templates_select
    // and shows_select are live policies written this way).
    const own = borrowed.replace('t.club_id is not null', 'club_id is not null');
    const [ownCall] = [...own.matchAll(CLUB_HELPER_CALL)];
    expect(isCallGuarded(own, ownCall!.index, 'club_id', 'classes')).toBe(true);
  });

  it('would notice a guard that disappeared from a live policy', () => {
    // Pins one policy whose guard is load-bearing. Asserted on the guard TEXT
    // and on the call-level verdict, never on which FILE last defined it — a
    // later legitimate re-ALTER of shows_update would fail a filename pin for a
    // reason that has nothing to do with this contract.
    const showsUpdate = policies.get('shows::shows_update');
    expect(showsUpdate, 'shows_update should exist in the migration set').toBeDefined();
    expect(showsUpdate?.body.toLowerCase()).toContain('club_id is not null');

    const calls = [...showsUpdate!.body.matchAll(CLUB_HELPER_CALL)];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(
        isCallGuarded(showsUpdate!.body, call.index, call[2], 'shows'),
        `shows_update -> ${call[1]}(${call[2]}) must be guarded`
      ).toBe(true);
    }
  });
});

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
