import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `emergency_packet_input` is SECURITY DEFINER, so RLS is not a backstop and
 * every guarantee a policy would have provided has to be restated in the body.
 * These are properties no row-level test can catch — a test running as the
 * owner, or as an authorized caller, passes either way.
 *
 * MYK9-228.
 */
// `emergency_packet_input` was rebuilt in full by `20260823150000` (a
// `CREATE OR REPLACE` of the same function, adding two JSON keys). Every
// assertion about that function's body must read the LATEST definition —
// asserting against the superseded `20260821220000` file would pass against
// text that no longer describes the deployed function, even though today the
// two bodies happen to be byte-identical apart from the new keys.
const sql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260823150000_emergency_packet_input_hides.sql'
  ),
  'utf8'
);

// `public.emergency_packet_section` is a SEPARATE helper function that
// `20260823150000` calls but does not redefine — its own most recent
// `CREATE OR REPLACE` still lives in `20260821220000`, so the one test that
// asserts on ITS definition (not `emergency_packet_input`'s) reads this file.
const sectionDefinitionSql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260821220000_emergency_packet_input_rpc.sql'
  ),
  'utf8'
);

describe('emergency_packet_input contract', () => {
  it('runs as definer with a pinned search_path', () => {
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
    // STABLE, not VOLATILE: it reads and must be safe to call repeatedly.
    expect(sql).toMatch(/\bSTABLE\b/);
  });

  it('restates every soft-delete filter RLS would have applied', () => {
    // A tombstoned row reaching paper is worse than a missing packet: a judge
    // would score a dog that was withdrawn.
    for (const table of ['shows', 'trials', 'classes', 'entries', 'dogs', 'clubs', 'people']) {
      const alias = {
        shows: 's',
        trials: 't',
        classes: 'cl',
        entries: 'e',
        dogs: 'd',
        // A show referencing a soft-deleted club would otherwise print that
        // club's name on paperwork, since definer bypasses its RLS predicate.
        clubs: 'c',
        people: 'p',
      }[table];
      expect(sql).toMatch(new RegExp(`${alias}\\.deleted_at IS NULL`));
    }
  });

  it('performs no authorization, and therefore is not granted broadly', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.emergency_packet_input\(uuid, date\) FROM PUBLIC, anon, authenticated;/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.emergency_packet_input\(uuid, date\) TO service_role;/
    );
    // The dangerous mistake is widening this without adding a gate inside.
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.emergency_packet_input[^;]*authenticated/
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.emergency_packet_input[^;]*\banon\b/
    );
  });

  it('prefers the judge assignment over the denormalised column', () => {
    // `resolveClassJudgeName` reads the assignment FIRST, and classes created
    // via create_show_with_children leave `judge_name` null — reading only the
    // column prints an empty judge for normally configured classes.
    expect(sql).toMatch(/FROM public\.judge_assignments a/);
    expect(sql).toMatch(/a\.status = 'confirmed'/);
    expect(sql).toMatch(
      /NULLIF\(btrim\(ja\.judge_full_name\), ''\),\s*\n\s*NULLIF\(btrim\(cl\.judge_name\), ''\)/
    );
  });

  it('normalises the section sentinel the way the app does', () => {
    // `resolveClassSection` trims and treats '-' as absent; emitting it raw
    // builds labels like "Exterior Excellent -" on the page.
    expect(sectionDefinitionSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.emergency_packet_section/
    );
    expect(sectionDefinitionSql).toMatch(/btrim\(p_section\) IN \('', '-'\)/);
    // Applied to BOTH the class row and the entry's copy of it.
    expect(
      sectionDefinitionSql.match(/public\.emergency_packet_section\(/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(3);
    // `emergency_packet_input` itself still calls the helper twice in the
    // LATEST definition, even though this migration does not redefine the
    // helper — a future rewrite that drops the call would go unnoticed by
    // the assertion above alone.
    expect(sql.match(/public\.emergency_packet_section\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('leaves entries that are not running off the paperwork', () => {
    // Withdrawn and scratched entries are NOT soft-deleted; that is the normal
    // lifecycle. `replicatedRunQueue`'s NOT_RUNNING_LIFECYCLE excludes exactly
    // these three, and paper that disagrees hands a judge a row for a dog that
    // is not competing.
    // Union of isRunnableScheduleStatus and the run queue's set, in the RAW
    // spellings the column holds. `moved` is the sharpest: a move-up leaves
    // the ORIGINAL row behind, so including it prints the dog twice.
    for (const raw of [
      'withdrawn',
      'cancelled',
      'not_accepted',
      'rejected',
      'promotion-expired',
      'scratched',
      'moved',
      'absent',
    ]) {
      expect(sql).toContain(`'${raw}'`);
    }
    // Two axes, and the check-in one wins: `pulled` only ever lives on
    // `check_in_status`, so a lifecycle-only filter leaves a dog pulled at the
    // gate on the sheet. `in-ring` must NOT be excluded — that dog is running.
    expect(sql).toMatch(/COALESCE\(e\.check_in_status, ''\) <> 'pulled'/);
    expect(sql).not.toMatch(/check_in_status[^\n]*'in-ring'/);
  });

  it('drops a cancelled trial or class, which soft-delete does not cover', () => {
    // Both `trials_status_check` and `classes_status_check` permit
    // 'cancelled', and neither sets deleted_at. A day holding two trials, one
    // cancelled, would otherwise print a full section for the one not running.
    expect(sql).toMatch(/COALESCE\(t\.status, ''\) <> 'cancelled'/);
    expect(sql).toMatch(/COALESCE\(cl\.status, ''\) <> 'cancelled'/);
  });

  it('backfills the armband from the authoritative table', () => {
    // `entries.armband` is a denormalised copy that lags an unsynced
    // replication UPDATE; `armbands` is written atomically by assign_armband
    // and the Reports read path backfills from it by (show_id, dog_id).
    // Without this, two seeded entries print as "#0" — two misidentified dogs
    // on a scoresheet, and a wrong running order.
    expect(sql).toMatch(/FROM public\.armbands a2/);
    expect(sql).toMatch(/a2\.show_id = p_show_id/);
    expect(sql).toMatch(/a2\.dog_id = e\.dog_id/);
    // Denormalised value wins when present; the table fills the gap.
    expect(sql).toMatch(/COALESCE\(NULLIF\(btrim\(e\.armband\), ''\), ab\.armband_number::text/);
  });

  it('never casts a free-text armband straight to int', () => {
    // `entries.armband` is TEXT and unconstrained; a suffixed armband ("12A")
    // through a bare ::int aborts the whole packet for one odd value.
    // Bounded, not just numeric: a long digit string passes an unbounded
    // regex and then `integer out of range` aborts the entire packet.
    expect(sql).toMatch(/~ '\^\[0-9\]\{1,9\}\$'/);
    expect(sql).not.toMatch(/~ '\^\[0-9\]\+\$'/);
    expect(sql).not.toMatch(/COALESCE\(e\.armband[^)]*\)::int/);
  });

  it('emits a null ring rather than a placeholder', () => {
    // Scent work has no rings and no column holds one. "Ring unassigned" reads
    // as a forgotten setting (#1728); see MYK9-227.
    expect(sql).toMatch(/'ringLabel', NULL/);
    // As a SQL literal — the comment above the line legitimately names the
    // placeholder it exists to avoid.
    expect(sql).not.toMatch(/'Ring unassigned'/);
  });

  it('returns the camelCase keys the renderer consumes', () => {
    // These are read directly as EmergencyPacketInput; renaming one silently
    // blanks a field on paper rather than failing loudly.
    for (const key of [
      'startDate',
      'endDate',
      'trialNumber',
      'registryId',
      'trialId',
      'displayOrder',
      'judgeName',
      'timeLimitSeconds',
      'timeLimitArea2Seconds',
      'timeLimitArea3Seconds',
      'numAreas',
      'runOrder',
      'callName',
      'classElement',
      'classLevel',
      'classSection',
    ]) {
      expect(sql).toContain(`'${key}',`);
    }
  });

  it('scopes to one trial day when asked, and the whole show when not', () => {
    expect(sql).toMatch(/p_trial_date IS NULL OR t\.date = p_trial_date/);
  });

  it('exposes hides and distraction counts on each class', () => {
    // The scoresheet header prints both. Without them the packet's header is
    // thinner than the Reports one and the two documents are not the same sheet.
    expect(sql).toMatch(/'numHides',\s*cl\.num_hides/);
    expect(sql).toMatch(/'distractionCount',\s*cl\.distraction_count/);
  });

  it('keeps the definer function locked down after the rebuild', () => {
    // CREATE OR REPLACE preserves the ACL, but this migration re-declares the
    // function, so the grants are restated and must still be restated correctly.
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.emergency_packet_input\(uuid, date\) FROM PUBLIC, anon, authenticated;/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.emergency_packet_input\(uuid, date\) TO service_role;/
    );
  });
});
