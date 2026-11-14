import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen, waitFor } from '@/test/utils/testUtils';
import { useShowStore } from '@/store/showStore';
import type { SecretaryCockpitClass } from './secretaryCockpitTypes';

const { getClassById, updateClass } = vi.hoisted(() => ({
  getClassById: vi.fn(),
  updateClass: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { getClassById, updateClass },
}));

import { FocusedClassJudgeScoring, FocusedClassScoringField } from './FocusedClassScoringControls';

const cls = (over: Partial<SecretaryCockpitClass>): SecretaryCockpitClass =>
  ({
    id: 'c1',
    judgeId: 'j1',
    judgeName: 'Pat Lee',
    lifecycle: 'not-started',
    scoresOnPaper: null,
    ...over,
  }) as SecretaryCockpitClass;

function setShow(usesDeviceScoring: boolean) {
  useShowStore.setState({
    shows: [{ id: 'show-1', usesDeviceScoring }] as never,
  });
}

describe('FocusedClassScoringControls (MYK9-1971)', () => {
  beforeEach(() => {
    getClassById.mockReset();
    updateClass.mockReset();
    getClassById.mockResolvedValue({ id: 'c1', scoresOnPaper: null });
  });

  it('reads the show switch from the live replica, so a paper show shows paper', () => {
    setShow(false);
    render(<FocusedClassScoringField showId="show-1" sourceClass={cls({})} className="Novice" />);
    expect(screen.getByRole('button', { name: 'Scores on paper' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('shows plain words, no buttons, once the class is complete', () => {
    setShow(true);
    render(
      <FocusedClassScoringField
        showId="show-1"
        sourceClass={cls({ lifecycle: 'complete', scoresOnPaper: true })}
        className="Novice"
      />
    );
    expect(screen.getByText('Scores on paper')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it("writes only the judge's classes that are still open", async () => {
    setShow(true);
    const classes = [
      cls({ id: 'c1' }),
      cls({ id: 'c2', lifecycle: 'complete' }),
      cls({ id: 'c3', judgeId: 'j2' }),
      cls({ id: 'c4', lifecycle: 'in-progress' }),
    ];
    const { user } = render(
      <FocusedClassJudgeScoring showId="show-1" sourceClass={classes[0]!} classes={classes} />
    );
    await user.click(screen.getByRole('button', { name: 'Scores on paper' }));
    await waitFor(() => expect(updateClass).toHaveBeenCalledTimes(2));
    expect(updateClass.mock.calls.map(call => call[0]).sort()).toEqual(['c1', 'c4']);
  });

  it('offers nothing for a class with no judge', () => {
    setShow(true);
    const { container } = render(
      <FocusedClassJudgeScoring
        showId="show-1"
        sourceClass={cls({ judgeId: null })}
        classes={[cls({ judgeId: null })]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
