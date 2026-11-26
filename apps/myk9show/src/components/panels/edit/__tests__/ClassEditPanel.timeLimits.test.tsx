/**
 * MYK9-2405: Edit Class no longer edits, sends or validates a class's time limits.
 * MaxTimeDialog is their one editor (it applies the rulebook), so a save can never write,
 * clear or be blocked by a limit the secretary did not touch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassEditPanel } from '../ClassEditPanel';
import type { ClassData } from '@/components/classes/types/classTypes';

const { getClassById, getClassesByTrial } = vi.hoisted(() => ({
  getClassById: vi.fn(),
  getClassesByTrial: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { getClassById, getClassesByTrial },
  replicatedTrialsTable: { getTrialById: vi.fn().mockResolvedValue({ id: 't-1', showId: 's-1' }) },
  replicatedShowsTable: {
    getShowById: vi.fn().mockResolvedValue({ organization: 'AKC Scent Work' }),
  },
}));
vi.mock('@/pages/scoring/types', () => ({
  scoresheetKeyForClass: vi.fn().mockResolvedValue('AKC_SCENT_WORK'),
}));
vi.mock('@/features/at-show/slots/MaxTimeDialog', () => ({
  MaxTimeDialog: (props: { isOpen: boolean; classData: unknown }) => (
    <div data-testid="max-time-dialog">{JSON.stringify(props.classData)}</div>
  ),
}));
vi.mock('@/store/showStore', () => ({ useShowStore: () => ({ shows: [] }) }));
vi.mock('@/store/userStore', () => ({ useUserStore: () => ({ people: [] }) }));
vi.mock('@/hooks/useClassRequirements', () => ({
  useClassRequirements: () => ({ autoFill: undefined }),
}));

// An estimatedJudgingTime renders the full form, which carries the Timing tab.
const fullClass = (extra: Partial<ClassData> = {}) =>
  ({
    id: 'cls-1',
    element: 'Interior',
    level: 'Master',
    section: 'A',
    judgeId: 'TBD',
    judge: 'TBD',
    status: 'Scheduled',
    classOrder: '1',
    estimatedJudgingTime: '5:00',
    timeLimit1: '3:00',
    timeLimit2: '4:00',
    timeLimit3: '5:00',
    ...extra,
  }) as Partial<ClassData>;

function renderPanel(initial: Partial<ClassData>) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <ClassEditPanel
      open
      onClose={vi.fn()}
      classId="cls-1"
      className="Interior Master"
      initialClassData={initial}
      onSave={onSave}
    />
  );
  return { ...view, onSave };
}

async function changeEstimate(view: ReturnType<typeof renderPanel>, value: string) {
  await view.user.click(await screen.findByRole('tab', { name: /Timing/ }));
  const estimate = screen.getByLabelText('Estimated Judging Time');
  await view.user.clear(estimate);
  await view.user.type(estimate, value);
  await view.user.click(screen.getByRole('button', { name: 'Save Changes' }));
}

describe('ClassEditPanel: time limits belong to MaxTimeDialog', () => {
  beforeEach(() => {
    getClassesByTrial.mockResolvedValue([]);
  });

  it('offers no time limit field, so a rulebook-fixed limit cannot be changed here', async () => {
    const view = renderPanel(fullClass());
    await view.user.click(await screen.findByRole('tab', { name: /Timing/ }));
    expect(screen.getByLabelText('Estimated Judging Time')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Time Limit/i)).not.toBeInTheDocument();
  });

  it('never writes a time limit when saving an unrelated change', async () => {
    const view = renderPanel(fullClass());
    await changeEstimate(view, '430');
    await waitFor(() => expect(view.onSave).toHaveBeenCalled());
    const patch = view.onSave.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch).toEqual(expect.objectContaining({ estimatedJudgingTime: '4:30' }));
    for (const key of ['timeLimit1', 'timeLimit2', 'timeLimit3']) {
      expect(patch).not.toHaveProperty(key);
    }
  });

  it('does not clear a limit the form never carried', async () => {
    const view = renderPanel(fullClass({ timeLimit1: '', timeLimit2: '', timeLimit3: '' }));
    await changeEstimate(view, '430');
    await waitFor(() => expect(view.onSave).toHaveBeenCalled());
    const patch = view.onSave.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(patch).filter(key => key.startsWith('timeLimit'))).toEqual([]);
  });

  it('saves when a stored limit is out of range or unreadable', async () => {
    const view = renderPanel(fullClass({ timeLimit1: '45:00', timeLimit2: 'abc' }));
    await changeEstimate(view, '430');
    await waitFor(() => expect(view.onSave).toHaveBeenCalled());
  });

  it('opens the one time limit editor from the Timing tab of the full form', async () => {
    getClassById.mockResolvedValue({
      id: 'cls-1',
      trialId: 't-1',
      name: 'Interior Master',
      element: 'Interior',
      level: 'Master',
      timeLimitSeconds: 180,
      areaCount: 1,
    });
    const view = renderPanel(fullClass());
    await view.user.click(await screen.findByRole('tab', { name: /Timing/ }));
    await view.user.click(screen.getByRole('button', { name: /Time limit/ }));
    const dialog = await screen.findByTestId('max-time-dialog');
    expect(JSON.parse(dialog.textContent ?? '')).toEqual({
      id: 'cls-1',
      element: 'Interior',
      level: 'Master',
      class_name: 'Interior Master',
      per_area_times: true,
      time_limit_seconds: 180,
      area_count: 1,
    });
    expect(view.onSave).not.toHaveBeenCalled();
  });

  it('opens the same editor from the simple form opened from Class Details', async () => {
    getClassById.mockResolvedValue({
      id: 'cls-1',
      name: 'Interior Master',
      element: 'Interior',
      level: 'Master',
    });
    const view = render(
      <ClassEditPanel
        open
        onClose={vi.fn()}
        classId="cls-1"
        className="Interior Master"
        mode="simple"
        initialClassData={{ id: 'cls-1', element: 'Interior', level: 'Master', judgeId: 'TBD' }}
        onSave={vi.fn()}
      />
    );
    await view.user.click(await screen.findByRole('button', { name: /Time limit/ }));
    expect(await screen.findByTestId('max-time-dialog')).toBeInTheDocument();
  });

  const novice = (id: string, section: string) => ({
    id,
    trialId: 't-1',
    name: `Interior Novice ${section}`,
    element: 'Interior',
    level: 'Novice',
    section,
    judgeName: 'Pat Judge',
  });

  it('passes the other section as pairedClassId for a combined A & B class', async () => {
    getClassById.mockResolvedValue(novice('cls-1', 'A'));
    getClassesByTrial.mockResolvedValue([novice('cls-1', 'A'), novice('cls-2', 'B')]);
    const view = renderPanel(fullClass());
    await view.user.click(await screen.findByRole('tab', { name: /Timing/ }));
    await view.user.click(screen.getByRole('button', { name: /Time limit/ }));
    const dialog = await screen.findByTestId('max-time-dialog');
    expect(JSON.parse(dialog.textContent ?? '')).toEqual(
      expect.objectContaining({
        id: 'cls-1',
        pairedClassId: 'cls-2',
        class_name: 'Interior Novice A & B',
      })
    );
  });

  it('passes no pairedClassId for a class that is not combined', async () => {
    getClassById.mockResolvedValue(novice('cls-1', 'A'));
    getClassesByTrial.mockResolvedValue([novice('cls-1', 'A')]);
    const view = renderPanel(fullClass());
    await view.user.click(await screen.findByRole('tab', { name: /Timing/ }));
    await view.user.click(screen.getByRole('button', { name: /Time limit/ }));
    const dialog = await screen.findByTestId('max-time-dialog');
    const shown = JSON.parse(dialog.textContent ?? '');
    expect(shown).not.toHaveProperty('pairedClassId');
    expect(shown.class_name).toBe('Interior Novice A');
  });
});
