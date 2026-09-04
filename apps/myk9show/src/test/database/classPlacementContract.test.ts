import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Placement is computed SERVER-SIDE and is value-sensitive (a wrong ORDER BY
// silently mis-ranks a class), yet had no test. These are static SQL-content
// contracts pinning the ranking invariants. The behavior was verified live
// against staging on 2026-06-25: Container Novice A, three qualifiers all at 0
// faults, ranked strictly by ascending search time — 38.50s -> 1st, 41.20s ->
// 2nd, 45.80s -> 3rd. This guards that a future migration can't quietly change
// the ranking keys, the qualified-only filter, the stale-clear, or the
// "only when the class is fully scored" gate without updating this contract.
//
// Authoritative sources:
//   recalculate_class_placements(uuid[], boolean) — the rank assignment
//   refresh_class_scoring_state(uuid)             — the full-scored gate + trigger

const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations');
const placementMigration = readFileSync(
  resolve(migrationsDir, '20260525170000_server_side_scoring_completion.sql'),
  'utf8'
);

// The ranking body has been redefined since 20260525170000, so pinning that
// file would validate SQL the database no longer runs. Discover the LATEST
// migration that redefines the function and assert against THAT — then pin its
// name, so a future redefinition fails here loudly instead of leaving this
// contract silently checking a superseded definition.
const rankingMigrationFiles = readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .filter(file =>
    readFileSync(resolve(migrationsDir, file), 'utf8').includes(
      'CREATE OR REPLACE FUNCTION public.recalculate_class_placements'
    )
  )
  .sort();
const latestRankingMigrationFile = rankingMigrationFiles[rankingMigrationFiles.length - 1];
const rankingMigration = readFileSync(resolve(migrationsDir, latestRankingMigrationFile), 'utf8');
// Same latest-wins discovery for the CALLER. This was pinned to
// 20260615160000 while the database had moved on through 20260713101000,
// 20260727235900 and 20260817140000 — so it was asserting the
// `v_scored_count = v_total_count` shape against a definition that no longer
// exists. Discover the newest redefinition and pin its NAME instead.
const gateMigrationFiles = readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .filter(file =>
    readFileSync(resolve(migrationsDir, file), 'utf8').includes(
      'CREATE OR REPLACE FUNCTION public.refresh_class_scoring_state(p_class_id uuid)'
    )
  )
  .sort();
const latestGateMigrationFile = gateMigrationFiles[gateMigrationFiles.length - 1];
const gateMigration = readFileSync(resolve(migrationsDir, latestGateMigrationFile), 'utf8');

// Body only — from `AS $$` to its closing `$$;`. The header comment of
// 20260817140000 quotes SQL while explaining a rejected alternative, so
// matching over the whole file picks up prose as if it were a statement.
const gateBody = gateMigration.slice(
  gateMigration.indexOf('AS $$'),
  gateMigration.indexOf('$$;', gateMigration.indexOf('AS $$'))
);

// Every placement-clearing UPDATE in the body, statement text only. They split
// into two kinds and the difference is the whole safety argument:
//   * three CLASS-WIDE clears in the derived terminal branches, which must NOT
//     filter deleted_at (that is what strips an emptied class's tombstone), and
//   * one TOMBSTONE-SCOPED clear in the manual early return, which must filter
//     deleted_at (a class-wide clear there would wipe pinned results).
const allPlacementClears =
  gateBody.match(/UPDATE public\.entries\s+SET final_placement = NULL\s+WHERE[^;]*;/g) ?? [];
const terminalClears = allPlacementClears.filter(clear => !clear.includes('deleted_at'));
const manualTombstoneClears = allPlacementClears.filter(clear =>
  clear.includes('deleted_at IS NOT NULL')
);
const normalizeMigration = readFileSync(
  resolve(migrationsDir, '20260625180000_normalize_final_placement_default_null.sql'),
  'utf8'
);
const scoringGrantMigration = readFileSync(
  resolve(migrationsDir, '20260703120000_revoke_scoring_fns_from_public.sql'),
  'utf8'
);
const forceRlsSweepMigration = readFileSync(
  resolve(migrationsDir, '20260703121000_force_rls_sweep_2026_07.sql'),
  'utf8'
);

// The function has two ranking branches: nationals (points) vs regular (faults).
const nationalsBranch = rankingMigration.slice(
  rankingMigration.indexOf('IF p_is_nationals THEN'),
  rankingMigration.indexOf('ELSE', rankingMigration.indexOf('IF p_is_nationals THEN'))
);
const regularBranch = rankingMigration.slice(
  rankingMigration.indexOf('ELSE', rankingMigration.indexOf('IF p_is_nationals THEN')),
  rankingMigration.indexOf('END IF', rankingMigration.indexOf('IF p_is_nationals THEN'))
);
// The stale-clearing UPDATE only — not the comment above it, which discusses
// deleted_at at length.
const clearStatement = rankingMigration.slice(
  rankingMigration.indexOf('UPDATE public.entries\n    SET final_placement = NULL'),
  rankingMigration.indexOf('IF p_is_nationals THEN')
);

describe('placement ranking — recalculate_class_placements (latest definition)', () => {
  it('asserts against the newest migration that redefines the function', () => {
    // If this fails, a later migration redefined the ranking: repoint the pin
    // rather than deleting it, and re-check every assertion below against the
    // new body. Silently leaving it behind is how a contract goes vacuous.
    expect(latestRankingMigrationFile).toBe(
      '20260817120000_placement_ranking_ignores_soft_deleted_entries.sql'
    );
  });

  it('places ONLY scored + qualified entries (NQ/ABS/EX/WD get no placement)', () => {
    for (const branch of [nationalsBranch, regularBranch]) {
      expect(branch).toContain('e2.is_scored = true');
      expect(branch).toContain("e2.result_status = 'qualified'");
    }
  });

  it('excludes SOFT-DELETED entries from the ranking in both branches', () => {
    // A tombstoned entry that was scored + qualified used to keep its
    // ROW_NUMBER() slot, pushing every live entry below it down one place
    // (1/2/3 -> soft-delete the 2nd -> survivors stranded at 1 and 3).
    for (const branch of [nationalsBranch, regularBranch]) {
      expect(branch).toContain('e2.deleted_at IS NULL');
    }
  });

  it('clears stale placements to NULL before re-ranking', () => {
    // A changed/reset score must not leave an old placement behind.
    const clear = rankingMigration.indexOf('SET final_placement = NULL');
    const firstRank = rankingMigration.indexOf('SET final_placement = ranked.placement');
    expect(clear).toBeGreaterThanOrEqual(0);
    expect(firstRank).toBeGreaterThan(clear); // clear precedes assignment
  });

  it('clears placements on soft-deleted rows too, so a tombstone is left unplaced', () => {
    // Deliberately NOT filtered by deleted_at, unlike the identical-looking
    // clears in refresh_class_scoring_state: those are terminal, this one is
    // followed by re-assignment. Filtering here would leave the deleted entry
    // holding the placement the live entry below it is about to be given, and
    // view_entry_with_results / view_myk9q_entries / view_stats_summary do not
    // filter deleted_at.
    expect(clearStatement).toContain('WHERE class_id = v_class_id');
    expect(clearStatement).not.toContain('deleted_at');
  });

  it('ranks a REGULAR class by fewest faults, then fastest time', () => {
    expect(regularBranch).toContain('ROW_NUMBER() OVER (');
    const faults = regularBranch.indexOf('e2.total_faults ASC NULLS LAST');
    const time = regularBranch.indexOf('e2.search_time_seconds ASC NULLS LAST');
    expect(faults).toBeGreaterThanOrEqual(0);
    expect(time).toBeGreaterThan(faults); // faults is the primary key, time the tiebreak
  });

  it('ranks a NATIONALS class by most points, then fastest time', () => {
    expect(nationalsBranch).toContain('ROW_NUMBER() OVER (');
    const points = nationalsBranch.indexOf('e2.points_earned DESC NULLS LAST');
    const time = nationalsBranch.indexOf('e2.search_time_seconds ASC NULLS LAST');
    expect(points).toBeGreaterThanOrEqual(0);
    expect(time).toBeGreaterThan(points);
  });

  it('recomputes on score writes via an AFTER UPDATE trigger over the scoring columns', () => {
    expect(placementMigration).toContain('CREATE TRIGGER entries_refresh_class_scoring_state');
    for (const col of [
      'is_scored',
      'result_status',
      'search_time_seconds',
      'total_faults',
      'points_earned',
    ]) {
      expect(placementMigration).toContain(col);
    }
  });
});

describe('completion gate — refresh_class_scoring_state (latest definition)', () => {
  it('asserts against the newest migration that redefines the function', () => {
    // Same rule as the ranking pin above: repoint it at the new file and
    // re-check every assertion below, rather than deleting it.
    expect(latestGateMigrationFile).toBe(
      '20260904160000_exclude_absent_entries_from_class_rollup.sql'
    );
  });

  it('excludes absent lifecycle rows from the expected denominator', () => {
    expect(gateBody).toContain("'not_accepted', 'absent'");
    expect(gateMigration).toContain("COALESCE(NEW.entry_status, '') NOT IN");
    expect(gateMigration).toContain("'not_accepted', 'absent'");
  });

  it('computes placements ONLY in the fully-accounted-for branch', () => {
    const branch = gateBody.indexOf('ELSIF v_accounted_count = v_expected_count THEN');
    const recalc = gateBody.indexOf('PERFORM public.recalculate_class_placements');
    const nextBranch = gateBody.indexOf('ELSIF v_accounted_count > 0 THEN');
    expect(branch).toBeGreaterThanOrEqual(0);
    expect(recalc).toBeGreaterThan(branch);
    expect(recalc).toBeLessThan(nextBranch); // recalc lives INSIDE that branch
  });

  it('counts only NON-DELETED entries when deciding completeness', () => {
    // The counting query must keep its deleted_at filter: a tombstoned entry
    // is not owed a run, so it must not hold the class out of 'completed'.
    expect(gateBody).toMatch(
      /INTO v_expected_count, v_accounted_count, v_scored_count\s+FROM public\.entries\s+WHERE class_id = p_class_id\s+AND deleted_at IS NULL/
    );
  });

  it('derives nationals-vs-regular from shows.is_nationals (not hard-coded)', () => {
    expect(gateBody).toContain('s.is_nationals');
    expect(gateBody).toContain(
      'recalculate_class_placements(ARRAY[p_class_id], COALESCE(v_is_nationals, false))'
    );
  });

  it('has a terminal placement-clearing UPDATE in each of the three non-ranking branches', () => {
    // v_expected_count = 0, v_accounted_count > 0, and the ELSE. If a branch
    // loses its clear, a class can drop out of 'completed' with placements
    // still attached.
    expect(terminalClears).toHaveLength(3);
  });

  it('bounds every terminal clear with final_placement IS NOT NULL', () => {
    // THE RINGSIDE GUARD (20260727235900). Without it the clear matches every
    // live entry in the class on each refresh, and each matched row pays for
    // the all-column entries triggers — increment_replication_version,
    // update_updated_at_column, and broadcast_entries_showday_change, which
    // calls realtime.send() per row — plus a row lock held to end of
    // transaction. That is the check-in that hung inside ringside_update_entry.
    // Behavioral counterpart: section 4 of
    // supabase/tests/placement_soft_delete_ranking_test.sql.
    for (const clear of allPlacementClears) {
      expect(clear).toContain('AND final_placement IS NOT NULL');
    }
  });

  it('accounts for every placement-clearing UPDATE in the body', () => {
    // Three class-wide + one tombstone-scoped. A new clear matching neither
    // shape means the safety split above needs re-deriving, not re-counting.
    expect(allPlacementClears).toHaveLength(4);
    expect(manualTombstoneClears).toHaveLength(1);
  });

  it('scopes the MANUAL-branch clear to soft-deleted rows only', () => {
    // status_source = 'manual' means a human pinned this class — its placements
    // are equally deliberate. Widening this to the class-wide form used by the
    // derived branches would wipe every published placement in the class on any
    // triggering entry write. Behavioral counterpart: section 5.3 of
    // supabase/tests/placement_soft_delete_ranking_test.sql.
    const [manualClear] = manualTombstoneClears;
    expect(manualClear).toContain('AND deleted_at IS NOT NULL');
    expect(manualClear).toContain('AND final_placement IS NOT NULL');
  });

  it('runs the manual clear inside the manual branch, before its early RETURN', () => {
    const manualBranch = gateBody.indexOf("IF v_status_source = 'manual' THEN");
    const manualClear = gateBody.indexOf('AND deleted_at IS NOT NULL');
    const earlyReturn = gateBody.indexOf('RETURN;', manualBranch);
    expect(manualBranch).toBeGreaterThanOrEqual(0);
    expect(manualClear).toBeGreaterThan(manualBranch);
    expect(earlyReturn).toBeGreaterThan(manualClear);
  });

  it('does NOT filter the terminal clears by deleted_at, so a tombstone is left unplaced', () => {
    // Emptying a completed class takes the v_expected_count = 0 branch, which
    // never reaches recalculate_class_placements — so this clear is the ONLY
    // thing that can strip the placement off the entry whose deletion emptied
    // it. A deleted_at filter here excludes exactly that row, and
    // view_entry_with_results / view_myk9q_entries / view_stats_summary do not
    // filter deleted_at, so the stale placement stays visible.
    for (const clear of terminalClears) {
      expect(clear).not.toContain('deleted_at');
    }
  });

  it('keeps the emptied-class branch ahead of the fully-accounted branch', () => {
    // Documents the ordering that creates the boundary: v_expected_count = 0 is
    // tested FIRST, so an emptied class can never reach the ranking call. If
    // this ever flips, the terminal clear above stops being load-bearing and
    // the reasoning in 20260817140000 needs revisiting.
    const empty = gateBody.indexOf('IF v_expected_count = 0 THEN');
    const accounted = gateBody.indexOf('ELSIF v_accounted_count = v_expected_count THEN');
    expect(empty).toBeGreaterThanOrEqual(0);
    expect(accounted).toBeGreaterThan(empty);
  });

  it('runs with an empty search_path (SA-027 conversion)', () => {
    expect(gateMigration).toContain("SET search_path = ''");
    expect(gateMigration).not.toContain('SET search_path = public');
  });
});

describe('final_placement NULL normalization (20260625180000)', () => {
  it('backfills the legacy 0 sentinel to NULL', () => {
    expect(normalizeMigration).toMatch(
      /UPDATE public\.entries\s+SET final_placement = NULL\s+WHERE final_placement = 0/
    );
  });

  it('drops the DEFAULT so new rows are born unplaced (NULL), not 0', () => {
    expect(normalizeMigration).toContain('ALTER COLUMN final_placement DROP DEFAULT');
  });

  it('tightens the CHECK so 0 (and negatives) can never return', () => {
    expect(normalizeMigration).toContain('CHECK (final_placement IS NULL OR final_placement >= 1)');
  });

  it('backfills BEFORE adding the tighter constraint (else the old 0s would reject it)', () => {
    const backfill = normalizeMigration.indexOf('SET final_placement = NULL');
    const addCheck = normalizeMigration.indexOf('ADD CONSTRAINT entries_final_placement_check');
    expect(backfill).toBeGreaterThanOrEqual(0);
    expect(addCheck).toBeGreaterThan(backfill);
  });
});

describe('scoring SECURITY DEFINER execute grants (20260703120000)', () => {
  it('revokes direct EXECUTE on the internal placement refresh functions from public client roles', () => {
    expect(scoringGrantMigration).toContain(
      'REVOKE ALL ON FUNCTION public.recalculate_class_placements(uuid[], boolean) FROM PUBLIC, anon, authenticated'
    );
    expect(scoringGrantMigration).toContain(
      'REVOKE ALL ON FUNCTION public.refresh_class_scoring_state(uuid) FROM PUBLIC, anon, authenticated'
    );
  });

  it('keeps the manual at-show backstop behind an authorized wrapper', () => {
    expect(scoringGrantMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.refresh_class_scoring_state_authorized'
    );
    expect(scoringGrantMigration).toContain(
      'v_is_manager OR v_is_assigned_judge OR v_has_judge_claim'
    );
    expect(scoringGrantMigration).toContain("v_claim_kind = 'ringside_passcode'");
    expect(scoringGrantMigration).toContain("v_claim_role IN ('judge', 'admin')");
    expect(scoringGrantMigration).toContain('RAISE EXCEPTION');
    expect(scoringGrantMigration).toContain("USING errcode = '42501'");
    expect(scoringGrantMigration).toContain(
      'PERFORM public.refresh_class_scoring_state(p_class_id)'
    );
    expect(scoringGrantMigration).toContain(
      'GRANT EXECUTE ON FUNCTION public.refresh_class_scoring_state_authorized(uuid) TO authenticated'
    );
  });
});

describe('FORCE RLS sweep (20260703121000)', () => {
  it.each([
    'analytics_events',
    'chatbot_feedback',
    'chatbot_query_log',
    'user_guide',
    'club_access_requests',
    'entry_payment_links',
    'entry_submissions',
    'notifications',
    'organization_agreements',
    'platform_waitlist',
    'result_submissions',
    'role_requests',
    'show_incidents',
    'show_messages',
    'show_message_threads',
    'training_goals',
    'trial_judge_supplies',
  ])('forces row-level security on %s', tableName => {
    expect(forceRlsSweepMigration).toContain(
      `ALTER TABLE public.${tableName} FORCE ROW LEVEL SECURITY`
    );
  });
});
