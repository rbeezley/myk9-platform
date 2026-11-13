import type { EntryDecisionEmailStatus } from './api';

/**
 * When a form's decision was last emailed: the newer of the per-registration email log and
 * every sent decision or correction job covering the form's entries. The lifecycle jobs never
 * write the email log, so reading the log alone says "no decision email" after one went out.
 */
export function latestDecisionEmailedAt(
  loggedAt: string | undefined,
  entryIds: string[],
  statusMap: Record<string, EntryDecisionEmailStatus> | undefined
): string | undefined {
  let best: string | undefined;
  let bestTime = Number.NEGATIVE_INFINITY;
  const consider = (value: string | null | undefined) => {
    if (!value) return;
    const time = Date.parse(value);
    if (Number.isNaN(time) || time <= bestTime) return;
    best = value;
    bestTime = time;
  };
  consider(loggedAt);
  for (const entryId of entryIds) {
    consider(statusMap?.[entryId]?.sentDecisionJob?.sentAt);
    consider(statusMap?.[entryId]?.sentCorrectionJob?.sentAt);
  }
  return best;
}
