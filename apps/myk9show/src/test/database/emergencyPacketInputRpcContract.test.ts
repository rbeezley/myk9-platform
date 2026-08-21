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
const sql = readFileSync(
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
    for (const table of ['shows', 'trials', 'classes', 'entries', 'dogs']) {
      const alias = { shows: 's', trials: 't', classes: 'cl', entries: 'e', dogs: 'd' }[table];
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

  it('never casts a free-text armband straight to int', () => {
    // `entries.armband` is TEXT and unconstrained; a suffixed armband ("12A")
    // through a bare ::int aborts the whole packet for one odd value.
    expect(sql).toMatch(/~ '\^\[0-9\]\+\$'/);
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
});
