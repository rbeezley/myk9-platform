import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CheckInStatus } from '@myk9/core';
import { useEntryStore } from '@/store/entryStore';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import type { Dog } from '@/types/dog-types';
import type { ConformationPuppyContext } from '@/features/dogs/identity';
import { buildRunSheetEntries } from './buildRunSheetEntries';
import type { RunSheetEntry } from './types';

interface UseRunSheetStateProps {
  rawEntries: RawEntryRow[];
  classId: string;
  userId: string;
  dogs: Dog[];
  organization?: string | null | undefined;
  /** The class's trial registry; absent means nothing can be held (MYK9-1162). */
  registryId?: string | null | undefined;
  /** Trial type and class names for the conformation-puppy carve-out (MYK9-1162). */
  puppyContext?: ConformationPuppyContext | undefined;
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
  registryId,
  puppyContext,
}: UseRunSheetStateProps): UseRunSheetStateReturn {
  const queryClient = useQueryClient();
  const dogLookup = useMemo(() => new Map(dogs.map(dog => [dog.id, dog])), [dogs]);

  const sortedEntries = useMemo(
    () => buildRunSheetEntries(rawEntries, dogLookup, organization, registryId, puppyContext),
    [rawEntries, dogLookup, organization, registryId, puppyContext]
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
