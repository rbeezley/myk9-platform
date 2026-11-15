/**
 * The one notice that a score was refused (MYK9-2011). It replaces the per-change refusal
 * toasts for scores: one persistent toast with the count and a way to the Scores not sent
 * list, which names each dog. Read from this device, so it comes back after a reload, and it
 * goes away by itself once no refused score is left.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { readDeviceUnsentWork } from '@/services/replication/unsentWork';
import { atShowScoresNotSentPath } from './scoresNotSentPath';
import { SCORES_NOT_SENT_TOAST_ID, scoresNotSentNoticeText } from './scoresNotSentFilter';

const REFRESH_EVENTS = [
  'replication:sync-failed',
  'replication:unsent-changed',
  'replication:upload-complete',
  'replication:recovery',
] as const;

export function ScoresNotSentNotice() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    let shownCount = 0;
    const refresh = () => {
      readDeviceUnsentWork()
        .then(work => {
          if (cancelled) return;
          const refused = work.scores.filter(score => score.refused);
          if (refused.length === 0) {
            shownCount = 0;
            toast.dismiss(SCORES_NOT_SENT_TOAST_ID);
            return;
          }
          // Once per change in the count: a judge who opened the list is not asked again.
          if (refused.length === shownCount) return;
          shownCount = refused.length;
          const showId = refused.find(score => score.showId)?.showId;
          const { title, description } = scoresNotSentNoticeText(refused.length);
          toast.error(title, {
            id: SCORES_NOT_SENT_TOAST_ID,
            description,
            // INTENT: a refusal notice stays until the judge acts on it.
            duration: Infinity,
            ...(showId && {
              action: {
                label: 'See scores',
                onClick: () => navigate(atShowScoresNotSentPath(showId)),
              },
            }),
          });
        })
        .catch(() => {
          /* best-effort; the counts still show the refused scores */
        });
    };
    refresh();
    for (const eventName of REFRESH_EVENTS) window.addEventListener(eventName, refresh);
    return () => {
      cancelled = true;
      for (const eventName of REFRESH_EVENTS) window.removeEventListener(eventName, refresh);
    };
  }, [navigate]);

  return null;
}
