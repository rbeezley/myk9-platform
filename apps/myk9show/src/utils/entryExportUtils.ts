/**
 * Pure helpers for CSV export of entries.
 * Extracted from useEntryManagementActions so they can be unit-tested independently.
 */

type DogRegistration = { organization: string; registration_number: string };
type Owner = { first_name: string; last_name: string; email: string; phone: string } | null;

export type ExportEntry = {
  armband?: string | null;
  handler?: string | null;
  entry_status?: string | null;
  payment_status?: string | null;
  entry_fee?: number | null;
  special_requests?: string | null;
  jump_height?: string | null;
  dog?: {
    name?: string | null;
    call_name?: string | null;
    breed?: string | null;
    owner?: Owner;
    dog_registrations?: DogRegistration[] | null;
  } | null;
  class?: { name?: string | null; class_number?: string | null } | null;
};

/**
 * Maps a single export entry to a 15-column CSV row.
 * Column order matches the headers in handleExportCSV:
 *  0  Armband
 *  1  Dog Name
 *  2  Call Name
 *  3  Breed
 *  4  Registration #
 *  5  Owner First Name
 *  6  Owner Last Name
 *  7  Owner Email
 *  8  Owner Phone
 *  9  Handler
 *  10 Entry Status
 *  11 Payment Status
 *  12 Total Fees
 *  13 Classes
 *  14 Special Requests
 */
export function buildExportRow(entry: ExportEntry): string[] {
  const dog = entry.dog ?? null;
  const owner = dog?.owner ?? null;
  const registrations = dog?.dog_registrations ?? [];
  const cls = entry.class ?? null;
  const jumpHeight = entry.jump_height ?? null;
  const className = cls?.name ? `${cls.name}${jumpHeight ? ` (${jumpHeight})` : ''}` : '';
  const registrationNumber = registrations.length
    ? registrations.map(r => `${r.organization}: ${r.registration_number}`).join('; ')
    : '';

  return [
    entry.armband || '',
    dog?.name || '',
    dog?.call_name || '',
    dog?.breed || '',
    registrationNumber,
    owner?.first_name || '',
    owner?.last_name || '',
    owner?.email || '',
    owner?.phone || '',
    entry.handler || '',
    entry.entry_status || '',
    entry.payment_status || '',
    Number.isFinite(entry.entry_fee) ? String(entry.entry_fee) : '0',
    className,
    entry.special_requests || '',
  ];
}
