import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CheckInStatus } from '@myk9/core';
import { useEntryStore } from '@/store/entryStore';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import type { Dog } from '@/types/dog-types';
import { buildRunSheetEntries } from './buildRunSheetEntries';
import type { RunSheetEntry } from './types';

interface UseRunSheetStateProps {
  rawEntries: RawEntryRow[];
  classId: string;
  userId: string;
  dogs: Dog[];
  organization?: string | null | undefined;
}

interface UseRunSheetStateReturn {
  sortedEntries: RunSheetEntry[];
  onCheckInStatus: (entryId: string, status: CheckInStatus) => Promise<void>;
}

export function useRunSheetState({
  rawEntries,
  classId,
  userId,
  dogs,
  organization,
}: UseRunSheetStateProps): UseRunSheetStateReturn {
  const queryClient = useQueryClient();
  const dogLookup = useMemo(() => new Map(dogs.map(dog => [dog.id, dog])), [dogs]);

  const sortedEntries = useMemo(
    () => buildRunSheetEntries(rawEntries, dogLookup, organization),
    [rawEntries, dogLookup, organization]
  );

  const onCheckInStatus = async (entryId: string, status: CheckInStatus) => {
    try {
      await useEntryStore.getState().updateCheckInStatus(entryId, status, userId);
      await queryClient.invalidateQueries({ queryKey: ['classes', classId, 'entries'] });
    } catch {
      toast.error('Failed to update check-in status');
    }
  };

  return { sortedEntries, onCheckInStatus };
}
