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
 *
 * Notification batching: If multiple triggers fire on the same poll cycle
 * (e.g., 3 classes start simultaneously), each fires independently.
 * The sound module's 1000ms throttle prevents audio overload. Toast stacking
 * is handled by Sonner's built-in queue. Voice TTS cancels previous utterance
 * before speaking new one.
 */
export function useShowDayAlerts(showDayData: ShowDayData): void {
  const { deliver } = useNotificationDelivery();
  const leadDogs = useNotificationStore(s => s.preferences.leadDogs);

  // Stable refs to avoid effect re-runs when deliver/leadDogs change
  const deliverRef = useRef(deliver);
  deliverRef.current = deliver;
  const leadDogsRef = useRef(leadDogs);
  leadDogsRef.current = leadDogs;

  // Track which notifications have already fired (prevents duplicates)
  const fired = useRef({
    yourTurn: new Set<string>(),
    classStarting: new Set<string>(),
    checkInReminder: new Set<string>(),
    resultsPosted: new Set<string>(),
  });
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (showDayData.isLoading || showDayData.error) return;

    const currentLeadDogs = leadDogsRef.current;

    // On first data load, seed "already seen" sets with current state
    // to avoid firing notifications for pre-existing conditions
    if (isInitialMount.current) {
      isInitialMount.current = false;
      for (const cls of showDayData.myClasses) {
        if (cls.classStatus === 'in_progress') {
          fired.current.classStarting.add(cls.classId);
        }
        if (cls.isScored) {
          fired.current.resultsPosted.add(cls.entryId);
        }
        if (!cls.isScored && cls.myRunningOrder !== null) {
          const dogsAhead = cls.myRunningOrder - cls.scoredEntries;
          if (dogsAhead <= currentLeadDogs) {
            fired.current.yourTurn.add(cls.entryId);
          }
        }
        if (cls.classStatus === 'check_in_open' && cls.entryStatus === 'no-status') {
          fired.current.checkInReminder.add(cls.entryId);
        }
      }
      return; // Don't fire on initial mount
    }

    for (const cls of showDayData.myClasses) {
      checkYourTurn(cls, currentLeadDogs);
      checkClassStarting(cls);
      checkCheckInReminder(cls);
      checkResultsPosted(cls);
    }

    function checkYourTurn(cls: ShowDayClass, ld: number) {
      if (cls.isScored || cls.myRunningOrder === null) return;

      const dogsAhead = cls.myRunningOrder - cls.scoredEntries;
      if (dogsAhead > ld) return;

      // Track by entryId only — fires once when threshold is first crossed
      if (fired.current.yourTurn.has(cls.entryId)) return;
      fired.current.yourTurn.add(cls.entryId);

      deliverRef.current(
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
      if (fired.current.classStarting.has(cls.classId)) return;
      fired.current.classStarting.add(cls.classId);

      deliverRef.current(
        buildClassStartingPayload({
          className: cls.className,
          ...(cls.ringNumber !== null && { ringNumber: cls.ringNumber }),
        })
      );
    }

    function checkCheckInReminder(cls: ShowDayClass) {
      if (cls.classStatus !== 'check_in_open') return;
      if (cls.entryStatus !== 'no-status') return;
      if (fired.current.checkInReminder.has(cls.entryId)) return;
      fired.current.checkInReminder.add(cls.entryId);

      deliverRef.current(
        buildCheckInReminderPayload({
          dogName: cls.dogCallName,
          className: cls.className,
        })
      );
    }

    function checkResultsPosted(cls: ShowDayClass) {
      if (!cls.isScored) return;
      if (fired.current.resultsPosted.has(cls.entryId)) return;
      fired.current.resultsPosted.add(cls.entryId);

      deliverRef.current(
        buildResultsPostedPayload({
          dogName: cls.dogCallName,
          className: cls.className,
        })
      );
    }
    // Only re-run when showDayData changes (refs handle deliver/leadDogs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDayData]);
}
