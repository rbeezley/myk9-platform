export type EvidenceKind = 'recorded' | 'computed' | 'staff-confirmed' | 'unknown';

export interface EvidenceValue<T> {
  evidence: EvidenceKind;
  value: T | null;
}

export type CockpitFilter = 'all' | 'in-progress' | 'needs-attention' | 'needs-closeout';
export type CockpitLifecycle = 'not-started' | 'in-progress' | 'complete' | 'cancelled';
export type CockpitCloseoutState = 'none' | 'needs-closeout' | 'closed';
export type CockpitAttentionKind =
  'blocker' | 'active-work' | 'preparation' | 'closeout' | 'administrative';
export type OperationalAreaKind = 'search-area' | 'ring' | 'course';
export type PaperworkState = 'current' | 'stale' | 'unconfirmed' | 'unknown';

export type CockpitDestination =
  { kind: 'href'; href: string } | { kind: 'command'; commandId: string };

export interface SecretaryCockpitAttention {
  id: string;
  dedupeKey?: string;
  classId?: string;
  kind: CockpitAttentionKind;
  label: string;
  reason: string;
  destination: CockpitDestination | null;
}

export interface SecretaryCockpitAction {
  id: string;
  label: string;
  destination: CockpitDestination;
  group: 'primary' | 'prepare' | 'finish' | 'class-work' | 'paperwork';
  priority?: number;
}

export interface SecretaryCockpitPaperwork {
  reportId: string;
  label: string;
  state: PaperworkState;
  printHref?: string;
  printedAt?: string;
  printedBy?: string;
  coveredByScope?: 'show' | 'trial' | 'class';
  confirmation?: {
    scope: ReportScope;
    coverage: Record<string, unknown>;
    fingerprint: string;
  };
  history?: readonly {
    id: string;
    printedAt: string;
    printedBy: string;
    voidedAt?: string | undefined;
  }[];
}

export interface SecretaryCockpitTrial {
  id: string;
  date: string;
  number: string;
  name?: string;
  order: number;
}

/**
 * One entry inside a focused class, with the operational actions that have no other
 * home in the app.
 *
 * F29b: `ShowMapRowActionsMenu` is the only renderer of the entry action set, and it
 * mounts only inside `ShowMapTab` -- the public show page, read-only by intent (#291).
 * The cockpit's own action surface filters to `recommended` actions, and no entry
 * action sets that flag, so `ShowDeskPanel`'s move-up dialog could never open. These
 * rows are what emit the commandId `runCommand` already knows how to resolve.
 *
 * Deliberately narrow: check-in, edit-score, scratch and message-handler already have
 * working homes (the run sheet, Entry Management -> Exceptions, the Messages panel),
 * and re-homing them here would duplicate live surfaces. See
 * docs/plan-f29b-operational-actions-home.md.
 */
/**
 * Run-order auto-sort controls, threaded from `useShowMapWorkbenchState`'s
 * `runOrderAutoSort` (F29b phase 2a). Structural rather than an import of the hook's
 * return type so the cockpit layer does not depend on the workbench hook.
 */
export interface SecretaryCockpitRunOrderControls {
  onAutoSort: (input: { classId: string; kind: ShowMapAutoSortKind; classLabel: string }) => void;
  isAutoSorting: boolean;
}

export interface SecretaryCockpitEntryAction {
  id: string;
  /** `${action.id}:${action.nodeId}` -- the shape ShowDeskPanel's runCommand resolves. */
  commandId: string;
  label: string;
  why: string;
}

export interface SecretaryCockpitEntryRow {
  nodeId: string;
  label: string;
  subtitle?: string | undefined;
  actions: readonly SecretaryCockpitEntryAction[];
}

export interface SecretaryCockpitClass {
  id: string;
  /** Entries of this class carrying stranded operational actions (F29b). */
  entryRows: readonly SecretaryCockpitEntryRow[];
  trialId: string;
  name: string;
  classOrder: number;
  scheduledStart?: string | null;
  revisedExpectedStart?: string | null;
  lifecycle?: CockpitLifecycle | null;
  actualStart?: string | null;
  actualFinish?: string | null;
  entryCount?: number | null;
  scoredCount?: number | null;
  closeout?: CockpitCloseoutState | null;
  judgeName?: string | null;
  operationalArea?: {
    kind: OperationalAreaKind;
    labels: readonly string[];
  } | null;
  attention: readonly SecretaryCockpitAttention[];
  actions: readonly SecretaryCockpitAction[];
  paperwork: readonly SecretaryCockpitPaperwork[];
}

export interface SecretaryCockpitSnapshot {
  showId: string;
  timeZone: string;
  now: Date;
  trials: readonly SecretaryCockpitTrial[];
  classes: readonly SecretaryCockpitClass[];
  administrativeAttention?: readonly SecretaryCockpitAttention[];
}

export interface SecretaryCockpitState {
  selectedDay?: string | undefined;
  focusedClassId?: string | undefined;
  filter: CockpitFilter;
}

export interface ScheduledClassModel {
  id: string;
  trialId: string;
  name: string;
  timeLabel: string;
  scheduledStart: string | null;
  expectedStart: string | null;
  lifecycle: EvidenceValue<CockpitLifecycle>;
  progress: EvidenceValue<{ completed: number; total: number }>;
  operationalArea: EvidenceValue<{ kind: OperationalAreaKind; label: string }>;
  judgeName: string | null;
  attentionCount: number;
  closeout: CockpitCloseoutState;
  primaryAction: SecretaryCockpitAction | null;
}

export interface TrialScheduleGroupModel {
  trialId: string;
  number: string;
  date: string;
  label: string;
  classes: readonly ScheduledClassModel[];
  nowMarkerIndex: number | null;
  summary: {
    classCount: number;
    inProgressCount: number;
    attentionCount: number;
    containsFocusedClass: boolean;
  };
}

export interface FocusedClassModel extends ScheduledClassModel {
  entryRows: readonly SecretaryCockpitEntryRow[];
  actualStart: EvidenceValue<string>;
  actualFinish: EvidenceValue<string>;
  paperwork: readonly (SecretaryCockpitPaperwork & { evidence: EvidenceKind })[];
  primaryActions: readonly SecretaryCockpitAction[];
  prepareActions: readonly SecretaryCockpitAction[];
  finishActions: readonly SecretaryCockpitAction[];
  classWorkActions: readonly SecretaryCockpitAction[];
}

export interface SecretaryCockpitModel {
  day: {
    selected: string | null;
    available: readonly string[];
    isToday: boolean;
  };
  attention: {
    items: readonly SecretaryCockpitAttention[];
    all: readonly SecretaryCockpitAttention[];
    overflowCount: number;
  };
  trialGroups: readonly TrialScheduleGroupModel[];
  focusedClass: FocusedClassModel | null;
}
import type { ReportScope } from '@/lib/reports/types';
import type { ShowMapAutoSortKind } from '../showMapRunOrderAutoSort';
