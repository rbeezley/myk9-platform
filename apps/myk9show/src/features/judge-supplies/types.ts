export type RegistryId = 'AKC' | 'UKC' | string;

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
