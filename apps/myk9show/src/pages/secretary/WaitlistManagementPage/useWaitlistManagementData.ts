/**
 * Data management hook for WaitlistManagementPage
 * Handles state, data loading, and actions
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuthContext } from '@/hooks/useAuthContext';
import { logger } from '@/services/LoggingService';
import {
  getClassesWithWaitlistCounts,
  getWaitlistByClass,
  offerWaitlistSpot,
  getWaitlistOfferMessageTarget,
  removeFromWaitlist,
} from '@/services/database/waitlists';
import { getSecretaryShows } from '@/services/database/shows';
import { useMessageStore } from '@/store/messageStore';
import { buildWaitlistOfferMessage } from './waitlistOfferMessage';
import type { Show, ActionDialogState, WaitlistEntry, ClassWithWaitlistCount } from './types';

export function useWaitlistManagementData(showId?: string) {
  const { user } = useAuthContext();
  const getOrCreateThread = useMessageStore(s => s.getOrCreateThread);
  const sendMessage = useMessageStore(s => s.sendMessage);

  const [shows, setShows] = useState<Show[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string>(showId ?? '');
  const [classes, setClasses] = useState<ClassWithWaitlistCount[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);

  // UI state
  const [isLoadingShows, setIsLoadingShows] = useState(true);
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

  useEffect(() => {
    if (showId !== undefined) {
      setSelectedShowId(showId);
    }
  }, [showId]);

  // Data loading callbacks
  const loadShows = useCallback(async () => {
    setIsLoadingShows(true);
    setError(null);

    try {
      const { data, error } = await getSecretaryShows(user?.id || '');
      if (error) {
        setError('Failed to load shows');
        logger.error('Error loading shows for waitlist:', 'secretary', {}, error as Error);
      } else {
        setShows(data || []);
      }
    } catch (err) {
      setError('Failed to load shows');
      logger.error('Error loading shows:', 'secretary', {}, err as Error);
    } finally {
      setIsLoadingShows(false);
    }
  }, [user?.id]);

  const loadClasses = useCallback(async (showId: string) => {
    setIsLoadingClasses(true);
    setError(null);
    setSelectedClassId('');
    setWaitlistEntries([]);

    try {
      const { data, error } = await getClassesWithWaitlistCounts(showId);
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

  const loadWaitlist = useCallback(async (classId: string) => {
    setIsLoadingWaitlist(true);
    setError(null);

    try {
      const { data, error } = await getWaitlistByClass(classId);
      if (error) {
        setError('Failed to load waitlist');
        logger.error('Error loading waitlist:', 'secretary', {}, error as Error);
      } else {
        setWaitlistEntries(data || []);
      }
    } catch (err) {
      setError('Failed to load waitlist');
      logger.error('Error loading waitlist:', 'secretary', {}, err as Error);
    } finally {
      setIsLoadingWaitlist(false);
    }
  }, []);

  // Load shows on mount
  useEffect(() => {
    loadShows();
  }, [loadShows]);

  // Load classes when show changes
  useEffect(() => {
    if (selectedShowId) {
      loadClasses(selectedShowId);
    } else {
      setClasses([]);
      setSelectedClassId('');
      setWaitlistEntries([]);
    }
  }, [selectedShowId, loadClasses]);

  // Load waitlist when class changes
  useEffect(() => {
    if (selectedClassId) {
      loadWaitlist(selectedClassId);
    } else {
      setWaitlistEntries([]);
    }
  }, [selectedClassId, loadWaitlist]);

  // Actions
  // Notify the offered exhibitor through the show-messaging system. Resolves
  // the exhibitor's auth account, opens (or reuses) their inbox thread for the
  // show, and posts the offer message. A failure here never blocks the offer —
  // the waitlist row is already marked `offered` — but the secretary IS told
  // (non-blocking toast) when the exhibitor couldn't be reached: a waitlist
  // offer is time-boxed (`offer_expires_at`), so a silent failure would let the
  // spot tick toward expiry while the secretary believes they notified them.
  const notifyOfferedExhibitor = useCallback(
    async (
      offer: { exhibitor_id?: string | null } | null | undefined,
      entry: WaitlistEntry,
      offerShowId: string
    ) => {
      const exhibitorId = offer?.exhibitor_id;
      if (!exhibitorId || !offerShowId) return;

      try {
        const { data: target, error } = await getWaitlistOfferMessageTarget(exhibitorId);
        if (error || !target) {
          logger.error(
            'Waitlist offer: could not resolve messaging target',
            'secretary',
            { exhibitorId, waitlistEntryId: entry.id },
            error as Error | undefined
          );
          toast.warning("Spot offered, but the in-app notification couldn't be sent.");
          return;
        }

        if (!target.participantAuthUserId) {
          // Known, persistent condition (not a transient error): the exhibitor
          // has no app account, so an in-app offer can't reach them. Surface it
          // so the secretary contacts them another way before the offer lapses.
          logger.error('Waitlist offer: exhibitor has no messaging account', 'secretary', {
            exhibitorId,
            waitlistEntryId: entry.id,
          });
          toast.warning(
            target.exhibitorName
              ? `Spot offered. ${target.exhibitorName} has no app account yet — notify them directly.`
              : 'Spot offered, but this exhibitor has no app account yet — notify them directly.'
          );
          return;
        }

        const thread = await getOrCreateThread(offerShowId, target.participantAuthUserId);
        if (!thread) {
          logger.error('Waitlist offer: failed to open message thread', 'secretary', {
            exhibitorId,
            waitlistEntryId: entry.id,
          });
          toast.warning(
            target.exhibitorName
              ? `Spot offered, but the in-app message to ${target.exhibitorName} didn't send.`
              : "Spot offered, but the in-app notification didn't send."
          );
          return;
        }

        const body = buildWaitlistOfferMessage({
          dogName: entry.dog?.call_name ?? entry.dog?.name ?? null,
          className: entry.class?.name ?? null,
        });
        await sendMessage(thread.id, offerShowId, body);
      } catch (err) {
        logger.error(
          'Waitlist offer: failed to notify exhibitor',
          'secretary',
          { exhibitorId, waitlistEntryId: entry.id },
          err as Error
        );
        toast.warning("Spot offered, but the in-app notification didn't send.");
      }
    },
    [getOrCreateThread, sendMessage]
  );

  const handleOfferSpot = useCallback(async () => {
    if (!actionDialog.entry) return;

    setIsProcessing(true);
    setError(null);

    try {
      const { data, error } = await offerWaitlistSpot(actionDialog.entry.id);

      if (error) {
        setError('Failed to offer spot. Please try again.');
        logger.error('Error offering waitlist spot:', 'secretary', {}, error as Error);
      } else {
        // Notify the offered exhibitor via the show-messaging system. This
        // writes an inbox thread + message (push fires via push-trigger-chat-
        // message), reusing the same single-recipient transport the show-map
        // "Message handler" action uses — not a parallel notifier.
        await notifyOfferedExhibitor(data, actionDialog.entry, selectedShowId);

        // Refresh the waitlist and class counts
        if (selectedClassId) {
          await loadWaitlist(selectedClassId);
        }
        if (selectedShowId) {
          await loadClasses(selectedShowId);
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
      logger.error('Error offering spot:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
      setActionDialog({ open: false, action: null, entry: null });
    }
  }, [
    actionDialog.entry,
    selectedClassId,
    selectedShowId,
    loadWaitlist,
    loadClasses,
    notifyOfferedExhibitor,
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
        // Refresh the waitlist and class counts
        if (selectedClassId) {
          await loadWaitlist(selectedClassId);
        }
        if (selectedShowId) {
          await loadClasses(selectedShowId);
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
      logger.error('Error removing from waitlist:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
      setActionDialog({ open: false, action: null, entry: null });
    }
  }, [actionDialog.entry, selectedClassId, selectedShowId, loadWaitlist, loadClasses]);

  const handleRefresh = useCallback(() => {
    if (selectedClassId) {
      loadWaitlist(selectedClassId);
    }
    if (selectedShowId) {
      loadClasses(selectedShowId);
    }
  }, [selectedClassId, selectedShowId, loadWaitlist, loadClasses]);

  // Derived state
  const filteredEntries = useMemo(() => {
    if (!searchTerm) return waitlistEntries;
    const search = searchTerm.toLowerCase();
    return waitlistEntries.filter(
      entry =>
        entry.dog?.name?.toLowerCase().includes(search) ||
        entry.dog?.call_name?.toLowerCase().includes(search)
    );
  }, [waitlistEntries, searchTerm]);

  const selectedClass = useMemo(
    () => classes.find(c => c.id === selectedClassId),
    [classes, selectedClassId]
  );

  return {
    // State
    shows,
    selectedShowId,
    classes,
    selectedClassId,
    waitlistEntries,
    filteredEntries,
    selectedClass,
    isLoadingShows,
    isLoadingClasses,
    isLoadingWaitlist,
    isProcessing,
    error,
    searchTerm,
    actionDialog,
    // Actions
    setSelectedShowId,
    setSelectedClassId,
    setSearchTerm,
    setActionDialog,
    handleOfferSpot,
    handleRemoveFromWaitlist,
    handleRefresh,
  };
}
