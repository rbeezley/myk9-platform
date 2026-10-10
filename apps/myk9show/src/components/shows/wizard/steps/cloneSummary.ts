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
}

export interface CloneSummary {
  needsConfirm: CloneSummaryItem[];
  carried: CloneSummaryItem[];
  cleared: CloneSummaryItem[];
}

/** The slice of a snapshot (or of the live draft after one) the summary reads. */
export type CloneSummarySource = Pick<
  CloneHydrationSnapshot,
  'sourceShowName' | 'show' | 'judgeDetails' | 'trials'
>;

type ShowKey = keyof WizardState['show'];
type TrialKey = keyof CloneHydrationSnapshot['trials'][number];

type FieldRule =
  /** Copied from the source and listed under `label` (fields sharing a label list once). */
  | { kind: 'carried'; label: string }
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
  onlineEntriesEnabled: { kind: 'carried', label: 'Payment options' },
  judgeIds: { kind: 'confirm' },
  startDate: { kind: 'cleared', label: 'Show dates' },
  endDate: { kind: 'cleared', label: 'Show dates' },
  entryOpenDate: { kind: 'cleared', label: 'Entry period dates' },
  entryCloseDate: { kind: 'cleared', label: 'Entry period dates' },
  latitude: { kind: 'cleared', label: 'Venue map pin' },
  longitude: { kind: 'cleared', label: 'Venue map pin' },
  officials: { kind: 'cleared', label: 'Officials (you are set as secretary)' },
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

function confirmItems(source: CloneSummarySource): CloneSummaryItem[] {
  const items: CloneSummaryItem[] = [];
  const judgeCount = source.show.judgeIds?.length ?? 0;
  if (judgeCount > 0) {
    items.push({
      text: `Judges: ${judgeCount} carried forward. Confirm they are judging this year.`,
      targetId: JUDGES_TARGET_ID,
    });
  }
  const name = (source.show.name ?? '').trim();
  const sameAsSource = name !== '' && name === source.sourceShowName.trim();
  if (name !== '' && (sameAsSource || /\b\d{4}\b/.test(name))) {
    items.push({
      text: `Show name copied as '${name}'. Check it for last year's date.`,
      targetId: SHOW_NAME_TARGET_ID,
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
    if (rule.kind === 'carried' && hasValue(source.show[key])) labels.add(rule.label);
  }
  return [...labels].map(label => item(label));
}

function clearedItems(source: CloneSummarySource): CloneSummaryItem[] {
  const labels = new Set<string>();
  for (const rule of Object.values(CLONE_SHOW_FIELD_RULES)) {
    if (rule.kind === 'cleared') labels.add(rule.label);
  }
  if (source.trials.length > 0) {
    for (const rule of Object.values(CLONE_TRIAL_FIELD_RULES)) {
      if (rule.kind === 'cleared') labels.add(rule.label);
    }
  }
  return [...labels].map(label => item(label));
}

export function summarizeClone(source: CloneSummarySource): CloneSummary {
  return {
    needsConfirm: confirmItems(source),
    carried: carriedItems(source),
    cleared: clearedItems(source),
  };
}
