import { useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  armband: string | null;
  handler: string | null;
  entry_fee: number | null;
  payment_status: string | null;
  submitted_at: string | null;
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
  // --- Show IDs (same pattern as useAnnouncementSubscription) ---
  const { activeShows } = useShowDayData();
  const selectedShowId = useShowStore(s => s.selectedShowId);
  const showIdsKey = useMemo(() => {
    const ids = new Set(activeShows.map(s => s.showId));
    if (selectedShowId) ids.add(selectedShowId);
    return [...ids].sort().join(',');
  }, [activeShows, selectedShowId]);
  const showIds = useMemo(() => (showIdsKey ? showIdsKey.split(',') : []), [showIdsKey]);

  // --- User's dogs ---
  const dogsQuery = useDogsByOwnerQuery(
    userWithRoles?.databaseUserId ?? '',
    !!userWithRoles?.databaseUserId
  );
  const dogIdsKey = useMemo(() => {
    const dogs = dogsQuery.data ?? [];
    return dogs
      .map(d => (d as { id: string }).id)
      .sort()
      .join(',');
  }, [dogsQuery.data]);
  const userDogIds = useMemo(() => new Set(dogIdsKey ? dogIdsKey.split(',') : []), [dogIdsKey]);

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
         armband, handler, entry_fee, payment_status, submitted_at,
         dog:dog_id!inner(id, call_name)`
        )
        .in('class_id', classIds);
      if (entryError) throw entryError;

      return { entries: entryRows ?? [], classes: classRows ?? [] };
    },
    enabled: showIds.length > 0 && preferences.enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

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
          submittedAt: entry.submitted_at ?? '',
          handler: entry.handler ?? '',
          entryFee: entry.entry_fee ?? 0,
          paymentStatus: (entry.payment_status as 'pending' | 'paid' | 'refunded') ?? 'pending',
          armband: entry.armband ?? undefined,
        },
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

    // Catch-up pass: fire missed notifications for classes already in progress
    // or already finalized when the app opens mid-show.
    for (const [classId, ctx] of newCtx) {
      const cls = classLookup.get(classId);
      if (!cls) continue;

      if (cls.status === 'In Progress' && !notifiedClassStarting.current.has(classId)) {
        notifiedClassStarting.current.add(classId);
        const userEntries = ctx.entries.filter(e => userDogIdsRef.current.has(e.dogId));
        if (userEntries.length > 0) {
          const payload = buildClassStartingPayload({ className: ctx.className });
          payload.actionUrl = `/classes/${classId}`;
          deliverRef.current(payload);

          for (const entry of userEntries) {
            if (!entry.checkInStatus || entry.checkInStatus === 'no-status') {
              const dogName = newDogNames.get(entry.dogId) ?? 'Your dog';
              const reminder = buildCheckInReminderPayload({ dogName, className: ctx.className });
              reminder.actionUrl = `/classes/${classId}`;
              deliverRef.current(reminder);
            }
          }
        }
      }

      const classRow = classes.find(c => (c as unknown as ClassRow).id === classId) as unknown as
        | ClassRow
        | undefined;
      if (classRow?.is_scoring_finalized && !notifiedResultsPosted.current.has(classId)) {
        notifiedResultsPosted.current.add(classId);
        const userDogNames = ctx.entries
          .filter(e => userDogIdsRef.current.has(e.dogId))
          .map(e => newDogNames.get(e.dogId) ?? 'Your dog');
        if (userDogNames.length > 0) {
          const resultsPayload = buildResultsPostedPayload({
            dogName: userDogNames.join(', '),
            className: ctx.className,
          });
          resultsPayload.actionUrl = `/classes/${classId}`;
          deliverRef.current(resultsPayload);
        }
      }
    }
  }, [showEntriesQuery.data]);

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
      const inRingIndex = runOrder.findIndex(e => e.id === newEntry.id);
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
        notificationPayload.actionUrl = `/classes/${cls.classId}`;

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
  const handleClassChange = useCallback((payload: RealtimePayload<ClassRow>) => {
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

      const userEntries = cls.entries.filter(e => userDogIdsRef.current.has(e.dogId));
      if (userEntries.length === 0) return;

      // Always send one class_starting notification
      const classStartingPayload = buildClassStartingPayload({ className: cls.className });
      classStartingPayload.actionUrl = `/classes/${cls.classId}`;
      deliverRef.current(classStartingPayload);

      // Additionally send per-dog check_in_reminder for unchecked dogs
      for (const entry of userEntries) {
        if (!entry.checkInStatus || entry.checkInStatus === 'no-status') {
          const dogName = dogNameMap.current.get(entry.dogId) ?? 'Your dog';
          const reminderPayload = buildCheckInReminderPayload({
            dogName,
            className: cls.className,
          });
          reminderPayload.actionUrl = `/classes/${cls.classId}`;
          deliverRef.current(reminderPayload);
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

      // One notification per class — join all user dog names
      const userDogNames = cls.entries
        .filter(e => userDogIdsRef.current.has(e.dogId))
        .map(e => dogNameMap.current.get(e.dogId) ?? 'Your dog');
      if (userDogNames.length > 0) {
        const resultsPayload = buildResultsPostedPayload({
          dogName: userDogNames.join(', '),
          className: cls.className,
        });
        resultsPayload.actionUrl = `/classes/${cls.classId}`;
        deliverRef.current(resultsPayload);
      }
    }
  }, []);

  // --- Realtime subscriptions ---
  useEffect(() => {
    // Early returns
    if (!preferences.enabled) return;
    if (!userWithRoles) return;
    if (showIds.length === 0) return;
    if (userDogIds.size === 0) return;

    const channels: ReturnType<typeof supabase.channel>[] = [];

    // Per-show entries channels (filtered by show_id)
    for (const showId of showIds) {
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
    }

    // Single classes channel (no show-level filter available — classes don't
    // have a direct show_id column). classContextRef gate in the handler
    // ensures only relevant classes trigger notifications.
    const classesChannel = supabase.channel('notif-classes');
    classesChannel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'classes' }, p => {
        const typed = p as unknown as { new: ClassRow; old: ClassRow };
        handleClassChange({ new: typed.new, old: typed.old });
      })
      .subscribe();
    channels.push(classesChannel);

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
