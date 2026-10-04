import { describe, expect, it } from 'vitest';

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CLUB_HELPER_CALL,
  clubIdColumnTable,
  isCallGuarded,
  migrationsDir,
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
 * this user a secretary anywhere?" and ~115 call sites rely on that. So passing
 * a NULLABLE club_id column positionally lets a row with no club match EVERY
 * active secretary and club admin on the platform.
 *
 * `shows.club_id` was nullable, and MYK9-258 (20260828230000) guarded every
 * shows-derived call with `s.club_id IS NOT NULL AND …`. MYK9-1008
 * (20261004181900) made the column NOT NULL and removed those guards, so a call
 * that reads a shows row's club_id is now safe by the column, and the cases
 * below require it to be either that or explicitly guarded.
 *
 * This is a source contract rather than a behavioural one on purpose. The
 * behavioural test (`supabase/tests/myk9_1008_show_requires_club_test.sql`)
 * proves the callers behave; it cannot prove anything about a NEW caller
 * nobody has written yet. Only reading the migration text catches that,
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
  // SAFE: read shows.club_id, NOT NULL since 20261004181900 (MYK9-1008), which
  // removed the MYK9-258 / MYK9-470 / MYK9-474 `s.club_id IS NOT NULL` guards.
  'can_manage_show -> is_trial_secretary',
  'can_manage_trial -> is_club_admin',
  'can_manage_trial -> is_trial_secretary',
  'manageable_show_ids -> is_club_admin',
  'manageable_show_ids -> is_trial_secretary',
  'is_show_office_manager -> is_trial_secretary',
  'get_entries_for_export -> is_trial_secretary',
  'get_show_officials -> is_club_admin',
  'can_manage_show_lifecycle_email -> is_club_admin',
  'can_manage_show_lifecycle_email -> is_trial_secretary',
  // Guarded by ur.club_id IS NOT NULL in 20260910181537 (MYK9-457).
  'get_visible_person_roles -> is_club_admin',
  'get_visible_person_roles -> is_trial_secretary',
  'get_visible_person_ids_by_role -> is_club_admin',
  'get_visible_person_ids_by_role -> is_trial_secretary',
  // SAFE: shows.club_id, as above.
  'trial_secretary_show_ids -> is_trial_secretary',
  'entry_enrollment_select_show_ids -> is_trial_secretary',
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

    // Read the SQL before adding an entry: either the column is NOT NULL (a
    // shows row's club_id) or the guard belongs in the call's own boolean
    // branch, as `<alias>.club_id IS NOT NULL AND …`.
    expect([...found].sort()).toEqual([...REVIEWED_CLUB_HELPER_CALL_SITES].sort());
  });

  it('every reviewed call reads a NOT NULL club_id or carries the guard (MYK9-1008)', () => {
    // Per CALL. A shows row's club_id is NOT NULL; any other table's column
    // (user_roles.club_id is nullable: a NULL there is a platform-wide role)
    // must still be guarded in the call's own boolean branch.
    const unsafe: string[] = [];
    let showsCalls = 0;
    for (const [name, { body, file }] of definitions) {
      if (name === 'is_club_admin' || name === 'is_trial_secretary') continue;
      for (const call of body.matchAll(CLUB_HELPER_CALL)) {
        const argument = call[2]!;
        if (!/^[a-z_][a-z0-9_]*\.club_id$/i.test(argument)) continue;
        const table = clubIdColumnTable(body, argument, '');
        if (table !== undefined && NOT_NULL_CLUB_ID_TABLES.includes(table)) {
          showsCalls += table === 'shows' ? 1 : 0;
          continue;
        }
        if (isCallGuarded(body, call.index, argument, '')) continue;
        unsafe.push(`${name} -> ${call[1]}(${argument}) (${file})`);
      }
    }
    expect(unsafe).toEqual([]);
    // Guards the guard: the shows sites must actually resolve to `shows`, or
    // the NOT NULL exemption above was never exercised.
    expect(showsCalls).toBeGreaterThanOrEqual(10);
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
 *     - shows.club_id: NOT NULL since 20261004181900 (MYK9-1008), which also
 *       removed the guards from every policy that reads a shows row's club_id.
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
 * `shows.club_id` WAS nullable, which is why every shows-derived site needed
 * the guard until MYK9-1008; show_templates.club_id still is, so
 * show_templates_select keeps its guard.
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
  // GUARDED: show_templates.club_id is nullable (a NULL is a platform template).
  'show_templates_select -> is_club_admin',
  'show_templates_select -> is_trial_secretary',
  // SAFE: shows.club_id is NOT NULL (20261004181900, MYK9-1008). Every entry
  // from here down reads a shows row's club_id; their `club_id IS NOT NULL`
  // guards (MYK9-585, MYK9-636 and earlier) were removed by that migration.
  // Behavioural coverage: supabase/tests/cross_club_policy_authorization_test.sql
  // and show_announcements_scope_test.sql.
  'entry_payment_links_select -> is_club_admin',
  'show_payouts_select -> is_club_admin',
  'shows_select -> is_club_admin',
  'entry_status_history_select -> is_club_admin',
  'Authenticated users can create announcements -> is_club_admin',
  'Authenticated users can create announcements -> is_trial_secretary',
  'Author or admin can delete announcements -> is_club_admin',
  'Author or admin can delete announcements -> is_trial_secretary',
  'Author or admin can update announcements -> is_club_admin',
  'Author or admin can update announcements -> is_trial_secretary',
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
 * Tables whose `club_id` is declared `NOT NULL`, so a policy or function that
 * reads one of them can hand the column to a club-scoped helper with no guard. Verified against
 * `information_schema.columns.is_nullable` on the linked database
 * (sojmvhhwsjxmfistvzbe) as well as the declaring migrations, 2026-09-16.
 *
 * This is the ONE thing the guard assertion below cannot read out of the
 * migration set cheaply — column nullability can be set by a CREATE TABLE, an
 * ALTER TABLE, or a later ALTER ... DROP NOT NULL, in any file. Everything
 * else it decides from the policy text itself.
 */
const NOT_NULL_CLUB_ID_TABLES: readonly string[] = [
  // 20261004181900 (MYK9-1008); pinned by the "shows.club_id stays NOT NULL"
  // case below, which reads the migration set rather than trusting this line.
  'shows',
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
    // (shows_select was the probe until MYK9-1008 re-declared it with ALTER POLICY.)
    expect(policies.get('club_stripe_accounts::club_stripe_accounts_select')?.body).toMatch(
      /create\s+policy\s+club_stripe_accounts_select/i
    );
    // Quoted CREATE POLICY.
    expect(policies.get('show_templates::show_templates_select')?.body).toMatch(
      /create\s+policy\s+"show_templates_select"/i
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

  it('every registered policy CALL reads a NOT NULL club_id or carries the guard (MYK9-585, MYK9-1008)', () => {
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
    // this catches a listed site that is neither NOT NULL nor guarded, and
    // supabase/tests/cross_club_policy_authorization_test.sql is the only one of
    // the three that executes SQL against the real schema.
    const unguarded: string[] = [];

    for (const [key, { body, name, file }] of policies) {
      const table = key.slice(0, key.indexOf('::'));

      for (const call of body.matchAll(CLUB_HELPER_CALL)) {
        const argument = call[2];
        if (!/^(?:[a-z_][a-z0-9_]*\.)?club_id$/i.test(argument)) continue;
        const columnTable = clubIdColumnTable(body, argument, table);
        if (columnTable !== undefined && NOT_NULL_CLUB_ID_TABLES.includes(columnTable)) continue;
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

  it('resolves a club_id argument to the table it reads (MYK9-1008)', () => {
    // Known answers for the exemption above. A resolver that answered `shows`
    // for everything would wave every unguarded call through.
    const body = `create policy p on public.classes using (
      exists (
        select 1 from public.trials t
        join public.shows s on s.id = t.show_id
        join show_templates as st on st.id = s.template_id
        where (select public.is_club_admin(s.club_id))
          or (select public.is_club_admin(t.club_id))
          or (select public.is_club_admin(st.club_id))
          or (select public.is_club_admin(x.club_id))
      )
    );`;
    expect(clubIdColumnTable(body, 's.club_id', 'classes')).toBe('shows');
    expect(clubIdColumnTable(body, 't.club_id', 'classes')).toBe('trials');
    expect(clubIdColumnTable(body, 'st.club_id', 'classes')).toBe('show_templates');
    expect(clubIdColumnTable(body, 'x.club_id', 'classes')).toBeUndefined();
    expect(clubIdColumnTable(body, 'club_id', 'classes')).toBe('classes');
    expect(clubIdColumnTable(body, 'classes.club_id', 'classes')).toBe('classes');
    // One alias bound to two different tables is ambiguous, so it is unknown.
    const ambiguous = 'select 1 from public.shows s; select 1 from public.trials s;';
    expect(clubIdColumnTable(ambiguous, 's.club_id', 'classes')).toBeUndefined();
  });

  it('shows.club_id stays NOT NULL in the migration set (MYK9-1008)', () => {
    // The exemption for shows is only as good as the column. The last
    // migration to change its nullability must be the SET NOT NULL.
    const change =
      /alter\s+table\s+(?:only\s+)?(?:public\.)?shows\s+alter\s+column\s+club_id\s+(set|drop)\s+not\s+null/gi;
    const changes: { file: string; action: string }[] = [];
    for (const file of readdirSync(migrationsDir)
      .filter(name => name.endsWith('.sql'))
      .sort()) {
      const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
      for (const match of sql.matchAll(change)) {
        changes.push({ file, action: match[1]!.toLowerCase() });
      }
    }
    expect(changes.at(-1)).toEqual({
      file: '20261004181900_myk9_1008_show_requires_club.sql',
      action: 'set',
    });
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
