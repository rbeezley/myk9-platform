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

  it('says the judge list could not load instead of offering an empty picker', () => {
    judgesQuery.mockReturnValue({ data: undefined, isError: true });
    renderCockpit(classOf({ judgeId: 'judge-1', judgeName: 'Jane Judge' }));

    expect(screen.queryByRole('combobox', { name: /^Judge for/ })).not.toBeInTheDocument();
    expect(screen.getByText(/couldn.t load the judge list/i)).toBeVisible();
  });
});
