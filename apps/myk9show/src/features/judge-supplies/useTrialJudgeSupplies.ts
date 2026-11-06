import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@/lib/notifications';
import { trialJudgeSuppliesService } from './trialJudgeSuppliesService';
import type { JudgeKey, RegistryId, TrialJudgeSupplyRow } from './types';

/** Prefix of every trial's list and of the show-wide list, so one invalidation covers them all. */
export const SUPPLIES_QUERY_ROOT = 'trial-judge-supplies';
/** The Judge Supply Checklist report's show-wide read (useHostedReportData). */
const REPORT_QUERY_ROOT = 'judge-supply-checklist-report';
const queryKey = (trialId: string) => [SUPPLIES_QUERY_ROOT, trialId] as const;

/**
 * MYK9-1728: set when the edited list is one judge's show-wide list. After every successful
 * write the hook copies the edited (source) trial's list onto `targetTrialIds`.
 */
export interface SupplyMirror {
  targetTrialIds: readonly string[];
  judge: JudgeKey;
  registryId: RegistryId | null;
}

// Syncs run one at a time: two overlapping runs would each insert the same missing custom row.
let syncChain: Promise<unknown> = Promise.resolve();

export function useTrialJudgeSupplies(trialId: string | null | undefined, mirror?: SupplyMirror) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKey(trialId ?? ''),
    enabled: !!trialId,
    queryFn: () => trialJudgeSuppliesService.listForTrial(trialId!),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKey(trialId ?? '') });

  const afterWrite = async () => {
    await invalidate();
    if (!trialId || !mirror || mirror.targetTrialIds.length === 0) return;
    const run = syncChain.then(() =>
      trialJudgeSuppliesService.syncJudgeAcrossTrials({
        sourceTrialId: trialId,
        targetTrialIds: mirror.targetTrialIds,
        judge: mirror.judge,
        registryId: mirror.registryId,
      })
    );
    syncChain = run.catch(() => undefined);
    try {
      await run;
    } catch (err) {
      notifications.error(
        err instanceof Error && err.message
          ? `Could not copy supplies to this judge's other trials: ${err.message}`
          : "Could not copy supplies to this judge's other trials"
      );
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [SUPPLIES_QUERY_ROOT] }),
        queryClient.invalidateQueries({ queryKey: [REPORT_QUERY_ROOT] }),
      ]);
    }
  };

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
    onSuccess: afterWrite,
  });

  const updateRow = useMutation({
    mutationFn: (args: {
      id: string;
      patch: Partial<Pick<TrialJudgeSupplyRow, 'included' | 'note' | 'sort_order' | 'item_label'>>;
    }) => trialJudgeSuppliesService.updateRow(args.id, args.patch),
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
      if (!trialId) throw new Error('trialId required');
      return trialJudgeSuppliesService.addCustomRow({
        trial_id: trialId,
        ...args,
      });
    },
    onSuccess: afterWrite,
  });

  const deleteCustomRow = useMutation({
    mutationFn: (id: string) => trialJudgeSuppliesService.deleteCustomRow(id),
    onSuccess: afterWrite,
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
