/**
 * What a clone carried forward, cleared, and needs the secretary to confirm (MYK9-1047).
 * Every snapshot field is classified in the `Record<keyof ...>` tables below, so a new field fails
 * typecheck (and `cloneSummary.test.ts`) until it is classified; the banner copy is derived here.
 */
import type { CloneHydrationSnapshot, WizardState } from '@/store/wizardStore';
import { countLabel } from '@/utils/pluralize';

export interface CloneSummaryItem {
  text: string;
  /** DOM id of the existing field this item is about, on the same wizard step. */
  targetId?: string;
  /** Short button label for `targetId`, e.g. "Check judges". */
  fieldLabel?: string;
}

export interface CloneSummary {
  needsConfirm: CloneSummaryItem[];
  carried: CloneSummaryItem[];
  cleared: CloneSummaryItem[];
}

/** The slice of a snapshot the summary reads: what the clone did, captured once. */
export type CloneSummarySource = Pick<CloneHydrationSnapshot, 'sourceShowName' | 'show' | 'trials'>;

/**
 * The live draft. It may only REMOVE items the snapshot produced (a judge list emptied, a name
 * edited, a date filled in); it never adds one, so hand-entered data never reads as cloned.
 */
export interface CloneSummaryLiveDraft {
  show: Pick<
    WizardState['show'],
    'name' | 'judgeIds' | 'startDate' | 'endDate' | 'entryOpenDate' | 'entryCloseDate'
  >;
  trials: ReadonlyArray<{ trialDate: string; eventNumber: string }>;
}

type ShowKey = keyof WizardState['show'];
type TrialKey = keyof CloneHydrationSnapshot['trials'][number];

type FieldRule =
  /** Copied from the source and listed under `label` (fields sharing a label list once). */
  | { kind: 'carried'; label: string; whenDefined?: true }
  /** Not copied; the secretary fills it in or it takes the default. Listed under `label`. */
  | { kind: 'cleared'; label: string }
  /** Copied, but worth a second look; handled by a dedicated rule below. */
  | { kind: 'confirm' }
  /** Counted by the trial rules, or plumbing the secretary never sees. */
  | { kind: 'handled' };

const JUDGES_TARGET_ID = 'judges-picker-trigger';
const SHOW_NAME_TARGET_ID = 'show-name';

export const CLONE_SNAPSHOT_FIELD_KINDS: Record<keyof CloneHydrationSnapshot, 'plumbing' | 'data'> =
  {
    sourceShowId: 'plumbing',
    sourceShowName: 'plumbing',
    show: 'data',
    judgeDetails: 'data',
    trials: 'data',
  };

export const CLONE_SHOW_FIELD_RULES: Record<ShowKey, FieldRule> = {
  name: { kind: 'confirm' },
  organization: { kind: 'carried', label: 'Registry and host club' },
  clubId: { kind: 'carried', label: 'Registry and host club' },
  location: { kind: 'carried', label: 'Venue' },
  timezone: { kind: 'carried', label: 'Time zone' },
  preEntryFee: { kind: 'carried', label: 'Fees' },
  dayOfShowFee: { kind: 'carried', label: 'Fees' },
  juniorHandlerFee: { kind: 'carried', label: 'Fees' },
  startingArmbandNumber: { kind: 'carried', label: 'Starting armband number' },
  acceptCheckPayments: { kind: 'carried', label: 'Payment options' },
  acceptCashPayments: { kind: 'carried', label: 'Payment options' },
  onlineEntriesEnabled: { kind: 'carried', label: 'Online entries setting', whenDefined: true },
  judgeIds: { kind: 'confirm' },
  startDate: { kind: 'cleared', label: 'Show dates' },
  endDate: { kind: 'cleared', label: 'Show dates' },
  entryOpenDate: { kind: 'cleared', label: 'Entry period dates' },
  entryCloseDate: { kind: 'cleared', label: 'Entry period dates' },
  latitude: { kind: 'cleared', label: 'Venue map location' },
  longitude: { kind: 'cleared', label: 'Venue map location' },
  officials: { kind: 'cleared', label: 'Officials' },
  style: { kind: 'cleared', label: 'Premium style' },
};

export const CLONE_TRIAL_FIELD_RULES: Record<TrialKey, FieldRule> = {
  nameOverride: { kind: 'handled' },
  trialType: { kind: 'handled' },
  classes: { kind: 'handled' },
  trialDate: { kind: 'cleared', label: 'Trial dates' },
  startTimeDraft: { kind: 'cleared', label: 'Trial dates' },
  eventNumber: { kind: 'cleared', label: 'Event numbers' },
};

/** Whether a copied value is worth listing: blank, zero and false carry nothing to mention. */
function hasValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '' && value !== 0 && value !== false;
}

const item = (text: string): CloneSummaryItem => ({ text });

const YEAR = /\b(19|20)\d{2}\b/;

function confirmItems(source: CloneSummarySource, live: CloneSummaryLiveDraft): CloneSummaryItem[] {
  const items: CloneSummaryItem[] = [];
  const judgeCount = source.show.judgeIds?.length ?? 0;
  if (judgeCount > 0 && live.show.judgeIds.length > 0) {
    items.push({
      text: `Judges: ${judgeCount} carried forward. Confirm they are judging this year.`,
      targetId: JUDGES_TARGET_ID,
      fieldLabel: 'Check judges',
    });
  }
  const name = (source.show.name ?? '').trim();
  const needsCheck = name !== '' && (name === source.sourceShowName.trim() || YEAR.test(name));
  if (needsCheck && live.show.name.trim() === name) {
    items.push({
      text: `Show name copied as '${name}'. Check the year or date in it.`,
      targetId: SHOW_NAME_TARGET_ID,
      fieldLabel: 'Check show name',
    });
  }
  return items;
}

function carriedItems(source: CloneSummarySource): CloneSummaryItem[] {
  const labels = new Set<string>();
  const trialCount = source.trials.length;
  const classCount = source.trials.reduce((sum, trial) => sum + trial.classes.length, 0);
  if (trialCount > 0) labels.add(countLabel(trialCount, 'trial'));
  if (classCount > 0) labels.add(countLabel(classCount, 'class', 'classes'));

  for (const key of Object.keys(CLONE_SHOW_FIELD_RULES) as ShowKey[]) {
    const rule = CLONE_SHOW_FIELD_RULES[key];
    if (rule.kind !== 'carried') continue;
    const value = source.show[key];
    if (rule.whenDefined ? value !== undefined : hasValue(value)) labels.add(rule.label);
  }
  return [...labels].map(item);
}

/** Cleared labels that disappear once the secretary has filled every live field behind them. */
function filledLabels(live: CloneSummaryLiveDraft): Set<string> {
  const { show, trials } = live;
  const filled = new Set<string>();
  if (show.startDate && show.endDate) filled.add('Show dates');
  if (show.entryOpenDate && show.entryCloseDate) filled.add('Entry period dates');
  if (trials.every(trial => trial.trialDate)) filled.add('Trial dates');
  if (trials.every(trial => trial.eventNumber)) filled.add('Event numbers');
  return filled;
}

function clearedItems(source: CloneSummarySource, live: CloneSummaryLiveDraft): CloneSummaryItem[] {
  const labels = new Set<string>();
  for (const rule of Object.values(CLONE_SHOW_FIELD_RULES)) {
    if (rule.kind === 'cleared') labels.add(rule.label);
  }
  if (source.trials.length > 0) {
    for (const rule of Object.values(CLONE_TRIAL_FIELD_RULES)) {
      if (rule.kind === 'cleared') labels.add(rule.label);
    }
  }
  const filled = filledLabels(live);
  return [...labels].filter(label => !filled.has(label)).map(item);
}

export function summarizeClone(
  source: CloneSummarySource,
  live: CloneSummaryLiveDraft
): CloneSummary {
  return {
    needsConfirm: confirmItems(source, live),
    carried: carriedItems(source),
    cleared: clearedItems(source, live),
  };
}
