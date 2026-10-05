/**
 * Data management hook for WaitlistManagementPage
 * Handles state, data loading, and actions
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { judgeDayCapacityKey, useJudgeDayCapacity } from '@/hooks/queries/useJudgeDayCapacity';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import {
  getClassesWithWaitlistCounts,
  getWaitlistByClass,
  promoteWaitlistEntry,
  removeFromWaitlist,
  sendWaitlistOfferMessage,
} from '@/services/database/waitlists';
import type {
  ActionDialogState,
  WaitlistClassGroup,
  WaitlistEntry,
  ClassWithWaitlistCount,
} from './types';

/** The judge-day a secretary asked to see the wait list of (the card's own identity). */
interface JudgeDayKey {
  judgeId: string;
  showDate: string;
}

/**
 * State for the Waitlist tab of Entry Management. The tab is already scoped to one show, so
 * there is no show or class to choose: it lists every waiting dog in the show, grouped by class,
 * and "View Wait List" on a judge-day card narrows that to the judge-day's classes (MYK9-1004).
 */
export function useWaitlistManagementData(showId: string) {
  const queryClient = useQueryClient();
  const { judgeDays } = useJudgeDayCapacity(showId || undefined);

  const [classes, setClasses] = useState<ClassWithWaitlistCount[]>([]);
  // The queue read, stamped with the scope (class set) that produced it: a result can only be
  // shown under that scope, never under the judge-day the secretary has since switched to.
  const [queue, setQueue] = useState<{ key: string; entries: WaitlistEntry[] } | null>(null);
  const [judgeDayKey, setJudgeDayKey] = useState<JudgeDayKey | null>(null);

  // UI state
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [isLoadingWaitlist, setIsLoadingWaitlist] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Dialog state
  const [actionDialog, setActionDialog] = useState<ActionDialogState>({
    open: false,
    action: null,
    entry: null,
  });

  // A different show means a different judge-day list: drop the narrowing.
  useEffect(() => {
    setJudgeDayKey(null);
  }, [showId]);

  const selectedJudgeDay = useMemo(
    () =>
      judgeDayKey
        ? (judgeDays.find(
            d => d.judgeId === judgeDayKey.judgeId && d.showDate === judgeDayKey.showDate
          ) ?? null)
        : null,
    [judgeDays, judgeDayKey]
  );

  // Which classes' queues to read: the judge-day's classes, else every class in the show that has
  // anyone waiting. Keyed by value so an unchanged set does not refetch.
  const targetClassIds = useMemo(
    () =>
      selectedJudgeDay
        ? selectedJudgeDay.classIds
        : classes.filter(c => c.waitlist_count > 0).map(c => c.id),
    [selectedJudgeDay, classes]
  );
  const targetKey = targetClassIds.join(',');
  const waitlistEntries = useMemo(
    () => (queue && queue.key === targetKey ? queue.entries : []),
    [queue, targetKey]
  );
  // Waiting on the read for the current scope (it has not produced a result yet).
  const isQueuePending = targetKey !== '' && queue?.key !== targetKey && !error;

  // Data loading callbacks
  const loadClasses = useCallback(async (forShowId: string) => {
    setIsLoadingClasses(true);
    setError(null);

    try {
      const { data, error } = await getClassesWithWaitlistCounts(forShowId);
      if (error) {
        setError('Failed to load classes');
        logger.error('Error loading classes for waitlist:', 'secretary', {}, error as Error);
      } else {
        setClasses(data || []);
      }
    } catch (err) {
      setError('Failed to load classes');
      logger.error('Error loading classes:', 'secretary', {}, err as Error);
    } finally {
      setIsLoadingClasses(false);
    }
  }, []);

  // Only the newest read may write state: a slow read for a judge-day the secretary has already
  // left must not overwrite the queue they are looking at now.
  const latestWaitlistRead = useRef(0);
  const loadWaitlist = useCallback(async (classIds: string[]) => {
    const readId = ++latestWaitlistRead.current;
    setIsLoadingWaitlist(true);
    setError(null);

    try {
      const results = await Promise.all(classIds.map(id => getWaitlistByClass(id)));
      if (readId !== latestWaitlistRead.current) return;
      const failed = results.find(r => r.error);
      if (failed) {
        setError('Failed to load waitlist');
        logger.error('Error loading waitlist:', 'secretary', {}, failed.error as Error);
      } else {
        setQueue({ key: classIds.join(','), entries: results.flatMap(r => r.data ?? []) });
      }
    } catch (err) {
      if (readId !== latestWaitlistRead.current) return;
      setError('Failed to load waitlist');
      logger.error('Error loading waitlist:', 'secretary', {}, err as Error);
    } finally {
      if (readId === latestWaitlistRead.current) setIsLoadingWaitlist(false);
    }
  }, []);

  // Load classes when the show changes
  useEffect(() => {
    if (showId) {
      loadClasses(showId);
    } else {
      setClasses([]);
      setQueue(null);
    }
  }, [showId, loadClasses]);

  // Load the queues whenever the set of classes to show changes
  useEffect(() => {
    if (targetKey) {
      loadWaitlist(targetKey.split(','));
    } else {
      latestWaitlistRead.current++;
      setQueue(null);
      setIsLoadingWaitlist(false);
    }
  }, [targetKey, loadWaitlist]);

  // Re-read the counts and the queues from the replica. Used by the retry button and when the
  // replica reports a change (a new arrival, an automatic offer, a withdrawal), since there is no
  // Refresh button any more. It reads the replica only: a read that wrote rows would notify again
  // and loop.
  const reload = useCallback(() => {
    void loadWaitlist(targetClassIds);
    if (showId) void loadClasses(showId);
  }, [loadWaitlist, loadClasses, targetClassIds, showId]);

  useEffect(() => {
    if (!showId) return;
    const unsubscribes = [
      replicatedWaitlistEntriesTable.subscribe(reload, { emitCurrent: false }),
      replicatedEntriesTable.subscribe(reload, { emitCurrent: false }),
      replicatedClassesTable.subscribe(reload, { emitCurrent: false }),
    ];
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [showId, reload]);

  // After an offer or removal: re-read the queues and counts, and the judge-day cards, which are
  // their own query and would otherwise keep showing the old Full / spots figures.
  const reloadAfterChange = useCallback(async () => {
    await Promise.all([loadWaitlist(targetClassIds), loadClasses(showId)]);
    await queryClient.invalidateQueries({ queryKey: judgeDayCapacityKey(showId) });
  }, [loadWaitlist, loadClasses, targetClassIds, showId, queryClient]);

  // Actions
  // Send the offered exhibitor the in-app offer message. The database writes
  // it (send_waitlist_offer_message), through the same function an automatic
  // offer uses, so both paths send the same message (MYK9-1003). A failure
  // here never blocks the offer — the row is already `offered` and its email
  // and push are queued by the database — but the secretary IS told (toast):
  // the offer is time-boxed, and a silent failure would let it tick toward
  // expiry while they believe the exhibitor heard.
  const notifyOfferedExhibitor = useCallback(
    async (entry: WaitlistEntry, paymentLinkUrl: string | null) => {
      try {
        const outcome = await sendWaitlistOfferMessage(entry.id, paymentLinkUrl);
        if (outcome === 'sent') return;
        logger.error('Waitlist offer: in-app message not sent', 'secretary', {
          waitlistEntryId: entry.id,
          outcome,
        });
        toast.warning(
          outcome === 'no_account'
            ? 'Spot offered. This exhibitor has no app account yet — notify them directly.'
            : "Spot offered, but the in-app notification didn't send."
        );
      } catch (err) {
        logger.error(
          'Waitlist offer: failed to notify exhibitor',
          'secretary',
          { waitlistEntryId: entry.id },
          err as Error
        );
        toast.warning("Spot offered, but the in-app notification didn't send.");
      }
    },
    []
  );

  const createWaitlistPaymentLink = useCallback(
    async (entryId: string, offerShowId: string): Promise<string> => {
      const origin = window.location.origin;
      const { data, error: invokeError } = await supabase.functions.invoke('stripe-payment-link', {
        body: {
          entry_ids: [entryId],
          success_url: `${origin}/shows/${offerShowId}?payment=success`,
          cancel_url: `${origin}/shows/${offerShowId}?payment=cancelled`,
        },
      });

      if (invokeError) {
        throw invokeError;
      }
      if (!data?.url || typeof data.url !== 'string') {
        throw new Error('Payment link response did not include a URL');
      }

      return data.url;
    },
    []
  );

  const handleOfferSpot = useCallback(async () => {
    if (!actionDialog.entry) return;

    setIsProcessing(true);
    setError(null);

    try {
      const promotedEntryId = await promoteWaitlistEntry(actionDialog.entry.id);

      let paymentLinkUrl: string | null = null;
      if (actionDialog.entry.joined_via !== 'mail_in') {
        try {
          paymentLinkUrl = await createWaitlistPaymentLink(promotedEntryId, showId);
        } catch (err) {
          logger.error(
            'Waitlist offer: failed to create payment link',
            'secretary',
            { waitlistEntryId: actionDialog.entry.id, promotedEntryId },
            err as Error
          );
          toast.warning(
            'Spot offered, but the payment link could not be created. Request payment from the entry list.'
          );
        }
      }

      // The exhibitor's inbox message (its insert sends the chat push).
      await notifyOfferedExhibitor(actionDialog.entry, paymentLinkUrl);

      await reloadAfterChange();
    } catch (err) {
      // 22023 is the database refusing on purpose (a trial that has already
      // taken place); its message says why, so show it instead of "try again".
      const refusal = err as { code?: string; message?: string };
      setError(
        refusal.code === '22023' && refusal.message
          ? refusal.message
          : 'Failed to offer spot. Please try again.'
      );
      logger.error('Error offering spot:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
      setActionDialog({ open: false, action: null, entry: null });
    }
  }, [
    actionDialog.entry,
    showId,
    reloadAfterChange,
    notifyOfferedExhibitor,
    createWaitlistPaymentLink,
  ]);

  const handleRemoveFromWaitlist = useCallback(async () => {
    if (!actionDialog.entry) return;

    setIsProcessing(true);
    setError(null);

    try {
      const { error } = await removeFromWaitlist(actionDialog.entry.id);

      if (error) {
        setError('Failed to remove from waitlist. Please try again.');
        logger.error('Error removing from waitlist:', 'secretary', {}, error as Error);
      } else {
        await reloadAfterChange();
      }
    } catch (err) {
      setError('An unexpected error occurred');
      logger.error('Error removing from waitlist:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
      setActionDialog({ open: false, action: null, entry: null });
    }
  }, [actionDialog.entry, reloadAfterChange]);

  // Derived state: one group per class, each in join order, narrowed by the dog search. Classes
  // with nobody (left) waiting are omitted rather than rendered as empty cards.
  const groups = useMemo<WaitlistClassGroup[]>(() => {
    const search = searchTerm.toLowerCase();
    const matches = (entry: WaitlistEntry) =>
      !search ||
      (entry.dog?.call_name ?? entry.dog?.name)?.toLowerCase().includes(search) ||
      entry.dog?.call_name?.toLowerCase().includes(search);
    const byClass = new Map<string, WaitlistEntry[]>();
    for (const entry of waitlistEntries) {
      if (!matches(entry)) continue;
      byClass.set(entry.class_id, [...(byClass.get(entry.class_id) ?? []), entry]);
    }
    return classes
      .filter(cls => byClass.has(cls.id))
      .map(cls => ({
        cls,
        entries: [...byClass.get(cls.id)!].sort((a, b) => a.position - b.position),
      }));
  }, [classes, waitlistEntries, searchTerm]);

  const viewJudgeDay = useCallback((judgeId: string, showDate: string) => {
    setJudgeDayKey({ judgeId, showDate });
  }, []);
  const showAllClasses = useCallback(() => setJudgeDayKey(null), []);

  return {
    // State
    judgeDays,
    selectedJudgeDay,
    waitlistEntries,
    groups,
    isLoadingClasses,
    isLoadingWaitlist: isLoadingWaitlist || isQueuePending,
    isProcessing,
    error,
    searchTerm,
    actionDialog,
    // Actions
    reload,
    viewJudgeDay,
    showAllClasses,
    setSearchTerm,
    setActionDialog,
    handleOfferSpot,
    handleRemoveFromWaitlist,
  };
}
