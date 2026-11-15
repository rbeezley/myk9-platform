/**
 * Why a score has not reached the server, in a judge's words (MYK9-2011). Never the server's
 * own text: each refusal the server can give a score is matched to one plain sentence, and
 * anything unrecognised gets a plain sentence too.
 *
 * Add a refusal by adding a rule to `SCORE_REFUSAL_RULES`. MYK9-2015 adds the judge-change
 * refusal here; the existing per-judge refusal already reads "This class is now judged by Lee
 * Okafor".
 */
import type { PendingMutation } from '@myk9/replication';
import type { ScoreUnitState } from '@/services/replication/unsentWork';
import { PASSCODE_REGENERATED_DB_MESSAGE } from '@/features/at-show/ringsidePasscodeRevocation';

export interface ScoreRefusalRule {
  /** The stored error (the server's message, after the queue's prefix). */
  match: RegExp;
  /** The sentence the judge reads; receives the regex match. */
  say: (match: RegExpExecArray) => string;
}

export const SCORE_REFUSAL_RULES: readonly ScoreRefusalRule[] = [
  {
    match: /This class is cancelled/i,
    say: () => 'This class was cancelled.',
  },
  {
    // MYK9-1950: RS403, the class is held by another judge. The name is the server's own.
    match: /This class is judged by (.+?)\s*$/i,
    say: m => `This class is now judged by ${m[1]}.`,
  },
  {
    match: /This class has no judge assigned/i,
    say: () => 'This class has no judge assigned. Ask the secretary to assign one.',
  },
  {
    // MYK9-923: MK014, the entry's class, trial or show was deleted.
    match: /This (class|trial|show) has been deleted/i,
    say: m => `This ${m[1]?.toLowerCase()} was deleted.`,
  },
  {
    // P0002 from ringside_update_entry, after the normal tries (MYK9-2011): the entry is not
    // there, either not synced yet or deleted. Never waited on forever.
    match: /Entry \S+ not found/i,
    say: () =>
      "This dog's entry is not in myK9Show yet, or it was removed. Ask the secretary, then try again.",
  },
  {
    match: /A Qualified needs a time/i,
    say: () => 'A Qualified needs a time.',
  },
  {
    match: /is over the .+ limit/i,
    say: () => 'The time is over the limit for this class.',
  },
  {
    match: new RegExp(PASSCODE_REGENERATED_DB_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    say: () => 'The passcode was changed. Enter the new code and it will be sent.',
  },
];

/** What the queue prepends when it stores a failure (mutation-retry.ts); not the reason. */
const QUEUE_PREFIX = /^(?:non-retryable error|max retries exceeded):\s*/i;

export const WAITING_REASON = 'Waiting to send. It will be sent on its own.';
export const SUPERSEDED_REASON =
  'A newer score for this dog was saved after this one, so this one will not be sent.';

export function unsentScoreReason({
  state,
  mutation,
}: {
  state: ScoreUnitState;
  mutation: Pick<PendingMutation, 'error' | 'failureKind'>;
}): string {
  if (state === 'waiting') return WAITING_REASON;
  if (state === 'superseded') return SUPERSEDED_REASON;
  const error = (mutation.error ?? '').trim().replace(QUEUE_PREFIX, '');
  for (const rule of SCORE_REFUSAL_RULES) {
    const match = rule.match.exec(error);
    if (match) return rule.say(match);
  }
  if (mutation.failureKind === 'authorization') {
    return 'This sign-in is not allowed to score this class.';
  }
  if (mutation.failureKind === 'max-retries') {
    return 'myK9Show did not take it after several tries.';
  }
  return 'myK9Show did not accept this score.';
}
