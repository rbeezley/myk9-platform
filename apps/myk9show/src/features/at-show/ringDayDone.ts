/**
 * The end of the judge's day on the class list (MYK9-2013, owner decision 7). A clipboard handed
 * to the secretary tells the judge it arrived; this card is the app's version of that.
 *
 * It speaks only when every class in Your ring for today is done, and it says "sent" only when
 * a real read of this device found nothing waiting or refused. The count is the one unsent-work
 * source (MYK9-2011); nothing here counts on its own.
 */
import { getEffectiveClassStatus } from '@myk9/ringside';
import { unsentPhrase } from '@/components/layout/signOutGuard';
import { isScoreForShow } from './scoresNotSent/scoresNotSentFilter';
import type { UnsentWorkState } from '@/hooks/useUnsentWork';
import type { DatedRingClass } from './orderRingClassesByDay';

export type RingDayDone =
  | { kind: 'sent'; text: string }
  | { kind: 'unsent'; text: string; unsentScoreCount: number }
  | { kind: 'elsewhere'; text: string }
  | { kind: 'checking'; text: string }
  | { kind: 'unchecked'; text: string };

/** Today's classes in Your ring, or null while any is still to be judged. Cancelled ones do not count. */
export function todaysRingClassesDone(yourRing: readonly DatedRingClass[]): number | null {
  const today = yourRing.filter(card => card.dayBucket === 'today' && !card.entry.is_cancelled);
  if (today.length === 0) return null;
  const allDone = today.every(card => getEffectiveClassStatus(card.entry) === 'completed');
  return allDone ? today.length : null;
}

/**
 * Scores are counted for THIS show, by the Scores not sent list's own rule, so the card's count
 * and the list it links to agree. A score from another show on this phone is named in words,
 * with no link. Other changes (a check-in) carry no show and count wherever they are.
 */
export function ringDayDone(
  showId: string | undefined,
  yourRing: readonly DatedRingClass[],
  { work, status }: UnsentWorkState
): RingDayDone | null {
  const classCount = todaysRingClassesDone(yourRing);
  if (classCount === null) return null;
  const done = classCount === 1 ? '1 class done.' : `All ${classCount} classes done.`;
  const here = showId
    ? work.scores.filter(score => score.state !== 'superseded' && isScoreForShow(score, showId))
        .length
    : 0;
  // From the source's own count, so nothing it counts can fall through to "sent".
  const elsewhere = work.unsentScoreCount - here;
  if (here > 0 || work.otherChangeCount > 0) {
    return {
      kind: 'unsent',
      text: `${unsentPhrase({ scores: here, otherChanges: work.otherChangeCount })}. Keep this phone on and connected.`,
      unsentScoreCount: here,
    };
  }
  // INTENT: never "sent" before a read of this device succeeded; an empty value is not the truth.
  if (status === 'loading') {
    return { kind: 'checking', text: `${done} Checking this phone for scores not sent.` };
  }
  if (status === 'failed') {
    return {
      kind: 'unchecked',
      text: `${done} This phone could not be checked for scores not sent.`,
    };
  }
  if (elsewhere > 0) {
    return {
      kind: 'elsewhere',
      text: `${done} Every score for this show is sent. ${elsewhere} from another show ${elsewhere === 1 ? 'is' : 'are'} still on this phone.`,
    };
  }
  return { kind: 'sent', text: `${done} Every score is sent.` };
}
