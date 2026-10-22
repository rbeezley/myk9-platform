import { screen, within } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
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

const JANE = {
  id: 'judge-1',
  firstName: 'Jane',
  lastName: 'Judge',
  judgeQualifications: [{ status: 'Active', organization: 'AKC' }],
};
const BOB = {
  id: 'judge-2',
  firstName: 'Bob',
  lastName: 'Barker',
  judgeQualifications: [{ status: 'Active', organization: 'AKC' }],
};

const CARL = {
  id: 'judge-3',
  firstName: 'Carl',
  lastName: 'Cole',
  judgeQualifications: [{ status: 'Active', organization: 'AKC' }],
};

const classOf = (overrides: Partial<SecretaryCockpitClass>): SecretaryCockpitClass => ({
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Container Novice',
  classOrder: 0,
  lifecycle: 'not-started',
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

const snapshotOf = (cls: SecretaryCockpitClass): SecretaryCockpitSnapshot => ({
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  trials: [{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }],
  classes: [cls],
});

const renderCockpit = (cls: SecretaryCockpitClass, canManageShow = true) =>
  render(
    <SecretaryCockpit
      snapshot={snapshotOf(cls)}
      canManageShow={canManageShow}
      onCommand={vi.fn()}
    />,
    { initialRoute: '/shows/show-1' }
  );

const header = () => screen.getByTestId('focused-class-header');
const scheduleRow = () => document.getElementById('cockpit-anchor-class-1') as HTMLElement;

describe('class panel judge picker (MYK9-1323)', () => {
  beforeEach(() => {
    showQuery.mockReturnValue({ data: { id: 'show-1', organization: 'AKC' } });
    judgesQuery.mockReturnValue({ data: [JANE, BOB] });
    upsertClassJudgeAssignment.mockReset();
    upsertClassJudgeAssignment.mockResolvedValue(undefined);
  });

  it('assigns the picked judge to the focused class and the schedule row shows it', async () => {
    const { user } = renderCockpit(classOf({}));
    expect(scheduleRow()).toHaveTextContent('Judge not set');

    await user.click(screen.getByRole('combobox', { name: 'Judge for Container Novice' }));
    await user.click(await screen.findByRole('option', { name: 'Jane Judge' }));

    expect(upsertClassJudgeAssignment).toHaveBeenCalledTimes(1);
    expect(upsertClassJudgeAssignment).toHaveBeenCalledWith('show-1', 'class-1', 'judge-1');
    // Before replication catches the class row up, the row already names the new judge.
    expect(await within(scheduleRow()).findByText(/Jane Judge/)).toBeInTheDocument();
  });

  it('a second change before replication catches up keeps the newest judge (A -> B -> C)', async () => {
    judgesQuery.mockReturnValue({ data: [JANE, BOB, CARL] });
    const { user } = renderCockpit(classOf({ judgeId: 'judge-1', judgeName: 'Jane Judge' }));
    const picker = () => screen.getByRole('combobox', { name: 'Judge for Container Novice' });

    await user.click(picker());
    await user.click(await screen.findByRole('option', { name: 'Bob Barker' }));
    expect(await within(scheduleRow()).findByText(/Bob Barker/)).toBeInTheDocument();

    // The class row still says Jane: replication has not caught up.
    await user.click(picker());
    await user.click(await screen.findByRole('option', { name: 'Carl Cole' }));

    expect(upsertClassJudgeAssignment).toHaveBeenLastCalledWith('show-1', 'class-1', 'judge-3');
    expect(await within(scheduleRow()).findByText(/Carl Cole/)).toBeInTheDocument();
    expect(scheduleRow()).not.toHaveTextContent('Jane Judge');
  });

  it('the class row wins once replication catches up, and again when someone else changes it', async () => {
    const { user, rerender } = renderCockpit(classOf({}));
    await user.click(screen.getByRole('combobox', { name: 'Judge for Container Novice' }));
    await user.click(await screen.findByRole('option', { name: 'Jane Judge' }));
    expect(await within(scheduleRow()).findByText(/Jane Judge/)).toBeInTheDocument();

    const rerenderWith = (judgeId: string, judgeName: string) =>
      rerender(
        <SecretaryCockpit
          snapshot={snapshotOf(classOf({ judgeId, judgeName }))}
          canManageShow
          onCommand={vi.fn()}
        />
      );
    rerenderWith('judge-1', 'Jane Judge');
    expect(scheduleRow()).toHaveTextContent('Jane Judge');
    rerenderWith('judge-2', 'Bob Barker');
    expect(scheduleRow()).toHaveTextContent('Bob Barker');
  });

  it('keeps the picked name on the schedule row if the judge list later drops that judge', async () => {
    const { user, rerender } = renderCockpit(classOf({}));
    await user.click(screen.getByRole('combobox', { name: 'Judge for Container Novice' }));
    await user.click(await screen.findByRole('option', { name: 'Bob Barker' }));
    expect(await within(scheduleRow()).findByText(/Bob Barker/)).toBeInTheDocument();

    judgesQuery.mockReturnValue({ data: [JANE] });
    rerender(
      <SecretaryCockpit snapshot={snapshotOf(classOf({}))} canManageShow onCommand={vi.fn()} />
    );

    expect(scheduleRow()).toHaveTextContent('Bob Barker');
    expect(scheduleRow()).not.toHaveTextContent('Judge not set');
  });

  it('writes the judge while offline: the write is local and replicated, not parked', async () => {
    const { user } = renderCockpit(classOf({}));
    onlineManager.setOnline(false);
    try {
      await user.click(screen.getByRole('combobox', { name: 'Judge for Container Novice' }));
      await user.click(await screen.findByRole('option', { name: 'Jane Judge' }));

      await vi.waitFor(() =>
        expect(upsertClassJudgeAssignment).toHaveBeenCalledWith('show-1', 'class-1', 'judge-1')
      );
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('reads the judge list refreshing only when stale on the show home', () => {
    renderCockpit(classOf({}));

    expect(judgesQuery).toHaveBeenCalledWith(true, 'when-stale');
  });

  it('keeps the picker when a background refetch fails but the list is cached', () => {
    judgesQuery.mockReturnValue({ data: [JANE, BOB], isError: true });
    renderCockpit(classOf({}));

    expect(screen.getByRole('combobox', { name: 'Judge for Container Novice' })).toBeVisible();
  });

  it('says a judge is assigned, not "not set", when the name has not resolved', () => {
    renderCockpit(classOf({ lifecycle: 'in-progress', judgeId: 'judge-9', judgeName: null }));

    const settings = screen.getByRole('region', { name: 'Class settings' });
    expect(within(settings).getByText('Judge assigned')).toBeVisible();
  });

  it("sends 'TBD' when the judge is unassigned", async () => {
    const { user } = renderCockpit(classOf({ judgeId: 'judge-1', judgeName: 'Jane Judge' }));

    await user.click(screen.getByRole('combobox', { name: 'Judge for Container Novice' }));
    await user.click(await screen.findByRole('option', { name: 'Unassigned' }));

    expect(upsertClassJudgeAssignment).toHaveBeenCalledWith('show-1', 'class-1', 'TBD');
  });

  it('does not repeat the judge in the header facts once the setting shows it', () => {
    renderCockpit(classOf({ judgeId: 'judge-1', judgeName: 'Jane Judge' }));

    expect(header()).not.toHaveTextContent('Judge Jane Judge');
    expect(screen.getByRole('combobox', { name: 'Judge for Container Novice' })).toBeVisible();
  });

  it('shows a viewer who cannot manage the show the judge as a fact, with no picker', () => {
    renderCockpit(classOf({ judgeId: 'judge-1', judgeName: 'Jane Judge' }), false);

    expect(header()).toHaveTextContent('Judge Jane Judge');
    expect(screen.queryByRole('combobox', { name: /^Judge for/ })).not.toBeInTheDocument();
  });

  it('locks the judge once the class has started', () => {
    renderCockpit(
      classOf({ lifecycle: 'in-progress', judgeId: 'judge-1', judgeName: 'Jane Judge' })
    );

    expect(screen.queryByRole('combobox', { name: /^Judge for/ })).not.toBeInTheDocument();
    expect(
      screen.getByText('Locked once the class starts. Use Edit class to change it.')
    ).toBeVisible();
  });

  it('locks a class whose status still reads not-started but already has a scored dog', () => {
    renderCockpit(classOf({ scoredCount: 1, judgeId: 'judge-1', judgeName: 'Jane Judge' }));

    expect(screen.queryByRole('combobox', { name: /^Judge for/ })).not.toBeInTheDocument();
    expect(
      screen.getByText('Locked once the class starts. Use Edit class to change it.')
    ).toBeVisible();
  });

  it('points at adding a judge when none are available and none is assigned', () => {
    judgesQuery.mockReturnValue({ data: [] });
    renderCockpit(classOf({}));

    expect(screen.getByText('No judges are available to assign to this class yet.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Add a judge' })).toBeVisible();
  });

  it("shows the judge's name, not a picker, while the judge list is still loading", () => {
    judgesQuery.mockReturnValue({ data: undefined });
    renderCockpit(classOf({ judgeId: 'judge-1', judgeName: 'Jane Judge' }));

    expect(screen.queryByRole('combobox', { name: /^Judge for/ })).not.toBeInTheDocument();
    const settings = screen.getByRole('region', { name: 'Class settings' });
    expect(within(settings).getByText('Jane Judge')).toBeVisible();
  });

  it('treats a judge read paused offline as unavailable', () => {
    judgesQuery.mockReturnValue({ data: undefined, fetchStatus: 'paused' });
    renderCockpit(classOf({ judgeId: 'judge-1', judgeName: 'Jane Judge' }));

    expect(screen.getByText(/couldn.t load the judge list/i)).toBeVisible();
  });

  it("treats the show's read paused offline as unavailable too", () => {
    showQuery.mockReturnValue({ data: undefined, fetchStatus: 'paused' });
    renderCockpit(classOf({ judgeId: 'judge-1', judgeName: 'Jane Judge' }));

    expect(screen.getByText(/couldn.t load the judge list/i)).toBeVisible();
  });

  it('says the judge list could not load instead of offering an empty picker', () => {
    judgesQuery.mockReturnValue({ data: undefined, isError: true });
    renderCockpit(classOf({ judgeId: 'judge-1', judgeName: 'Jane Judge' }));

    expect(screen.queryByRole('combobox', { name: /^Judge for/ })).not.toBeInTheDocument();
    expect(screen.getByText(/couldn.t load the judge list/i)).toBeVisible();
  });
});
