import type { EntryManagementEntry } from '@/types/entry-management-types';

/**
 * The address a decision email to this entry form's exhibitor reaches (MYK9-2483).
 * `send-email` resolves the recipient from the enrollment's handler, the person who placed
 * the form, not from the dog's owner. The handler's address is used whenever the form's
 * enrollment was read; the owner's only stands in when it was not.
 */
export function exhibitorContactEmail(
  entry: Pick<EntryManagementEntry, 'ownerEmail' | 'enrollmentPayerEmail'> | undefined
): string {
  return (entry?.enrollmentPayerEmail ?? entry?.ownerEmail ?? '').trim();
}
