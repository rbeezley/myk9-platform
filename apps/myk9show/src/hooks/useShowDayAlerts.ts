import { useEffect, useRef } from 'react';
import type { ShowDayData, ShowDayClass } from '@/types/show-day-types';
import {
  buildYourTurnPayload,
  buildClassStartingPayload,
  buildResultsPostedPayload,
  buildCheckInReminderPayload,
} from '@myk9/notifications';
import { useNotificationStore } from '@/store/notificationStore';
import { useNotificationDelivery } from './useNotificationDelivery';

/**
 * Watches show-day data and fires notifications when trigger conditions are met.
 * Each trigger fires at most once per entry/class (tracked by ref sets).
 * On initial mount, pre-populates "already seen" sets to avoid false positives
 * for classes that are already in_progress or already scored.
 */
export function useShowDayAlerts(showDayData: ShowDayData): void {
  const { deliver } = useNotificationDelivery();
  const leadDogs = useNotificationStore(s => s.preferences.leadDogs);

  // Track which notifications have already fired (prevents duplicates)
  const firedYourTurn = useRef(new Set<string>());
  const firedClassStarting = useRef(new Set<string>());
  const firedCheckInReminder = useRef(new Set<string>());
  const firedResultsPosted = useRef(new Set<string>());
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (showDayData.isLoading || showDayData.error) return;

    // On first data load, seed "already seen" sets with current state
    // to avoid firing notifications for pre-existing conditions
    if (isInitialMount.current) {
      isInitialMount.current = false;
      for (const cls of showDayData.myClasses) {
        if (cls.classStatus === 'in_progress') {
          firedClassStarting.current.add(cls.classId);
        }
        if (cls.isScored) {
          firedResultsPosted.current.add(cls.entryId);
        }
        if (!cls.isScored && cls.myRunningOrder !== null) {
          const dogsAhead = cls.myRunningOrder - cls.scoredEntries;
          if (dogsAhead <= leadDogs) {
            firedYourTurn.current.add(`${cls.entryId}-${dogsAhead}`);
          }
        }
      }
      return; // Don't fire on initial mount
    }

    // [ADDED] Notification batching note: If multiple triggers fire on the same
    // poll cycle (e.g., 3 classes start simultaneously), each fires independently.
    // The sound module's 1000ms throttle prevents audio overload. Toast stacking
    // is handled by Sonner's built-in queue. Voice TTS cancels previous utterance
    // before speaking new one. This is acceptable for v1 — exhibitors rarely have
    // 3+ classes starting in the same 30-second polling window.

    for (const cls of showDayData.myClasses) {
      checkYourTurn(cls);
      checkClassStarting(cls);
      checkCheckInReminder(cls);
      checkResultsPosted(cls);
    }

    function checkYourTurn(cls: ShowDayClass) {
      if (cls.isScored || cls.myRunningOrder === null) return;

      const dogsAhead = cls.myRunningOrder - cls.scoredEntries;
      if (dogsAhead > leadDogs) return;

      const key = `${cls.entryId}-${dogsAhead}`;
      if (firedYourTurn.current.has(key)) return;
      firedYourTurn.current.add(key);

      deliver(
        buildYourTurnPayload({
          dogName: cls.dogCallName,
          className: cls.className,
          dogsAhead: Math.max(0, dogsAhead),
          armband: cls.armband,
          ...(cls.ringNumber !== null && { ringNumber: cls.ringNumber }),
        })
      );
    }

    function checkClassStarting(cls: ShowDayClass) {
      if (cls.classStatus !== 'in_progress') return;
      if (firedClassStarting.current.has(cls.classId)) return;
      firedClassStarting.current.add(cls.classId);

      deliver(
        buildClassStartingPayload({
          className: cls.className,
          ...(cls.ringNumber !== null && { ringNumber: cls.ringNumber }),
        })
      );
    }

    function checkCheckInReminder(cls: ShowDayClass) {
      if (cls.classStatus !== 'check_in_open') return;
      if (cls.entryStatus !== 'no-status') return;
      if (firedCheckInReminder.current.has(cls.entryId)) return;
      firedCheckInReminder.current.add(cls.entryId);

      deliver(
        buildCheckInReminderPayload({
          dogName: cls.dogCallName,
          className: cls.className,
        })
      );
    }

    function checkResultsPosted(cls: ShowDayClass) {
      if (!cls.isScored) return;
      if (firedResultsPosted.current.has(cls.entryId)) return;
      firedResultsPosted.current.add(cls.entryId);

      deliver(
        buildResultsPostedPayload({
          dogName: cls.dogCallName,
          className: cls.className,
        })
      );
    }
  }, [showDayData, deliver, leadDogs]);
}
