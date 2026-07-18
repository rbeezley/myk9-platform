/**
 * Task 3.2 — a display density preset (Design Decision 3) is a bounded
 * layout choice: identity, status, selection, and the row action menu must
 * remain rendered in EVERY density.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClassManagementRow, type DbClassRow } from '../ClassManagementRow';

const cls: DbClassRow = {
  id: 'c1',
  name: 'Novice A',
  element: 'Interior',
  level: 'Novice',
  section: 'A',
  status: 'in_progress',
  class_order: 1,
  max_entries: 20,
  entries: [{ id: 'e1' }],
  judge_assignments: [],
};

function renderRow(density: 'comfortable' | 'compact') {
  return render(
    <ClassManagementRow
      cls={cls}
      selected={false}
      showId="show-1"
      showStatus="published"
      availableJudges={[]}
      onToggleSelect={vi.fn()}
      onViewWaitlist={vi.fn()}
      onStatusChange={vi.fn()}
      onJudgeChange={vi.fn()}
      onDelete={vi.fn()}
      density={density}
    />
  );
}

describe('ClassManagementRow density', () => {
  it.each(['comfortable', 'compact'] as const)(
    'keeps identity, status, selection, and the row action menu in %s density',
    density => {
      renderRow(density);

      expect(screen.getByText('Novice A')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /select novice a/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /more actions for novice a/i })).toBeInTheDocument();
      // Lifecycle status chip renders for a published show.
      expect(screen.getByText(/in progress/i)).toBeInTheDocument();
    }
  );
});
