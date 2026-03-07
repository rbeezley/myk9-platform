import { ClassData } from './types/classTypes';
import { TrialClass } from '@/components/trials/types/trial.types';
import { logger } from '@/services/LoggingService';

/**
 * Process a class item for form editing, normalizing startTime format.
 */
export function processClassItem(
  item: ClassData | TrialClass | null
): ClassData | TrialClass | null {
  if (!item) return null;
  const processedItem = { ...item };
  if ('startTime' in item && item.startTime && !item.startTime.includes('T')) {
    try {
      const date = new Date(item.startTime);
      if (!isNaN(date.getTime())) {
        processedItem.startTime = date.toISOString().slice(0, 16);
      }
    } catch (e) {
      logger.warn('Failed to convert startTime:', 'classes', {}, e as Error);
    }
  }
  return processedItem;
}

/**
 * Count the number of populated (non-empty, non-zero, non-false) fields.
 */
export function countPopulatedFields(fields: (string | number | boolean | undefined)[]): number {
  return fields.filter(
    field =>
      field !== undefined &&
      field !== null &&
      field !== '' &&
      // For booleans, only count 'true' values since we only show them when true
      (typeof field === 'boolean' ? field === true : field !== 0)
  ).length;
}

/**
 * Count timing-related populated fields for a ClassData instance.
 */
export function countTimingFields(classData: ClassData): number {
  return countPopulatedFields([
    classData.estimatedJudgingTime,
    classData.timeLimit1,
    classData.timeLimit2,
    classData.timeLimit3,
  ]);
}

/**
 * Count officials-related populated fields for a ClassData instance.
 */
export function countOfficialsFields(classData: ClassData): number {
  return countPopulatedFields([
    classData.judge,
    classData.gateSteward,
    classData.tableSteward,
    classData.timerSteward,
    classData.ringSteward1,
    classData.ringSteward2,
    classData.ringSteward3,
  ]);
}

/**
 * Count requirements-related populated fields for a ClassData instance.
 */
export function countRequirementsFields(classData: ClassData): number {
  return countPopulatedFields([
    classData.hidesUsed,
    classData.distractionsUsed,
    classData.itemsUsed,
  ]);
}

/**
 * Count fee-related populated fields for a ClassData instance.
 */
export function countFeesFields(classData: ClassData): number {
  return countPopulatedFields([classData.preEntryFee, classData.dayOfShowFee]);
}
