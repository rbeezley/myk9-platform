import { isOnClassRunList, type EntryAccountingFields } from '@/features/_shared/entryAccounting';

/** The class and trial facts the conformation-puppy carve-out reads. */
export interface ConformationPuppyContext {
  trialType: string | null | undefined;
  className: string | null | undefined;
  element: string | null | undefined;
  level: string | null | undefined;
}

/**
 * AKC permits entering a conformation puppy before registration completes.
 * Missing metadata fails closed: the carve-out applies only when both the
 * sport and the class metadata prove it. Mirrors the SQL in
 * `entries_require_dog_registration()`.
 */
export function isConformationPuppyClass({
  trialType,
  className,
  element,
  level,
}: ConformationPuppyContext): boolean {
  const normalizedTrialType = trialType?.trim().toLowerCase() ?? '';
  if (!normalizedTrialType.includes('conformation')) return false;

  const classMetadata = [className, element, level]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return classMetadata.includes('puppy');
}

/** The server's held verdict, as an entry row carries it (either casing). */
export interface ServerHeldFlag {
  awaitingRegistrationNumber?: boolean | null | undefined;
  awaiting_registration_number?: boolean | null | undefined;
}

/**
 * Is this entry awaiting a registration number (MYK9-1162)?
 *
 * The server decides, never this device. `awaiting_registration_number` is
 * computed by the entry-results views from the dog's registrations, the
 * trial's registry and the conformation-puppy carve-out: the rule the insert
 * trigger and `emergency_packet_input` apply. A registration added or removed
 * touches the dog's entries, so the replica carries the new verdict on its next
 * sync. Rederiving it here from whatever registrations the device held went
 * wrong whenever that copy was partial, so every surface reads the flag.
 *
 * A row with no flag (an online read whose held lookup did not answer) is not
 * held: a class is never emptied on a guess. An entry off the run list
 * (withdrawn, scratched, moved) is never held, whatever the flag says.
 */
export function isHeldEntry(entry: EntryAccountingFields & ServerHeldFlag): boolean {
  if (!isOnClassRunList(entry)) return false;
  return (entry.awaitingRegistrationNumber ?? entry.awaiting_registration_number) === true;
}
