import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';

export type ShowMapNodeType =
  | 'show'
  | 'all-exhibitors'
  | 'trial'
  | 'class'
  | 'dog'
  | 'entry'
  | 'dog-entry'
  | 'more';

export type ShowMapStatusKind = 'neutral' | 'active' | 'complete' | 'muted' | 'attention';

export type ShowMapFilter = 'all' | 'in-progress' | 'needs-attention';
export type ShowMapDayScope = 'today' | 'tomorrow' | 'all';
export type ShowMapCompletionScope = 'active' | 'completed';

export interface ShowMapScopeState {
  dayScope: ShowMapDayScope;
  completionScope: ShowMapCompletionScope;
}

export interface ShowMapProgress {
  completed: number;
  total: number;
  label: string;
}

export interface ShowMapDisplayStatus {
  value: string;
  label: string;
  kind: ShowMapStatusKind;
}

export const SHOW_MAP_WRAP_UP_STATUS = {
  NEEDS_JUDGE_SIGNATURE: 'needs-judge-signature',
  SIGNED_BY_JUDGE: 'signed-by-judge',
  CLASS_READY_FOR_WRAP_UP: 'class-ready-for-wrap-up',
  SUBMITTED_TO_REGISTRY: 'submitted-to-registry',
  NEEDS_WRAP_UP: 'needs-wrap-up',
  TRIAL_READY_TO_SUBMIT: 'trial-ready-to-submit',
} as const;

export type ShowMapWrapUpStatusValue =
  (typeof SHOW_MAP_WRAP_UP_STATUS)[keyof typeof SHOW_MAP_WRAP_UP_STATUS];

export interface ShowMapTrialInput extends SyncableTrial {
  resultSubmittedAt?: string | null | undefined;
}

export interface ShowMapNode {
  id: string;
  type: ShowMapNodeType;
  label: string;
  subtitle?: string | undefined;
  count?: number | undefined;
  status?: ShowMapDisplayStatus | undefined;
  wrapUpStatus?: ShowMapDisplayStatus | undefined;
  checkInStatus?: ShowMapDisplayStatus | undefined;
  progress?: ShowMapProgress | undefined;
  attentionCount?: number | undefined;
  href?: string | undefined;
  scoreHref?: string | undefined;
  trialDate?: string | undefined;
  timezone?: string | null | undefined;
  ringLabel?: string | undefined;
  judgeName?: string | undefined;
  startTime?: string | undefined;
  entryDisplay?: ShowMapEntryDisplay | undefined;
  dogEntryDisplay?: ShowMapDogEntryDisplay | undefined;
  parentId?: string | undefined;
  childrenCount: number;
  isSynthetic?: boolean | undefined;
}

export interface ShowMapEntryDisplay {
  armband?: string | undefined;
  dogName: string;
  dogId?: string | undefined;
  breed?: string | undefined;
  handler?: string | undefined;
  handlerId?: string | undefined;
  dogHref?: string | undefined;
  handlerHref?: string | undefined;
}

export interface ShowMapDogEntryDisplay {
  entryId: string;
  classId?: string | undefined;
  classLabel: string;
  trialId?: string | undefined;
  trialLabel?: string | undefined;
  trialDate?: string | undefined;
  ringLabel?: string | undefined;
  judgeName?: string | undefined;
  startTime?: string | undefined;
}

export interface ShowMapTree {
  root: ShowMapNode;
  nodesById: Record<string, ShowMapNode>;
  childIdsByParentId: Record<string, string[]>;
}

export interface ShowMapClassInput {
  id: string;
  trialId: string;
  name: string;
  element?: string | undefined;
  level?: string | undefined;
  section?: string | undefined;
  judgeName?: string | undefined;
  time?: string | undefined;
  status?: string | undefined;
  entryCount?: number | undefined;
  scoredCount?: number | undefined;
  ring?: string | number | null | undefined;
  ringName?: string | undefined;
  trialDate?: string | undefined;
  trialNumber?: string | undefined;
  trialName?: string | undefined;
}

export type ShowMapEntryInput = Record<string, unknown>;

export interface BuildShowMapTreeInput {
  show: Show;
  trials: ShowMapTrialInput[];
  classes: ShowMapClassInput[];
  entries: ShowMapEntryInput[];
  entryPreviewLimit?: number;
}
