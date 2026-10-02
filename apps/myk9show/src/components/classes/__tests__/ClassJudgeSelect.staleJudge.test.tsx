/**
 * Narrowing the judge list to the show's registry can legitimately empty it while a
 * class still records a judge — one qualified for another organization, or whose
 * qualification lapsed. Disabling the selector on an empty list then STRANDS that
 * assignment: "Unassigned" is the only way to clear it and it lives inside the control.
 *
 * This is the second time the same shape has appeared in this work (the class Edit
 * panel had it too), so it is asserted on rendered state rather than trusted. (Ported from
 * the retired Class Management row's tests, MYK9-924.)
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassJudgeSelect } from '../ClassJudgeSelect';

const STALE_JUDGE_ID = 'b0728006-4428-4b5d-8462-00015c26a35b';

function renderSelect(
  assignedJudgeId: string | null,
  availableJudges: Array<{ id: string; name: string }> = [],
  canAssign = true
) {
  return render(
    <ClassJudgeSelect
      classId="c1"
      classLabel="Interior Novice A"
      assignedJudgeId={assignedJudgeId}
      availableJudges={availableJudges}
      canAssign={canAssign}
      onJudgeChange={vi.fn()}
    />
  );
}

describe('ClassJudgeSelect with an empty eligible list', () => {
  it('stays usable when a stale assignment still needs clearing', () => {
    renderSelect(STALE_JUDGE_ID, []);

    expect(screen.getByRole('combobox', { name: /judge for interior novice a/i })).toBeEnabled();
  });

  it('labels the stale judge rather than rendering its raw id', () => {
    renderSelect(STALE_JUDGE_ID, []);

    expect(screen.getByText(/assigned judge \(unavailable\)/i)).toBeInTheDocument();
    expect(screen.queryByText(STALE_JUDGE_ID)).toBeNull();
  });

  it('is disabled when there is nothing to pick and nothing to clear', () => {
    renderSelect(null, []);

    expect(screen.getByRole('combobox', { name: /judge for interior novice a/i })).toBeDisabled();
  });

  it('is enabled whenever eligible judges exist', () => {
    renderSelect(null, [{ id: 'j1', name: 'Pat Lee' }]);

    expect(screen.getByRole('combobox', { name: /judge for interior novice a/i })).toBeEnabled();
  });

  it('is disabled when no assignment can be written', () => {
    renderSelect(null, [{ id: 'j1', name: 'Pat Lee' }], false);

    expect(screen.getByRole('combobox', { name: /judge for interior novice a/i })).toBeDisabled();
  });
});
