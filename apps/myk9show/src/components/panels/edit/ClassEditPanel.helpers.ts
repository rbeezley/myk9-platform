import type { ClassData } from '@/components/classes/types/classTypes';
import type { TrialClass } from '@/components/trials/types/trial.types';
import type { ClassEditFormData, TrialClassEditFormData } from './ClassEditPanel.types';

// Convert ClassData to form data
export const classToFormData = (classItem: Partial<ClassData>): ClassEditFormData => {
  return {
    element: classItem.element || '',
    level: classItem.level || '',
    section: classItem.section || '',
    classOrder: classItem.classOrder || '',
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
    allowsWaitlist: classItem.allowsWaitlist ?? false,
    preEntryFee: classItem.preEntryFee || 0,
    dayOfShowFee: classItem.dayOfShowFee || 0,
  };
};

// Convert form data back to ClassData
// Use conditional spread to satisfy exactOptionalPropertyTypes
export const formDataToClass = (formData: ClassEditFormData): Partial<ClassData> => ({
  element: formData.element,
  level: formData.level,
  section: formData.section,
  classOrder: formData.classOrder,
  status: formData.status,
  ...(formData.estimatedJudgingTime !== undefined && {
    estimatedJudgingTime: formData.estimatedJudgingTime,
  }),
  ...(formData.timeLimit1 !== undefined && { timeLimit1: formData.timeLimit1 }),
  ...(formData.timeLimit2 !== undefined && { timeLimit2: formData.timeLimit2 }),
  ...(formData.timeLimit3 !== undefined && { timeLimit3: formData.timeLimit3 }),
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
  ...(formData.maxEntries !== undefined && { maxEntries: formData.maxEntries }),
  ...(formData.allowsWaitlist !== undefined && { allowsWaitlist: formData.allowsWaitlist }),
  ...(formData.preEntryFee !== undefined && { preEntryFee: formData.preEntryFee }),
  ...(formData.dayOfShowFee !== undefined && { dayOfShowFee: formData.dayOfShowFee }),
});

type CapacitySource = {
  maxEntries?: number | null | undefined;
  allowsWaitlist?: boolean | undefined;
};

/**
 * Whether the class handed to the editor carried its entry limit and wait list switch.
 * A source that dropped them (any producer that maps a class by hand) must not make the editor
 * show "no limit, wait list off" as fact, because saving would then write exactly that.
 */
export const hasLoadedCapacity = (initial: CapacitySource | undefined): boolean =>
  initial?.allowsWaitlist !== undefined;

/**
 * The entry limit and wait list switch go to the save only when they were loaded AND the user
 * changed them, so an unrelated edit can never overwrite them, and a future producer that drops
 * a field cannot silently null it out (MYK9-998, Codex review of #2735).
 */
export function onlyChangedCapacity<T extends CapacitySource>(
  saved: T,
  initial: CapacitySource | undefined
): T {
  const { maxEntries, allowsWaitlist, ...rest } = saved;
  if (!hasLoadedCapacity(initial)) return rest as T;
  const loadedLimit = initial?.maxEntries ?? null;
  const out: CapacitySource = {};
  if (maxEntries !== undefined && maxEntries !== loadedLimit) out.maxEntries = maxEntries;
  if (allowsWaitlist !== undefined && allowsWaitlist !== initial?.allowsWaitlist) {
    out.allowsWaitlist = allowsWaitlist;
  }
  return { ...rest, ...out } as T;
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
    allowsWaitlist: (trialClass as Partial<ClassData>).allowsWaitlist ?? false,
  };
};

// Convert form data back to TrialClass
// Use conditional spread to satisfy exactOptionalPropertyTypes
export const formDataToTrialClass = (formData: TrialClassEditFormData): Partial<TrialClass> => ({
  element: formData.element,
  level: formData.level,
  section: formData.section,
  judgeId: formData.judgeId,
  ...(formData.judgeName !== undefined && { judgeName: formData.judgeName }),
  status: formData.status,
  entries: formData.entries,
  ...(formData.maxEntries !== undefined && { maxEntries: formData.maxEntries }),
  ...(formData.allowsWaitlist !== undefined && { allowsWaitlist: formData.allowsWaitlist }),
});
