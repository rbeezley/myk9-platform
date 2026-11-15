/**
 * MYK9-2015: Edit class is where a started class's judge changes (the Show Desk picker locks once
 * a dog is scored). Picking another judge for a started class says the outgoing judge's phone may
 * hold scores that have not arrived; a class that has not started says nothing. Both forms (the
 * Setup snapshot's simple form and the full form) carry the line.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassEditPanel } from '../ClassEditPanel';
import type { ClassData } from '@/components/classes/types/classTypes';

const JUDGES = [
  { judgeId: 'judge-a', judgeName: 'Pat Rivera' },
  { judgeId: 'judge-b', judgeName: 'Lee Okafor' },
];
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({ shows: [{ id: 'show-1', assignedJudges: JUDGES }] }),
}));
vi.mock('@/store/userStore', () => ({ useUserStore: () => ({ people: [] }) }));
vi.mock('@/hooks/useClassRequirements', () => ({
  useClassRequirements: () => ({ autoFill: undefined }),
}));

const snapshot = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  reads: [] as string[],
}));
vi.mock('@/features/at-show/useClassEntriesSnapshot', () => ({
  useClassEntriesSnapshot: (classId: string) => {
    snapshot.reads.push(classId);
    return { rows: snapshot.rows, failed: false, retry: vi.fn() };
  },
}));

const WARNING = "Pat Rivera may have scores on their phone that haven't arrived.";
const CHECKED_IN = { entry_status: 'confirmed', check_in_status: 'checked-in' };
const NOT_CHECKED_IN = { entry_status: 'confirmed', check_in_status: 'no-status' };

const classWithJudgeA = (extra: Partial<ClassData> = {}) =>
  ({
    id: 'cls-1',
    element: 'Interior',
    level: 'Novice',
    section: 'A',
    judgeId: 'judge-a',
    judge: 'Pat Rivera',
    status: 'Scheduled',
    classOrder: '1',
    ...extra,
  }) as Partial<ClassData>;

async function openAndPickJudgeB(initial: Partial<ClassData>, tab?: RegExp) {
  const view = render(
    <ClassEditPanel
      open
      onClose={vi.fn()}
      classId="cls-1"
      className="Interior Novice"
      initialClassData={initial}
      showId="show-1"
      onSave={vi.fn().mockResolvedValue(undefined)}
    />
  );
  // The full form keeps the judge on its Officials tab.
  if (tab) await view.user.click(await screen.findByRole('tab', { name: tab }));
  const trigger = await screen.findByRole('combobox', { name: /judge/i });
  await view.user.click(trigger);
  await view.user.click(await screen.findByRole('option', { name: /Lee Okafor/ }));
  await waitFor(() => expect(snapshot.reads).toContain('cls-1'));
  return view;
}

describe('ClassEditPanel: changing the judge of a started class (MYK9-2015)', () => {
  beforeEach(() => {
    snapshot.rows = [];
    snapshot.reads = [];
  });

  it('warns under the judge field, naming the outgoing judge, in the Setup form', async () => {
    snapshot.rows = [NOT_CHECKED_IN, CHECKED_IN];
    await openAndPickJudgeB(classWithJudgeA());
    expect(await screen.findByText(WARNING)).toBeInTheDocument();
    // A plain line, never a confirmation in the way of Save.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
  });

  it('warns in the full form too', async () => {
    snapshot.rows = [{ ...CHECKED_IN, is_scored: true, result_status: 'qualified' }];
    await openAndPickJudgeB(classWithJudgeA({ estimatedJudgingTime: '00:02' }), /officials/i);
    expect(await screen.findByText(WARNING)).toBeInTheDocument();
  });

  it('says nothing for a class that has not started', async () => {
    snapshot.rows = [NOT_CHECKED_IN, NOT_CHECKED_IN];
    await openAndPickJudgeB(classWithJudgeA());
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });

  it('says nothing before the judge is changed', async () => {
    snapshot.rows = [CHECKED_IN];
    render(
      <ClassEditPanel
        open
        onClose={vi.fn()}
        classId="cls-1"
        className="Interior Novice"
        initialClassData={classWithJudgeA()}
        showId="show-1"
      />
    );
    expect(await screen.findByRole('combobox', { name: /judge/i })).toBeInTheDocument();
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });
});
