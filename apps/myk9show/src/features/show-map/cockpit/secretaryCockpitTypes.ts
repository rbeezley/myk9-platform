import type { SecretaryCockpitClassEntry } from './cockpitClassEntries';
import type { StatusLine } from './scheduleStatusLine';

export type EvidenceKind = 'recorded' | 'computed' | 'staff-confirmed' | 'unknown';

export interface EvidenceValue<T> {
  evidence: EvidenceKind;
  value: T | null;
}

/** One status the schedule can be narrowed to; ticking several shows a class matching any (MYK9-1727). */
export type CockpitStatus = 'in-progress' | 'needs-attention' | 'needs-closeout';
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
  /** Page the destination opens, added to the pill's accessible name (MYK9-1618). */
  destinationName?: string;
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
  /** The current print record, so a row can offer to mark it not printed. */
  recordId?: string;
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
  /** Hand placement (MYK9-972): put one dog in a chosen slot of the run list. */
  onPlaceEntry: (input: ShowMapHandPlaceInput) => void;
  /** The last run-order change (preset or hand), while its Undo is on offer. */
  lastChange: { classId: string; summary: string } | null;
  onUndo: () => void;
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
  /** The class's trial registry (class nodes carry it), for registry-specific wording. */
  registryId?: string | null;
  /** Entries of this class carrying stranded operational actions (F29b). */
  entryRows: readonly SecretaryCockpitEntryRow[];
  /** Every entry in run order with its run status; absent in a snapshot built without the tree. */
  entries?: readonly SecretaryCockpitClassEntry[] | undefined;
  /** Entries the tree left out (its preview cap); the entries table says so rather than truncate. */
  entriesHidden?: number | undefined;
  trialId: string;
  name: string;
  /** Registry element/level/section (MYK9-825) — the label is composed from these, not `name` alone. */
  element?: string | null;
  level?: string | null;
  section?: string | null;
  classOrder: number;
  scheduledStart?: string | null;
  revisedExpectedStart?: string | null;
  lifecycle?: CockpitLifecycle | null;
  /** The class row's raw status, which Select classes' bulk Change status reads (MYK9-1324). */
  status?: string | null;
  actualStart?: string | null;
  actualFinish?: string | null;
  entryCount?: number | null;
  scoredCount?: number | null;
  runListCount?: number | null;
  closeout?: CockpitCloseoutState | null;
  /** The tree's wrap-up value; `closeout` folds signed and unsigned together, the checklist cannot. */
  wrapUpStatus?: string | null;
  judgeName?: string | null;
  /** The assigned judge's person id, for the class panel's judge picker (MYK9-1323). */
  judgeId?: string | null;
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
  /** The show's sanctioning registry (MYK9-825) — drives level-progression order on the schedule. */
  registryId: RegistryId;
  now: Date;
  /**
   * Any sheet on the show was printed from the app or recorded as printed (MYK9-1620), or the
   * print records could not be read. False hides "Not confirmed printed" and "Prepare" chips.
   */
  printTrackingInUse: boolean;
  /** `printTrackingInUse` or a judge sign-off is recorded. False collapses the checklist under a quiet disclosure. */
  checklistInUse: boolean;
  trials: readonly SecretaryCockpitTrial[];
  classes: readonly SecretaryCockpitClass[];
  administrativeAttention?: readonly SecretaryCockpitAttention[];
}

export interface SecretaryCockpitState {
  /** The ticked show days; empty or absent means every day (MYK9-1719). */
  selectedDays?: readonly string[] | undefined;
  focusedClassId?: string | undefined;
  /** The URL's anchor; when it names a trial, that trial opens whatever the day (MYK9-1320). */
  anchor?: string | undefined;
  /** The ticked statuses; empty means every class (MYK9-1727). */
  statuses?: readonly CockpitStatus[] | undefined;
}

export interface ScheduledClassModel {
  id: string;
  trialId: string;
  name: string;
  timeLabel: string;
  scheduledStart: string | null;
  expectedStart: string | null;
  /** The recorded start, once the class has started; null before, or when none was recorded. */
  startedLabel: string | null;
  lifecycle: EvidenceValue<CockpitLifecycle>;
  progress: EvidenceValue<{ completed: number; total: number }>;
  operationalArea: EvidenceValue<{ kind: OperationalAreaKind; label: string }>;
  judgeName: string | null;
  attentionCount: number;
  closeout: CockpitCloseoutState;
  primaryAction: SecretaryCockpitAction | null;
  /** Line 2 of the schedule row: one status-and-next-step phrase. */
  statusLine: StatusLine;
}

export interface TrialScheduleGroupModel {
  trialId: string;
  number: string;
  date: string;
  label: string;
  classes: readonly ScheduledClassModel[];
  nowMarkerIndex: number | null;
  /** Whether the group starts expanded. */
  defaultOpen: boolean;
  summary: {
    classCount: number;
    inProgressCount: number;
    attentionCount: number;
  };
}

export interface FocusedClassModel extends ScheduledClassModel {
  /** From the snapshot (MYK9-1620): false hides "Not confirmed printed" on paperwork rows. */
  printTrackingInUse: boolean;
  /** From the snapshot (MYK9-1620): false collapses the checklist under a quiet disclosure. */
  checklistInUse: boolean;
  entryRows: readonly SecretaryCockpitEntryRow[];
  /** Every entry in run order with its run status (the entries table). */
  entries: readonly SecretaryCockpitClassEntry[];
  entriesHidden: number;
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
    /**
     * The one ticked day; otherwise (several ticked, or every day) the default day whose trials
     * start open, or the earliest ticked day when the default is out of scope.
     */
    selected: string | null;
    /** The ticked days that exist on this show, sorted. Empty means every day. */
    days: readonly string[];
    /** No day is ticked, or the ticks cover every show day. */
    allDays: boolean;
    available: readonly string[];
    isToday: boolean;
  };
  attention: {
    items: readonly SecretaryCockpitAttention[];
    all: readonly SecretaryCockpitAttention[];
    overflowCount: number;
  };
  /** Every Class scheduled today, unfiltered by `state.statuses` (MYK9-812). */
  daySchedule: readonly ScheduledClassModel[];
  trialGroups: readonly TrialScheduleGroupModel[];
  focusedClass: FocusedClassModel | null;
}
import type { ReportScope } from '@/lib/reports/types';
import type { RegistryId } from '@/features/registries';
import type { ShowMapAutoSortKind } from '../showMapRunOrderAutoSort';
import type { ShowMapHandPlaceInput } from '../useShowMapRunOrderAutoSort';
