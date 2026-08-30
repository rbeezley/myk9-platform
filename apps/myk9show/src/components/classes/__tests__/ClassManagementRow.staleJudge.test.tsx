/**
 * Narrowing the judge list to the show's registry can legitimately empty it while a
 * class still records a judge — one qualified for another organization, or whose
 * qualification lapsed. Disabling the selector on an empty list then STRANDS that
 * assignment: "Unassigned" is the only way to clear it and it lives inside the control.
 *
 * This is the second time the same shape has appeared in this work (the class Edit
 * panel had it too), so it is asserted on rendered state rather than trusted.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassManagementRow, type DbClassRow } from '../ClassManagementRow';

const STALE_JUDGE_ID = 'b0728006-4428-4b5d-8462-00015c26a35b';

function makeClass(judgeId?: string): DbClassRow {
  return {
    id: 'c1',
    name: 'Interior Novice A',
    element: 'Interior',
    level: 'Novice',
    section: 'A',
    status: 'scheduled',
    class_order: 1,
    max_entries: 20,
    entries: [],
    judge_assignments: judgeId ? [{ person_id: judgeId }] : [],
  } as unknown as DbClassRow;
}

function renderRow(cls: DbClassRow, availableJudges: Array<{ id: string; name: string }> = []) {
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

describe('ClassManagementRow judge selector with an empty eligible list', () => {
  it('stays usable when a stale assignment still needs clearing', () => {
    renderRow(makeClass(STALE_JUDGE_ID), []);

    const select = screen.getByRole('combobox', { name: /judge for interior novice a/i });
    expect(select).toBeEnabled();
  });

  it('labels the stale judge rather than rendering its raw id', () => {
    renderRow(makeClass(STALE_JUDGE_ID), []);

    expect(screen.getByText(/assigned judge \(unavailable\)/i)).toBeInTheDocument();
    expect(screen.queryByText(STALE_JUDGE_ID)).toBeNull();
  });

  it('is disabled when there is nothing to pick and nothing to clear', () => {
    renderRow(makeClass(), []);

    expect(screen.getByRole('combobox', { name: /judge for interior novice a/i })).toBeDisabled();
  });

  it('is enabled whenever eligible judges exist', () => {
    renderRow(makeClass(), [{ id: 'j1', name: 'Pat Lee' }]);

    expect(screen.getByRole('combobox', { name: /judge for interior novice a/i })).toBeEnabled();
  });
});
