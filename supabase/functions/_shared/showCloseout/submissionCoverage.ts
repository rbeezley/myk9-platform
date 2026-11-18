/**
 * Which scores a sent results file covers (MYK9-2078, shared with the reminder in MYK9-2077).
 *
 * Deno-safe: no imports, no app code. The Finish the show list (`submissionTimes.ts`) and the
 * registry deadline reminder both read "was the file sent before a score changed" through these,
 * so a corrected file reopens the line in the list and in the email alike.
 */

export interface CoverageRow {
  status?: string | null | undefined;
  organization?: string | null | undefined;
  /** `result_submissions.submitted_at`: when the file went. */
  submitted_at?: string | null | undefined;
}

/** Registries whose results file the app emails itself, so only these can go stale. */
export const APP_SENT_REGISTRIES: readonly string[] = ['AKC'];

/**
 * The score columns the AKC results file is built from (`AKCScentWorkFormatter` and
 * `akcEntryOutcome`): the result, the search time and the placement. A change to any other audited
 * column (judge notes, signatures, video review, fault counts) leaves the sent file true.
 */
export const AKC_FILE_SCORE_FIELDS: ReadonlySet<string> = new Set([
  'result_status',
  'search_time_seconds',
  'final_placement',
  'is_scored',
]);

function normalizeStatus(status: string | null | undefined): string {
  return status?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
}

/**
 * The newest record of one kind for a registry, as a time. `sent` = the app emailed the file;
 * `submitted` = the secretary filed it elsewhere and recorded it. A record that names no
 * organization (an older row) covers every registry.
 */
export function newestSubmissionAt(
  submissions: readonly CoverageRow[] | null | undefined,
  registryId: string,
  status: 'sent' | 'submitted'
): number | null {
  let newest: number | null = null;
  for (const row of submissions ?? []) {
    if (normalizeStatus(row.status) !== status) continue;
    if (row.organization && row.organization.toUpperCase() !== registryId.toUpperCase()) continue;
    const at = row.submitted_at ? Date.parse(row.submitted_at) : Number.NaN;
    if (!Number.isNaN(at) && (newest === null || at > newest)) newest = at;
  }
  return newest;
}

/** A change after the newest send or recorded filing (either covers the scores before it). */
export function coveredUntil(
  submissions: readonly CoverageRow[] | null | undefined,
  registryId: string
): number | null {
  const sentAt = newestSubmissionAt(submissions, registryId, 'sent');
  if (sentAt === null) return null;
  return Math.max(sentAt, newestSubmissionAt(submissions, registryId, 'submitted') ?? sentAt);
}
