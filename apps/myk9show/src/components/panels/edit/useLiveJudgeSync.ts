import { useEffect, useRef } from 'react';

import type { CurrentClassJudge } from './ClassEditPanel.types';

/**
 * Keeps the form's judge in step with the live one (MYK9-2379). When the class's judge changes
 * while the panel is open (the live control, or another device) and the form's Judge still holds
 * the judge it last agreed with, it follows; a judge the user picked in the form is left alone.
 */
export function useLiveJudgeSync(
  current: CurrentClassJudge | undefined,
  formJudgeId: string | undefined,
  apply: (judgeId: string, judgeName: string) => void
) {
  const liveId = current?.id ?? '';
  const lastLive = useRef(liveId);
  useEffect(() => {
    if (current === undefined || lastLive.current === liveId) return;
    const previous = lastLive.current;
    lastLive.current = liveId;
    if ((formJudgeId ?? '') !== previous) return;
    apply(liveId, current.name ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveId]);
}
