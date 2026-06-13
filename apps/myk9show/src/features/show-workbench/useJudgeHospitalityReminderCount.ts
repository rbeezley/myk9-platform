import { useEffect, useState } from 'react';
import {
  JUDGE_HOSPITALITY_CHANGE_EVENT,
  readJudgeHospitalityState,
  summarizeJudgeHospitality,
  type JudgeHospitalityJudge,
} from './judgeHospitality';

function readReminderCount(
  showId: string,
  judges: readonly JudgeHospitalityJudge[]
): number {
  const state = readJudgeHospitalityState(showId, judges);
  const summary = summarizeJudgeHospitality(judges, state);
  // Mirror JudgeHospitalityCard's `reminders` so the trigger badge and the
  // card's own badge never disagree.
  return summary.lunchPendingCount + summary.waterPendingCount;
}

// INTENT: Reactive read of the (localStorage-backed) hospitality reminder count
// for the Show Desk Tools trigger badge. Subscribes to the persist event fired
// by writeJudgeHospitalityState so toggling a checkbox inside the open sheet
// keeps the closed-trigger glance current — and to `storage` so a second tab
// stays in sync. JudgeHospitalityCard remains the editing owner; this hook only
// observes.
export function useJudgeHospitalityReminderCount(
  showId: string,
  judges: readonly JudgeHospitalityJudge[]
): number {
  const judgeIdsKey = judges.map(judge => judge.id).join('|');
  const resyncKey = `${showId}::${judgeIdsKey}`;

  const [snapshot, setSnapshot] = useState(() => ({
    key: resyncKey,
    count: readReminderCount(showId, judges),
  }));

  // Resync during render when the show or judge roster changes. Using the
  // adjust-state-during-render pattern (not a useEffect) avoids the repo's
  // react-hooks/set-state-in-effect lint rule.
  if (snapshot.key !== resyncKey) {
    setSnapshot({ key: resyncKey, count: readReminderCount(showId, judges) });
  }

  useEffect(() => {
    const recompute = () =>
      setSnapshot({ key: resyncKey, count: readReminderCount(showId, judges) });
    window.addEventListener(JUDGE_HOSPITALITY_CHANGE_EVENT, recompute);
    window.addEventListener('storage', recompute);
    return () => {
      window.removeEventListener(JUDGE_HOSPITALITY_CHANGE_EVENT, recompute);
      window.removeEventListener('storage', recompute);
    };
    // `judges` is a fresh array each render; resyncKey captures the only change
    // that affects the count (show or judge-id set), so depend on it instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId, resyncKey]);

  return snapshot.count;
}
