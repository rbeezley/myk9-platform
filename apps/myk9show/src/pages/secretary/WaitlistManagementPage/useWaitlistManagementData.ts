/**
 * Data management hook for WaitlistManagementPage
 * Handles state, data loading, and actions
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuthContext } from '@/hooks/useAuthContext';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import {
  getClassesWithWaitlistCounts,
  getWaitlistByClass,
  promoteWaitlistEntry,
  removeFromWaitlist,
  sendWaitlistOfferMessage,
} from '@/services/database/waitlists';
import { getSecretaryShows } from '@/services/database/shows';
import type { Show, ActionDialogState, WaitlistEntry, ClassWithWaitlistCount } from './types';

export function useWaitlistManagementData(showId?: string) {
  const { user } = useAuthContext();

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
          paymentLinkUrl = await createWaitlistPaymentLink(promotedEntryId, selectedShowId);
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

      // Refresh the waitlist and class counts
      if (selectedClassId) {
        await loadWaitlist(selectedClassId);
      }
      if (selectedShowId) {
        await loadClasses(selectedShowId);
      }
    } catch (err) {
      setError('Failed to offer spot. Please try again.');
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
        (entry.dog?.call_name ?? entry.dog?.name)?.toLowerCase().includes(search) ||
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
