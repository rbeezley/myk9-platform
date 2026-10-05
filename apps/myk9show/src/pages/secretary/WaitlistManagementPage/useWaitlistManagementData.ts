/**
 * Data management hook for WaitlistManagementPage
 * Handles state, data loading, and actions
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import type { ActionDialogState, WaitlistClassGroup, WaitlistEntry } from './types';

/** The judge-day a secretary asked to see the wait list of (the card's own identity, in a show). */
interface JudgeDayKey {
  showId: string;
  judgeId: string;
  showDate: string;
}

/** Every query of this tab lives under this key, so one invalidation refreshes all of it. */
const waitlistKey = (showId: string) => ['waitlist', showId] as const;

/**
 * State for the Waitlist tab of Entry Management. The tab is already scoped to one show, so
 * there is no show or class to choose: it lists every waiting dog in the show, grouped by class,
 * and "View Wait List" on a judge-day card narrows that to the judge-day's classes (MYK9-1004).
 *
 * Every read is a query keyed by its full scope (show, class set), so data can only render under
 * the scope that produced it: switching show or judge-day shows nothing, not the old rows, until
 * the new read succeeds. One refresh path (`reload`) serves the replica subscription, mutation
 * success and "Try again".
 */
export function useWaitlistManagementData(showId: string) {
  const queryClient = useQueryClient();
  const { judgeDays } = useJudgeDayCapacity(showId || undefined);

  const [judgeDayKey, setJudgeDayKey] = useState<JudgeDayKey | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionDialog, setActionDialog] = useState<ActionDialogState>({
    open: false,
    action: null,
    entry: null,
  });

  const selectedJudgeDay = useMemo(
    () =>
      judgeDayKey && judgeDayKey.showId === showId
        ? (judgeDays.find(
            d => d.judgeId === judgeDayKey.judgeId && d.showDate === judgeDayKey.showDate
          ) ?? null)
        : null,
    [judgeDays, judgeDayKey, showId]
  );

  const classesQuery = useQuery({
    queryKey: [...waitlistKey(showId), 'classes'],
    queryFn: async () => {
      const { data, error } = await getClassesWithWaitlistCounts(showId);
      if (error) {
        logger.error('Error loading classes for waitlist:', 'secretary', {}, error as Error);
        throw error;
      }
      return data;
    },
    enabled: !!showId,
  });
  const classes = useMemo(() => classesQuery.data ?? [], [classesQuery.data]);

  // Which classes' queues to read: the judge-day's classes, else every class in the show that has
  // anyone waiting.
  const targetClassIds = useMemo(
    () =>
      (selectedJudgeDay
        ? selectedJudgeDay.classIds
        : classes.filter(c => c.waitlist_count > 0).map(c => c.id)
      )
        .slice()
        .sort(),
    [selectedJudgeDay, classes]
  );

  const queueQuery = useQuery({
    queryKey: [...waitlistKey(showId), 'queue', targetClassIds],
    queryFn: async () => {
      const results = await Promise.all(targetClassIds.map(id => getWaitlistByClass(id)));
      const failed = results.find(r => r.error);
      if (failed) {
        logger.error('Error loading waitlist:', 'secretary', {}, failed.error as Error);
        throw failed.error;
      }
      return results.flatMap(r => r.data ?? []);
    },
    enabled: !!showId && targetClassIds.length > 0,
  });
  const waitlistEntries = useMemo(() => queueQuery.data ?? [], [queueQuery.data]);

  const isLoading =
    !!showId && (classesQuery.isPending || (targetClassIds.length > 0 && queueQuery.isPending));
  const loadError = classesQuery.error
    ? 'Failed to load classes'
    : queueQuery.error
      ? 'Failed to load waitlist'
      : null;
  const error = actionError ?? loadError;

  // The one refresh path: the replica reporting a change (a new arrival, an automatic offer, a
  // withdrawal), a finished offer or removal, and "Try again". It re-reads this tab's queries and
  // the judge-day cards, which are their own query. Reads hit the replica only, so a refresh
  // cannot notify itself into a loop.
  const reload = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: waitlistKey(showId) }),
      queryClient.invalidateQueries({ queryKey: judgeDayCapacityKey(showId) }),
    ]);
  }, [queryClient, showId]);

  useEffect(() => {
    if (!showId) return;
    const onChange = () => void reload();
    const unsubscribes = [
      replicatedWaitlistEntriesTable.subscribe(onChange, { emitCurrent: false }),
      replicatedEntriesTable.subscribe(onChange, { emitCurrent: false }),
      replicatedClassesTable.subscribe(onChange, { emitCurrent: false }),
    ];
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [showId, reload]);

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
    setActionError(null);

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

      await reload();
    } catch (err) {
      // 22023 is the database refusing on purpose (a trial that has already
      // taken place); its message says why, so show it instead of "try again".
      const refusal = err as { code?: string; message?: string };
      setActionError(
        refusal.code === '22023' && refusal.message
          ? refusal.message
          : 'Failed to offer spot. Please try again.'
      );
      logger.error('Error offering spot:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
      setActionDialog({ open: false, action: null, entry: null });
    }
  }, [actionDialog.entry, showId, reload, notifyOfferedExhibitor, createWaitlistPaymentLink]);

  const handleRemoveFromWaitlist = useCallback(async () => {
    if (!actionDialog.entry) return;

    setIsProcessing(true);
    setActionError(null);

    try {
      const { error } = await removeFromWaitlist(actionDialog.entry.id);

      if (error) {
        setActionError('Failed to remove from waitlist. Please try again.');
        logger.error('Error removing from waitlist:', 'secretary', {}, error as Error);
      } else {
        await reload();
      }
    } catch (err) {
      setActionError('An unexpected error occurred');
      logger.error('Error removing from waitlist:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
      setActionDialog({ open: false, action: null, entry: null });
    }
  }, [actionDialog.entry, reload]);

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

  const viewJudgeDay = useCallback(
    (judgeId: string, showDate: string) => setJudgeDayKey({ showId, judgeId, showDate }),
    [showId]
  );
  const showAllClasses = useCallback(() => setJudgeDayKey(null), []);

  return {
    // State
    judgeDays,
    selectedJudgeDay,
    waitlistEntries,
    groups,
    isLoading,
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
