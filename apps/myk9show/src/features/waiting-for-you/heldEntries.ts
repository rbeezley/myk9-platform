import {
  findEntriesAwaitingRegistrationNumber,
  type RegistrationNeededRow,
} from '@/components/entries/management/registrationNeeded';
import type { WaitingList } from './types';

/**
 * Entries held for a registration number (MYK9-1162): the rows of the "Registration number
 * needed" list. Reads `findEntriesAwaitingRegistrationNumber`, the list's own function, so the
 * server's `awaitingRegistrationNumber` stays the only definition of "held".
 */
export function findHeldEntries(
  input: Parameters<typeof findEntriesAwaitingRegistrationNumber>[0]
): WaitingList<RegistrationNeededRow> {
  const rows = findEntriesAwaitingRegistrationNumber(input);
  return { count: rows.length, rows };
}
