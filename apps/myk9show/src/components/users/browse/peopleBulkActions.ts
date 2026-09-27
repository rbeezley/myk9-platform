/**
 * Pure helpers behind the People page's bulk bar (list toolkit, MYK9-797) —
 * kept apart from the component so `react-refresh/only-export-components`
 * stays clean (Users' `exportUsersCSV` follows the same split).
 */

import { toast } from 'sonner';
import type { User } from '@/types/user-types';

export function getFullName(person: User): string {
  return `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unknown';
}

function escapeCsvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function exportPeopleCSV(people: User[]): void {
  const rows = [
    ['Name', 'Email', 'Roles', 'Location'].join(','),
    ...people.map(person =>
      [
        getFullName(person),
        person.email ?? '',
        (person.roles ?? []).join(';'),
        [person.city, person.state].filter(Boolean).join(', '),
      ]
        .map(escapeCsvCell)
        .join(',')
    ),
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `people-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
