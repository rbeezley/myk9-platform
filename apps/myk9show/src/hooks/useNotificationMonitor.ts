import { useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useNotificationStore } from '@/store/notificationStore';
import { useNotificationDelivery } from '@/hooks/useNotificationDelivery';
import { useShowDayData } from '@/hooks/queries/useShowDayData';
import { useShowStore } from '@/store/showStore';
import { useDogsByOwnerQuery } from '@/hooks/queries/useDogsDatabase';
import {
  buildYourTurnPayload,
  buildClassStartingPayload,
  buildCheckInReminderPayload,
  buildResultsPostedPayload,
} from '@myk9/notifications';
import { getRunOrder } from '@/utils/runOrderUtils';
import { detectConflicts } from '@/utils/conflictDetection';
import type { ClassContext } from '@/utils/conflictDetection';
import type { ShowEntry } from '@/store/entry-store-types';

const DEDUP_WINDOW_MS = 60_000;

interface EntryRow {
  id: string;
  dog_id: string;
  class_id: string;
  show_id: string;
  check_in_status: string | null;
  registration_data: Record<string, unknown> | null;
  competition_data: Record<string, unknown> | null;
}

interface ClassRow {
  id: string;
  name: string;
  status: string | null;
  is_scoring_finalized: boolean;
}

interface RealtimePayload<T> {
  new: T;
  old: T;
}

/**
 * Core notification monitor hook.
 *
 * Subscribes to Supabase realtime channels for entries and classes across
 * all active shows. Computes run order, detects conflicts across classes,
 * and fires in-app notifications through the delivery pipeline.
 *
 * Mount once inside the AuthProvider tree (e.g. App.tsx).
 */
export function useNotificationMonitor(): void {
  const { userWithRoles, user } = useAuthContext();
  const preferences = useNotificationStore(s => s.preferences);
  const { deliver } = useNotificationDelivery();
  const queryClient = useQueryClient();

  // --- Show IDs (same pattern as useAnnouncementSubscription) ---
  const { activeShows } = useShowDayData();
  const selectedShowId = useShowStore(s => s.selectedShowId);
  const showIds = useMemo(() => {
    const ids = new Set(activeShows.map(s => s.showId));
    if (selectedShowId) ids.add(selectedShowId);
    return [...ids];
  }, [activeShows, selectedShowId]);

  // --- User's dogs ---
  const dogsQuery = useDogsByOwnerQuery(
    userWithRoles?.databaseUserId ?? '',
    !!userWithRoles?.databaseUserId
  );
  const userDogIds = useMemo(() => {
    const dogs = dogsQuery.data ?? [];
    return new Set(dogs.map((d: { id: string }) => d.id));
  }, [dogsQuery.data]);

  // --- Fetch entries + classes for context ---
  const showEntriesQuery = useQuery({
    queryKey: ['notification-monitor', 'entries', showIds],
    queryFn: async () => {
      if (showIds.length === 0) return { entries: [], classes: [] };

      // Fetch classes for these shows via trials
      const { data: classRows, error: classError } = await supabase
        .from('classes')
        .select(
          `id, name, status, is_scoring_finalized,
         trial:trials!inner(show_id)`
        )
        .in('trial.show_id', showIds);
      if (classError) throw classError;

      const classIds = (classRows ?? []).map((c: { id: string }) => c.id);
      if (classIds.length === 0) return { entries: [], classes: classRows ?? [] };

      // Fetch entries for those classes
      const { data: entryRows, error: entryError } = await supabase
        .from('entries')
        .select(
          `id, dog_id, class_id, show_id, check_in_status,
         registration_data, competition_data,
         dog:dogs!inner(id, call_name)`
        )
        .in('class_id', classIds);
      if (entryError) throw entryError;

      return { entries: entryRows ?? [], classes: classRows ?? [] };
    },
    enabled: showIds.length > 0 && preferences.enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // --- Build class context map and dog name map ---
  const classContextRef = useRef<Map<string, ClassContext>>(new Map());
  const dogNameMap = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const data = showEntriesQuery.data;
    if (!data) return;

    const { entries, classes } = data;
    const newCtx = new Map<string, ClassContext>();
    const newDogNames = new Map<string, string>();

    // Build class lookup
    const classLookup = new Map<string, { name: string; status: string }>();
    for (const cls of classes) {
      const c = cls as unknown as ClassRow;
      classLookup.set(c.id, { name: c.name, status: c.status ?? '' });
    }

    // Group entries by class and build dog name map
    const entriesByClass = new Map<string, ShowEntry[]>();
    for (const raw of entries) {
      const entry = raw as unknown as EntryRow & {
        dog?: { id: string; call_name: string };
      };
      if (entry.dog) {
        newDogNames.set(entry.dog.id, entry.dog.call_name);
      }

      const mapped: ShowEntry = {
        id: entry.id,
        dogId: entry.dog_id,
        classId: entry.class_id,
        showId: entry.show_id,
        checkInStatus: (entry.check_in_status as ShowEntry['checkInStatus']) ?? undefined,
        status: 'confirmed',
        registrationData: {
          submittedAt: '',
          handler: '',
          entryFee: 0,
          paymentStatus: 'paid',
          ...(entry.registration_data as Record<string, unknown> | null),
        } as ShowEntry['registrationData'],
        competitionData: entry.competition_data
          ? (entry.competition_data as unknown as ShowEntry['competitionData'])
          : undefined,
        statusHistory: [],
        createdAt: '',
        updatedAt: '',
      };

      const existing = entriesByClass.get(entry.class_id) ?? [];
      existing.push(mapped);
      entriesByClass.set(entry.class_id, existing);
    }

    // Build class contexts
    for (const [classId, classEntries] of entriesByClass) {
      const cls = classLookup.get(classId);
      newCtx.set(classId, {
        classId,
        className: cls?.name ?? classId,
        status: cls?.status ?? '',
        entries: classEntries,
      });
    }

    classContextRef.current = newCtx;
    dogNameMap.current = newDogNames;
  }, [showEntriesQuery.data]);

  // --- Dedup state ---
  const lastYourTurnAlert = useRef<Map<string, number>>(new Map());
  const notifiedClassStarting = useRef<Set<string>>(new Set());
  const notifiedResultsPosted = useRef<Set<string>>(new Set());

  // Stable refs for callbacks — updated via useLayoutEffect so they are
  // always current before any effect fires, without violating the lint rule
  // that forbids mutating refs during render.
  const deliverRef = useRef(deliver);
  const preferencesRef = useRef(preferences);
  const userDogIdsRef = useRef(userDogIds);

  useLayoutEffect(() => {
    deliverRef.current = deliver;
    preferencesRef.current = preferences;
    userDogIdsRef.current = userDogIds;
  });

  // --- Push gating ---
  const sendPush = useCallback(
    async (payload: unknown) => {
      if (!user?.id) return;
      if (document.visibilityState === 'visible') return;
      try {
        await supabase.functions.invoke('send-push-notification', {
          body: { user_id: user.id, payload },
        });
      } catch {
        /* non-fatal */
      }
    },
    [user]
  );
  const sendPushRef = useRef(sendPush);
  useLayoutEffect(() => {
    sendPushRef.current = sendPush;
  });

  // --- Entry change handler ---
  const handleEntryChange = useCallback(
    (payload: RealtimePayload<EntryRow>) => {
      const newEntry = payload.new;
      if (!newEntry || newEntry.check_in_status !== 'in-ring') return;

      const cls = classContextRef.current.get(newEntry.class_id);
      if (!cls) return;

      const runOrder = getRunOrder(cls.entries);
      const inRingIndex = runOrder.findIndex(
        e => e.id === newEntry.id || e.checkInStatus === 'in-ring'
      );
      if (inRingIndex === -1) return;

      const leadDogs = preferencesRef.current.leadDogs;
      const allClasses = [...classContextRef.current.values()];

      // Check next N entries after the in-ring dog
      for (let i = inRingIndex + 1; i <= inRingIndex + leadDogs && i < runOrder.length; i++) {
        const entry = runOrder[i];
        if (!userDogIdsRef.current.has(entry.dogId)) continue;

        // Dedup: skip if alerted within 60s
        const now = Date.now();
        const lastAlerted = lastYourTurnAlert.current.get(entry.id);
        if (lastAlerted && now - lastAlerted < DEDUP_WINDOW_MS) continue;
        lastYourTurnAlert.current.set(entry.id, now);

        const dogsAhead = i - inRingIndex;
        const dogName = dogNameMap.current.get(entry.dogId) ?? 'Your dog';

        // Detect conflicts in other classes
        const conflicts = detectConflicts(entry.dogId, cls.classId, allClasses, leadDogs);

        const notificationPayload = buildYourTurnPayload({
          dogName,
          className: cls.className,
          dogsAhead,
          armband: entry.registrationData?.armband ?? null,
          ...(conflicts.length > 0 ? { conflicts } : {}),
        });

        deliverRef.current(notificationPayload);

        // Push if backgrounded
        if (preferencesRef.current.pushEnabled) {
          sendPushRef.current(notificationPayload);
        }
      }
    },
    [] // refs handle all mutable state
  );

  // --- Class change handler ---
  const handleClassChange = useCallback(
    (payload: RealtimePayload<ClassRow>) => {
      const newClass = payload.new;
      const oldClass = payload.old;
      if (!newClass) return;

      const cls = classContextRef.current.get(newClass.id);
      if (!cls) return;

      // Class starting: status changed to In Progress
      if (
        newClass.status === 'In Progress' &&
        oldClass?.status !== 'In Progress' &&
        !notifiedClassStarting.current.has(newClass.id)
      ) {
        notifiedClassStarting.current.add(newClass.id);

        // For each user dog in this class
        for (const entry of cls.entries) {
          if (!userDogIdsRef.current.has(entry.dogId)) continue;

          if (entry.checkInStatus === 'checked-in') {
            // Class starting notification
            deliverRef.current(buildClassStartingPayload({ className: cls.className }));
          } else if (!entry.checkInStatus || entry.checkInStatus === 'no-status') {
            // Check-in reminder for unchecked dogs
            const dogName = dogNameMap.current.get(entry.dogId) ?? 'Your dog';
            deliverRef.current(
              buildCheckInReminderPayload({
                dogName,
                className: cls.className,
              })
            );
          }
        }
      }

      // Results posted: scoring finalized
      if (
        newClass.is_scoring_finalized &&
        !oldClass?.is_scoring_finalized &&
        !notifiedResultsPosted.current.has(newClass.id)
      ) {
        notifiedResultsPosted.current.add(newClass.id);

        for (const entry of cls.entries) {
          if (!userDogIdsRef.current.has(entry.dogId)) continue;

          const dogName = dogNameMap.current.get(entry.dogId) ?? 'Your dog';
          deliverRef.current(
            buildResultsPostedPayload({
              dogName,
              className: cls.className,
            })
          );
        }
      }

      // Invalidate context data so next poll refreshes
      queryClient.invalidateQueries({
        queryKey: ['notification-monitor', 'entries'],
      });
    },
    [queryClient]
  );

  // --- Realtime subscriptions ---
  useEffect(() => {
    // Early returns
    if (!preferences.enabled) return;
    if (!userWithRoles) return;
    if (showIds.length === 0) return;
    if (userDogIds.size === 0) return;

    const channels: ReturnType<typeof supabase.channel>[] = [];

    for (const showId of showIds) {
      // Entries channel
      const entriesChannel = supabase.channel(`notif-entries:${showId}`);
      entriesChannel
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'entries',
            filter: `show_id=eq.${showId}`,
          },
          p => {
            const typed = p as unknown as { new: EntryRow; old: EntryRow };
            handleEntryChange({ new: typed.new, old: typed.old });
          }
        )
        .subscribe();
      channels.push(entriesChannel);

      // Classes channel — subscribe via trials for this show
      const classesChannel = supabase.channel(`notif-classes:${showId}`);
      classesChannel
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'classes',
          },
          p => {
            const typed = p as unknown as { new: ClassRow; old: ClassRow };
            handleClassChange({ new: typed.new, old: typed.old });
          }
        )
        .subscribe();
      channels.push(classesChannel);
    }

    return () => {
      for (const channel of channels) {
        supabase.removeChannel(channel);
      }
    };
  }, [
    preferences.enabled,
    userWithRoles,
    showIds,
    userDogIds,
    handleEntryChange,
    handleClassChange,
  ]);
}
