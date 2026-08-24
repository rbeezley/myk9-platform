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
// `emergency_packet_input` is rebuilt in full by each successive
// `CREATE OR REPLACE`; the latest is `20260824150000` (MYK9-243, the armband
// label). Every assertion about that function's body must read the LATEST
// definition — asserting against a superseded file passes against text that no
// longer describes the deployed function. This path is the one thing here that
// MUST be updated whenever the function is rebuilt again.
const sql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260824150000_emergency_packet_armband_label.sql'
  ),
  'utf8'
);

// `public.emergency_packet_section` is a SEPARATE helper function that
// `20260823170000` calls but does not redefine — its own most recent
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

  it('takes the armband from the AUTHORITATIVE table, not the denormalised copy', () => {
    // MYK9-243. `armbands` is written atomically by assign_armband;
    // `entries.armband` is a denormalised copy that lags an unsynced
    // replication UPDATE. The previous expression read the copy FIRST, so a
    // stale value beat the canonical one and put a wrong armband on show-day
    // paper — the opposite of what its own comment claimed.
    expect(sql).toMatch(/FROM public\.armbands a2/);
    expect(sql).toMatch(/a2\.show_id = p_show_id/);
    expect(sql).toMatch(/a2\.dog_id = e\.dog_id/);
    // Authoritative first, entries only as the fallback for a dog with no
    // `armbands` row at all.
    expect(sql).toMatch(
      /NULLIF\(btrim\(COALESCE\(NULLIF\(btrim\(ab\.armband_number\), ''\), e\.armband, ''\)\), ''\)\s*\n\s*AS armband,/
    );
    // The exact inverted order that shipped, named so it cannot come back.
    expect(sql).not.toMatch(/COALESCE\(NULLIF\(btrim\(e\.armband\), ''\), ab\.armband_number/);
    // Same precedence for the fallback call name, or a dog is named after a
    // number its own row no longer shows.
    expect(sql).toMatch(
      /'Dog ' \|\| COALESCE\(NULLIF\(btrim\(ab\.armband_number\), ''\), NULLIF\(btrim\(e\.armband\), ''\), '\?'\)/
    );
  });

  it('emits the armband as a text LABEL, never a numeric sentinel', () => {
    // MYK9-243. Suffixed armbands ("12A") are real. The old body cast to int
    // with `ELSE 0`, so one printed as `#0` — a number no dog wears — and
    // sorted ahead of every genuine entry.
    expect(sql).not.toMatch(/ELSE 0\s*\n\s*END AS armband,/);
    // Ordering comes from a separate leading-digits key, so "12A" still sorts
    // beside 12 rather than by text (where "9" would follow "10").
    expect(sql).toMatch(/AS armband_sort/);
    expect(sql).toMatch(/ORDER BY e\.run_order NULLS LAST, e\.armband_sort NULLS LAST/);
  });

  it('never casts a free-text armband straight to int', () => {
    // `entries.armband` is TEXT and unconstrained; a suffixed armband ("12A")
    // through a bare ::int aborts the whole packet for one odd value. The
    // label itself is no longer cast at all (MYK9-243) — only the sort key is,
    // and it takes a BOUNDED leading-digits substring: an unbounded run of
    // digits overflows int and `integer out of range` aborts the whole packet,
    // which is the crash this guard has always been about.
    expect(sql).toMatch(/from '\^\[0-9\]\{1,9\}'/);
    expect(sql).not.toMatch(/from '\^\[0-9\]\+'/);
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
