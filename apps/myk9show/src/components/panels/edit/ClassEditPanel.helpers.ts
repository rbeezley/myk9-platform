import type { ClassData } from '@/components/classes/types/classTypes';
import type { TrialClass } from '@/components/trials/types/trial.types';
import type { TimeLimitField } from './ClassTimeLimitFields';
import type {
  CapacityControl,
  ClassEditFormData,
  TrialClassEditFormData,
} from './ClassEditPanel.types';

// Convert ClassData to form data
export const classToFormData = (classItem: Partial<ClassData>): ClassEditFormData => {
  return {
    element: classItem.element || '',
    level: classItem.level || '',
    section: classItem.section || '',
    status:
      (classItem.status as 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled' | 'Scheduled') ||
      'Scheduled',
    estimatedJudgingTime: classItem.estimatedJudgingTime || '',
    timeLimit1: classItem.timeLimit1 || '',
    timeLimit2: classItem.timeLimit2 || '',
    timeLimit3: classItem.timeLimit3 || '',
    judge:
      classItem.judge ||
      ((classItem as unknown as Record<string, unknown>).judgeName as string) ||
      '',
    judgeId: classItem.judgeId || '',
    gateSteward: classItem.gateSteward || '',
    tableSteward: classItem.tableSteward || '',
    timerSteward: classItem.timerSteward || '',
    ringSteward1: classItem.ringSteward1 || '',
    ringSteward2: classItem.ringSteward2 || '',
    ringSteward3: classItem.ringSteward3 || '',
    hidesUsed: classItem.hidesUsed || '',
    distractionsUsed: classItem.distractionsUsed || '',
    itemsUsed: classItem.itemsUsed || '',
    maxEntries: classItem.maxEntries ?? null,
    allowsWaitlist: classItem.allowsWaitlist ?? null,
    editedCapacity: [],
    editedTimeLimits: [] as TimeLimitField[],
    ...entryFeeFormFields(classItem),
  };
};

// Convert form data back to ClassData
// Use conditional spread to satisfy exactOptionalPropertyTypes
export const formDataToClass = (formData: ClassEditFormData): Partial<ClassData> => ({
  element: formData.element,
  level: formData.level,
  section: formData.section,
  status: formData.status,
  ...(formData.estimatedJudgingTime !== undefined && {
    estimatedJudgingTime: formData.estimatedJudgingTime,
  }),
  ...timeLimitPatch(formData),
  ...(formData.judge !== undefined && { judge: formData.judge }),
  ...(formData.judgeId !== undefined && { judgeId: formData.judgeId }),
  ...(formData.gateSteward !== undefined && { gateSteward: formData.gateSteward }),
  ...(formData.tableSteward !== undefined && { tableSteward: formData.tableSteward }),
  ...(formData.timerSteward !== undefined && { timerSteward: formData.timerSteward }),
  ...(formData.ringSteward1 !== undefined && { ringSteward1: formData.ringSteward1 }),
  ...(formData.ringSteward2 !== undefined && { ringSteward2: formData.ringSteward2 }),
  ...(formData.ringSteward3 !== undefined && { ringSteward3: formData.ringSteward3 }),
  ...(formData.hidesUsed !== undefined && { hidesUsed: formData.hidesUsed }),
  ...(formData.distractionsUsed !== undefined && { distractionsUsed: formData.distractionsUsed }),
  ...(formData.itemsUsed !== undefined && { itemsUsed: formData.itemsUsed }),
  ...editedCapacityPatch(formData),
  ...entryFeePatch(formData),
});

type EntryFeeSource = { entryFee?: number | undefined };

/**
 * The fee field's starting state (MYK9-1931). A source that did not carry `entryFee` (a class
 * mapped by hand) shows no field, so the editor never presents "no fee of its own" as fact.
 * 0 is "no fee of its own".
 */
function entryFeeFormFields(source: EntryFeeSource) {
  const loaded = source.entryFee !== undefined;
  return {
    entryFeeLoaded: loaded,
    entryFeeEdited: false,
    ...(source.entryFee !== undefined && { entryFee: source.entryFee }),
  };
}

/** The fee, only when it was changed in this session. 0 (an emptied field) clears it. */
export function entryFeePatch(formData: {
  entryFee?: number | undefined;
  entryFeeEdited?: boolean | undefined;
}): { entryFee?: number } {
  return formData.entryFeeEdited ? { entryFee: formData.entryFee ?? 0 } : {};
}

type CapacitySource = {
  maxEntries?: number | null | undefined;
  /** null: the class follows the show's "Allow wait lists" (MYK9-1019). */
  allowsWaitlist?: boolean | null | undefined;
};

/**
 * Whether the class handed to the editor carried its entry limit and wait list switch.
 * A source that dropped them (any producer that maps a class by hand) must not make the editor
 * show "no limit, wait list off" as fact, because saving would then write exactly that.
 */
export const hasLoadedCapacity = (initial: CapacitySource | undefined): boolean =>
  initial?.allowsWaitlist !== undefined;

/**
 * The capacity controls the user edited in this editor session, and nothing else. A value is
 * never compared with the class props: those can refresh under an open editor (another
 * secretary's change), and a comparison against the refreshed props would send the stale form
 * value over it. An untouched control is simply absent from the patch (MYK9-998).
 */
export function editedCapacityPatch(formData: {
  maxEntries?: number | null | undefined;
  allowsWaitlist?: boolean | null | undefined;
  editedCapacity?: CapacityControl[] | undefined;
}): CapacitySource {
  const edited = formData.editedCapacity ?? [];
  const out: CapacitySource = {};
  if (edited.includes('maxEntries') && formData.maxEntries !== undefined) {
    out.maxEntries = formData.maxEntries;
  }
  if (edited.includes('allowsWaitlist') && formData.allowsWaitlist !== undefined) {
    out.allowsWaitlist = formData.allowsWaitlist;
  }
  return out;
}

/**
 * Section (A/B) only applies to AKC Scent Work Novice — Advanced, Excellent,
 * and Master do not have sections. Detective has no sections regardless of level.
 */
export function isScentWorkNovice(level: string, element: string): boolean {
  if (element === 'Detective') return false;
  return level.startsWith('Novice');
}

// Convert TrialClass to form data
export const trialClassToFormData = (trialClass: Partial<TrialClass>): TrialClassEditFormData => {
  return {
    element: trialClass.element || '',
    level: trialClass.level || '',
    section: trialClass.section || '',
    judgeId: trialClass.judgeId || '',
    judgeName: trialClass.judgeName || '',
    status: trialClass.status || 'Upcoming',
    entries: trialClass.entries || 0,
    maxEntries: (trialClass as Partial<ClassData>).maxEntries ?? null,
    allowsWaitlist: (trialClass as Partial<ClassData>).allowsWaitlist ?? null,
    editedCapacity: [],
    ...entryFeeFormFields(trialClass),
    ...timeLimitFormFields(trialClass as Partial<ClassData>),
  };
};

// Convert form data back to TrialClass
// Use conditional spread to satisfy exactOptionalPropertyTypes
export const formDataToTrialClass = (
  formData: TrialClassEditFormData
): Partial<TrialClass> & TimeLimitPatch => ({
  element: formData.element,
  level: formData.level,
  section: formData.section,
  judgeId: formData.judgeId,
  ...(formData.judgeName !== undefined && { judgeName: formData.judgeName }),
  status: formData.status,
  entries: formData.entries,
  ...editedCapacityPatch(formData),
  ...entryFeePatch(formData),
  ...timeLimitPatch(formData),
});

/**
 * The patch without what the live settings own (MYK9-2379): status and judge were saved when
 * changed, and the form's copy is as old as the panel, so writing it back would undo them. A judge
 * picked in the form itself (the Officials tab, which is how a started class's judge changes)
 * is still unsaved, so `keepJudge` leaves it in.
 */
export function withoutLiveSettings<T extends object>(
  data: T,
  { keepJudge }: { keepJudge: boolean }
): Partial<T> {
  const patch: Partial<T> = { ...data };
  const owned = keepJudge ? ['status'] : ['status', 'judge', 'judgeId', 'judgeName'];
  for (const key of owned) delete patch[key as keyof T];
  return patch;
}

type TimeLimitPatch = { timeLimit1?: string; timeLimit2?: string; timeLimit3?: string };

/**
 * The time-limit fields' starting state. A source that did not carry `timeLimit1` shows no field
 * (a blank would read as "no limit" and saving it would clear the real one).
 */
function timeLimitFormFields(source: Partial<ClassData>) {
  return {
    timeLimitLoaded: source.timeLimit1 !== undefined,
    editedTimeLimits: [] as TimeLimitField[],
    timeLimit1: source.timeLimit1 ?? '',
    timeLimit2: source.timeLimit2 ?? '',
    timeLimit3: source.timeLimit3 ?? '',
  };
}

/** Only the limits whose inputs were shown and changed in this session; never one the user did not see. */
export function timeLimitPatch(formData: {
  editedTimeLimits?: TimeLimitField[] | undefined;
  timeLimit1?: string | undefined;
  timeLimit2?: string | undefined;
  timeLimit3?: string | undefined;
}): TimeLimitPatch {
  const patch: TimeLimitPatch = {};
  for (const field of formData.editedTimeLimits ?? []) {
    const value = formData[field];
    if (value !== undefined) patch[field] = value;
  }
  return patch;
}
