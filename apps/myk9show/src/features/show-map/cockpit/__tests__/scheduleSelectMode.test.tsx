import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { SecretaryCockpit } from '../SecretaryCockpit';
import type { SecretaryCockpitClass, SecretaryCockpitSnapshot } from '../secretaryCockpitTypes';

// jsdom has no layout: unmeasured is the stacked layout.
vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: { current: null }, width: null }),
}));

const showQuery = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useShowsDatabase', () => ({ useShowQuery: showQuery }));

const judgesQuery = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: judgesQuery,
}));

const upsertClassJudgeAssignment = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment }));

const applyManualClassStatus = vi.hoisted(() => vi.fn());
vi.mock('@/services/show-day/classStatusMutations', () => ({ applyManualClassStatus }));

const JANE = {
  id: 'judge-1',
  firstName: 'Jane',
  lastName: 'Judge',
  judgeQualifications: [{ status: 'Active', organization: 'AKC' }],
};

const classOf = (overrides: Partial<SecretaryCockpitClass>): SecretaryCockpitClass => ({
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Container Novice',
  classOrder: 0,
  lifecycle: 'not-started',
  status: 'not_started',
  entryCount: 10,
  scoredCount: 0,
  judgeName: null,
  judgeId: null,
  entryRows: [],
  attention: [],
  actions: [],
  paperwork: [],
  ...overrides,
});

const CLASSES = [
  classOf({ id: 'class-1', name: 'Container Novice', classOrder: 0 }),
  classOf({ id: 'class-2', name: 'Interior Novice', classOrder: 1 }),
  classOf({
    id: 'class-3',
    name: 'Exterior Novice',
    classOrder: 2,
    lifecycle: 'in-progress',
    status: 'in_progress',
  }),
  classOf({ id: 'class-9', trialId: 'trial-2', name: 'Buried Novice', classOrder: 0 }),
];

const snapshot: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  trials: [
    { id: 'trial-1', date: '2026-07-20', number: '1', order: 0 },
    { id: 'trial-2', date: '2026-07-21', number: '2', order: 1 },
  ],
  classes: CLASSES,
};

const renderCockpit = (route = '/shows/show-1?select=classes', canManageShow = true) =>
  render(
    <SecretaryCockpit snapshot={snapshot} canManageShow={canManageShow} onCommand={vi.fn()} />,
    {
      initialRoute: route,
    }
  );

const row = (classId: string) =>
  document.getElementById(`cockpit-anchor-${classId}`) as HTMLElement;
const tick = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}` });
const expandTrial2 = async (user: ReturnType<typeof renderCockpit>['user']) => {
  const trigger = screen.getByRole('button', { name: /^Expand 2 / });
  await user.click(trigger);
};

describe('Select classes on the schedule (MYK9-1324)', () => {
  beforeEach(() => {
    showQuery.mockReturnValue({ data: { id: 'show-1', organization: 'AKC' } });
    judgesQuery.mockReturnValue({ data: [JANE] });
    upsertClassJudgeAssignment.mockReset();
    upsertClassJudgeAssignment.mockResolvedValue(undefined);
    applyManualClassStatus.mockReset();
    applyManualClassStatus.mockResolvedValue(undefined);
  });

  it('shows no checkboxes outside select mode, nor to a viewer who cannot manage the show', () => {
    const { unmount } = renderCockpit('/shows/show-1');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    unmount();

    renderCockpit('/shows/show-1?select=classes', false);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: 'Select classes' })).not.toBeInTheDocument();
  });

  it('offers every bulk action the Select classes table had, plus Assign judge (inventory)', async () => {
    // Focused on a class that has not started, so the panel's judge picker is open.
    const { user } = renderCockpit('/shows/show-1?select=classes&focus=class-1');
    await user.click(tick('Container Novice'));

    // The table's bar was Change status, Delete and Export; its per-row judge picker is now the
    // class panel's (MYK9-1323), and bulk Assign judge is new here.
    for (const name of ['Assign judge', 'Change status', 'Delete', 'Export']) {
      expect(screen.getByRole('button', { name })).toBeEnabled();
    }

    // Done hands the schedule back with the class panel, and its judge picker, where it was.
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('combobox', { name: /^Judge for / })).toBeInTheDocument();
  });

  it('hides the inline class panel while selecting, so it never sits inside the tick list', () => {
    renderCockpit('/shows/show-1?select=classes&focus=class-1');

    expect(screen.queryByTestId('cockpit-inline-focus')).not.toBeInTheDocument();
  });

  it('a row click ticks the row instead of focusing the class', async () => {
    const { user } = renderCockpit('/shows/show-1?select=classes&focus=class-1');

    await user.click(within(row('class-2')).getByText('Interior Novice'));
    expect(tick('Interior Novice')).toBeChecked();
    await user.click(row('class-2'));
    expect(tick('Interior Novice')).not.toBeChecked();

    // After Done the class it was opened on is still the focused one.
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('focused-class-header')).toHaveTextContent('Container Novice');
  });

  it('a tick a filter hides is dropped for good, not hidden until the filter changes back', async () => {
    const { user } = renderCockpit();
    await user.click(tick('Container Novice'));

    const filters = () => screen.getByRole('combobox', { name: 'View: Schedule filters' });
    await user.click(filters());
    await user.click(await screen.findByRole('option', { name: /^In progress/ }));
    await user.click(filters());
    await user.click(await screen.findByRole('option', { name: /^All/ }));

    expect(tick('Container Novice')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Change status' })).not.toBeInTheDocument();
  });

  it('the trial heading ticks every visible class of its trial', async () => {
    const { user } = renderCockpit();

    await user.click(screen.getByRole('checkbox', { name: /^Select every class in 1 / }));

    expect(tick('Container Novice')).toBeChecked();
    expect(tick('Interior Novice')).toBeChecked();
    expect(tick('Exterior Novice')).toBeChecked();
  });

  it('assigns a judge to every ticked class that has not started, never to a started one', async () => {
    const { user } = renderCockpit();
    await user.click(tick('Container Novice'));
    await user.click(tick('Interior Novice'));
    await user.click(tick('Exterior Novice'));

    await user.click(screen.getByRole('button', { name: 'Assign judge (2 of 3)' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Jane Judge' }));

    const name = { name: 'Jane Judge', firstName: 'Jane', lastName: 'Judge' };
    await vi.waitFor(() => expect(upsertClassJudgeAssignment).toHaveBeenCalledTimes(2));
    expect(upsertClassJudgeAssignment).toHaveBeenCalledWith('show-1', 'class-1', 'judge-1', name);
    expect(upsertClassJudgeAssignment).toHaveBeenCalledWith('show-1', 'class-2', 'judge-1', name);
    expect(upsertClassJudgeAssignment).not.toHaveBeenCalledWith(
      'show-1',
      'class-3',
      expect.anything(),
      expect.anything()
    );
  });

  it('Unassigned clears the judge on the ticked classes', async () => {
    const { user } = renderCockpit();
    await user.click(tick('Container Novice'));

    await user.click(screen.getByRole('button', { name: 'Assign judge' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Unassigned' }));

    await vi.waitFor(() =>
      expect(upsertClassJudgeAssignment).toHaveBeenCalledWith('show-1', 'class-1', 'TBD', undefined)
    );
  });

  it('changes status on the ticked classes through the shared bulk status', async () => {
    const { user } = renderCockpit();
    await user.click(tick('Container Novice'));
    await user.click(tick('Interior Novice'));

    await user.click(screen.getByRole('button', { name: 'Change status' }));
    const items = await screen.findAllByRole('menuitem');
    await user.click(items[0]!);

    await vi.waitFor(() => expect(applyManualClassStatus).toHaveBeenCalledTimes(2));
    const ids = applyManualClassStatus.mock.calls.map(call => call[0]);
    expect(ids.sort()).toEqual(['class-1', 'class-2']);
  });

  it('a tick in another trial starts a new selection there, and says so', async () => {
    const { user } = renderCockpit();
    await user.click(tick('Container Novice'));
    await expandTrial2(user);

    await user.click(tick('Buried Novice'));

    expect(tick('Buried Novice')).toBeChecked();
    expect(tick('Container Novice')).not.toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent(/one trial at a time/);
  });

  it('collapsing the trial that holds the selection clears it', async () => {
    const { user } = renderCockpit();
    await user.click(tick('Container Novice'));

    const trigger = screen.getByRole('button', { name: /^Collapse 1 / });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /^Expand 1 / }));

    expect(tick('Container Novice')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Change status' })).not.toBeInTheDocument();
  });

  it('a day chip clears the selection', async () => {
    const { user } = renderCockpit();
    await user.click(tick('Container Novice'));

    await user.click(screen.getByRole('button', { name: /Jul 20/ }));

    expect(tick('Container Novice')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Change status' })).not.toBeInTheDocument();
  });

  it('Done leaves select mode and clears the selection', async () => {
    const { user } = renderCockpit();
    await user.click(tick('Container Novice'));

    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Change status' })).not.toBeInTheDocument();
  });

  it("a Select classes link's trial opens on arrival, ticking nothing", () => {
    renderCockpit('/shows/show-1?select=classes&trialId=trial-2');

    expect(screen.getByRole('button', { name: /^Collapse 2 / })).toBeInTheDocument();
    expect(tick('Buried Novice')).not.toBeChecked();
  });
});
