export const REGISTRATION_ENTRIES_SELECT =
  'armband, class_id, dog:dogs(call_name), class:classes(name)' as const;

interface RegistrationEntryRow {
  armband: string | null;
  class_id?: string | null;
  dog: { call_name: string | null } | null;
  class: { name: string | null } | null;
}

/** The email rows; each class names its confirmed judge when `judgeByClass` has one (MYK9-1999). */
export function mapRegistrationEntries(
  entries: RegistrationEntryRow[],
  judgeByClass: ReadonlyMap<string, string> = new Map()
) {
  return entries.map(entry => ({
    dogName: entry.dog?.call_name || 'Unknown',
    className: entry.class?.name || 'Unknown',
    armband: entry.armband ?? undefined,
    judgeName: (entry.class_id && judgeByClass.get(entry.class_id)) || null,
  }));
}
