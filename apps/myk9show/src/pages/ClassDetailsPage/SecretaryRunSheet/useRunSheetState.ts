import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useEntryStore } from '@/store/entryStore';
import type { ClassData } from '@/components/classes/types/classTypes';
import type { ClassInput } from '@/store/classStore.types';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { buildRunSheetEntries } from './buildRunSheetEntries';
import type { SortMode, RunSheetEntry, RunSheetResult, ClassPhase } from './types';
import { toClassPhase } from './types';

interface UseRunSheetStateProps {
  rawEntries: RawEntryRow[];
  currentClass: ClassData | null;
  updateClass: (id: string, updates: Partial<ClassInput>) => Promise<unknown>;
  userId: string;
}

interface UseRunSheetStateReturn {
  sortMode: SortMode;
  onSort: (mode: SortMode) => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  classPhase: ClassPhase;
  sortedEntries: RunSheetEntry[];
  onCheckIn: (entryId: string, checked: boolean) => Promise<void>;
  onScratch: (entryId: string, scratched: boolean) => Promise<void>;
  onSaveResult: (entryId: string, result: RunSheetResult) => Promise<void>;
  onStartClass: () => Promise<void>;
  onCloseClass: () => Promise<void>;
}

export function useRunSheetState({
  rawEntries,
  currentClass,
  updateClass,
  userId,
}: UseRunSheetStateProps): UseRunSheetStateReturn {
  const queryClient = useQueryClient();
  const [sortMode, setSortMode] = useState<SortMode>('runOrder');
  const [randomSnapshot, setRandomSnapshot] = useState<RunSheetEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const classPhase = toClassPhase(currentClass?.status);
  const classId = currentClass?.id;

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
      if (classId) {
        await queryClient.invalidateQueries({ queryKey: ['classes', classId, 'entries'] });
      }
    } catch {
      toast.error(errorMsg);
    }
  };

  const onCheckIn = (entryId: string, checked: boolean) =>
    setCheckInStatus(entryId, checked ? 'checked-in' : 'no-status', 'Failed to update check-in');

  const onScratch = (entryId: string, scratched: boolean) =>
    setCheckInStatus(entryId, scratched ? 'pulled' : 'no-status', 'Failed to scratch entry');

  const onSaveResult = async (entryId: string, result: RunSheetResult) => {
    const { recordResult } = useEntryStore.getState();
    try {
      await recordResult(entryId, {
        qualified: result.qualified,
        time: result.timeStr || undefined,
        faults: result.faults,
        placement: result.placement !== null ? String(result.placement) : undefined,
        judgeNotes: result.judgeNotes || undefined,
        recordedBy: userId,
        recordedAt: new Date().toISOString(),
      });
      if (classId) {
        await queryClient.invalidateQueries({ queryKey: ['classes', classId, 'entries'] });
      }
      toast.success('Result saved');
    } catch {
      toast.error('Failed to save result');
    }
  };

  const onStartClass = async () => {
    if (!currentClass?.id) return;
    try {
      await updateClass(currentClass.id, { status: 'In Progress' });
    } catch {
      toast.error('Failed to start class');
    }
  };

  const onCloseClass = async () => {
    if (!currentClass?.id) return;
    try {
      await updateClass(currentClass.id, { status: 'Completed' });
    } catch {
      toast.error('Failed to close class');
    }
  };

  const onToggleExpand = (id: string) => setExpandedId(expandedId === id ? null : id);

  return {
    sortMode,
    onSort,
    expandedId,
    onToggleExpand,
    classPhase,
    sortedEntries,
    onCheckIn,
    onScratch,
    onSaveResult,
    onStartClass,
    onCloseClass,
  };
}
