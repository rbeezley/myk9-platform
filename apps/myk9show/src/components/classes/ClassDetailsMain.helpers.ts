import { ClassData, EntryData } from './types/classTypes';
import type { ScentWorkEntry, ScentWorkClassConfig } from '@/types/scent-work-types';
import { getDogBreedLabel, type Dog } from '@/types/dog-types';
import { msToDisplay } from '@/lib/timeUtils';
import { parseTimeLimitSeconds } from '@/services/mappers/classTimeLimits';

/**
 * Count the number of populated (non-empty, non-zero, non-false) fields.
 */
export function countPopulatedFields(fields: (string | number | boolean | undefined)[]): number {
  return fields.filter(
    field =>
      field !== undefined &&
      field !== null &&
      field !== '' &&
      (typeof field === 'boolean' ? field === true : field !== 0)
  ).length;
}

/**
 * Format time from milliseconds to MM:SS.HH format.
 * @deprecated Use `msToDisplay(ms, 'hundredths')` from `@/lib/timeUtils` directly.
 */
export function formatTime(ms: number): string {
  return msToDisplay(ms, 'hundredths');
}

/**
 * Determine whether section should be displayed for a class.
 *
 * AKC Scent Work rules:
 * - Detective element has no levels or sections.
 * - Only Novice level has sections (A or B).
 * - Advanced, Excellent, Master, and all other levels do not have sections.
 */
export function shouldShowSection(classLike: {
  element?: string | undefined;
  level?: string | undefined;
  section?: string | undefined;
}): boolean {
  if (!classLike.section) return false;
  if (classLike.element === 'Detective') return false;
  if (!classLike.level) return false;
  return classLike.level.startsWith('Novice');
}

/**
 * Detective element in AKC Scent Work has no levels — hide level display.
 */
export function shouldShowLevel(classLike: {
  element?: string | undefined;
  level?: string | undefined;
}): boolean {
  if (!classLike.level) return false;
  if (classLike.element === 'Detective') return false;
  return true;
}

/**
 * Build a formatted class title from element, level, and section.
 */
export function formatClassTitle(classData: ClassData): string {
  const parts = [classData.element];
  if (shouldShowLevel(classData)) parts.push(classData.level!);
  if (shouldShowSection(classData)) parts.push(classData.section!);
  return parts.join(' ');
}

/**
 * Build a ScentWorkClassConfig from ClassData. `timeLimit` is 0 when the class
 * has no saved max time: no limit, never an invented 3:00 (#2894, MYK9-1095).
 */
export function buildClassConfig(classData: ClassData): ScentWorkClassConfig {
  return {
    element: (classData.element as 'Interior' | 'Exterior' | 'Container' | 'Buried') || 'Interior',
    level: (classData.level as 'Novice' | 'Advanced' | 'Excellent' | 'Masters') || 'Novice',
    timeLimit: (parseTimeLimitSeconds(classData.timeLimit1 ?? '') ?? 0) * 1000,
    multiArea: false,
    warningsEnabled: true,
  };
}

/**
 * Transform classEntries to ScentWorkEntry format for BulkResultEntry.
 */
export function buildScentWorkEntries(
  classEntries: EntryData[],
  classData: ClassData,
  classConfig: ScentWorkClassConfig,
  dogs: Dog[]
): ScentWorkEntry[] {
  return classEntries.map(entry => {
    const dog = dogs.find(
      d =>
        d.name === entry.dog ||
        d.callName === entry.dog ||
        d.name.toLowerCase() === entry.dog.toLowerCase()
    );

    return {
      id: entry.id,
      showId: classData.id,
      classId: classData.id,
      dogId: dog?.id || entry.id,
      status: 'confirmed' as const,
      registrationData: {
        submittedAt: new Date(),
        handler: entry.handler || 'Unknown Handler',
        entryFee: classData.entryFee ? parseFloat(classData.entryFee.toString()) : 0,
        paymentStatus: 'paid' as const,
        armband: entry.armband || '',
      },
      competitionData:
        entry.time || entry.score || entry.status
          ? {
              time: entry.time || '',
              score: entry.score || '',
              qualified:
                entry.status === 'Qualified'
                  ? true
                  : entry.status === 'Not Qualified'
                    ? false
                    : undefined,
              qualification: entry.status || '',
              qualificationReason: entry.qualificationReason || '',
              placement: entry.placement || '',
              judgeNotes: '',
              recordedBy: 'Secretary',
              recordedAt: new Date().toISOString(),
            }
          : undefined,
      statusHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      classConfig: classConfig,
      registrations: dog?.registrations || [],
      displayInfo: {
        armband: entry.armband || '',
        dogName: entry.dog || 'Unknown Dog',
        dogBreed: dog ? getDogBreedLabel(dog) : 'Breed not set',
        handlerName: entry.handler || 'Unknown Handler',
        dogId: dog?.id || '',
        handlerId: '',
      },
      judgingState: {
        isInProgress: false,
        currentResult:
          entry.time || entry.score || entry.status
            ? {
                entryId: entry.id,
                classId: classData.id,
                searchTime: entry.score ? Math.round(parseFloat(entry.score) * 1000) : 0,
                maxTimeAllowed: classConfig.timeLimit,
                qualification:
                  entry.status as import('@/types/scent-work-types').QualificationStatus,
                qualificationReason: entry.qualificationReason,
                faults: 0,
                judgeNotes: '',
                recordedBy: 'System',
                recordedAt: new Date(),
              }
            : undefined,
      },
    };
  });
}
