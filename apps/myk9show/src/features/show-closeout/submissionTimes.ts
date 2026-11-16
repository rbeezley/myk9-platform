import { normalizeCloseoutStatus } from './closeoutStatus';
import type { WhatIsLeftInput } from './whatIsLeft';

type Submissions = NonNullable<WhatIsLeftInput['submissions']>;

/**
 * The newest record of one kind for a registry, as a time. `sent` = the app emailed the file;
 * `submitted` = the secretary filed it elsewhere and recorded it. A record that names no
 * organization (an older row) covers every registry.
 */
export function newestSubmissionAt(
  submissions: Submissions | null | undefined,
  registryId: string,
  status: 'sent' | 'submitted'
): number | null {
  let newest: number | null = null;
  for (const row of submissions ?? []) {
    if (normalizeCloseoutStatus(row.status) !== status) continue;
    if (row.organization && row.organization.toUpperCase() !== registryId.toUpperCase()) continue;
    const at = row.submitted_at ? Date.parse(row.submitted_at) : Number.NaN;
    if (!Number.isNaN(at) && (newest === null || at > newest)) newest = at;
  }
  return newest;
}

/** A change after the newest send or recorded filing (either covers the scores before it). */
export function coveredUntil(submissions: Submissions | null | undefined, registryId: string) {
  const sentAt = newestSubmissionAt(submissions, registryId, 'sent');
  if (sentAt === null) return null;
  return Math.max(sentAt, newestSubmissionAt(submissions, registryId, 'submitted') ?? sentAt);
}

/**
 * The oldest of each registry's newest `sent` time: nothing before it can matter to any sent
 * file, so it bounds the score-history read. One definition of "sent" (`newestSubmissionAt`).
 */
export function oldestNewestSentAt(submissions: Submissions | null | undefined): string | null {
  const orgs = new Set<string>();
  for (const row of submissions ?? []) {
    if (normalizeCloseoutStatus(row.status) === 'sent') orgs.add((row.organization ?? '').trim());
  }
  const times = [...orgs]
    .map(org => newestSubmissionAt(submissions, org, 'sent'))
    .filter((at): at is number => at !== null);
  return times.length > 0 ? new Date(Math.min(...times)).toISOString() : null;
}

/** The one sentence per state of the app-sent results file, for the list, the close step and the send step. */
export const SENT_FILE_TEXT = {
  changed: 'Scores changed since the results file was sent.',
  unknown: 'Could not check whether scores changed since the results file was sent.',
  checking: 'Checking whether scores changed since the results file was sent.',
} as const;
