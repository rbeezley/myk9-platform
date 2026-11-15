import type { SyncFailedEventDetail } from '@/providers/replicationSyncFormatters';
import { isScoreMutation } from '@/services/replication/unsentWork';

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
