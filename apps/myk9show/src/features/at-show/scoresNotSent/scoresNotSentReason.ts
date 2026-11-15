/**
 * Why a score was not sent, in plain words (MYK9-2011). Never the server's raw text: each rule
 * recognises one refusal the server can give and says it the way a judge would. A refusal no
 * rule knows reads as a plain sentence too.
 *
 * MYK9-2015 adds judge-change refusals by adding a rule here; the list, the count and the
 * actions do not change.
 */
import type { PendingMutation } from '@myk9/replication';

type Refusal = Pick<PendingMutation, 'error' | 'failureKind'>;

interface ReasonRule {
  /** Matched against the server's message, after the queue's own prefix is removed. */
  pattern: RegExp;
  /** The plain sentence; `match` is the pattern's result, for a name it captured. */
  say: (match: RegExpExecArray) => string;
}

/** What the queue prepends when it stores a failure (packages/replication mutation-retry.ts). */
const QUEUE_PREFIX = /^(?:non-retryable error|max retries exceeded):\s*/i;

const RULES: readonly ReasonRule[] = [
  // RS403 (MYK9-1950): the class's judge is someone else. The server's sentence names them.
  {
    pattern: /This class is (?:now )?judged by (.+?)\.?\s*$/i,
    say: match => `This class is now judged by ${match[1]}.`,
  },
  {
    pattern: /This class has no judge assigned/i,
    say: () => 'This class has no judge assigned. Ask the secretary.',
  },
  // 23514 class_cancelled (MYK9-1863).
  { pattern: /This class is cancelled/i, say: () => 'This class was cancelled.' },
  // MK014 (MYK9-923): the class, trial or show was deleted.
  {
    pattern: /This (class|trial|show) has been deleted/i,
    say: match => `This ${match[1]?.toLowerCase()} was deleted.`,
  },
  // 42501: the code it was scored under was replaced (normally sent again on its own, MYK9-2009).
  {
    pattern: /Passcode has been regenerated/i,
    say: () => 'Your judge code was changed. Enter the new code to send it.',
  },
  // 23514 (MYK9-2005): the server refuses a Qualified with no time, or over the limit.
  {
    pattern: /A Qualified needs a time/i,
    say: () => 'A Qualified needs a time. Score the dog again.',
  },
  {
    pattern: /is over the .+ limit/i,
    say: () => 'The time is over the class limit. Score the dog again.',
  },
];

/** The plain-words reason for a refused score. */
export function describeRefusal(refusal: Refusal | undefined): string {
  const message = (refusal?.error ?? '').trim().replace(QUEUE_PREFIX, '');
  for (const rule of RULES) {
    const match = rule.pattern.exec(message);
    if (match) return rule.say(match);
  }
  if (refusal?.failureKind === 'authorization') {
    return 'This code cannot score this class. Ask the secretary.';
  }
  if (refusal?.failureKind === 'max-retries') {
    return 'It did not go through after several tries.';
  }
  return 'The server did not accept this score. Ask the secretary.';
}
