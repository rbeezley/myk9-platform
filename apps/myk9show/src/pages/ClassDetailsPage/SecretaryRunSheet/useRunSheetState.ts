import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useEntryStore } from '@/store/entryStore';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { buildRunSheetEntries } from './buildRunSheetEntries';
import type { SortMode, RunSheetEntry } from './types';

interface UseRunSheetStateProps {
  rawEntries: RawEntryRow[];
  classId: string;
  userId: string;
}

interface UseRunSheetStateReturn {
  sortMode: SortMode;
  onSort: (mode: SortMode) => void;
  sortedEntries: RunSheetEntry[];
  onCheckIn: (entryId: string, checked: boolean) => Promise<void>;
  onScratch: (entryId: string, scratched: boolean) => Promise<void>;
}

export function useRunSheetState({
  rawEntries,
  classId,
  userId,
}: UseRunSheetStateProps): UseRunSheetStateReturn {
  const queryClient = useQueryClient();
  const [sortMode, setSortMode] = useState<SortMode>('runOrder');
  const [randomSnapshot, setRandomSnapshot] = useState<RunSheetEntry[]>([]);

  const sortedEntries = useMemo(() => {
    if (sortMode === 'random') return randomSnapshot;
    return buildRunSheetEntries(rawEntries, sortMode);
  }, [rawEntries, sortMode, randomSnapshot]);

  const onSort = (mode: SortMode) => {
    if (mode === 'random') setRandomSnapshot(buildRunSheetEntries(rawEntries, 'random'));
    setSortMode(mode);
  };

  const setCheckInStatus = async (
    entryId: string,
    status: 'checked-in' | 'no-status' | 'pulled',
    errorMsg: string
  ) => {
    try {
      await useEntryStore.getState().updateCheckInStatus(entryId, status, userId);
      await queryClient.invalidateQueries({ queryKey: ['classes', classId, 'entries'] });
    } catch {
      toast.error(errorMsg);
    }
  };

  const onCheckIn = (entryId: string, checked: boolean) =>
    setCheckInStatus(entryId, checked ? 'checked-in' : 'no-status', 'Failed to update check-in');

  const onScratch = (entryId: string, scratched: boolean) =>
    setCheckInStatus(entryId, scratched ? 'pulled' : 'no-status', 'Failed to update pull status');

  return {
    sortMode,
    onSort,
    sortedEntries,
    onCheckIn,
    onScratch,
  };
}
