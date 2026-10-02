import { useQuery } from '@tanstack/react-query';
import { deviceHasUnsavedWork, type UnsavedWork } from './deleteUnsyncedWork';

export type UnsavedWorkState =
  | { status: 'checking' }
  | { status: 'error' }
  | { status: 'clean' }
  | ({ status: 'unsaved' } & UnsavedWork);

export interface UseUnsavedWorkResult {
  state: UnsavedWorkState;
  /** Look again now and resolve with the fresh answer. */
  recheck: () => Promise<UnsavedWorkState>;
}

function stateOf(work: UnsavedWork): UnsavedWorkState {
  return work.total > 0 ? { status: 'unsaved', ...work } : { status: 'clean' };
}

/**
 * Whether this device has changes that have not uploaded, read when the delete
 * dialog opens and again on demand (Check again, and at confirm). Unknown is
 * never "clean": while checking, and when the queue cannot be read, Delete stays
 * off. `gcTime: 0` so a closed dialog leaves no answer behind for the next.
 */
export function useUnsavedWork(enabled: boolean): UseUnsavedWorkResult {
  const query = useQuery({
    queryKey: ['delete-unsaved-work'],
    queryFn: deviceHasUnsavedWork,
    enabled,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  const state: UnsavedWorkState =
    query.isFetching || (!query.data && !query.isError)
      ? { status: 'checking' }
      : query.isError
        ? { status: 'error' }
        : stateOf(query.data as UnsavedWork);

  const recheck = async (): Promise<UnsavedWorkState> => {
    const result = await query.refetch();
    return result.isError || !result.data ? { status: 'error' } : stateOf(result.data);
  };

  return { state, recheck };
}
