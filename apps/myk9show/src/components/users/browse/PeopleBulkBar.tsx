/**
 * The People page's bulk bar (list toolkit, MYK9-797) — Copy emails and
 * Export only. Role editing stays on admin Users (docs/plan-list-toolkit.md);
 * this page has no delete or account action.
 */

import { Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { FloatingBulkBar, BulkBarButton } from '@/components/list-toolkit';
import type { User } from '@/types/user-types';

const PEOPLE_NOUN = ['person', 'people'] as const;

function getFullName(person: User): string {
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

interface PeopleBulkBarProps {
  selectedPeople: User[];
  onClearSelection: () => void;
}

export function PeopleBulkBar({ selectedPeople, onClearSelection }: PeopleBulkBarProps) {
  if (selectedPeople.length === 0) return null;

  return (
    <FloatingBulkBar count={selectedPeople.length} noun={PEOPLE_NOUN} onClear={onClearSelection}>
      <p className="sr-only">
        Selected people: {selectedPeople.slice(0, 3).map(getFullName).join(', ')}
        {selectedPeople.length > 3 && ` and ${selectedPeople.length - 3} more`}
      </p>
      <BulkBarButton
        onClick={() => void copyPeopleEmails(selectedPeople)}
        icon={<Copy className="h-4 w-4" aria-hidden="true" />}
      >
        Copy emails
      </BulkBarButton>
      <BulkBarButton
        onClick={() => exportPeopleCSV(selectedPeople)}
        icon={<Download className="h-4 w-4" aria-hidden="true" />}
      >
        Export
      </BulkBarButton>
    </FloatingBulkBar>
  );
}
