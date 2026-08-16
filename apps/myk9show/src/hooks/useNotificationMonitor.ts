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
  const notifiedClassStarting = useRef<Set<string>>(new Set());
  const notifiedResultsPosted = useRef<Set<string>>(new Set());
  const classContextRef = useRef<Map<string, ClassContext>>(new Map());
  const dogNameMap = useRef<Map<string, string>>(new Map());
  const entryResultStatusMapRef = useRef<Map<string, string | null>>(new Map());
  const lastInRingEntryByClassRef = useRef<Map<string, string>>(new Map());

  const deliverRef = useRef(deliver);
  const preferencesRef = useRef(preferences);
  const userDogIdsRef = useRef(userDogIds);
  const watchSetRef = useRef(watchSet);
  useLayoutEffect(() => {
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
    (snapshot: NotificationSnapshot) => {
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
      const nextInRingEntryByClass = new Map<string, string>();
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

      for (const [classId, context] of nextContexts) {
        const classRow = classLookup.get(classId);
        if (!classRow) continue;
        const userEntries = context.entries.filter(entry => userDogIdsRef.current.has(entry.dogId));

        if (
          classRow.status === 'In Progress' &&
          !notifiedClassStarting.current.has(classId) &&
          userEntries.length > 0
        ) {
          notifiedClassStarting.current.add(classId);
          const starting = buildClassStartingPayload({ className: context.className });
          starting.actionUrl = `/classes/${classId}`;
          deliverRef.current(starting);

          for (const entry of userEntries) {
            if (!entry.checkInStatus || entry.checkInStatus === 'no-status') {
              const reminder = buildCheckInReminderPayload({
                dogName: nextDogNames.get(entry.dogId) ?? 'Your dog',
                className: context.className,
              });
              reminder.actionUrl = `/classes/${classId}`;
              deliverRef.current(reminder);
            }
          }
        }

        if (
          classRow.is_scoring_finalized &&
          !notifiedResultsPosted.current.has(classId) &&
          userEntries.length > 0
        ) {
          notifiedResultsPosted.current.add(classId);
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

        const inRingEntry = context.entries.find(entry => entry.checkInStatus === 'in-ring');
        if (inRingEntry) {
          nextInRingEntryByClass.set(classId, inRingEntry.id);
          if (lastInRingEntryByClassRef.current.get(classId) !== inRingEntry.id) {
            notifyUpcomingDogs(classId, inRingEntry.id);
          }
        }
      }

      lastInRingEntryByClassRef.current = nextInRingEntryByClass;
    },
    [notifyUpcomingDogs]
  );

  useEffect(() => {
    if (snapshotQuery.data) processSnapshot(snapshotQuery.data);
  }, [snapshotQuery.data, processSnapshot]);

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
        if (!disposed && result.data) processSnapshot(result.data);
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
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [preferences.enabled, userWithRoles, showIds, watchSet, refetchSnapshot, processSnapshot]);
}
