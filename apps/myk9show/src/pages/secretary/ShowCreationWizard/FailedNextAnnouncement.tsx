import React from 'react';

export interface FailedNextSummary {
  /** Bumps on every failed Next so a repeat failure re-announces. */
  attempt: number;
  count: number;
  first: string;
}

export function summarizeFailedNext(
  attempt: number,
  messages: readonly string[]
): FailedNextSummary | null {
  const first = messages[0];
  return first === undefined ? null : { attempt, count: messages.length, first };
}

/**
 * The one live announcement for a failed Next (MYK9-1240). Field callouts carry no live role,
 * and focus lands on the first invalid control before its description mounts, so without this
 * a screen reader would hear only the label. Visually hidden: the callouts are what the eye
 * reads. Keyed by attempt so each failure is announced once, and frozen at the attempt, so
 * fixing fields afterwards does not re-announce on every keystroke.
 */
export const FailedNextAnnouncement: React.FC<{ summary: FailedNextSummary }> = ({ summary }) => (
  <p key={summary.attempt} role="alert" className="sr-only">
    {summary.count} item{summary.count !== 1 ? 's' : ''} need{summary.count === 1 ? 's' : ''}{' '}
    attention. {summary.first}
  </p>
);
