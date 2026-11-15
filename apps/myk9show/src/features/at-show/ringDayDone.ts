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
import type { UnsentWorkState } from '@/hooks/useUnsentWork';
import type { DatedRingClass } from './orderRingClassesByDay';

export type RingDayDone =
  | { kind: 'sent'; text: string }
  | { kind: 'unsent'; text: string; unsentScoreCount: number }
  | { kind: 'checking'; text: string }
  | { kind: 'unchecked'; text: string };

/** Today's classes in Your ring, or null while any is still to be judged. Cancelled ones do not count. */
export function todaysRingClassesDone(yourRing: readonly DatedRingClass[]): number | null {
  const today = yourRing.filter(card => card.dayBucket === 'today' && !card.entry.is_cancelled);
  if (today.length === 0) return null;
  const allDone = today.every(card => getEffectiveClassStatus(card.entry) === 'completed');
  return allDone ? today.length : null;
}

export function ringDayDone(
  yourRing: readonly DatedRingClass[],
  { work, status }: UnsentWorkState
): RingDayDone | null {
  const classCount = todaysRingClassesDone(yourRing);
  if (classCount === null) return null;
  const done = classCount === 1 ? '1 class done.' : `All ${classCount} classes done.`;
  if (work.total > 0) {
    return {
      kind: 'unsent',
      text: `${unsentPhrase({ scores: work.unsentScoreCount, otherChanges: work.otherChangeCount })}. Keep this phone on and connected.`,
      unsentScoreCount: work.unsentScoreCount,
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
  return { kind: 'sent', text: `${done} Every score is sent.` };
}
