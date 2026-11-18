import { normalizeCloseoutStatus } from './closeoutStatus';
import {
  coveredUntil,
  newestSubmissionAt,
} from '../../../../../supabase/functions/_shared/showCloseout/submissionCoverage';
import type { WhatIsLeftInput } from './whatIsLeft';

export { coveredUntil, newestSubmissionAt };

type Submissions = NonNullable<WhatIsLeftInput['submissions']>;

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
