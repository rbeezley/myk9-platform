import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showJudgeSuppliesService } from './showJudgeSuppliesService';
import type { RegistryId, ShowJudgeSupplyRow } from './types';

/** The Judge Supply Checklist report's show-wide read (useHostedReportData). */
const REPORT_QUERY_ROOT = 'judge-supply-checklist-report';
export const showSuppliesQueryKey = (showId: string) => ['show-judge-supplies', showId] as const;

/** Every judge's supply rows for one show: the list the tool, the dialog and the report share. */
export function useShowJudgeSupplyRows(showId: string | null | undefined) {
  return useQuery({
    queryKey: showSuppliesQueryKey(showId ?? ''),
    enabled: !!showId,
    queryFn: () => showJudgeSuppliesService.listForShow(showId!),
  });
}

export function useShowJudgeSupplies(showId: string | null | undefined) {
  const queryClient = useQueryClient();
  const query = useShowJudgeSupplyRows(showId);

  // The report reads the same rows under its own key, so a write refreshes both.
  const afterWrite = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: showSuppliesQueryKey(showId ?? '') }),
      queryClient.invalidateQueries({ queryKey: [REPORT_QUERY_ROOT] }),
    ]);
  };

  const ensureSeeded = useMutation({
    mutationFn: async (args: {
      person_id: string | null;
      judge_name: string;
      registry_id: RegistryId | null;
    }) => {
      if (!showId) throw new Error('showId required');
      return showJudgeSuppliesService.ensureSeededForJudge({ show_id: showId, ...args });
    },
    onSuccess: afterWrite,
  });

  const updateRow = useMutation({
    mutationFn: (args: {
      id: string;
      patch: Partial<Pick<ShowJudgeSupplyRow, 'included' | 'note' | 'sort_order' | 'item_label'>>;
    }) => showJudgeSuppliesService.updateRow(args.id, args.patch),
    onSuccess: afterWrite,
  });

  const addCustomRow = useMutation({
    mutationFn: async (args: {
      person_id: string | null;
      judge_name: string;
      item_label: string;
      sort_order: number;
      note?: string | null;
    }) => {
      if (!showId) throw new Error('showId required');
      return showJudgeSuppliesService.addCustomRow({ show_id: showId, ...args });
    },
    onSuccess: afterWrite,
  });

  const deleteCustomRow = useMutation({
    mutationFn: (id: string) => showJudgeSuppliesService.deleteCustomRow(id),
    onSuccess: afterWrite,
  });

  /** Renumber sort_order on the given rows according to position in the array.
   * Issued as parallel single-row updates; small N keeps this cheap. */
  const reorder = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, idx) =>
          showJudgeSuppliesService.updateRow(id, { sort_order: (idx + 1) * 10 })
        )
      );
    },
    onSuccess: afterWrite,
  });

  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    ensureSeeded,
    updateRow,
    addCustomRow,
    deleteCustomRow,
    reorder,
  };
}
