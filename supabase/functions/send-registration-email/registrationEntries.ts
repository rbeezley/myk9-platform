export const REGISTRATION_ENTRIES_SELECT =
  'armband, dog:dogs(call_name), class:classes(name)' as const;

interface RegistrationEntryRow {
  armband: string | null;
  dog: { call_name: string | null } | null;
  class: { name: string | null } | null;
}

export function mapRegistrationEntries(entries: RegistrationEntryRow[]) {
  return entries.map(entry => ({
    dogName: entry.dog?.call_name || 'Unknown',
    className: entry.class?.name || 'Unknown',
    armband: entry.armband ?? undefined,
  }));
}
