export type RegistryId = string;

export interface SupplyTemplateItem {
  label: string;
  sort: number;
}

export interface TrialJudgeSupplyRow {
  id: string;
  trial_id: string;
  person_id: string | null;
  judge_name: string;
  item_label: string;
  included: boolean;
  note: string | null;
  sort_order: number;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
}

export interface JudgeKey {
  person_id: string | null;
  judge_name: string;
}

/**
 * Stable string identity for a (person_id, judge_name) pair. The `name:`
 * prefix prevents a judge whose name happens to match a UUID from
 * colliding with a person_id keyspace entry. Used by every surface that
 * groups, indexes, or compares judges — keeping it in one place prevents
 * silent desync between section/dialog/report grouping.
 */
export function judgeKey(judge: { person_id: string | null; judge_name: string }): string {
  return judge.person_id ?? `name:${judge.judge_name}`;
}
