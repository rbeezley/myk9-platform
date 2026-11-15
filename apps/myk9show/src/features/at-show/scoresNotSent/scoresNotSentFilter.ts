import type { SyncFailedEventDetail } from '@/providers/replicationSyncFormatters';
import { isScoreMutation, type UnsentScore } from '@/services/replication/unsentWork';

/**
 * A refused score lives on the Scores not sent list, not in a per-change toast (MYK9-2011):
 * the toast named no dog, showed the server's own text, offered a Discard that named no score,
 * and a fourth one pushed the oldest away. The provider keeps toasting everything else.
 */
export function withoutListedScores(detail: SyncFailedEventDetail): SyncFailedEventDetail {
  const mutations = detail.mutations.filter(mutation => !isScoreMutation(mutation));
  if (mutations.length === detail.mutations.length) return detail;
  return { ...detail, count: mutations.length, mutations };
}

export const SCORES_NOT_SENT_TOAST_ID = 'scores-not-sent';

/** The one notice for refused scores: how many, and that the list says which and why. */
export function scoresNotSentNoticeText(refused: number): { title: string; description: string } {
  return {
    title: `${refused} ${refused === 1 ? 'score' : 'scores'} not sent`,
    description: `myK9Show did not take ${refused === 1 ? 'it' : 'them'}. The list shows each dog, the score and why.`,
  };
}

/**
 * Whether a score unit belongs on this show's Scores not sent list. A score with no show stamp
 * and no replica row still sits on this phone, so every show lists it (MYK9-2011). The list and
 * the end-of-day card (MYK9-2013) use this one rule, so the card's count and the list agree.
 */
export function isScoreForShow(score: Pick<UnsentScore, 'showId'>, showId: string): boolean {
  return score.showId === showId || score.showId === undefined;
}
