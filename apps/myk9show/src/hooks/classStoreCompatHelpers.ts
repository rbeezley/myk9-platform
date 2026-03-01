// Pure helper functions for useClassStoreCompat

import type { ClassInput, EntryInput, SyncableClassData } from '@/store/classStore';
import type { GeneratedClass } from '@/types/class-template-types';

/**
 * Validates required fields for creating a class.
 * Throws descriptive errors for missing fields.
 */
export function validateClassInput(classData: ClassInput): void {
  if (!classData.trialId) throw new Error('Trial ID is required');
  if (!classData.status) throw new Error('Class status is required');
  if (!classData.judge) throw new Error('Judge is required');
}

/**
 * Validates required fields for updating a class.
 * Throws descriptive errors for missing fields.
 */
export function validateClassUpdate(id: string, updates: Partial<ClassInput>): void {
  if (!id) throw new Error('Class ID is required for updates');
  if (Object.keys(updates).length === 0) {
    throw new Error('At least one field must be provided for update');
  }
}

/**
 * Validates required fields for creating an entry.
 * Throws descriptive errors for missing fields.
 */
export function validateEntryInput(entryData: EntryInput): void {
  if (!entryData.classId) throw new Error('Class ID is required');
  if (!entryData.armband) throw new Error('Armband is required');
  if (!entryData.handler) throw new Error('Handler name is required');
  if (!entryData.dog) throw new Error('Dog name is required');
}

/**
 * Builds a ClassInput from a template-generated class definition.
 */
export function buildClassFromTemplate(
  genClass: GeneratedClass,
  trialId: string,
  index: number,
  trialDate: string,
  trialNumber: string
): ClassInput {
  return {
    trialId,
    trial: `Trial ${trialId}`,
    trialDate,
    trialNumber,
    classOrder: (index + 1).toString(),
    status: 'Scheduled' as const,
    judge: 'TBD',
    className: genClass.className,
    classNumber: genClass.classNumber,
    element: genClass.element,
    level: genClass.level,
    section: genClass.section,
    maxEntries: genClass.maxEntries || 40,
    requiresJumpHeight: genClass.requiresJumpHeight || false,
    customFields: genClass.customFields,
    hidesUsed: '',
    distractionsUsed: '',
    itemsUsed: '',
    timeLimit1: '3:00',
    timeLimit2: '',
    timeLimit3: '',
    photoUrl: '',
    templateId: undefined,
  };
}

/**
 * Creates multiple classes from a template using the provided addClass function.
 */
export async function addClassesFromTemplateHelper(
  trialId: string,
  generatedClasses: GeneratedClass[],
  addClass: (classData: ClassInput) => Promise<SyncableClassData>
): Promise<SyncableClassData[]> {
  const currentDate = new Date().toISOString().split('T')[0];
  const trialNumber = `TRL-${Date.now()}`;
  const newClasses: SyncableClassData[] = [];

  for (let index = 0; index < generatedClasses.length; index++) {
    const classInput = buildClassFromTemplate(
      generatedClasses[index],
      trialId,
      index,
      currentDate,
      trialNumber
    );
    const createdClass = await addClass(classInput);
    newClasses.push(createdClass);
  }

  return newClasses;
}
