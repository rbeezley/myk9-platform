import { judgeFor } from '../_shared/exhibitorEmailFacts.ts';

export const REGISTRATION_ENTRIES_SELECT =
  'class_id, armband, dog:dogs(call_name), class:classes(name)' as const;

interface RegistrationEntryRow {
  class_id?: string | null;
  armband: string | null;
  dog: { call_name: string | null } | null;
  class: { name: string | null } | null;
}

/** The receipt's rows. Each names the class's judge (MYK9-1999), or "Judge to be announced". */
export function mapRegistrationEntries(
  entries: RegistrationEntryRow[],
  judgesByClass: Map<string, string> = new Map()
) {
  return entries.map(entry => ({
    dogName: entry.dog?.call_name || 'Unknown',
    className: entry.class?.name || 'Unknown',
    judgeName: judgeFor(judgesByClass, entry.class_id),
    armband: entry.armband ?? undefined,
  }));
}
