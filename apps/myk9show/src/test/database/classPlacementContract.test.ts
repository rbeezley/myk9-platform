import { readFileSync } from 'node:fs';
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
const gateMigration = readFileSync(
  resolve(migrationsDir, '20260615160000_add_shows_is_nationals_placement_source.sql'),
  'utf8'
);
const normalizeMigration = readFileSync(
  resolve(migrationsDir, '20260625180000_normalize_final_placement_default_null.sql'),
  'utf8'
);

// The function has two ranking branches: nationals (points) vs regular (faults).
const nationalsBranch = placementMigration.slice(
  placementMigration.indexOf('IF p_is_nationals THEN'),
  placementMigration.indexOf('ELSE', placementMigration.indexOf('IF p_is_nationals THEN'))
);
const regularBranch = placementMigration.slice(
  placementMigration.indexOf('ELSE', placementMigration.indexOf('IF p_is_nationals THEN')),
  placementMigration.indexOf('END IF', placementMigration.indexOf('IF p_is_nationals THEN'))
);

describe('placement ranking — recalculate_class_placements (20260525170000)', () => {
  it('places ONLY scored + qualified entries (NQ/ABS/EX/WD get no placement)', () => {
    for (const branch of [nationalsBranch, regularBranch]) {
      expect(branch).toContain('e2.is_scored = true');
      expect(branch).toContain("e2.result_status = 'qualified'");
    }
  });

  it('clears stale placements to NULL before re-ranking', () => {
    // A changed/reset score must not leave an old placement behind.
    const clear = placementMigration.indexOf('SET final_placement = NULL');
    const firstRank = placementMigration.indexOf('SET final_placement = ranked.placement');
    expect(clear).toBeGreaterThanOrEqual(0);
    expect(firstRank).toBeGreaterThan(clear); // clear precedes assignment
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
    for (const col of ['is_scored', 'result_status', 'search_time_seconds', 'total_faults', 'points_earned']) {
      expect(placementMigration).toContain(col);
    }
  });
});

describe('full-scored gate — refresh_class_scoring_state (20260615160000)', () => {
  it('computes placements ONLY when every entry in the class is scored', () => {
    const gate = gateMigration.indexOf('IF v_scored_count = v_total_count THEN');
    const recalc = gateMigration.indexOf('PERFORM public.recalculate_class_placements');
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(recalc).toBeGreaterThan(gate); // recalc lives inside the fully-scored branch
  });

  it('clears placements while a class is only partially scored', () => {
    // Between the gate and the end, the partial/none branches null placements out.
    const afterRecalc = gateMigration.slice(
      gateMigration.indexOf('PERFORM public.recalculate_class_placements')
    );
    expect(afterRecalc).toContain('SET final_placement = NULL');
  });

  it('derives nationals-vs-regular from shows.is_nationals (not hard-coded)', () => {
    expect(gateMigration).toContain('s.is_nationals');
    expect(gateMigration).toContain(
      'recalculate_class_placements(ARRAY[p_class_id], COALESCE(v_is_nationals, false))'
    );
  });
});

describe('final_placement NULL normalization (20260625180000)', () => {
  it('backfills the legacy 0 sentinel to NULL', () => {
    expect(normalizeMigration).toMatch(
      /UPDATE public\.entries\s+SET final_placement = NULL\s+WHERE final_placement = 0/
    );
  });

  it('drops the DEFAULT so new rows are born unplaced (NULL), not 0', () => {
    expect(normalizeMigration).toContain(
      'ALTER COLUMN final_placement DROP DEFAULT'
    );
  });

  it('tightens the CHECK so 0 (and negatives) can never return', () => {
    expect(normalizeMigration).toContain(
      'CHECK (final_placement IS NULL OR final_placement >= 1)'
    );
  });

  it('backfills BEFORE adding the tighter constraint (else the old 0s would reject it)', () => {
    const backfill = normalizeMigration.indexOf('SET final_placement = NULL');
    const addCheck = normalizeMigration.indexOf('ADD CONSTRAINT entries_final_placement_check');
    expect(backfill).toBeGreaterThanOrEqual(0);
    expect(addCheck).toBeGreaterThan(backfill);
  });
});
