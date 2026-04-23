/**
 * Data management hook for WaitlistManagementPage
 * Handles state, data loading, and actions
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { logger } from '@/services/LoggingService';
import {
  getClassesWithWaitlistCounts,
  getWaitlistByClass,
  offerWaitlistSpot,
  removeFromWaitlist,
} from '@/services/database/queries/waitlistQueries';
import { getSecretaryShows } from '@/services/database/queries/showQueries';
import type { Show, ActionDialogState, WaitlistEntry, ClassWithWaitlistCount } from './types';

export function useWaitlistManagementData(externalShowId?: string) {
  const { user } = useAuthContext();

  // Selection state — initialized from parent; stays in sync when parent changes.
  const [shows, setShows] = useState<Show[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string>(externalShowId ?? '');
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

  // Keep local selection in sync when the parent page changes its show selection.
  useEffect(() => {
    if (externalShowId !== undefined) {
      setSelectedShowId(externalShowId);
    }
  }, [externalShowId]);

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
        // TODO: Phase 6 notifications — notify exhibitor of offered spot
        if (data?.exhibitor_id) {
          logger.debug('Waitlist spot offered notification', 'secretary', {
            exhibitorId: data.exhibitor_id,
            classEntryId: actionDialog.entry.id,
          });
        }

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
  }, [actionDialog.entry, selectedClassId, selectedShowId, loadWaitlist, loadClasses]);

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
