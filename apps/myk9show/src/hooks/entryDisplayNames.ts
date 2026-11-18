/**
 * The one rule for naming an entry's exhibitor and dog, shared by Entry Management
 * (`mapSecretaryEntryToEntryManagementEntry`) and the Refund all result lines (MYK9-1862).
 */

interface NamedPerson {
  first_name: string | null;
  last_name: string | null;
}

/** The fields the rule reads; a full `SecretaryEntry` and a slim by-id row both fit. */
export interface EntryDisplayNameSource {
  handler: string | null;
  dog: {
    name: string;
    call_name: string | null;
    owner: NamedPerson | null;
  } | null;
}

/** "First Last" from a joined person record, or null when absent/blank. */
export function personName(person: NamedPerson | null | undefined): string | null {
  if (!person) return null;
  const name = `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
  return name || null;
}

/**
 * Online (webhook-created) entries set the dog's owner FK but never the legacy `handler` text;
 * mail-in entries set the text only.
 */
export function entryOwnerName(entry: EntryDisplayNameSource): string {
  return personName(entry.dog?.owner) || entry.handler || 'Unknown';
}

/** The call name, else the registered name. */
export function entryDogName(entry: EntryDisplayNameSource): string {
  return entry.dog?.call_name || entry.dog?.name || 'Unknown Dog';
}

/** The registered name when the dog is shown by a different call name, else null. */
export function entryDogRegisteredName(entry: EntryDisplayNameSource): string | null {
  return entry.dog?.call_name && entry.dog?.name ? entry.dog.name : null;
}
