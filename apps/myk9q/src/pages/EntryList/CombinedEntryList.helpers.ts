import React, { useCallback, useState } from 'react';
import type { Entry } from '../../stores/entryStore';
import type { OrgData, ResetConfirmState, SortOrder } from './CombinedEntryList.types';
import { supabase } from '../../lib/supabase';
import { logger } from '@/utils/logger';

/**
 * Parse organization data from org string
 */
export function parseOrganizationData(orgString: string): OrgData {
  if (!orgString || orgString.trim() === '') {
    return { organization: 'AKC', activity_type: 'Scent Work' };
  }
  const parts = orgString.split(' ');
  return { organization: parts[0], activity_type: parts.slice(1).join(' ') };
}

/**
 * Compare entries for sorting
 */
export function compareEntries(a: Entry, b: Entry, sortOrder: SortOrder): number {
  const aInRing = a.status === 'in-ring';
  const bInRing = b.status === 'in-ring';
  if (aInRing && !bInRing) return -1;
  if (!aInRing && bInRing) return 1;

  if (sortOrder === 'section-armband') {
    if (a.section && b.section && a.section !== b.section) {
      return a.section.localeCompare(b.section);
    }
    return a.armband - b.armband;
  } else if (sortOrder === 'armband') {
    return a.armband - b.armband;
  } else if (sortOrder === 'placement') {
    if (a.section && b.section && a.section !== b.section) {
      return a.section.localeCompare(b.section);
    }
    if (a.placement === undefined && b.placement === undefined) return 0;
    if (a.placement === undefined) return 1;
    if (b.placement === undefined) return -1;
    return a.placement - b.placement;
  } else if (sortOrder === 'run') {
    return (a.exhibitorOrder || 0) - (b.exhibitorOrder || 0);
  }
  return 0;
}

/**
 * Parse time limits from string format
 */
export function parseTimeLimit(timeStr?: string): number | undefined {
  if (!timeStr) return undefined;
  const num = parseInt(timeStr, 10);
  if (!isNaN(num)) return num;
  return undefined;
}

/**
 * Fetch class requirements (hides/distractions) from database
 */
export async function fetchClassRequirements(
  orgData: { organization: string },
  element?: string,
  level?: string
): Promise<{ hidesText: string | undefined; distractionsText: string | undefined }> {
  const isMasterLevel = level?.toLowerCase().includes('master');
  if (isMasterLevel || !orgData.organization || !element || !level) {
    return { hidesText: undefined, distractionsText: undefined };
  }

  try {
    const { data: requirements } = await supabase
      .from('class_requirements')
      .select('hides, distractions')
      .eq('organization', orgData.organization)
      .eq('element', element)
      .eq('level', level)
      .single();

    if (requirements) {
      return { hidesText: requirements.hides, distractionsText: requirements.distractions };
    }
  } catch (reqError) {
    logger.warn('Could not fetch class requirements:', reqError);
  }
  return { hidesText: undefined, distractionsText: undefined };
}

/**
 * Determine scoresheet route based on org/activity/element
 */
export function getScoresheetNavigationRoute(orgString: string, entry: Entry): string | null {
  const orgData = parseOrganizationData(orgString);
  const element = entry.element || '';
  const base = `/scoresheet`;

  if (orgData.organization === 'AKC') {
    if (orgData.activity_type === 'Scent Work' || orgData.activity_type === 'ScentWork') {
      return `${base}/akc-scent-work/${entry.classId}/${entry.id}`;
    }
    if (orgData.activity_type === 'FastCat' || orgData.activity_type === 'Fast Cat') {
      return `${base}/akc-fastcat/${entry.classId}/${entry.id}`;
    }
  } else if (orgData.organization === 'UKC') {
    if (orgData.activity_type === 'Nosework') {
      return `${base}/ukc-nosework/${entry.classId}/${entry.id}`;
    }
    if (element === 'Obedience') {
      return `${base}/ukc-obedience/${entry.classId}/${entry.id}`;
    }
    if (element === 'Rally') {
      return `${base}/ukc-rally/${entry.classId}/${entry.id}`;
    }
  }
  return null;
}

export const PRINT_DIALOG_TITLES: Record<string, string> = {
  'check-in': 'Print Check-In Sheet',
  'results-a': 'Print Results - Section A',
  'results-b': 'Print Results - Section B',
  'scoresheet-a': 'Print Scoresheet - Section A',
  'scoresheet-b': 'Print Scoresheet - Section B',
};

/**
 * Hook for status change, reset, and menu handlers.
 */
export function useEntryHandlers(opts: {
  localEntries: Entry[];
  setLocalEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  entries: Entry[];
  handleMarkInRing: (entryId: number, currentStatus?: Entry['status']) => Promise<void>;
  handleMarkCompleted: (entryId: number) => Promise<void>;
  handleStatusChangeHook: (
    entryId: number,
    status: 'no-status' | 'checked-in' | 'conflict' | 'pulled' | 'at-gate' | 'come-to-gate'
  ) => Promise<void>;
  handleResetScoreHook: (entryId: number) => Promise<void>;
  refresh: (force?: boolean) => Promise<void>;
  setActiveTab: (tab: 'pending' | 'completed') => void;
}) {
  const {
    localEntries,
    setLocalEntries,
    entries,
    handleMarkInRing,
    handleMarkCompleted,
    handleStatusChangeHook,
    handleResetScoreHook,
    refresh,
    setActiveTab,
  } = opts;

  const [activeStatusPopup, setActiveStatusPopup] = useState<number | null>(null);
  const [activeResetMenu, setActiveResetMenu] = useState<number | null>(null);
  const [resetMenuPosition, setResetMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [resetConfirmDialog, setResetConfirmDialog] = useState<ResetConfirmState>({
    show: false,
    entry: null,
  });

  const handleStatusClick = useCallback((e: React.MouseEvent, entryId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveStatusPopup(entryId);
  }, []);

  const handleStatusChange = useCallback(
    async (
      entryId: number,
      newStatus:
        | 'no-status'
        | 'checked-in'
        | 'conflict'
        | 'pulled'
        | 'at-gate'
        | 'come-to-gate'
        | 'in-ring'
        | 'completed'
    ) => {
      setActiveStatusPopup(null);

      if (newStatus === 'in-ring') {
        const currentEntry = localEntries.find(entry => entry.id === entryId);
        const currentStatus = currentEntry?.status;
        setLocalEntries(prev =>
          prev.map(entry => (entry.id === entryId ? { ...entry, status: 'in-ring' } : entry))
        );
        try {
          await handleMarkInRing(entryId, currentStatus);
        } catch (error) {
          logger.error('Mark in-ring failed:', error);
          refresh();
        }
        return;
      }

      if (newStatus === 'completed') {
        setLocalEntries(prev =>
          prev.map(entry =>
            entry.id === entryId ? { ...entry, isScored: true, status: 'completed' } : entry
          )
        );
        try {
          await handleMarkCompleted(entryId);
        } catch (error) {
          logger.error('Mark completed failed:', error);
          refresh();
        }
        return;
      }

      setLocalEntries(prev =>
        prev.map(entry =>
          entry.id === entryId
            ? {
                ...entry,
                checkedIn: newStatus !== 'no-status',
                status: newStatus,
                _timestamp: Date.now(),
              }
            : entry
        )
      );

      try {
        await handleStatusChangeHook(entryId, newStatus);
        await refresh();
      } catch (error) {
        logger.error('Status change failed:', error);
        setLocalEntries(prev =>
          prev.map(entry =>
            entry.id === entryId
              ? { ...entry, status: entries.find(e => e.id === entryId)?.status || 'no-status' }
              : entry
          )
        );
        refresh();
      }
    },
    [
      handleMarkInRing,
      handleMarkCompleted,
      handleStatusChangeHook,
      entries,
      localEntries,
      refresh,
      setLocalEntries,
    ]
  );

  const handleResetMenuClick = useCallback((e: React.MouseEvent, entryId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Use rect.right so menu extends LEFT from button (via translateX(-100%) in ResetMenuPopup)
    setResetMenuPosition({ top: rect.bottom + 4, left: rect.right });
    setActiveResetMenu(entryId);
  }, []);

  const handleResetScore = useCallback((entry: Entry) => {
    setActiveResetMenu(null);
    setResetMenuPosition(null);
    setResetConfirmDialog({ show: true, entry });
  }, []);

  const confirmResetScore = useCallback(async () => {
    if (!resetConfirmDialog.entry) return;
    const entryId = resetConfirmDialog.entry.id;
    try {
      await handleResetScoreHook(entryId);
      await new Promise(resolve => setTimeout(resolve, 1500));
      await refresh();
      setActiveTab('pending');
    } catch (error) {
      logger.error('Failed to reset score:', error);
      alert(`Failed to reset score: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    setResetConfirmDialog({ show: false, entry: null });
  }, [resetConfirmDialog.entry, handleResetScoreHook, refresh, setActiveTab]);

  const cancelResetScore = useCallback(() => {
    setResetConfirmDialog({ show: false, entry: null });
  }, []);

  const closeResetMenu = useCallback(() => {
    setActiveResetMenu(null);
    setResetMenuPosition(null);
  }, []);

  return {
    activeStatusPopup,
    setActiveStatusPopup,
    handleStatusClick,
    handleStatusChange,
    activeResetMenu,
    resetMenuPosition,
    handleResetMenuClick,
    handleResetScore,
    resetConfirmDialog,
    confirmResetScore,
    cancelResetScore,
    closeResetMenu,
  };
}
