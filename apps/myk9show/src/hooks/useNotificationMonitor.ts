import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useNotificationStore } from '@/store/notificationStore';
import { useNotificationDelivery } from '@/hooks/useNotificationDelivery';
import { useShowDayData } from '@/hooks/queries/useShowDayData';
import { useShowStore } from '@/store/showStore';
import { useDogsByOwnerQuery } from '@/hooks/queries/useDogsDatabase';
import { subscribeToShowChanges } from '@/features/show-live-sync/showChangeSignal';
import {
  buildYourTurnPayload,
  buildClassStartingPayload,
  buildCheckInReminderPayload,
  buildResultsPostedPayload,
} from '@myk9/notifications';
import { useFavoriteArmbandsByShow } from '@/features/at-show/dogFavoritesSync';
import {
  watchSetSize,
  watchedUpcomingEntries,
  type NotificationWatchSet,
} from '@/hooks/notificationWatchSet';
import { detectConflicts } from '@/utils/conflictDetection';
import type { ClassContext } from '@/utils/conflictDetection';
import type { ShowEntry } from '@/store/entry-store-types';

const DEDUP_WINDOW_MS = 60_000;
const REFRESH_DEBOUNCE_MS = 400;

interface EntryRow {
  id: string;
  dog_id: string;
  class_id: string;
  show_id: string;
  check_in_status: string | null;
  armband: string | null;
  is_scored: boolean | null;
  result_status: string | null;
  dog_call_name: string | null;
}

interface ClassRow {
  id: string;
  name: string;
  status: string | null;
  is_scoring_finalized: boolean;
  results_released_at: string | null;
}

interface NotificationSnapshot {
  entries: unknown[];
  classes: unknown[];
}

/** What the monitor last saw of one class, to tell a change from a state. */
interface ObservedClass {
  finalized: boolean;
  inProgress: boolean;
  entryIds: ReadonlySet<string>;
  inRingEntryId: string | null;
}

/** The previous snapshot, for the user it was taken for. */
interface Observed {
  userId: string | null;
  classes: ReadonlyMap<string, ObservedClass>;
}

function isUnchecked(entry: ShowEntry): boolean {
  return !entry.checkInStatus || entry.checkInStatus === 'no-status';
}

function isRevealableResult(
  resultStatus: string | null | undefined,
  resultsReleasedAt: string | null | undefined
): boolean {
  return resultStatus === 'qualified' && Boolean(resultsReleasedAt);
}

function buildResultsActionUrl(
  classId: string,
  userEntries: ShowEntry[],
  entryResultStatuses: ReadonlyMap<string, string | null>,
  resultsReleasedAt: string | null | undefined
): string {
  if (
    userEntries.length === 1 &&
    isRevealableResult(entryResultStatuses.get(userEntries[0].id), resultsReleasedAt)
  ) {
    return `/exhibitor/entries?resultEntryId=${encodeURIComponent(userEntries[0].id)}`;
  }

  return `/classes/${classId}`;
}

export function useNotificationMonitor(): void {
  const { userWithRoles } = useAuthContext();
  const preferences = useNotificationStore(state => state.preferences);
  const { deliver } = useNotificationDelivery();
  const { activeShows } = useShowDayData();
  const selectedShowId = useShowStore(state => state.selectedShowId);

  const showIdsKey = useMemo(() => {
    const ids = new Set(activeShows.map(show => show.showId));
    if (selectedShowId) ids.add(selectedShowId);
    return [...ids].sort().join(',');
  }, [activeShows, selectedShowId]);
  const showIds = useMemo(() => (showIdsKey ? showIdsKey.split(',') : []), [showIdsKey]);

  const dogsQuery = useDogsByOwnerQuery(
    userWithRoles?.databaseUserId ?? '',
    Boolean(userWithRoles?.databaseUserId)
  );
  const dogIdsKey = useMemo(
    () =>
      (dogsQuery.data ?? [])
        .map(dog => (dog as { id: string }).id)
        .sort()
        .join(','),
    [dogsQuery.data]
  );
  const userDogIds = useMemo(() => new Set(dogIdsKey ? dogIdsKey.split(',') : []), [dogIdsKey]);

  // The watch set is owned dogs UNION favorited armbands (MYK9-79). Favorites
  // come from the server mirror, so they survive a backgrounded PWA; the query
  // is disabled when signed out, which keeps anonymous passcode sessions on the
  // owned-only (i.e. empty) watch set with no push path.
  const favoriteArmbandsByShow = useFavoriteArmbandsByShow(showIds);
  const watchSet = useMemo<NotificationWatchSet>(
    () => ({ ownedDogIds: userDogIds, favoriteArmbandsByShow }),
    [userDogIds, favoriteArmbandsByShow]
  );

  const snapshotQuery = useQuery({
    queryKey: ['notification-monitor', 'entries', showIds],
    queryFn: async (): Promise<NotificationSnapshot> => {
      if (showIds.length === 0) return { entries: [], classes: [] };

      const { data: classRows, error: classError } = await supabase
        .from('classes')
        .select(
          `id, name, status, is_scoring_finalized, results_released_at,
         trial:trials!inner(show_id)`
        )
        .in('trial.show_id', showIds);
      if (classError) throw classError;

      const classIds = (classRows ?? []).map((row: { id: string }) => row.id);
      if (classIds.length === 0) return { entries: [], classes: classRows ?? [] };

      const { data: entryRows, error: entryError } = await supabase
        .from('view_authenticated_entry_results')
        .select(
          `id, dog_id, class_id, show_id, check_in_status, armband, is_scored, result_status,
         dog_call_name`
        )
        .in('class_id', classIds);
      if (entryError) throw entryError;

      return { entries: entryRows ?? [], classes: classRows ?? [] };
    },
    enabled: showIds.length > 0 && preferences.enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const lastYourTurnAlert = useRef<Map<string, number>>(new Map());
  const classContextRef = useRef<Map<string, ClassContext>>(new Map());
  const dogNameMap = useRef<Map<string, string>>(new Map());
  const entryResultStatusMapRef = useRef<Map<string, string | null>>(new Map());
  // INTENT (MYK9-735): the in-app monitor alerts only on changes it observes
  // while mounted. The first snapshot after mount, or after the signed-in user
  // changes, is a silent baseline. Server push (push-trigger-scoring,
  // push-trigger-class-status, push-trigger-run-proximity) covers what happened
  // while the user was away; alerting on STATE here re-announced weeks-old
  // results on every sign-in.
  const observedRef = useRef<Observed | null>(null);
  // Set when the app is hidden: backgrounded time counts as "away" too, so the
  // first snapshot processed while visible again is a baseline.
  const awaySinceLastBaselineRef = useRef(false);
  // When the app last became visible. Only a snapshot fetched successfully at or
  // after it ends the away baseline; cached data handed back with a refetch
  // error predates it and stays a baseline.
  const visibleSinceRef = useRef<number | null>(null);
  // The live refresh, while the subscription effect is active; used to take the
  // post-away baseline the moment the app is visible again.
  const refreshNowRef = useRef<(() => void) | null>(null);
  const userIdRef = useRef<string | null>(userWithRoles?.id ?? null);

  const deliverRef = useRef(deliver);
  const preferencesRef = useRef(preferences);
  const userDogIdsRef = useRef(userDogIds);
  const watchSetRef = useRef(watchSet);
  const currentUserId = userWithRoles?.id ?? null;
  useLayoutEffect(() => {
    userIdRef.current = currentUserId;
    deliverRef.current = deliver;
    preferencesRef.current = preferences;
    userDogIdsRef.current = userDogIds;
    watchSetRef.current = watchSet;
  });

  // NOTE: this monitor no longer sends push. It used to, gated on
  // `document.visibilityState !== 'visible'`, which required the PWA process to
  // be alive and merely backgrounded — iOS Safari suspends backgrounded PWAs,
  // so the exhibitor with the phone in their pocket at the crate got nothing.
  // Push now originates server-side from push-trigger-run-proximity (migration
  // 20260816120000), which fires on the same in-ring transition and reads the
  // per-user threshold from notification_preferences.lead_dogs. Keeping a
  // client sender as well would double-notify a backgrounded-but-alive app.
  // In-app delivery (toast + voice) stays here.

  const notifyUpcomingDogs = useCallback((classId: string, inRingEntryId: string) => {
    const context = classContextRef.current.get(classId);
    if (!context) return;

    if (!context.entries.some(entry => entry.id === inRingEntryId)) return;

    const leadDogs = preferencesRef.current.leadDogs;
    const allClasses = [...classContextRef.current.values()];
    // Watched = owned dogs UNION favorited armbands, deduped to one entry each.
    // `dogsAhead` is the index into the shared run queue — in-ring, scored and
    // pulled dogs already excluded — so it is the same number the entry-list
    // pill shows for this dog.
    const upcoming = watchedUpcomingEntries(context.entries, leadDogs, watchSetRef.current);

    for (const { entry, dogsAhead } of upcoming) {
      const now = Date.now();
      const lastAlerted = lastYourTurnAlert.current.get(entry.id);
      if (lastAlerted && now - lastAlerted < DEDUP_WINDOW_MS) continue;
      lastYourTurnAlert.current.set(entry.id, now);

      const conflicts = detectConflicts(entry.dogId, context.classId, allClasses, leadDogs);
      const notification = buildYourTurnPayload({
        dogName: dogNameMap.current.get(entry.dogId) ?? 'Your dog',
        className: context.className,
        dogsAhead,
        armband: entry.registrationData?.armband ?? null,
        ...(conflicts.length > 0 ? { conflicts } : {}),
      });
      notification.actionUrl = `/classes/${context.classId}`;
      deliverRef.current(notification);
    }
  }, []);

  const processSnapshot = useCallback(
    (snapshot: NotificationSnapshot, fetchedAt: number) => {
      const classLookup = new Map<string, ClassRow>();
      const entriesByClass = new Map<string, ShowEntry[]>();
      const nextDogNames = new Map<string, string>();
      const nextResultStatuses = new Map<string, string | null>();

      for (const rawClass of snapshot.classes) {
        const classRow = rawClass as ClassRow;
        classLookup.set(classRow.id, classRow);
      }

      for (const rawEntry of snapshot.entries) {
        const row = rawEntry as EntryRow;
        if (row.dog_id && row.dog_call_name) nextDogNames.set(row.dog_id, row.dog_call_name);
        nextResultStatuses.set(row.id, row.result_status);

        const mapped: ShowEntry = {
          id: row.id,
          dogId: row.dog_id,
          classId: row.class_id,
          showId: row.show_id,
          checkInStatus: (row.check_in_status as ShowEntry['checkInStatus']) ?? undefined,
          status: 'confirmed',
          registrationData: {
            submittedAt: '',
            handler: '',
            entryFee: 0,
            paymentStatus: 'pending',
            armband: row.armband ?? undefined,
          },
          competitionData: row.is_scored ? { recordedBy: '', recordedAt: '' } : undefined,
          statusHistory: [],
          createdAt: '',
          updatedAt: '',
        };
        const classEntries = entriesByClass.get(row.class_id) ?? [];
        classEntries.push(mapped);
        entriesByClass.set(row.class_id, classEntries);
      }

      const nextContexts = new Map<string, ClassContext>();
      for (const [classId, entries] of entriesByClass) {
        const classRow = classLookup.get(classId);
        nextContexts.set(classId, {
          classId,
          className: classRow?.name ?? classId,
          status: classRow?.status ?? '',
          entries,
        });
      }

      classContextRef.current = nextContexts;
      dogNameMap.current = nextDogNames;
      entryResultStatusMapRef.current = nextResultStatuses;

      const nextObserved = new Map<string, ObservedClass>();
      for (const [classId, classRow] of classLookup) {
        const entries = entriesByClass.get(classId) ?? [];
        nextObserved.set(classId, {
          finalized: Boolean(classRow.is_scoring_finalized),
          inProgress: classRow.status === 'In Progress',
          entryIds: new Set(entries.map(entry => entry.id)),
          inRingEntryId: entries.find(entry => entry.checkInStatus === 'in-ring')?.id ?? null,
        });
      }

      const userId = userIdRef.current;
      const previous = observedRef.current;
      observedRef.current = { userId, classes: nextObserved };
      // Baseline: the first snapshot after mount, after a user change, or after
      // the app was hidden (every snapshot while hidden is a baseline too).
      const wasAway = awaySinceLastBaselineRef.current;
      const visibleSince = visibleSinceRef.current;
      if (wasAway && visibleSince !== null && fetchedAt >= visibleSince) {
        awaySinceLastBaselineRef.current = false;
      }
      if (!previous || previous.userId !== userId || wasAway) return;

      for (const [classId, context] of nextContexts) {
        const classRow = classLookup.get(classId);
        const before = previous.classes.get(classId);
        const now = nextObserved.get(classId);
        // A class first seen in this snapshot (e.g. a newly selected show) is
        // part of the baseline, not a change.
        if (!classRow || !before || !now) continue;
        const userEntries = context.entries.filter(entry => userDogIdsRef.current.has(entry.dogId));

        const startedNow = now.inProgress && !before.inProgress;
        if (startedNow && userEntries.length > 0) {
          const starting = buildClassStartingPayload({ className: context.className });
          starting.actionUrl = `/classes/${classId}`;
          deliverRef.current(starting);
        }

        if (now.inProgress) {
          for (const entry of userEntries) {
            // Remind for every unchecked entry when the class just started, and
            // for an unchecked entry that appeared while it was running.
            if (!isUnchecked(entry) || (!startedNow && before.entryIds.has(entry.id))) continue;
            const reminder = buildCheckInReminderPayload({
              dogName: nextDogNames.get(entry.dogId) ?? 'Your dog',
              className: context.className,
            });
            reminder.actionUrl = `/classes/${classId}`;
            deliverRef.current(reminder);
          }
        }

        if (now.finalized && !before.finalized && userEntries.length > 0) {
          const results = buildResultsPostedPayload({
            dogName: userEntries
              .map(entry => nextDogNames.get(entry.dogId) ?? 'Your dog')
              .join(', '),
            className: context.className,
          });
          results.actionUrl = buildResultsActionUrl(
            classId,
            userEntries,
            nextResultStatuses,
            classRow.results_released_at
          );
          deliverRef.current(results);
        }

        if (now.inRingEntryId && now.inRingEntryId !== before.inRingEntryId) {
          notifyUpcomingDogs(classId, now.inRingEntryId);
        }
      }
    },
    [notifyUpcomingDogs]
  );

  useEffect(() => {
    if (snapshotQuery.data) {
      const fetchedAt = snapshotQuery.isError ? 0 : snapshotQuery.dataUpdatedAt;
      processSnapshot(snapshotQuery.data, fetchedAt);
    }
  }, [snapshotQuery.data, snapshotQuery.dataUpdatedAt, snapshotQuery.isError, processSnapshot]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        awaySinceLastBaselineRef.current = true;
        visibleSinceRef.current = null;
      } else if (awaySinceLastBaselineRef.current) {
        visibleSinceRef.current = Date.now();
        // Take the baseline now rather than at the next poll, so a change
        // after the user is back is compared against it and still alerts. A
        // change during this one round trip is covered by server push.
        refreshNowRef.current?.();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const refetchSnapshot = snapshotQuery.refetch;
  useEffect(() => {
    // Nothing to watch means nothing to poll for — but "nothing" is now the
    // union: a user who owns no dogs still gets alerts for favorited armbands.
    if (
      !preferences.enabled ||
      !userWithRoles ||
      showIds.length === 0 ||
      watchSetSize(watchSet) === 0
    ) {
      return undefined;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let pending = false;
    let disposed = false;

    const refresh = async (): Promise<void> => {
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      try {
        const result = await refetchSnapshot();
        if (!disposed && result.data) {
          processSnapshot(result.data, result.isError ? 0 : result.dataUpdatedAt);
        }
      } catch {
        // The 30-second query poll and next signal repair a transient failure.
      } finally {
        inFlight = false;
        if (!disposed && pending) {
          pending = false;
          void refresh();
        }
      }
    };

    const nudge = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void refresh();
      }, REFRESH_DEBOUNCE_MS);
    };

    const unsubscribes = showIds.map(showId => subscribeToShowChanges(showId, nudge));
    refreshNowRef.current = () => void refresh();
    return () => {
      disposed = true;
      refreshNowRef.current = null;
      if (timer) clearTimeout(timer);
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [preferences.enabled, userWithRoles, showIds, watchSet, refetchSnapshot, processSnapshot]);
}
