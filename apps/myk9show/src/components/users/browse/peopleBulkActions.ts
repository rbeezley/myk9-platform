/**
 * Pure helpers behind the People page's bulk bar (list toolkit, MYK9-797) —
 * kept apart from the component so `react-refresh/only-export-components`
 * stays clean (Users' `exportUsersCSV` follows the same split).
 */

import { toast } from 'sonner';
import type { User } from '@/types/user-types';
import { exportRowsCsv } from '@/utils/downloadCsv';

export function getFullName(person: User): string {
  return `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unknown';
}

/** The People list's CSV columns, shared by the whole-list page export and the bulk bar's. */
export const PEOPLE_EXPORT_HEADERS = ['Name', 'Email', 'Roles', 'Location'] as const;

export function peopleExportRows(people: readonly User[]): string[][] {
  return people.map(person => [
    getFullName(person),
    person.email ?? '',
    (person.roles ?? []).join(', '),
    [person.city, person.state].filter(Boolean).join(', '),
  ]);
}

export function exportPeopleCSV(people: User[]): void {
  exportRowsCsv('people', PEOPLE_EXPORT_HEADERS, peopleExportRows(people));
}

export async function copyPeopleEmails(people: User[]): Promise<void> {
  const emails = people.map(p => p.email).filter((email): email is string => Boolean(email));
  const missing = people.length - emails.length;
  if (emails.length === 0) {
    toast.error('None of the selected people has an email address.');
    return;
  }
  try {
    await navigator.clipboard.writeText(emails.join(', '));
    toast.success(
      `Copied ${emails.length} email ${emails.length === 1 ? 'address' : 'addresses'}`,
      missing > 0 ? { description: `${missing} selected without an email.` } : undefined
    );
  } catch {
    toast.error('Could not copy to the clipboard. Try Export instead.');
  }
}
