/**
 * The close step's sentences, in its order (MYK9-1945), split from `whatIsLeft.ts`. Each carries
 * the kind it came from, so the close step can link the one it has a place for.
 */
import { SENT_FILE_TEXT } from './submissionTimes';
import { FLAGGED_PULLS_FAILED_TEXT, FLAGGED_PULLS_LOADING_TEXT } from './flaggedPulls';
import type { WhatIsLeftInput, WhatIsLeftLine, WhatIsLeftLineKey } from './whatIsLeft';

export type CloseConcernKind = WhatIsLeftLineKey | 'no-submission' | 'sent-file';

export interface CloseConcern {
  kind: CloseConcernKind;
  text: string;
}

/**
 * MYK9-2145: the one wording of check-in "pulled" flags the Check-in desk has not confirmed, for
 * the close step's summary card and its concerns alike. A flag is not a removal (docs/INTENT.md,
 * Withdraw vs Pull), so it is said apart from the pulls and refunds.
 */
export function flaggedPullText(count: number): string {
  return `${count} ${count === 1 ? 'dog' : 'dogs'} flagged as pulled at the show, not confirmed.`;
}

/**
 * The flagged-pulls line (MYK9-2145) from the caller's shared flag read (MYK9-2180). A flag is not
 * a removal and not a refund to decide (docs/INTENT.md, Withdraw vs Pull), but the close step
 * names it. A read that did not succeed is "couldn't check", with no count and `open: null`.
 * `null` when the caller does not look.
 */
export function flaggedPullsLine(flags: WhatIsLeftInput['flaggedPulls']): WhatIsLeftLine | null {
  if (!flags) return null;
  const count = flags.status === 'read' ? (flags.dogCount ?? 0) : null;
  const text =
    count !== null
      ? flaggedPullText(count)
      : flags.status === 'loading'
        ? FLAGGED_PULLS_LOADING_TEXT
        : FLAGGED_PULLS_FAILED_TEXT;
  return {
    key: 'flagged-pulls',
    kind: 'flagged-pulls',
    label: text,
    count,
    classIds: [],
    open: count === null ? null : count > 0,
    closeConcern: text,
  };
}

export function buildCloseConcerns(input: {
  lines: readonly WhatIsLeftLine[];
  /** Result submissions could not be read. */
  submissionsUnread: boolean;
  hasSubmittedResults: boolean;
}): CloseConcern[] {
  const { lines } = input;
  // The submission is one show-level sentence, whatever the registry, and unread is its own
  // concern: it may not claim "nothing submitted".
  const submissionConcern = input.submissionsUnread
    ? 'Result submissions could not be checked, so whether results were sent is unknown.'
    : input.hasSubmittedResults
      ? null
      : 'No result submission has been recorded for this show.';
  // A file the app sent that the scores have moved past, or that could not be checked: close warns.
  const sentFileChecks = lines.flatMap(line =>
    line.kind === 'results-submission' && line.sentFileCheck ? [line.sentFileCheck] : []
  );
  const sentFileConcern = sentFileChecks.includes('changed')
    ? `${SENT_FILE_TEXT.changed} Send it again before closing.`
    : sentFileChecks.includes('unknown')
      ? SENT_FILE_TEXT.unknown
      : sentFileChecks.includes('checking')
        ? SENT_FILE_TEXT.checking
        : null;
  const concernOf = (kind: WhatIsLeftLineKey): CloseConcern[] => {
    const line = lines.find(candidate => candidate.kind === kind);
    return line?.closeConcern && line.open !== false ? [{ kind, text: line.closeConcern }] : [];
  };
  return [
    ...concernOf('unknown-counts'),
    ...concernOf('unscored'),
    ...concernOf('pending-review'),
    ...(submissionConcern ? [{ kind: 'no-submission' as const, text: submissionConcern }] : []),
    ...(sentFileConcern ? [{ kind: 'sent-file' as const, text: sentFileConcern }] : []),
    ...concernOf('refund-review'),
    ...concernOf('flagged-pulls'),
    ...concernOf('incidents'),
  ];
}
