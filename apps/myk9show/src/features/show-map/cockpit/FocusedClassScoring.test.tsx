import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen, waitFor, within } from '@/test/utils/testUtils';

const { getClassById, updateClass } = vi.hoisted(() => ({
  getClassById: vi.fn(),
  updateClass: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { getClassById, updateClass },
}));

import { ClassScoringSwitch, JudgeScoringChoice } from './FocusedClassScoring';
import { judgeScoringModel } from './classScoringModel';
import type { SecretaryCockpitClass } from './secretaryCockpitTypes';

const cls = (over: Partial<SecretaryCockpitClass>) =>
  ({
    id: 'c',
    judgeId: 'j1',
    lifecycle: 'not-started',
    scoresOnPaper: null,
    ...over,
  }) as SecretaryCockpitClass;

const judgeModel = (
  classes: SecretaryCockpitClass[],
  usesDeviceScoring: boolean | undefined = true
) => judgeScoringModel(classes, 'j1', usesDeviceScoring);

describe('Show Desk scoring controls (MYK9-1971)', () => {
  beforeEach(() => {
    getClassById.mockReset();
    updateClass.mockReset();
    getClassById.mockResolvedValue({ id: 'c1', scoresOnPaper: null });
  });

  it('switches one class to paper in one tap, with no confirmation', async () => {
    const { user } = render(
      <ClassScoringSwitch
        classId="c1"
        className="Container Novice"
        scoresOnPaper={null}
        showUsesDeviceScoring
      />
    );
    expect(
      screen.getByRole('button', { name: "Scores on a phone (the show's usual way)" })
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Scores on paper' }));
    await waitFor(() => expect(updateClass).toHaveBeenCalledWith('c1', { scoresOnPaper: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lets both choice buttons wrap on a narrow phone and keeps the 44px target (MYK9-2318)', () => {
    render(
      <ClassScoringSwitch classId="c1" className="N" scoresOnPaper={null} showUsesDeviceScoring />
    );
    const group = screen.getByRole('group');
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toHaveClass('h-auto', 'min-h-11', 'whitespace-normal', 'text-left');
    }
  });

  it('marks a class with its own choice without the usual-way note', () => {
    render(<ClassScoringSwitch classId="c1" className="N" scoresOnPaper showUsesDeviceScoring />);
    expect(screen.getByRole('button', { name: 'Scores on paper' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('reads a class that follows a paper show as paper, and switching to a phone writes false', async () => {
    const { user } = render(
      <ClassScoringSwitch
        classId="c1"
        className="Container Novice"
        scoresOnPaper={null}
        showUsesDeviceScoring={false}
      />
    );
    expect(
      screen.getByRole('button', { name: "Scores on paper (the show's usual way)" })
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Scores on a phone' }));
    await waitFor(() => expect(updateClass).toHaveBeenCalledWith('c1', { scoresOnPaper: false }));
  });

  it('presses neither button while the show switch is unknown, and both still write', async () => {
    const { user } = render(
      <ClassScoringSwitch
        classId="c1"
        className="Container Novice"
        scoresOnPaper={null}
        showUsesDeviceScoring={undefined}
      />
    );
    for (const name of ['Scores on paper', 'Scores on a phone']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
    await user.click(screen.getByRole('button', { name: 'Scores on paper' }));
    await waitFor(() => expect(updateClass).toHaveBeenCalledWith('c1', { scoresOnPaper: true }));
  });

  it('sets every open class of the judge, says how far that reaches and what a later class gets', async () => {
    const classes = [
      cls({ id: 'c1' }),
      cls({ id: 'c2' }),
      cls({ id: 'c3', lifecycle: 'complete' }),
    ];
    const { user } = render(
      <JudgeScoringChoice judgeName="Pat Lee" model={judgeModel(classes)} showUsesDeviceScoring />
    );
    expect(screen.getByRole('group', { name: 'Every class Pat Lee judges' })).toBeInTheDocument();
    expect(
      screen.getByText(/Applies to 2 classes Pat Lee judges, on every day of this show\./)
    ).toBeInTheDocument();
    expect(screen.getByText(/1 finished or cancelled class stays as it is\./)).toBeInTheDocument();
    expect(screen.getByText(/scored the show's usual way \(on a phone\)\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Scores on paper' }));
    await waitFor(() => expect(updateClass).toHaveBeenCalledTimes(2));
    expect(updateClass).toHaveBeenCalledWith('c1', { scoresOnPaper: true });
    expect(updateClass).toHaveBeenCalledWith('c2', { scoresOnPaper: true });
  });

  it('gives counts when the judge classes are mixed and presses neither', () => {
    const classes = [
      cls({ id: 'a', scoresOnPaper: true }),
      cls({ id: 'b', scoresOnPaper: true }),
      cls({ id: 'c' }),
    ];
    render(
      <JudgeScoringChoice judgeName="Pat Lee" model={judgeModel(classes)} showUsesDeviceScoring />
    );
    expect(screen.getByText(/2 on paper, 1 on a phone\./)).toBeInTheDocument();
    for (const name of ['Scores on paper', 'Scores on a phone']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('presses neither and names no usual way while the show switch is unknown', () => {
    render(
      <JudgeScoringChoice
        judgeName="Pat Lee"
        model={judgeModel([cls({ id: 'a' })], undefined)}
        showUsesDeviceScoring={undefined}
      />
    );
    expect(screen.getByRole('button', { name: 'Scores on paper' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByText(/scored the show's usual way\./)).toBeInTheDocument();
  });
});
