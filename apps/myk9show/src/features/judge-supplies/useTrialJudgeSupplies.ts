import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trialJudgeSuppliesService } from './trialJudgeSuppliesService';
import type { JudgeKey, RegistryId, TrialJudgeSupplyRow } from './types';

const queryKey = (trialId: string) => ['trial-judge-supplies', trialId] as const;

export interface JudgeSuppliesGroup {
  key: string;
  judge: JudgeKey;
  rows: TrialJudgeSupplyRow[];
}

function groupKey(row: TrialJudgeSupplyRow): string {
  return row.person_id ?? `name:${row.judge_name}`;
}

function groupByJudge(rows: TrialJudgeSupplyRow[]): JudgeSuppliesGroup[] {
  const map = new Map<string, JudgeSuppliesGroup>();
  for (const row of rows) {
    const key = groupKey(row);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        judge: { person_id: row.person_id, judge_name: row.judge_name },
        rows: [],
      };
      map.set(key, group);
    }
    group.rows.push(row);
  }
  for (const group of map.values()) {
    group.rows.sort((a, b) => a.sort_order - b.sort_order);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.judge.judge_name.localeCompare(b.judge.judge_name)
  );
}

export function useTrialJudgeSupplies(trialId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKey(trialId ?? ''),
    enabled: !!trialId,
    queryFn: () => trialJudgeSuppliesService.listForTrial(trialId!),
  });

  const groups = useMemo(() => groupByJudge(query.data ?? []), [query.data]);

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
    groups,
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
