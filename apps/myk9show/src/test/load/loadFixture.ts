export const LOAD_SHOW_ID = 'dededede-0000-0000-0000-000000000010';
export const LOAD_GENERATED_ENTRY_COUNT = 504;
export const LOAD_SHOW_ENTRY_COUNT = 514;

export const LOAD_CLASS_IDS = [
  'dec1a55e-0000-0000-0000-000000000032',
  'dec1a55e-0000-0000-0000-000000000033',
  'dec1a55e-0000-0000-0000-000000000034',
  'dec1a55e-0000-0000-0000-000000000035',
  'dec1a55e-0000-0000-0000-000000000036',
  'dec1a55e-0000-0000-0000-000000000037',
  'dec1a55e-0000-0000-0000-000000000038',
  'dec1a55e-0000-0000-0000-000000000039',
] as const;

export interface LoadEntryFixture {
  entryId: string;
  classId: string;
  dogNumber: number;
  armband: number;
}

export function loadEntryFixture(entryNumber: number): LoadEntryFixture {
  if (
    !Number.isInteger(entryNumber) ||
    entryNumber < 1 ||
    entryNumber > LOAD_GENERATED_ENTRY_COUNT
  ) {
    throw new Error(
      `Load entry number must be between 1 and ${LOAD_GENERATED_ENTRY_COUNT}; received ${entryNumber}.`
    );
  }
  const dogNumber = Math.floor((entryNumber - 1) / 8) + 1;
  const classIndex = (entryNumber - 1) % 8;
  return {
    entryId: `a1090000-0000-0000-0002-${String(entryNumber).padStart(12, '0')}`,
    classId: LOAD_CLASS_IDS[classIndex],
    dogNumber,
    armband: 2000 + dogNumber,
  };
}
