import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { SecretaryCockpit } from '../SecretaryCockpit';
import type { SecretaryCockpitSnapshot } from '../secretaryCockpitTypes';

// Edit class opens from the header's own button (MYK9-2379); the panel is stubbed to show what
// the cockpit hands it. The real panel's behavior is covered in ClassEditPanel.liveSettings.test.
vi.mock('@/components/shows/tabs/useClassRowActions', async () =>
  (await import('./editClassSettingsStub')).classRowActionsStub(false)
);
vi.mock('@/components/shows/tabs/SetupClassDialogs', async () => ({
  SetupClassDialogs: (await import('./editClassSettingsStub')).SetupClassDialogsStub,
}));
vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: { current: null }, width: null }),
}));

const showQuery = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useShowsDatabase', () => ({ useShowQuery: showQuery }));
const judgesQuery = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: judgesQuery,
}));
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment: vi.fn() }));

const snapshot: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  printTrackingInUse: true,
  checklistInUse: true,
  trials: [{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }],
  classes: [
    {
      id: 'class-1',
      trialId: 'trial-1',
      name: 'Exterior Excellent',
      classOrder: 0,
      scheduledStart: '9:00 AM',
      lifecycle: 'not-started',
      entryCount: 4,
      scoredCount: 0,
      judgeName: null,
      judgeId: null,
      entryRows: [],
      attention: [],
      actions: [],
      paperwork: [],
    },
  ],
};

describe('Edit class from Show Desk (MYK9-2379)', () => {
  beforeEach(() => {
    showQuery.mockReturnValue({ data: { id: 'show-1', organization: 'AKC' } });
    judgesQuery.mockReturnValue({ data: [] });
  });

  it('keeps the settings out of the header until Edit class opens them', async () => {
    const { user } = render(
      <SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />,
      { initialRoute: '/shows/show-1' }
    );
    const header = screen.getByTestId('focused-class-header');
    expect(screen.queryByRole('button', { name: 'Class settings' })).not.toBeInTheDocument();
    expect(within(header).queryByText('Expected start')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Edit Class' })).not.toBeInTheDocument();

    await user.click(within(header).getByRole('button', { name: 'Edit class Exterior Excellent' }));

    const panel = screen.getByRole('dialog', { name: 'Edit Class' });
    expect(within(panel).getByText('Status')).toBeInTheDocument();
    expect(within(panel).getByText('Judge')).toBeInTheDocument();
    expect(within(panel).getByText('Scoring')).toBeInTheDocument();
    expect(within(panel).getByText('Expected start')).toBeInTheDocument();
    expect(
      within(panel).getByRole('button', { name: /^Status: Not started\. Change status/ })
    ).toBeEnabled();
    expect(within(panel).queryByText('Actual timing')).not.toBeInTheDocument();
  });

  it('has one Judge control: the live one before the class starts', async () => {
    const { user } = render(
      <SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />,
      { initialRoute: '/shows/show-1' }
    );
    await user.click(screen.getByRole('button', { name: 'Edit class Exterior Excellent' }));

    const panel = screen.getByRole('dialog', { name: 'Edit Class' });
    expect(panel).toHaveAttribute('data-live-judge', 'true');
    expect(within(panel).getByText('Judge')).toBeInTheDocument();
  });

  it('leaves the Judge to the panel own field once the class has started, with no lock message', async () => {
    const started = {
      ...snapshot,
      classes: [{ ...snapshot.classes[0]!, lifecycle: 'in-progress' as const }],
    };
    const { user } = render(
      <SecretaryCockpit snapshot={started} canManageShow onCommand={vi.fn()} />,
      { initialRoute: '/shows/show-1' }
    );
    await user.click(screen.getByRole('button', { name: 'Edit class Exterior Excellent' }));

    const panel = screen.getByRole('dialog', { name: 'Edit Class' });
    expect(panel).toHaveAttribute('data-live-judge', 'false');
    expect(within(panel).queryByText('Judge')).not.toBeInTheDocument();
    expect(within(panel).queryByText(/Use Edit class/)).not.toBeInTheDocument();
  });

  it('gives a viewer no Edit class button and no panel', () => {
    render(<SecretaryCockpit snapshot={snapshot} canManageShow={false} onCommand={vi.fn()} />, {
      initialRoute: '/shows/show-1',
    });
    expect(screen.queryByRole('button', { name: /^Edit class/ })).not.toBeInTheDocument();
  });
});
