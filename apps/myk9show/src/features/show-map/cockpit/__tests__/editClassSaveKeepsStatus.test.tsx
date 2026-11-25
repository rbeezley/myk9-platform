import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLASS_STATUS } from '@myk9/core';

import { render } from '@/test/utils/testUtils';
import { applyManualClassStatus } from '@/services/show-day/classStatusMutations';
import { SecretaryCockpit } from '../SecretaryCockpit';
import type { SecretaryCockpitSnapshot } from '../secretaryCockpitTypes';

/**
 * MYK9-2379: the real cockpit, the real Edit class dialog and panel, and the real Show day
 * settings. A live status change, then Save Changes: the saved patch must not carry the panel's
 * older status back over it. Only the replica read that opens the panel, and the writes, are faked.
 */
vi.mock('@/components/shows/tabs/useClassRowActions', async () =>
  (await import('./editClassSettingsStub')).classRowActionsStub(false, {
    element: 'Exterior',
    level: 'Excellent',
    section: '',
    judgeId: 'judge-1',
    judgeName: 'Jane Judge',
    status: 'Upcoming',
    entries: 4,
    timeLimit1: '3:00',
  })
);
const saveClass = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/hooks/useClassEditActions', () => ({ useClassEditActions: () => ({ saveClass }) }));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ updateClass: vi.fn() }),
}));
vi.mock('@/services/show-day/classStatusMutations', () => ({
  applyManualClassStatus: vi.fn(async () => undefined),
}));
vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: { current: null }, width: null }),
}));
vi.mock('@/hooks/useClassRequirements', () => ({
  useClassRequirements: () => ({ autoFill: undefined }),
}));
const showQuery = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useShowsDatabase', () => ({ useShowQuery: showQuery }));
const judgesQuery = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: judgesQuery,
}));
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
      judgeName: 'Jane Judge',
      judgeId: 'judge-1',
      entryRows: [],
      attention: [],
      actions: [],
      paperwork: [],
    },
  ],
};

describe('Edit class from Show Desk: a live change survives Save Changes (MYK9-2379)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showQuery.mockReturnValue({ data: { id: 'show-1', organization: 'AKC' } });
    judgesQuery.mockReturnValue({ data: [] });
  });

  it('does not send the panel status back after the status was changed live', async () => {
    render(<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />, {
      initialRoute: '/shows/show-1',
    });
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Edit class Exterior Excellent' }));
    const panel = await screen.findByRole('dialog', { name: 'Edit Class' });
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(
      within(panel).getByRole('button', { name: /^Status: .*Change status of Exterior Excellent$/ })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'In progress' }));
    expect(applyManualClassStatus).toHaveBeenCalledWith('class-1', CLASS_STATUS.IN_PROGRESS);

    const limit = within(panel).getByLabelText('Time Limit 1');
    await user.clear(limit);
    await user.type(limit, '430');
    await user.click(within(panel).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(saveClass).toHaveBeenCalled());
    const patch = saveClass.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch).toEqual(expect.objectContaining({ timeLimit1: '4:30' }));
    expect(patch).not.toHaveProperty('status');
    expect(patch).not.toHaveProperty('judgeId');
  });
});
