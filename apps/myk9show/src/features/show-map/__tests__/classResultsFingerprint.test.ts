// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  classResultsCanonicalText,
  classResultsFingerprint,
  entryResultsLine,
  type ClassResultsFingerprintEntry,
} from '../classResultsFingerprint';

/**
 * The fixture class of supabase/tests/myk9_1045_results_verified_test.sql, as the client
 * replica holds it AFTER the server ranked it: numbers as JSON numbers (45.20 arrives as
 * 45.2), the placement as the string the entries mapper stores, defaults the server filled
 * in (0) spelled out. Keep the two in step: both pin FIXTURE_HASH.
 */
const FIXTURE: ClassResultsFingerprintEntry[] = [
  {
    // Soft-deleted qualified run: no line.
    id: '00000000-0000-0000-0000-000000104510',
    deleted_at: '2026-10-08T01:43:00Z',
    is_scored: true,
    result_status: 'qualified',
    search_time_seconds: 1,
    area1_time_seconds: 1,
    area2_time_seconds: 0,
    area3_time_seconds: 0,
    area4_time_seconds: 0,
    total_correct_finds: 1,
    total_incorrect_finds: 0,
    total_faults: 0,
    no_finish_count: 0,
    total_score: 0,
    points_earned: 0,
    final_placement: null,
    disqualification_reason: null,
  },
  {
    id: '00000000-0000-0000-0000-000000104513',
    deleted_at: null,
    is_scored: true,
    result_status: 'qualified',
    search_time_seconds: 45.2,
    area1_time_seconds: 45.2,
    area2_time_seconds: 0,
    area3_time_seconds: 0,
    area4_time_seconds: 0,
    total_correct_finds: 1,
    total_incorrect_finds: 0,
    total_faults: 0,
    no_finish_count: 0,
    total_score: 0,
    points_earned: 0,
    final_placement: '1',
    disqualification_reason: null,
  },
  {
    id: '00000000-0000-0000-0000-000000104511',
    deleted_at: null,
    is_scored: true,
    result_status: 'qualified',
    search_time_seconds: 30.5,
    area1_time_seconds: 30.5,
    area2_time_seconds: 0,
    area3_time_seconds: 0,
    area4_time_seconds: 0,
    total_correct_finds: 1,
    total_incorrect_finds: 0,
    total_faults: 1,
    no_finish_count: 0,
    total_score: 0,
    points_earned: 0,
    final_placement: 2,
    disqualification_reason: null,
  },
  {
    id: '00000000-0000-0000-0000-000000104512',
    deleted_at: null,
    is_scored: true,
    result_status: 'nq',
    search_time_seconds: 12,
    area1_time_seconds: 12,
    area2_time_seconds: 0,
    area3_time_seconds: 0,
    area4_time_seconds: 0,
    total_correct_finds: 0,
    total_incorrect_finds: 0,
    total_faults: 3,
    no_finish_count: 0,
    total_score: 0,
    points_earned: 0,
    final_placement: undefined,
    disqualification_reason: 'Handler said "a|b\\c"\nthen left',
  },
  {
    id: '00000000-0000-0000-0000-000000104514',
    deleted_at: null,
    is_scored: false,
    result_status: 'absent',
    search_time_seconds: 0,
    area1_time_seconds: 0,
    area2_time_seconds: 0,
    area3_time_seconds: 0,
    area4_time_seconds: 0,
    total_correct_finds: 0,
    total_incorrect_finds: 0,
    total_faults: 0,
    no_finish_count: 0,
    total_score: 0,
    points_earned: 0,
    final_placement: null,
    disqualification_reason: null,
  },
  {
    // Scratched, never ran: no line.
    id: '00000000-0000-0000-0000-000000104515',
    deleted_at: null,
    is_scored: false,
    result_status: 'pending',
    search_time_seconds: 0,
    area1_time_seconds: 0,
    area2_time_seconds: 0,
    area3_time_seconds: 0,
    area4_time_seconds: 0,
    total_correct_finds: 0,
    total_incorrect_finds: 0,
    total_faults: 0,
    no_finish_count: 0,
    total_score: 0,
    points_earned: 0,
    final_placement: null,
    disqualification_reason: null,
  },
];

/** Also pinned in supabase/tests/myk9_1045_results_verified_test.sql (PASS 2). */
const FIXTURE_HASH = '4d0d56e5b7bb8cdb47591069945876b6bd09bc638cec4c559f0d3669d9612e46';

describe('classResultsFingerprint (MYK9-1045)', () => {
  it('writes the canonical text the SQL fingerprint hashes', () => {
    expect(classResultsCanonicalText(FIXTURE)).toBe(
      [
        'myk9-class-results-v1',
        '00000000-0000-0000-0000-000000104511|1|qualified|30.5|30.5|0|0|0|1|0|1|0|0|0|2|\\N',
        '00000000-0000-0000-0000-000000104512|1|nq|12|12|0|0|0|0|0|3|0|0|0|\\N|Handler said "a\\|b\\\\c"\\nthen left',
        '00000000-0000-0000-0000-000000104513|1|qualified|45.2|45.2|0|0|0|1|0|0|0|0|0|1|\\N',
        '00000000-0000-0000-0000-000000104514|0|absent|0|0|0|0|0|0|0|0|0|0|0|\\N|\\N',
      ].join('\n')
    );
  });

  it('agrees with the SQL fingerprint on the shared fixture', async () => {
    await expect(classResultsFingerprint(FIXTURE)).resolves.toBe(FIXTURE_HASH);
  });

  it('does not depend on the order the replica lists entries in', async () => {
    await expect(classResultsFingerprint([...FIXTURE].reverse())).resolves.toBe(FIXTURE_HASH);
  });

  it('reads numeric strings, a placement of 0 and missing values the way the server does', () => {
    const base = FIXTURE[2]!;
    expect(entryResultsLine({ ...base, search_time_seconds: '30.50', final_placement: '2' })).toBe(
      entryResultsLine(base)
    );
    expect(entryResultsLine({ ...base, final_placement: 0 })).toBe(
      entryResultsLine({ ...base, final_placement: null })
    );
    expect(entryResultsLine({ ...base, disqualification_reason: undefined })).toBe(
      entryResultsLine({ ...base, disqualification_reason: null })
    );
  });

  it('changes when a result changes, and not for a lifecycle-only difference', async () => {
    const corrected = FIXTURE.map(entry =>
      entry.id.endsWith('104511') ? { ...entry, search_time_seconds: 30.25 } : entry
    );
    await expect(classResultsFingerprint(corrected)).resolves.not.toBe(FIXTURE_HASH);

    // An unscored, pending entry has no line, so adding or dropping one changes nothing.
    const withWaitlisted = [
      ...FIXTURE,
      { id: '00000000-0000-0000-0000-000000104519', is_scored: false, result_status: 'pending' },
    ];
    await expect(classResultsFingerprint(withWaitlisted)).resolves.toBe(FIXTURE_HASH);
  });
});
