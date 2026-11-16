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
