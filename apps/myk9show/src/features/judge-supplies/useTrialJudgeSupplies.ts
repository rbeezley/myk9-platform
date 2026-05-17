import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trialJudgeSuppliesService } from './trialJudgeSuppliesService';
import type { RegistryId, TrialJudgeSupplyRow } from './types';

const queryKey = (trialId: string) => ['trial-judge-supplies', trialId] as const;

export function useTrialJudgeSupplies(trialId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKey(trialId ?? ''),
    enabled: !!trialId,
    queryFn: () => trialJudgeSuppliesService.listForTrial(trialId!),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKey(trialId ?? '') });

  const ensureSeeded = useMutation({
    mutationFn: async (args: {
      person_id: string | null;
      judge_name: string;
      registry_id: RegistryId | null;
    }) => {
      if (!trialId) throw new Error('trialId required');
      return trialJudgeSuppliesService.ensureSeededForJudge({
        trial_id: trialId,
        ...args,
      });
    },
    onSuccess: invalidate,
  });

  const updateRow = useMutation({
    mutationFn: (args: {
      id: string;
      patch: Partial<Pick<TrialJudgeSupplyRow, 'included' | 'note' | 'sort_order' | 'item_label'>>;
    }) => trialJudgeSuppliesService.updateRow(args.id, args.patch),
    onSuccess: invalidate,
  });

  const addCustomRow = useMutation({
    mutationFn: async (args: {
      person_id: string | null;
      judge_name: string;
      item_label: string;
      sort_order: number;
      note?: string | null;
    }) => {
      if (!trialId) throw new Error('trialId required');
      return trialJudgeSuppliesService.addCustomRow({
        trial_id: trialId,
        ...args,
      });
    },
    onSuccess: invalidate,
  });

  const deleteCustomRow = useMutation({
    mutationFn: (id: string) => trialJudgeSuppliesService.deleteCustomRow(id),
    onSuccess: invalidate,
  });

  /** Renumber sort_order on the given rows according to position in the array.
   * Issued as parallel single-row updates; small N keeps this cheap. */
  const reorder = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, idx) =>
          trialJudgeSuppliesService.updateRow(id, { sort_order: (idx + 1) * 10 })
        )
      );
    },
    onSuccess: invalidate,
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
