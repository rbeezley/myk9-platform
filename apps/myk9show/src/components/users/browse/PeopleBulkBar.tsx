/**
 * The People page's bulk bar (list toolkit, MYK9-797) — Copy emails and
 * Export only. Role editing stays on admin Users (docs/plan-list-toolkit.md);
 * this page has no delete or account action.
 */

import { Copy, Download } from 'lucide-react';
import { FloatingBulkBar, BulkBarButton } from '@/components/list-toolkit';
import type { User } from '@/types/user-types';
import { copyPeopleEmails, exportPeopleCSV, getFullName } from './peopleBulkActions';

const PEOPLE_NOUN = ['person', 'people'] as const;

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
