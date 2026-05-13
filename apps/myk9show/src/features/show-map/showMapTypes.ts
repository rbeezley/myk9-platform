import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';

export type ShowMapNodeType = 'show' | 'trial' | 'class' | 'entry' | 'more';

export type ShowMapStatusKind = 'neutral' | 'active' | 'complete' | 'muted' | 'attention';

export type ShowMapFilter = 'all' | 'in-progress' | 'needs-attention' | 'complete';

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

export interface ShowMapNode {
  id: string;
  type: ShowMapNodeType;
  label: string;
  subtitle?: string | undefined;
  count?: number | undefined;
  status?: ShowMapDisplayStatus | undefined;
  checkInStatus?: ShowMapDisplayStatus | undefined;
  progress?: ShowMapProgress | undefined;
  attentionCount?: number | undefined;
  href?: string | undefined;
  parentId?: string | undefined;
  childrenCount: number;
  isSynthetic?: boolean | undefined;
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
  status?: string | undefined;
  entryCount?: number | undefined;
  scoredCount?: number | undefined;
  trialDate?: string | undefined;
  trialNumber?: string | undefined;
  trialName?: string | undefined;
}

export type ShowMapEntryInput = Record<string, unknown>;

export interface BuildShowMapTreeInput {
  show: Show;
  trials: SyncableTrial[];
  classes: ShowMapClassInput[];
  entries: ShowMapEntryInput[];
  entryPreviewLimit?: number;
}
