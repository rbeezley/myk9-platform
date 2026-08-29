/**
 * F28 (secretary task walk) — Manage Classes rendered the judge's raw UUID as the
 * visible text of the per-class judge selector.
 *
 * Two candidate causes, distinguished here rather than assumed:
 *  1. the row renders the option VALUE instead of its label, or
 *  2. the assigned judge is absent from `availableJudges`, so the Select has no
 *     item to resolve the value against and falls back to showing it raw.
 *
 * Asserts rendered text, never source strings.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClassManagementRow, type DbClassRow } from '../ClassManagementRow';

const JUDGE_ID = 'b0728006-4428-4b5d-8462-00015c26a35b';

const cls: DbClassRow = {
  id: 'c1',
  name: 'Interior Novice A',
  element: 'Interior',
  level: 'Novice',
  section: 'A',
  status: 'scheduled',
  class_order: 1,
  max_entries: 20,
  entries: [],
  judge_assignments: [{ person_id: JUDGE_ID }],
} as unknown as DbClassRow;

function renderRow(availableJudges: Array<{ id: string; name: string }>) {
  return render(
    <ClassManagementRow
      cls={cls}
      selected={false}
      showId="show-1"
      showStatus="published"
      availableJudges={availableJudges}
      onToggleSelect={vi.fn()}
      onViewWaitlist={vi.fn()}
      onStatusChange={vi.fn()}
      onJudgeChange={vi.fn()}
      onDelete={vi.fn()}
      density="comfortable"
    />
  );
}

describe('ClassManagementRow judge label', () => {
  it('shows the judge name when the assigned judge is among the options', () => {
    renderRow([{ id: JUDGE_ID, name: 'Test Judge' }]);
    const trigger = screen.getByRole('combobox', { name: /judge for interior novice a/i });
    expect(trigger).toHaveTextContent('Test Judge');
    expect(trigger).not.toHaveTextContent(JUDGE_ID);
  });

  it('never shows a raw id when the assigned judge is missing from the options', () => {
    // The real-world case: the judge list is empty or filtered, so the value
    // matches no item. Whatever it falls back to, a UUID is never acceptable.
    renderRow([]);
    const trigger = screen.getByRole('combobox', { name: /judge for interior novice a/i });
    expect(trigger).not.toHaveTextContent(JUDGE_ID);
  });
});
