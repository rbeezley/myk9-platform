import type { ClassData } from '@/components/classes/types/classTypes';
import type { TrialClass } from '@/components/trials/types/trial.types';
import type { ClassEditFormData, TrialClassEditFormData } from './ClassEditPanel.types';

// Form validation for ClassData
export const validateClassData = (data: ClassEditFormData): string[] | null => {
  const errors: string[] = [];

  if (!data.element?.trim()) {
    errors.push('Element is required');
  }

  if (!data.level?.trim()) {
    errors.push('Level is required');
  }

  // Validate time limits if provided
  if (data.timeLimit1 && isNaN(parseInt(data.timeLimit1))) {
    errors.push('Time Limit 1 must be a valid number');
  }

  if (data.timeLimit2 && isNaN(parseInt(data.timeLimit2))) {
    errors.push('Time Limit 2 must be a valid number');
  }

  if (data.timeLimit3 && isNaN(parseInt(data.timeLimit3))) {
    errors.push('Time Limit 3 must be a valid number');
  }

  // Validate fees if provided
  if (data.preEntryFee && (isNaN(data.preEntryFee) || data.preEntryFee < 0)) {
    errors.push('Pre-entry fee must be a valid positive number');
  }

  if (data.dayOfShowFee && (isNaN(data.dayOfShowFee) || data.dayOfShowFee < 0)) {
    errors.push('Day of show fee must be a valid positive number');
  }

  return errors.length > 0 ? errors : null;
};

// Form validation for TrialClass
export const validateTrialClassData = (data: TrialClassEditFormData): string[] | null => {
  const errors: string[] = [];

  if (!data.judgeId?.trim()) {
    errors.push('Judge is required');
  }

  if (!data.startTime?.trim()) {
    errors.push('Start time is required');
  }

  if (!data.status?.trim()) {
    errors.push('Status is required');
  }

  return errors.length > 0 ? errors : null;
};

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
    judge: classItem.judge || '',
    gateSteward: classItem.gateSteward || '',
    tableSteward: classItem.tableSteward || '',
    timerSteward: classItem.timerSteward || '',
    ringSteward1: classItem.ringSteward1 || '',
    ringSteward2: classItem.ringSteward2 || '',
    ringSteward3: classItem.ringSteward3 || '',
    hidesUsed: classItem.hidesUsed || '',
    distractionsUsed: classItem.distractionsUsed || '',
    itemsUsed: classItem.itemsUsed || '',
    preEntryFee: classItem.preEntryFee || 0,
    dayOfShowFee: classItem.dayOfShowFee || 0,
  };
};

// Convert TrialClass to form data
export const trialClassToFormData = (trialClass: Partial<TrialClass>): TrialClassEditFormData => {
  return {
    element: trialClass.element || '',
    level: trialClass.level || '',
    section: trialClass.section || '',
    judgeId: trialClass.judgeId || '',
    judgeName: trialClass.judgeName || '',
    startTime: trialClass.startTime || '',
    status: trialClass.status || 'Upcoming',
    entries: trialClass.entries || 0,
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
  ...(formData.gateSteward !== undefined && { gateSteward: formData.gateSteward }),
  ...(formData.tableSteward !== undefined && { tableSteward: formData.tableSteward }),
  ...(formData.timerSteward !== undefined && { timerSteward: formData.timerSteward }),
  ...(formData.ringSteward1 !== undefined && { ringSteward1: formData.ringSteward1 }),
  ...(formData.ringSteward2 !== undefined && { ringSteward2: formData.ringSteward2 }),
  ...(formData.ringSteward3 !== undefined && { ringSteward3: formData.ringSteward3 }),
  ...(formData.hidesUsed !== undefined && { hidesUsed: formData.hidesUsed }),
  ...(formData.distractionsUsed !== undefined && { distractionsUsed: formData.distractionsUsed }),
  ...(formData.itemsUsed !== undefined && { itemsUsed: formData.itemsUsed }),
  ...(formData.preEntryFee !== undefined && { preEntryFee: formData.preEntryFee }),
  ...(formData.dayOfShowFee !== undefined && { dayOfShowFee: formData.dayOfShowFee }),
});

// Convert form data back to TrialClass
// Use conditional spread to satisfy exactOptionalPropertyTypes
export const formDataToTrialClass = (formData: TrialClassEditFormData): Partial<TrialClass> => ({
  element: formData.element,
  level: formData.level,
  section: formData.section,
  judgeId: formData.judgeId,
  ...(formData.judgeName !== undefined && { judgeName: formData.judgeName }),
  startTime: formData.startTime,
  status: formData.status,
  entries: formData.entries,
});
